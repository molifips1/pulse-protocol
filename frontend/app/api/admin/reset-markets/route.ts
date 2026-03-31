import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-pulse-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Delete dependents first (foreign key order)
  await supabase.from('bets').delete().not('id', 'is', null)
  const { error: oeErr } = await supabase.from('oracle_events').delete().not('market_id', 'is', null)
  if (oeErr) {
    return NextResponse.json({ error: `Failed to delete oracle_events: ${oeErr.message}` }, { status: 500 })
  }

  const { error: marketsErr, count: marketsCount } = await supabase
    .from('markets')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (marketsErr) {
    return NextResponse.json({ error: `Failed to delete markets: ${marketsErr.message}` }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    deleted: { markets: marketsCount },
  })
}
