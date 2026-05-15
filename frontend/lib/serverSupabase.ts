import { createClient } from '@supabase/supabase-js'

export function getServerSupabase() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase server env: SUPABASE_URL and SUPABASE_SERVICE_KEY')
  }

  return createClient(url, serviceKey)
}
