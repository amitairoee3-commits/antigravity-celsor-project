/**
 * CELSOR — /api/auth/me
 * Returns the authenticated user's profile, plan, and permissions.
 * Called on dashboard load to hydrate user state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Plan-based permissions map (RBAC)
const PLAN_PERMISSIONS: Record<string, string[]> = {
  free: [
    'read:signals:limited',   // 10 signals/day, ETH only
    'read:wallets',
    'write:watchlist',
  ],
  basic: [
    'read:signals',           // 50 signals/day, all chains
    'read:wallets',
    'write:watchlist',
    'write:alerts:basic',
    'read:scan_history',
  ],
  pro: [
    'read:signals:unlimited', // Unlimited, all chains
    'read:signals:ai',        // Full AI narratives
    'read:wallets',
    'write:watchlist',
    'write:alerts',
    'read:scan_history',
    'write:bookmarks',
    'read:wallet:deep_scan',
    'api:scan:trigger',
    'read:signals:stream',    // SSE stream
  ],
};

export async function GET(req: NextRequest) {
  try {
    // Dev mode bypass
    const userId = req.headers.get('x-celsor-user-id');
    const plan   = req.headers.get('x-celsor-plan') ?? 'free';

    if (userId === 'dev-user') {
      return NextResponse.json({
        ok: true,
        user: {
          id: 'dev-user-000',
          email: 'dev@celsor.io',
          plan: 'pro',
          permissions: PLAN_PERMISSIONS['pro'],
          preferences: {
            chains: ['eth', 'arb', 'base', 'bsc', 'op'],
            minConvictionScore: 50,
            emailAlertsEnabled: false,
            pushAlertsEnabled: false,
            alertThreshold: 75,
            watchedTokens: [],
          },
          createdAt: new Date().toISOString(),
        },
        mode: 'development',
      });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || supabaseUrl.includes('dummy')) {
      return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 503 });
    }

    const response = NextResponse.next();
    const supabase = createServerClient(supabaseUrl, supabaseKey!, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        ),
      },
    });

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    const userPlan = (profile?.plan ?? 'free') as keyof typeof PLAN_PERMISSIONS;
    const permissions = PLAN_PERMISSIONS[userPlan] ?? PLAN_PERMISSIONS.free;

    return NextResponse.json({
      ok: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        plan: userPlan,
        permissions,
        preferences: profile?.preferences ?? {},
        signalsToday: profile?.signals_today ?? 0,
        createdAt: profile?.created_at,
      },
    });
  } catch (err) {
    console.error('[/api/auth/me]', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

// PATCH: Update user preferences
export async function PATCH(req: NextRequest) {
  try {
    const userId = req.headers.get('x-celsor-user-id');

    if (userId === 'dev-user') {
      return NextResponse.json({ ok: true, message: 'Dev mode — preferences not persisted' });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || supabaseUrl.includes('dummy')) {
      return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 503 });
    }

    const response = NextResponse.next();
    const supabase = createServerClient(supabaseUrl, supabaseKey!, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        ),
      },
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    const { error } = await supabase
      .from('profiles')
      .update({ preferences: body.preferences })
      .eq('id', session.user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true, message: 'Preferences updated' });
  } catch (err) {
    console.error('[/api/auth/me PATCH]', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
