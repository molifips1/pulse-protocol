import { describe, it, expect } from 'vitest'
import { calculatePrice, BucketPool } from '../lib/utils'

const EQUAL_BUCKETS: BucketPool[] = [
  { bucket_id: 'A', pool_usdc: 0, seed_usdc: 25 },
  { bucket_id: 'B', pool_usdc: 0, seed_usdc: 25 },
  { bucket_id: 'C', pool_usdc: 0, seed_usdc: 25 },
  { bucket_id: 'D', pool_usdc: 0, seed_usdc: 25 },
]

describe('calculatePrice', () => {
  it('returns 0.25 for all buckets at open (no real bets, equal seeds)', () => {
    const prices = calculatePrice(EQUAL_BUCKETS)
    expect(prices).toHaveLength(4)
    prices.forEach(p => expect(p.price).toBe(0.25))
  })

  it('prices always sum to 1.0', () => {
    const buckets: BucketPool[] = [
      { bucket_id: 'A', pool_usdc: 100, seed_usdc: 25 },
      { bucket_id: 'B', pool_usdc: 50,  seed_usdc: 25 },
      { bucket_id: 'C', pool_usdc: 10,  seed_usdc: 25 },
      { bucket_id: 'D', pool_usdc: 5,   seed_usdc: 25 },
    ]
    const prices = calculatePrice(buckets)
    const total = prices.reduce((sum, p) => sum + p.price, 0)
    expect(total).toBeCloseTo(1.0, 5)
  })

  it('a bucket with more bets gets a higher price', () => {
    const buckets: BucketPool[] = [
      { bucket_id: 'A', pool_usdc: 200, seed_usdc: 25 },
      { bucket_id: 'B', pool_usdc: 0,   seed_usdc: 25 },
      { bucket_id: 'C', pool_usdc: 0,   seed_usdc: 25 },
      { bucket_id: 'D', pool_usdc: 0,   seed_usdc: 25 },
    ]
    const prices = calculatePrice(buckets)
    const [a, b, c, d] = prices
    expect(a.price).toBeGreaterThan(b.price)
    expect(a.price).toBeGreaterThan(c.price)
    expect(a.price).toBeGreaterThan(d.price)
  })

  it('implied_pct equals price * 100 rounded to 2dp', () => {
    const prices = calculatePrice(EQUAL_BUCKETS)
    prices.forEach(p => {
      expect(p.implied_pct).toBeCloseTo(p.price * 100, 2)
    })
  })

  it('odds equals 1 / price', () => {
    const prices = calculatePrice(EQUAL_BUCKETS)
    prices.forEach(p => {
      expect(p.odds).toBeCloseTo(1 / p.price, 3)
    })
  })

  it('seed is excluded from payouts — price uses effective pool correctly', () => {
    const buckets: BucketPool[] = [
      { bucket_id: 'A', pool_usdc: 100, seed_usdc: 25 },
      { bucket_id: 'B', pool_usdc: 25,  seed_usdc: 25 },
      { bucket_id: 'C', pool_usdc: 25,  seed_usdc: 25 },
      { bucket_id: 'D', pool_usdc: 25,  seed_usdc: 25 },
    ]
    const prices = calculatePrice(buckets)
    // A: effective = 100+25=125, total effective = 125+50+50+50 = 275
    // price_A = 125/275 ≈ 0.4545
    expect(prices.find(p => p.bucket_id === 'A')!.price).toBeCloseTo(125 / 275, 4)
  })
})
