import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')
  if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })

  const { data, error } = await supabase
    .from('bets')
    .select('*, markets(title, status, outcome, category, closes_at)')
    .eq('wallet_address', wallet.toLowerCase())
    .order('id', { ascending: false })
    .limit(50)

  console.log(`[user-bets] wallet=${wallet.toLowerCase().slice(0,10)} count=${data?.length ?? 'null'} err=${error?.message?.slice(0,60) ?? 'none'}`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ bets: data || [] })
}
