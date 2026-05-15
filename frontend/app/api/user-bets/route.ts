import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/serverSupabase'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = getServerSupabase()
  const wallet = req.nextUrl.searchParams.get('wallet')
  if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })

  // Two separate queries avoids any join/column issues
  const { data: bets, error } = await supabase
    .from('bets')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase())
    .order('id', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!bets || bets.length === 0) return NextResponse.json({ bets: [] })

  const marketIds = [...new Set(bets.map((b: any) => b.market_id).filter(Boolean))]
  const { data: markets } = await supabase
    .from('markets')
    .select('id, title, status, outcome, category, closes_at')
    .in('id', marketIds)

  const marketMap = new Map((markets || []).map((m: any) => [m.id, m]))
  const result = bets.map((b: any) => ({ ...b, markets: marketMap.get(b.market_id) || null }))

  return NextResponse.json({ bets: result })
}
