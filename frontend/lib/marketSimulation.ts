import { getStreamerFromTitle, KNOWN_STREAMERS } from './utils'

export interface SimMarket {
  id?: string
  title: string
  status: string
  total_yes_usdc?: number
  total_no_usdc?: number
  streams?: { stream_key?: string | null } | null
}

export interface SimLiveStream {
  channel: string
  viewers: number
  thumbnail?: string | null
}

export function buildStreamerMarketModel(
  markets: SimMarket[],
  liveStreams: SimLiveStream[],
  knownStreamers = KNOWN_STREAMERS
) {
  const marketsByChannel = new Map<string, SimMarket[]>()
  for (const market of markets) {
    const channel = (market.streams?.stream_key || getStreamerFromTitle(market.title))?.toLowerCase()
    if (!channel) continue
    if (!marketsByChannel.has(channel)) marketsByChannel.set(channel, [])
    marketsByChannel.get(channel)!.push(market)
  }

  const onlineChannels = liveStreams
    .slice()
    .sort((a, b) => b.viewers - a.viewers)
    .map(stream => stream.channel.toLowerCase())

  const offlineChannels: string[] = []
  const seen = new Set(onlineChannels)
  for (const channel of marketsByChannel.keys()) {
    if (!seen.has(channel)) {
      offlineChannels.push(channel)
      seen.add(channel)
    }
  }
  for (const channel of knownStreamers) {
    if (!seen.has(channel)) {
      offlineChannels.push(channel)
      seen.add(channel)
    }
  }

  return {
    marketsByChannel,
    onlineChannels,
    offlineChannels,
    openMarkets: markets.filter(market => market.status === 'open'),
    totalVolume: markets.reduce(
      (sum, market) => sum + (market.total_yes_usdc || 0) + (market.total_no_usdc || 0),
      0
    ),
  }
}

export function buildBetRecordPayload(input: {
  marketId: string
  walletAddress: string
  isCategorical: boolean
  selectedBucket?: string
  betSide: 'yes' | 'no'
  amountUsdc: number
  oddsAtPlacement: number
  potentialPayout: number
  txHash: string
  contractBetId?: string | null
}) {
  return {
    marketId: input.marketId,
    walletAddress: input.walletAddress,
    side: input.isCategorical ? 'yes' : input.betSide,
    bucketId: input.isCategorical ? input.selectedBucket : undefined,
    amountUsdc: input.amountUsdc,
    oddsAtPlacement: input.oddsAtPlacement,
    potentialPayout: input.potentialPayout,
    txHash: input.txHash,
    contractBetId: input.contractBetId ?? null,
  }
}
