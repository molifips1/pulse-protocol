import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('streams')
    .select('stream_key, viewer_count, game_title, game_category')
    .eq('is_live', true)
    .order('viewer_count', { ascending: false })
    .limit(10)

  if (error) return NextResponse.json({ streams: [] })
  return NextResponse.json({ streams: data || [] })
}
