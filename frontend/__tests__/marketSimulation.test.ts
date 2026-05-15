import { describe, expect, it } from 'vitest'
import { buildBetRecordPayload, buildStreamerMarketModel, SimLiveStream, SimMarket } from '../lib/marketSimulation'

const MARKETS: SimMarket[] = [
  {
    id: 'm-haddzy-open',
    title: "What will Haddzy's Peak Viewership be (9:00 PM - 10:00 PM)?",
    status: 'open',
    total_yes_usdc: 120,
    total_no_usdc: 80,
    streams: { stream_key: 'haddzy' },
  },
  {
    id: 'm-roshtein-history',
    title: "Will Roshtein hit 10K viewers?",
    status: 'resolved',
    total_yes_usdc: 40,
    total_no_usdc: 60,
    streams: null,
  },
]

const LIVE: SimLiveStream[] = [
  { channel: 'haddzy', viewers: 12_500, thumbnail: null },
  { channel: 'xqc', viewers: 42_000, thumbnail: null },
]

describe('streamer market simulations', () => {
  it('keeps at least one seeded live streamer available without relying on Kick being online', () => {
    const model = buildStreamerMarketModel(MARKETS, LIVE, ['haddzy', 'roshtein', 'xqc'])

    expect(model.onlineChannels).toEqual(['xqc', 'haddzy'])
    expect(model.marketsByChannel.get('haddzy')?.map(m => m.id)).toEqual(['m-haddzy-open'])
    expect(model.openMarkets.map(m => m.id)).toEqual(['m-haddzy-open'])
    expect(model.totalVolume).toBe(300)
  })

  it('puts offline streamers with market history ahead of known streamers with no markets', () => {
    const model = buildStreamerMarketModel(MARKETS, LIVE, ['haddzy', 'trainwreckstv', 'roshtein'])

    expect(model.offlineChannels.slice(0, 2)).toEqual(['roshtein', 'trainwreckstv'])
  })
})

describe('bet recording simulations', () => {
  it('preserves binary NO side instead of saving every bet as YES', () => {
    const payload = buildBetRecordPayload({
      marketId: 'binary-market',
      walletAddress: '0xabc',
      isCategorical: false,
      betSide: 'no',
      amountUsdc: 25,
      oddsAtPlacement: 1.8,
      potentialPayout: 45,
      txHash: '0xtx',
    })

    expect(payload).toMatchObject({
      marketId: 'binary-market',
      walletAddress: '0xabc',
      side: 'no',
      bucketId: undefined,
    })
  })

  it('records categorical bucket bets as YES plus bucket id', () => {
    const payload = buildBetRecordPayload({
      marketId: 'bucket-market',
      walletAddress: '0xabc',
      isCategorical: true,
      selectedBucket: 'C',
      betSide: 'no',
      amountUsdc: 10,
      oddsAtPlacement: 4,
      potentialPayout: 40,
      txHash: '0xtx',
      contractBetId: '0xbet',
    })

    expect(payload).toMatchObject({
      side: 'yes',
      bucketId: 'C',
      contractBetId: '0xbet',
    })
  })
})
