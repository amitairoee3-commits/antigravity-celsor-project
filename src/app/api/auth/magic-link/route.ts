/**
 * CELSOR — /api/auth/magic-link
 * Sends a Supabase magic link to the user's email.
 * On success, the user clicks the link → /api/auth/callback → dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { rateLimit } from '@/lib/db/redis';

const RequestSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 3 magic link requests per email per 10 minutes
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    // Rate limit by email
    const rl = await rateLimit(`celsor:auth:rl:${email}`, 3, 600);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Too many attempts. Please wait 10 minutes before trying again.' },
        { status: 429 }
      );
    }

    const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const siteUrl      = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

    // Dev mode: Supabase not configured
    if (!supabaseUrl || supabaseUrl.includes('dummy')) {
      return NextResponse.json({
        ok: true,
        message: '✓ [DEV MODE] Magic link simulated. In production, check your email.',
        devOnly: true,
      });
    }

    const res  = NextResponse.next();
    const supabase = createServerClient(supabaseUrl, supabaseKey!, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/api/auth/callback`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.error('[CELSOR Magic Link]', error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Magic link sent to ${email}. Check your inbox and click the link to sign in.`,
    });
  } catch (err) {
    console.error('[/api/auth/magic-link]', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
