export const KNOWN_STREAMERS = [
  'trainwreckstv','roshtein','classybeef','xposed','mellstroy987',
  'sweetflips','cheesur','syztmz','vysotzky','elzeein','taour',
  'plinkoplayerca','glowis888','sloxol','dajmaxdajmax','maloycsеr',
  'ladyluckslots','mascoobs','cousik','tck','shurzggg','haddzy','snikwins','gtasty',
  'rakkispider','gamegladiatorgg','baldybronson',
  'hunterowner','lvsteppers','splyfe_sv','umbrab0i','real_bazzi','666dope','stripnclub',
  'zeroedg3','torontovvs','dzhordik','strikeeth','art_depo','scurrows','kyrexx21','k3ltz',
  'viktoria_sun','robertolovely','rombears','zpaic0','renzrzkzbhsfw','jo1nder','moratiar',
  'skinnyoungster','sparta4elo','hutonis4','striker6x6','opmbaby_','tobbianoq','playermaketv',
  'disthydbeast','slowl33','moneyneedoff','voryndor','ketlerrr52','misterjack1995','goert08','hoodden',
  'hstikkytokky','cuffem','shnaggyhose','danludan2311','artemgraph','thedoctor','generalqw77',
]

export function getStreamerFromTitle(title: string): string | null {
  const lower = title.toLowerCase()
  const known = KNOWN_STREAMERS.find(s => lower.includes(s.toLowerCase()))
  if (known) return known.toLowerCase()
  const match = title.match(/^Will ([^'\s]+)(?:'s|\s)/i)
  if (match) return match[1].toLowerCase()
  return null
}

export function calcOdds(market: { total_yes_usdc: number; total_no_usdc: number; initial_yes_odds?: number; initial_no_odds?: number }) {
  const totalPool = (market.total_yes_usdc || 0) + (market.total_no_usdc || 0)
  const yesPercent = totalPool > 0 ? Math.round((market.total_yes_usdc / totalPool) * 100) : 50
  const noPercent = 100 - yesPercent
  const yesOdds = totalPool > 0 && market.total_yes_usdc > 0
    ? parseFloat(((totalPool * 0.9925) / market.total_yes_usdc).toFixed(2))
    : market.initial_yes_odds || 2.0
  const noOdds = totalPool > 0 && market.total_no_usdc > 0
    ? parseFloat(((totalPool * 0.9925) / market.total_no_usdc).toFixed(2))
    : market.initial_no_odds || 2.0
  return { totalPool, yesPercent, noPercent, yesOdds, noOdds }
}

export const MARKET_LOCK_WINDOW_MINUTES = 10
export const MARKET_LOCK_WINDOW_MS = MARKET_LOCK_WINDOW_MINUTES * 60 * 1000

export function getMarketLockTime(closesAt: string | Date) {
  const closeMs = new Date(closesAt).getTime()
  if (!Number.isFinite(closeMs)) return null
  return new Date(closeMs - MARKET_LOCK_WINDOW_MS)
}

export function isMarketBettingLocked(
  closesAt: string | Date,
  status: string = 'open',
  now: Date = new Date()
) {
  if (status !== 'open') return true
  const lockAt = getMarketLockTime(closesAt)
  if (!lockAt) return true
  return now.getTime() >= lockAt.getTime()
}

export function getMarketLockState(market: { status?: string; closes_at?: string } | null | undefined, now = Date.now()) {
  const closesAtMs = market?.closes_at ? new Date(market.closes_at).getTime() : NaN
  const lockAtMs = Number.isFinite(closesAtMs) ? closesAtMs - MARKET_LOCK_WINDOW_MS : NaN
  const isOpen = market?.status === 'open'
  const isLockedByTime = Number.isFinite(lockAtMs) ? now >= lockAtMs : true
  const isPastClose = Number.isFinite(closesAtMs) ? now >= closesAtMs : true

  return {
    isOpen,
    isBettable: isOpen && !isLockedByTime && !isPastClose,
    isLockedByTime: isOpen && isLockedByTime,
    closesAtMs,
    lockAtMs,
    msToClose: Number.isFinite(closesAtMs) ? Math.max(0, closesAtMs - now) : 0,
    msToLock: Number.isFinite(lockAtMs) ? Math.max(0, lockAtMs - now) : 0,
  }
}

export function formatCompactDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

export interface BucketPool {
  bucket_id: 'A' | 'B' | 'C' | 'D'
  pool_usdc: number
  seed_usdc: number
}

export interface BucketPrice {
  bucket_id:   'A' | 'B' | 'C' | 'D'
  price:       number   // 0–1
  implied_pct: number   // price * 100
  odds:        number   // 1 / price
}

export function calculatePrice(buckets: BucketPool[]): BucketPrice[] {
  const total = buckets.reduce((sum, b) => sum + b.pool_usdc + b.seed_usdc, 0)

  return buckets.map(b => {
    const effective = b.pool_usdc + b.seed_usdc
    const price = total > 0 ? effective / total : 0.25
    return {
      bucket_id:   b.bucket_id,
      price:       parseFloat(price.toFixed(6)),
      implied_pct: parseFloat((price * 100).toFixed(2)),
      odds:        parseFloat((1 / price).toFixed(4)),
    }
  })
}
