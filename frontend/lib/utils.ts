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
