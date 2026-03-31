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
