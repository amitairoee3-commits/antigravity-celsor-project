/**
 * CELSOR — Supabase Service Client
 * Uses the SERVICE ROLE key — bypasses RLS.
 * NEVER expose this on the client side.
 * Use only in server-side API routes and background workers.
 */

import { createClient as _createClient } from '@supabase/supabase-js';

let _serviceClient: ReturnType<typeof _createClient> | null = null;

export function createServiceClient() {
  if (_serviceClient) return _serviceClient;

  const url   = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || url.includes('dummy')) {
    // Return a no-op client when Supabase is not configured
    return {
      from: () => ({
        select: () => ({ data: null, error: new Error('Supabase not configured') }),
        insert: () => ({ data: null, error: new Error('Supabase not configured') }),
        upsert: () => ({ data: null, error: new Error('Supabase not configured') }),
        update: () => ({ data: null, error: new Error('Supabase not configured') }),
        delete: () => ({ data: null, error: new Error('Supabase not configured') }),
        eq: () => ({}) as any,
        single: () => ({ data: null, error: new Error('Supabase not configured') }),
        order: () => ({ data: null, error: new Error('Supabase not configured') } as any),
        limit: () => ({ data: null, error: new Error('Supabase not configured') } as any),
      }),
      rpc: () => ({ data: null, error: new Error('Supabase not configured') }),
      auth: {
        admin: {
          getUserById: async () => ({ data: null, error: new Error('Supabase not configured') }),
          listUsers: async () => ({ data: null, error: new Error('Supabase not configured') }),
        },
      },
    } as any;
  }

  _serviceClient = _createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _serviceClient;
}
