import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(`${requestUrl.origin}/login?error=no_code`);
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch { /* server component — safe to ignore */ }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Supabase exchange error:', error.message);
      return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_failed`);
    }

    const session = data?.session;
    if (!session?.user) {
      return NextResponse.redirect(`${requestUrl.origin}/login?error=no_session`);
    }

    const { provider_token, provider_refresh_token } = session;
    const userId    = session.user.id;
    const userEmail = session.user.email;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ── Check if this user has already set up their account ─────────────────
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, setup_completed')
      .eq('id', userId)
      .single();

    if (existingProfile) {
      // Returning user — ONLY refresh tokens; never overwrite saved preferences
      const tokenUpdate = { google_access_token: provider_token };
      if (provider_refresh_token) {
        tokenUpdate.google_refresh_token = provider_refresh_token;
      }
      const { error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update(tokenUpdate)
        .eq('id', userId);
      if (updateErr) console.error('Token update error:', updateErr.message);

      // If setup is done, go straight to command bar — skip setup wizard
      if (existingProfile.setup_completed) {
        return NextResponse.redirect(`${requestUrl.origin}/dashboard/commands`);
      }
      return NextResponse.redirect(`${requestUrl.origin}/setup`);
    }

    // ── New user — insert profile with defaults ──────────────────────────────
    const serverTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    const { error: insertErr } = await supabaseAdmin
      .from('profiles')
      .insert({
        id:                   userId,
        email:                userEmail,
        briefing_time:        '08:00',
        timezone:             serverTz,
        delivery_method:      'email',
        google_access_token:  provider_token,
        google_refresh_token: provider_refresh_token || null,
        setup_completed:      false,
      });

    if (insertErr) console.error('Profile insert error:', insertErr.message);

    return NextResponse.redirect(`${requestUrl.origin}/setup`);

  } catch (err) {
    console.error('Auth callback crash:', err.message);
    const requestUrl = new URL(request.url);
    return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_failed`);
  }
}
