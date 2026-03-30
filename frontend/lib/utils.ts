export const KNOWN_STREAMERS = [
  'trainwreckstv','haddzy','roshtein','xqc','adinross','mellstroy475','xposed',
  'classybeef','stevewilldoit','casinodaddy','cheesur','caseoh','kingkulbik',
  'ngslot','jarttu84','snikwins','gtasty','ac7ionman','westcol','elzeein',
  'syztmz','mitchjones','corinnakopf','taour','tyceno','capatob','snutz',
  'ilyaselmaliki','szymool','scurrows','lobanjicaa','teufeurs','deuceace','vondice',
  'bougassaa','nahoule82k','vodkafunky','7idan7777','mathematicien','paymoneywubby',
  'butisito','zonagemelosoficial','lospollosTV','letsgiveItaspin','striker6x6','rombears',
  'real_bazzi','hunterowner','sniff','andymilonakis','orangemorange',
  'stake','stakeus','nickslots','labowsky','bonusking','fruityslots','slotspinner',
  'goonbags','nicks_slots','cg_cgaming','chipmonkz','casino_eric','slotlady',
  'vegaslow','mrvegas','david_labowsky','bonanzas','spintwix','slotsfighter','casinogrounds',
  'sweetflips','zubarefff45','wesbtw','blonderabbit','artemgraph',
  'native_stream_192','aferist','generalqw77',
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
