import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client for serverless functions.
 *
 * This key bypasses RLS, so it must never be sent to the browser and every
 * handler that uses it is responsible for scoping its own queries.
 */
export function adminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Resolve the caller from their bearer token, honouring RLS for reads. */
export function userClient(req) {
  const url = process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  const auth = req.headers.authorization ?? ''

  if (!url || !anon) throw new Error('Supabase URL and anon key must be set')

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: auth ? { Authorization: auth } : {} },
  })
}

export function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json')
  res.status(status).send(JSON.stringify(body))
}
