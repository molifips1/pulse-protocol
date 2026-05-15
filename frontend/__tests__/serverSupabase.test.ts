import { afterEach, describe, expect, it, vi } from 'vitest'
import { getServerSupabase } from '../lib/serverSupabase'

describe('server Supabase env boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not allow server service-role clients to rely on public Supabase URL naming', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://public-only.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'service-role-key')
    vi.stubEnv('SUPABASE_URL', '')

    expect(() => getServerSupabase()).toThrow(/SUPABASE_URL/)
  })

  it('creates a server client only when server-only env names are present', () => {
    vi.stubEnv('SUPABASE_URL', 'https://server-only.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'service-role-key')

    expect(() => getServerSupabase()).not.toThrow()
  })
})
