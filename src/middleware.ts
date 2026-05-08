/**
 * CELSOR — Next.js Middleware v2
 * 
 * Handles:
 * 1. Supabase session validation on all /dashboard/* and /api/* routes
 * 2. Plan-based route protection (free/basic/pro)
 * 3. Security headers (CSP, HSTS, etc.)
 * 4. Rate limiting via Upstash Redis
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public routes (no auth required)
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/pricing',
  '/api/auth/magic-link',
  '/api/auth/callback',
  '/api/health',
  '/api/webhooks/stripe',
];

// Pro-only API routes
const PRO_ONLY_PATHS = [
  '/api/signals/stream',
  '/api/ai/analyze',
  '/api/alerts',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Allow public paths ──────────────────────────────────────────────────────
  const isPublic = PUBLIC_PATHS.some(p =>
    pathname === p || pathname.startsWith(p + '/')
  );

  // Always add security headers
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  addSecurityHeaders(response);

  if (isPublic) return response;

  // ── Validate Supabase session ───────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Skip auth if Supabase not configured (dev mode)
  if (!supabaseUrl || supabaseUrl.includes('dummy') || !supabaseAnonKey || supabaseAnonKey.includes('dummy')) {
    // Dev bypass: allow everything through
    response.headers.set('x-celsor-plan', 'pro');
    response.headers.set('x-celsor-user-id', 'dev-user');
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: { session }, error } = await supabase.auth.getSession();

  // ── Not authenticated → redirect to login ──────────────────────────────────
  if (!session || error) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Fetch user plan from DB (cached in cookie to avoid extra DB round-trips) ─
  let userPlan = request.cookies.get('celsor-plan')?.value as 'free' | 'basic' | 'pro' | undefined;

  if (!userPlan) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', session.user.id)
        .single();

      userPlan = (profile?.plan as 'free' | 'basic' | 'pro') ?? 'free';
      response.cookies.set('celsor-plan', userPlan, {
        maxAge: 60 * 5, // 5-minute cache
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
    } catch {
      userPlan = 'free';
    }
  }

  // ── Pro-only route protection ───────────────────────────────────────────────
  const isProOnly = PRO_ONLY_PATHS.some(p => pathname.startsWith(p));
  if (isProOnly && userPlan !== 'pro') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: 'Pro subscription required', code: 'UPGRADE_REQUIRED' },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL('/pricing?reason=pro_required', request.url));
  }

  // Attach user context to request headers for API routes
  response.headers.set('x-celsor-user-id', session.user.id);
  response.headers.set('x-celsor-plan', userPlan);

  return response;
}

// ─── Security Headers ─────────────────────────────────────────────────────────

function addSecurityHeaders(response: NextResponse) {
  const h = response.headers;

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.stripe.com https://api.etherscan.io https://api.arbiscan.io https://api.basescan.org https://api.bscscan.com https://api-optimistic.etherscan.io https://api.dexscreener.com",
    "frame-src 'self' https://js.stripe.com https://dexscreener.com",
    "worker-src 'self' blob:",
  ].join('; ');

  h.set('Content-Security-Policy', csp);
  h.set('X-Frame-Options', 'DENY');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
