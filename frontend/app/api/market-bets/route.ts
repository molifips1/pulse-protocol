import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const marketId = req.nextUrl.searchParams.get('marketId')
  const wallet = req.nextUrl.searchParams.get('wallet')

  if (!marketId) return NextResponse.json({ error: 'Missing marketId' }, { status: 400 })

  const [activityRes, myBetsRes, allBetsRes] = await Promise.all([
    supabase.from('bets').select('*').eq('market_id', marketId)
      .order('created_at', { ascending: false }).limit(25),
    wallet
      ? supabase.from('bets').select('*').eq('market_id', marketId)
          .eq('wallet_address', wallet.toLowerCase()).order('created_at', { ascending: false })
      : Promise.resolve({ data: null, error: null }),
    supabase.from('bets').select('wallet_address, amount_usdc').eq('market_id', marketId),
  ])

  if (activityRes.error) return NextResponse.json({ error: activityRes.error.message }, { status: 500 })

  const holderMap = new Map<string, number>()
  for (const b of allBetsRes.data || []) {
    holderMap.set(b.wallet_address, (holderMap.get(b.wallet_address) || 0) + b.amount_usdc)
  }
  const topHolders = [...holderMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([addr, total]) => ({ addr, total }))

  return NextResponse.json({
    activity: activityRes.data || [],
    myBets: myBetsRes.data || [],
    topHolders,
  })
}
