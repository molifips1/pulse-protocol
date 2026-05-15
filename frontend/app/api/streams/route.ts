import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/serverSupabase'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('streams')
    .select('stream_key, viewer_count, game_title, game_category, is_live')
    .order('viewer_count', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ streams: [], error: error.message })
  const live = (data || []).filter(s => s.is_live)
  return NextResponse.json({ streams: live, all: data || [] })
}
