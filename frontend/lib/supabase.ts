import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, anonKey)

export type MarketStatus = 'pending' | 'open' | 'locked' | 'resolved' | 'voided'
export type Outcome = 'yes' | 'no' | 'void'
export type BetSide = 'yes' | 'no'

export interface Market {
  id: string
  stream_id: string
  streamer_id: string
  title: string
  description?: string
  event_type: string
  category: 'casino' | 'fps' | 'irl' | 'sports' | 'other'
  status: MarketStatus
  outcome?: Outcome
  opens_at: string
  closes_at: string
  auto_void_at: string
  total_yes_usdc: number
  total_no_usdc: number
  initial_yes_odds: number
  initial_no_odds: number
  contract_market_id: string
  vault_address: string
  rake_rate: number
  created_at: string
  streams?: Stream
  streamers?: Streamer
}

export interface Stream {
  id: string
  streamer_id: string
  platform: 'twitch' | 'kick'
  stream_key: string
  game_category: string
  game_title?: string
  is_live: boolean
  viewer_count: number
  streamers?: Streamer
}

export interface Streamer {
  id: string
  display_name: string
  wallet_address?: string
  total_earned_usdc: number
}

export interface Bet {
  id: string
  market_id: string
  user_id?: string
  wallet_address: string
  side: BetSide
  amount_usdc: number
  odds_at_placement: number
  potential_payout_usdc: number
  status: string
  tx_hash?: string
  contract_bet_id?: string
  placed_at?: string
  created_at?: string
}
