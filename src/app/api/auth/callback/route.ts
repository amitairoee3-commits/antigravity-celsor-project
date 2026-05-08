/**
 * CELSOR — /api/auth/callback
 * Exchanges the auth code from the magic link email for a session.
 * Supabase redirects here after the user clicks the magic link.
 * Then redirects to /dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code         = searchParams.get('code');
  const redirectTo   = searchParams.get('next') ?? '/dashboard';
  const errorParam   = searchParams.get('error');
  const errorDesc    = searchParams.get('error_description');

  // Handle OAuth errors
  if (errorParam) {
    console.error('[CELSOR Auth Callback] Error:', errorDesc);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDesc ?? errorParam)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl.includes('dummy')) {
    // Dev mode — redirect straight to dashboard
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const response = NextResponse.redirect(`${origin}${redirectTo}`);

  const supabase = createServerClient(supabaseUrl, supabaseKey!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cs) => cs.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options)
      ),
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[CELSOR Auth Callback]', error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // Ensure profile exists (trigger fires on signup, but just in case)
  if (data.user) {
    try {
      const { createServiceClient } = await import('@/utils/supabase/service');
      const service = createServiceClient();
      const { data: existing } = await service
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!existing) {
        await service.from('profiles').insert({
          id: data.user.id,
          email: data.user.email ?? '',
          plan: 'free',
        });
      }
    } catch { /* Silently continue */ }
  }

  return response;
}
