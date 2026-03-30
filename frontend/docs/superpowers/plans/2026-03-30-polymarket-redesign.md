# Polymarket-Style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Pulse Protocol frontend to match Polymarket's clean, light-theme structure — full visual overhaul while preserving all wagmi/Supabase/contract logic.

**Architecture:** Logic-preserve, shell-replace. Every wagmi hook, Supabase query, and contract interaction is kept exactly as-is. Only the visual layer (styles, layout, component shells) is replaced. The StreamerMarketsModal is replaced by a full `/markets/[channel]` page route.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, wagmi v2, viem, RainbowKit, Supabase, date-fns

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `tailwind.config.js` | Replace dark pulse.* tokens with light palette |
| Modify | `app/globals.css` | Light theme body, remove scanlines |
| Modify | `app/layout.tsx` | Add Sidebar + TopBar shell |
| **Create** | `components/Sidebar.tsx` | Desktop left sidebar (240px) |
| **Create** | `components/TopBar.tsx` | Mobile navbar + desktop top bar |
| **Create** | `lib/utils.ts` | Shared `getStreamerFromTitle` + `KNOWN_STREAMERS` |
| Modify | `oracle/detector.js` | Include thumbnail in liveStreamersCache |
| Modify | `app/api/live-streamers/route.ts` | Pass thumbnail through |
| Modify | `components/StreamerCard.tsx` | Static thumbnail, clean light card |
| Modify | `components/LiveMarketsGrid.tsx` | Navigate to /markets/[channel], update state type |
| **Create** | `components/BetWidget.tsx` | Inline bet widget (logic from BetModal) |
| **Create** | `app/markets/[channel]/page.tsx` | Full market page route |
| Modify | `hooks/useUserBets.ts` | Join streams data for channel link |
| Modify | `app/bets/page.tsx` | Light theme rewrite |
| Modify | `app/page.tsx` | Remove Navbar import, update heading |
| **Delete** | `components/StreamerMarketsModal.tsx` | Replaced by market page |
| **Delete** | `components/BetModal.tsx` | Replaced by BetWidget |
| **Delete** | `components/MarketCard.tsx` | Unused |
| **Delete** | `components/Navbar.tsx` | Replaced by Sidebar + TopBar |

---

## Task 1: Design Tokens

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Replace tailwind.config.js**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        pm: {
          bg: '#FFFFFF',
          surface: '#F7F8FA',
          border: '#E5E7EB',
          text: '#111827',
          muted: '#6B7280',
          accent: '#6366F1',
          'live-red': '#EF4444',
          'yes-bg': '#EFF6FF',
          'yes': '#2563EB',
          'no-bg': '#FEF2F2',
          'no': '#DC2626',
        }
      },
      animation: {
        'slide-up': 'slideUp 0.4s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        slideUp: { from: { transform: 'translateY(20px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      }
    }
  },
  plugins: [],
}
```

- [ ] **Step 2: Replace globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-mono: 'IBM Plex Mono', monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html { height: 100%; }

body {
  background: #FFFFFF;
  color: #111827;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  height: 100%;
}

/* Scrollbar */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: #F7F8FA; }
::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 2px; }

/* Monospace numbers */
.num { font-family: var(--font-mono); }

/* Live dot pulse */
@keyframes livePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.live-dot { animation: livePulse 1.2s ease-in-out infinite; }
```

- [ ] **Step 3: Update layout.tsx — drop Bebas Neue from Google Fonts import**

```tsx
import type { Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pulse Protocol — Live Prediction Markets',
  description: 'Bet on live streaming events. AI-detected. Crypto-settled.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/tailwind.config.js frontend/app/globals.css frontend/app/layout.tsx
git commit -m "feat: light theme design tokens — Polymarket palette"
```

---

## Task 2: Shared Utils

**Files:**
- Create: `frontend/lib/utils.ts`

- [ ] **Step 1: Create lib/utils.ts — move KNOWN_STREAMERS and getStreamerFromTitle here**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/utils.ts
git commit -m "feat: shared utils — getStreamerFromTitle, calcOdds"
```

---

## Task 3: Oracle Thumbnail + API Route

**Files:**
- Modify: `oracle/detector.js` line 568 and line 589
- Modify: `frontend/app/api/live-streamers/route.ts`

- [ ] **Step 1: Update liveStreamersCache to include thumbnail (detector.js line 568)**

Find this line in `oracle/detector.js`:
```js
liveStreamersCache = liveStreamers.slice(0, 10).map(s => ({ channel: s.channel, viewers: s.viewers || 0 }))
```
Replace with:
```js
liveStreamersCache = liveStreamers.slice(0, 10).map(s => ({
  channel: s.channel,
  viewers: s.viewers || 0,
  thumbnail: s.thumbnail || null,
}))
```

- [ ] **Step 2: Update webhook payload to include thumbnail (detector.js line 589)**

Find:
```js
{ streamers: liveStreamers.slice(0, 10).map(s => ({ channel: s.channel, viewers: s.viewers })) }
```
Replace with:
```js
{ streamers: liveStreamers.slice(0, 10).map(s => ({ channel: s.channel, viewers: s.viewers, thumbnail: s.thumbnail || null })) }
```

- [ ] **Step 3: Commit oracle change**

```bash
git add oracle/detector.js
git commit -m "feat: include thumbnail in live streamers cache"
```

- [ ] **Step 4: The API route already passes through the streamers array unchanged — no change needed. Verify it passes thumbnail by checking the response shape:**

The existing `route.ts` returns `data.streamers || []` from the oracle. Since oracle now includes `thumbnail` in each streamer object, it will flow through automatically. No code change needed.

---

## Task 4: Sidebar Component

**Files:**
- Create: `frontend/components/Sidebar.tsx`

- [ ] **Step 1: Create Sidebar.tsx**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useEffect, useState } from 'react'

export function Sidebar() {
  const path = usePathname()
  const [liveCount, setLiveCount] = useState(0)

  useEffect(() => {
    fetch('/api/live-streamers')
      .then(r => r.json())
      .then(d => setLiveCount((d.streamers || []).length))
      .catch(() => {})
  }, [])

  const navItems = [
    { href: '/', label: 'Markets', icon: '◈' },
    { href: '/bets', label: 'My Bets', icon: '◎' },
  ]

  return (
    <aside style={{
      width: '240px',
      flexShrink: 0,
      borderRight: '1px solid #E5E7EB',
      background: '#F7F8FA',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 40,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 8px' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px',
            background: '#EF4444',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '800', color: 'white', fontSize: '15px',
          }}>P</div>
          <span style={{ color: '#111827', fontWeight: '700', fontSize: '16px' }}>Pulse</span>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 12px', flex: 1 }}>
        {navItems.map(item => {
          const active = path === item.href
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px', textDecoration: 'none',
              marginBottom: '2px',
              background: active ? '#FFFFFF' : 'transparent',
              color: active ? '#111827' : '#6B7280',
              fontWeight: active ? '600' : '500',
              fontSize: '14px',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: '16px', opacity: 0.7 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}

        {/* Live count */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '9px 12px', borderRadius: '8px',
          color: '#6B7280', fontSize: '14px', fontWeight: '500',
        }}>
          <span
            className="live-dot"
            style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', display: 'inline-block', flexShrink: 0 }}
          />
          Live
          {liveCount > 0 && (
            <span style={{
              marginLeft: 'auto', background: '#FEE2E2', color: '#DC2626',
              borderRadius: '9999px', padding: '1px 7px', fontSize: '12px', fontWeight: '600',
            }}>{liveCount}</span>
          )}
        </div>
      </nav>

      {/* Bottom: chain + wallet */}
      <div style={{ padding: '16px', borderTop: '1px solid #E5E7EB' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 10px', background: '#ECFDF5', border: '1px solid #D1FAE5',
          borderRadius: '8px', marginBottom: '10px',
        }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
          <span style={{ color: '#065F46', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>Base Sepolia</span>
        </div>
        <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/Sidebar.tsx
git commit -m "feat: Sidebar component — desktop left nav"
```

---

## Task 5: TopBar Component

**Files:**
- Create: `frontend/components/TopBar.tsx`

- [ ] **Step 1: Create TopBar.tsx**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'

export function TopBar() {
  const path = usePathname()

  return (
    <>
      {/* Mobile navbar — visible below lg */}
      <nav style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '56px',
      }} className="lg:hidden">
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', background: '#EF4444', borderRadius: '6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '800', color: 'white', fontSize: '13px',
          }}>P</div>
          <span style={{ color: '#111827', fontWeight: '700', fontSize: '15px' }}>Pulse</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {[
            { href: '/', label: 'Markets' },
            { href: '/bets', label: 'My Bets' },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{
              textDecoration: 'none', fontSize: '14px', fontWeight: '500',
              color: path === item.href ? '#111827' : '#6B7280',
              borderBottom: path === item.href ? '2px solid #6366F1' : '2px solid transparent',
              paddingBottom: '2px',
            }}>
              {item.label}
            </Link>
          ))}
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
        </div>
      </nav>

      {/* Desktop top bar — visible from lg, inside the main content area */}
      <div style={{
        borderBottom: '1px solid #E5E7EB',
        padding: '0 32px',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        background: '#FFFFFF',
        flexShrink: 0,
      }} className="hidden lg:flex">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '5px 10px', background: '#ECFDF5', border: '1px solid #D1FAE5', borderRadius: '8px',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
            <span style={{ color: '#065F46', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>Base Sepolia</span>
          </div>
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/TopBar.tsx
git commit -m "feat: TopBar component — mobile navbar + desktop top bar"
```

---

## Task 6: Layout Shell

**Files:**
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Update layout.tsx to use Sidebar + TopBar shell**

```tsx
import type { Metadata } from 'next'
import { Providers } from './providers'
import { Sidebar } from '../components/Sidebar'
import { TopBar } from '../components/TopBar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pulse Protocol — Live Prediction Markets',
  description: 'Bet on live streaming events. AI-detected. Crypto-settled.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ display: 'flex', minHeight: '100vh' }}>
        <Providers>
          {/* Desktop sidebar */}
          <div className="hidden lg:block" style={{ width: '240px', flexShrink: 0 }}>
            <Sidebar />
          </div>
          {/* Main column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <TopBar />
            <main style={{ flex: 1, background: '#FFFFFF' }}>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/layout.tsx
git commit -m "feat: layout shell with Sidebar + TopBar"
```

---

## Task 7: StreamerCard Redesign

**Files:**
- Modify: `frontend/components/StreamerCard.tsx`

- [ ] **Step 1: Rewrite StreamerCard.tsx**

The `onClick` prop is now replaced with `href` navigation — the parent (`LiveMarketsGrid`) will use `useRouter` to push to `/markets/[channel]`.

```tsx
'use client'
import { useState } from 'react'

interface Props {
  channel: string
  markets: any[]
  isLive: boolean
  thumbnail: string | null
  onClick: () => void
}

export function StreamerCard({ channel, markets, isLive, thumbnail, onClick }: Props) {
  const [imgError, setImgError] = useState(false)
  const firstMarket = markets[0]

  return (
    <div
      onClick={onClick}
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#F3F4F6' }}>
        {thumbnail && !imgError ? (
          <img
            src={thumbnail}
            alt={channel}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, #F3F4F6, #E5E7EB)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '32px', opacity: 0.3 }}>📺</span>
          </div>
        )}
        {isLive && (
          <span style={{
            position: 'absolute', top: '10px', left: '10px',
            background: '#EF4444', color: 'white',
            fontSize: '11px', fontWeight: '700',
            padding: '3px 8px', borderRadius: '9999px',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <span className="live-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'white', display: 'inline-block' }} />
            LIVE
          </span>
        )}
        {markets.length > 0 && (
          <span style={{
            position: 'absolute', top: '10px', right: '10px',
            background: 'rgba(255,255,255,0.9)',
            color: '#111827', fontSize: '11px', fontWeight: '600',
            padding: '3px 8px', borderRadius: '9999px',
            backdropFilter: 'blur(4px)',
          }}>
            {markets.length} market{markets.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: '#111827', fontWeight: '600', fontSize: '14px' }}>{channel}</span>
          <a
            href={`https://kick.com/${channel}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}
          >
            kick.com ↗
          </a>
        </div>

        {firstMarket ? (
          <>
            <p style={{
              color: '#374151', fontSize: '12px', lineHeight: '1.5',
              margin: '0 0 8px',
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {firstMarket.title}
            </p>
            <MiniOddsBar market={firstMarket} />
          </>
        ) : (
          <p style={{ color: '#9CA3AF', fontSize: '12px', margin: 0 }}>No active markets</p>
        )}

        <div style={{ marginTop: '10px', color: '#6366F1', fontSize: '12px', fontWeight: '600' }}>
          View markets →
        </div>
      </div>
    </div>
  )
}

function MiniOddsBar({ market }: { market: any }) {
  const totalPool = (market.total_yes_usdc || 0) + (market.total_no_usdc || 0)
  const yesPercent = totalPool > 0 ? Math.round((market.total_yes_usdc / totalPool) * 100) : 50
  const noPercent = 100 - yesPercent

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
        <span style={{ color: '#2563EB', fontWeight: '700' }}>Yes {yesPercent}%</span>
        <span style={{ color: '#DC2626', fontWeight: '700' }}>{noPercent}% No</span>
      </div>
      <div style={{ height: '3px', background: '#E5E7EB', borderRadius: '9999px', overflow: 'hidden', display: 'flex' }}>
        <div style={{ height: '100%', width: yesPercent + '%', background: '#2563EB', transition: 'width 0.5s ease' }} />
        <div style={{ height: '100%', width: noPercent + '%', background: '#DC2626', transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/StreamerCard.tsx
git commit -m "feat: StreamerCard redesign — light theme, static thumbnail"
```

---

## Task 8: LiveMarketsGrid Update

**Files:**
- Modify: `frontend/components/LiveMarketsGrid.tsx`

- [ ] **Step 1: Rewrite LiveMarketsGrid.tsx**

Key changes: import `getStreamerFromTitle`/`KNOWN_STREAMERS` from `lib/utils`, extend `liveStreams` type to include `thumbnail`, navigate to `/markets/[channel]` instead of opening modal, remove modal state.

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Market } from '../lib/supabase'
import { StreamerCard } from './StreamerCard'
import { getStreamerFromTitle, KNOWN_STREAMERS } from '../lib/utils'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'fps', label: 'FPS' },
  { key: 'irl', label: 'IRL' },
  { key: 'sports', label: 'Sports' },
]

export function LiveMarketsGrid() {
  const router = useRouter()
  const [markets, setMarkets] = useState<Market[]>([])
  const [liveStreams, setLiveStreams] = useState<{ channel: string; viewers: number; thumbnail: string | null }[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    const streamsRes = await fetch('/api/live-streamers').then(r => r.json()).catch(() => ({ streamers: [] }))
    setLiveStreams(streamsRes.streamers || [])

    let query = supabase
      .from('markets')
      .select('*, streams(*, streamers(*))')
      .in('status', ['open', 'locked'])
      .order('created_at', { ascending: false })
      .limit(100)
    if (filter !== 'all') query = query.eq('category', filter)
    const { data } = await query
    setMarkets(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const channel = supabase.channel('markets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, fetchData)
      .subscribe()
    const streamPoll = setInterval(fetchData, 60_000)
    return () => { supabase.removeChannel(channel); clearInterval(streamPoll) }
  }, [filter])

  // Build streamer → markets map
  const streamerMap = new Map<string, Market[]>()
  for (const market of markets) {
    const streamer = market.streams?.stream_key || getStreamerFromTitle(market.title)
    if (!streamer) continue
    if (!streamerMap.has(streamer)) streamerMap.set(streamer, [])
    streamerMap.get(streamer)!.push(market)
  }

  // Merge live streams + market-only streamers
  const allChannels: string[] = []
  const seen = new Set<string>()
  for (const s of liveStreams) {
    if (!seen.has(s.channel)) { allChannels.push(s.channel); seen.add(s.channel) }
  }
  for (const key of streamerMap.keys()) {
    if (!seen.has(key)) { allChannels.push(key); seen.add(key) }
  }

  const liveMap = new Map(liveStreams.map(s => [s.channel, s]))

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Page heading */}
      <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '16px' }}>Markets</h1>

      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: '0',
        borderBottom: '1px solid #E5E7EB', marginBottom: '24px',
      }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '8px 16px', background: 'transparent', border: 'none',
              borderBottom: filter === f.key ? '2px solid #6366F1' : '2px solid transparent',
              color: filter === f.key ? '#6366F1' : '#6B7280',
              fontWeight: filter === f.key ? '600' : '500',
              fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s',
              marginBottom: '-1px',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              height: '280px', background: '#F3F4F6',
              border: '1px solid #E5E7EB', borderRadius: '12px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
      ) : allChannels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.4 }}>📡</div>
          <p style={{ color: '#111827', fontSize: '16px', fontWeight: '600', marginBottom: '6px' }}>
            Scanning Streams
          </p>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>
            AI Watcher is monitoring live streams. Markets appear when events are detected.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {allChannels.map(channel => {
            const live = liveMap.get(channel)
            return (
              <StreamerCard
                key={channel}
                channel={channel}
                markets={streamerMap.get(channel) || []}
                isLive={!!live}
                thumbnail={live?.thumbnail || null}
                onClick={() => router.push(`/markets/${channel}`)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/LiveMarketsGrid.tsx
git commit -m "feat: LiveMarketsGrid — navigate to market page, light theme"
```

---

## Task 9: Home Page Update

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Rewrite page.tsx — remove Navbar, remove wrapper styles**

```tsx
import { LiveMarketsGrid } from '../components/LiveMarketsGrid'

export default function Home() {
  return <LiveMarketsGrid />
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat: home page — simplified, layout shell handles nav"
```

---

## Task 10: BetWidget Component

**Files:**
- Create: `frontend/components/BetWidget.tsx`

This is the inline bet widget extracted from `StreamerMarketsModal.tsx`. All wagmi logic is identical — only the visual shell is new (light theme, no modal overlay).

- [ ] **Step 1: Create BetWidget.tsx**

```tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useConfig } from 'wagmi'
import { simulateContract } from '@wagmi/core'
import { parseUnits, maxUint256 } from 'viem'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { supabase } from '../lib/supabase'
import { VAULT_ADDRESS, USDC_ADDRESS, VAULT_ABI, ERC20_ABI } from '../lib/wagmi'
import { calcOdds } from '../lib/utils'

interface Props {
  market: any
  expired: boolean
  onSuccess: () => void
}

type BetStep = 'input' | 'approve' | 'confirming' | 'done' | 'error'

export function BetWidget({ market, expired, onSuccess }: Props) {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const config = useConfig()

  const [betSide, setBetSide] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<BetStep>('input')
  const [errorMsg, setErrorMsg] = useState('')
  const contractBetIdRef = useRef<string | null>(null)

  const amountUsdc = parseFloat(amount) || 0
  const amountRaw = amount ? parseUnits(amount, 6) : 0n
  const odds = calcOdds(market)
  const selectedOdds = betSide === 'yes' ? odds.yesOdds : odds.noOdds
  const potentialPayout = (amountUsdc * selectedOdds).toFixed(2)

  // Allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
  })
  const needsApproval = amountRaw > 0n && (allowance === undefined || allowance < amountRaw)

  // Approve
  const { writeContract: approve, data: approveTxHash } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // Place bet
  const { writeContract: placeBet, data: betTxHash } = useWriteContract()
  const { isSuccess: betConfirmed } = useWaitForTransactionReceipt({ hash: betTxHash })

  useEffect(() => {
    if (approveConfirmed) { refetchAllowance(); placeBetNow() }
  }, [approveConfirmed])

  useEffect(() => {
    if (betConfirmed && betTxHash) saveBet(betTxHash)
  }, [betConfirmed, betTxHash])

  const placeBetNow = async () => {
    if (!market || !address || !amountRaw) return
    try {
      setStep('confirming')
      const { result: betId, request } = await simulateContract(config, {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'placeBet',
        args: [market.contract_market_id as `0x${string}`, betSide === 'yes', amountRaw],
        account: address,
      })
      contractBetIdRef.current = betId as string
      placeBet(request)
    } catch (e: any) {
      setErrorMsg(e.shortMessage || e.message || 'Transaction failed')
      setStep('error')
    }
  }

  const handleBet = async () => {
    if (!isConnected) { openConnectModal?.(); return }
    if (!amountRaw) return
    setErrorMsg('')
    try {
      if (needsApproval) {
        setStep('approve')
        approve({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [VAULT_ADDRESS, maxUint256] })
      } else {
        await placeBetNow()
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Transaction failed')
      setStep('error')
    }
  }

  const saveBet = async (txHash: string) => {
    if (!address) return
    try {
      await supabase.from('users').upsert(
        { wallet_address: address.toLowerCase(), last_seen_at: new Date().toISOString() },
        { onConflict: 'wallet_address', ignoreDuplicates: false }
      )
      const { data: user } = await supabase.from('users').select('id').eq('wallet_address', address.toLowerCase()).single()
      await supabase.from('bets').insert({
        market_id: market.id,
        user_id: user?.id,
        wallet_address: address.toLowerCase(),
        side: betSide,
        amount_usdc: amountUsdc,
        odds_at_placement: selectedOdds,
        potential_payout_usdc: parseFloat(potentialPayout),
        status: 'confirmed',
        tx_hash: txHash,
        contract_bet_id: contractBetIdRef.current,
      })
    } catch (e) { console.error('Save error:', e) }
    setStep('done')
    setTimeout(() => { setStep('input'); setAmount(''); onSuccess() }, 2000)
  }

  if (step === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '28px 0' }}>
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
        <p style={{ color: '#059669', fontWeight: '700', fontSize: '15px', margin: '0 0 4px' }}>Bet Confirmed</p>
        <p style={{ color: '#6B7280', fontSize: '12px', fontFamily: 'var(--font-mono)', margin: 0 }}>
          ${amountUsdc.toFixed(2)} on {betSide.toUpperCase()} · up to ${potentialPayout}
        </p>
      </div>
    )
  }

  if (step === 'approve' || step === 'confirming') {
    return (
      <div style={{ textAlign: 'center', padding: '28px 0' }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{
          width: '32px', height: '32px', border: '2px solid #E5E7EB', borderTopColor: '#6366F1',
          borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px',
        }} />
        <p style={{ color: '#6B7280', fontSize: '13px', margin: '0 0 3px' }}>
          {step === 'approve' ? 'Approving USDC…' : 'Confirming bet…'}
        </p>
        <p style={{ color: '#9CA3AF', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Check your wallet</p>
      </div>
    )
  }

  return (
    <div>
      {/* YES / NO toggle */}
      <div style={{ display: 'flex', background: '#F7F8FA', borderRadius: '8px', padding: '3px', gap: '3px', marginBottom: '14px' }}>
        {(['yes', 'no'] as const).map(s => (
          <button
            key={s}
            onClick={() => setBetSide(s)}
            disabled={expired}
            style={{
              flex: 1, padding: '9px 0', borderRadius: '6px', border: 'none',
              cursor: expired ? 'not-allowed' : 'pointer',
              background: betSide === s
                ? (s === 'yes' ? '#EFF6FF' : '#FEF2F2')
                : 'transparent',
              color: betSide === s ? (s === 'yes' ? '#2563EB' : '#DC2626') : '#6B7280',
              fontWeight: '700', fontSize: '13px', transition: 'all 0.15s',
            }}
          >
            {s.toUpperCase()} ×{s === 'yes' ? odds.yesOdds : odds.noOdds}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ color: '#6B7280', fontSize: '11px', display: 'block', marginBottom: '6px', letterSpacing: '0.06em' }}>
          AMOUNT (USDC)
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            min="1"
            disabled={expired}
            style={{
              width: '100%', background: '#F7F8FA', border: '1px solid #E5E7EB', borderRadius: '8px',
              padding: '10px 48px 10px 12px', color: '#111827', fontSize: '15px',
              fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
            }}
          />
          <span style={{
            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
            color: '#9CA3AF', fontSize: '11px', fontFamily: 'var(--font-mono)',
          }}>USDC</span>
        </div>
        <div style={{ display: 'flex', gap: '5px', marginTop: '7px' }}>
          {[5, 10, 25, 50].map(v => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              disabled={expired}
              style={{
                flex: 1, padding: '5px 0', background: '#FFFFFF', border: '1px solid #E5E7EB',
                borderRadius: '6px', color: '#374151', cursor: expired ? 'not-allowed' : 'pointer',
                fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: '600',
              }}
            >${v}</button>
          ))}
        </div>
      </div>

      {/* Payout preview */}
      {amountUsdc > 0 && (
        <div style={{
          background: '#F7F8FA', border: '1px solid #E5E7EB', borderRadius: '8px',
          padding: '10px 12px', marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: '#6B7280' }}>Potential payout</span>
            <span style={{ color: '#111827', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>${potentialPayout}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span style={{ color: '#9CA3AF' }}>Odds</span>
            <span style={{ color: '#6B7280', fontFamily: 'var(--font-mono)' }}>×{selectedOdds}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '3px' }}>
            <span style={{ color: '#9CA3AF' }}>Protocol fee</span>
            <span style={{ color: '#6B7280', fontFamily: 'var(--font-mono)' }}>0.75%</span>
          </div>
        </div>
      )}

      {step === 'error' && (
        <p style={{ color: '#DC2626', fontSize: '11px', marginBottom: '8px', lineHeight: '1.4' }}>
          {errorMsg || 'Transaction failed'}
        </p>
      )}

      <button
        onClick={handleBet}
        disabled={expired || !amountUsdc}
        style={{
          width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
          background: expired || !amountUsdc
            ? '#F3F4F6'
            : betSide === 'yes' ? '#2563EB' : '#DC2626',
          color: expired || !amountUsdc ? '#9CA3AF' : 'white',
          fontWeight: '700', fontSize: '14px', letterSpacing: '0.04em',
          cursor: expired || !amountUsdc ? 'not-allowed' : 'pointer',
          transition: 'opacity 0.15s',
        }}
      >
        {expired
          ? 'Market Closed'
          : !isConnected
          ? 'Connect Wallet'
          : needsApproval
          ? 'Approve & Bet'
          : `Bet ${betSide.toUpperCase()}`}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/BetWidget.tsx
git commit -m "feat: BetWidget — inline bet placement, light theme"
```

---

## Task 11: Market Page Route

**Files:**
- Create: `frontend/app/markets/[channel]/page.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p frontend/app/markets/\[channel\]
```

- [ ] **Step 2: Create app/markets/[channel]/page.tsx**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow, isPast } from 'date-fns'
import { useAccount } from 'wagmi'
import { supabase } from '../../../lib/supabase'
import { calcOdds, getStreamerFromTitle } from '../../../lib/utils'
import { BetWidget } from '../../../components/BetWidget'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      color: '#9CA3AF', fontSize: '10px', fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px',
    }}>{children}</h3>
  )
}

export default function MarketPage() {
  const params = useParams()
  const channel = (params.channel as string).toLowerCase()
  const { address } = useAccount()

  const [markets, setMarkets] = useState<any[]>([])
  const [selectedMarket, setSelectedMarket] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [topHolders, setTopHolders] = useState<{ addr: string; total: number }[]>([])
  const [timeLeft, setTimeLeft] = useState('')
  const [expired, setExpired] = useState(false)
  const [dataRefresh, setDataRefresh] = useState(0)
  const [liveInfo, setLiveInfo] = useState<{ viewers?: number } | null>(null)

  // Fetch markets for this channel
  useEffect(() => {
    const fetchMarkets = async () => {
      const { data } = await supabase
        .from('markets')
        .select('*, streams(*, streamers(*))')
        .in('status', ['open', 'locked'])
      if (!data) { setLoading(false); return }

      const channelMarkets = data.filter(m =>
        (m.streams?.stream_key?.toLowerCase() === channel) ||
        getStreamerFromTitle(m.title) === channel
      )
      setMarkets(channelMarkets)
      setSelectedMarket(channelMarkets[0] || null)
      setLoading(false)
    }
    fetchMarkets()

    const ch = supabase.channel('market-page')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'markets' }, fetchMarkets)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [channel])

  // Fetch activity/positions/holders
  useEffect(() => {
    if (!selectedMarket) return
    const go = async () => {
      const { data: bets } = await supabase
        .from('bets').select('*').eq('market_id', selectedMarket.id)
        .order('created_at', { ascending: false }).limit(25)
      setActivity(bets || [])

      if (address) {
        const { data: myBets } = await supabase
          .from('bets').select('*').eq('market_id', selectedMarket.id)
          .eq('wallet_address', address.toLowerCase()).order('created_at', { ascending: false })
        setPositions(myBets || [])
      }

      const { data: allBets } = await supabase
        .from('bets').select('wallet_address, amount_usdc').eq('market_id', selectedMarket.id)
      if (allBets) {
        const map = new Map<string, number>()
        for (const b of allBets) map.set(b.wallet_address, (map.get(b.wallet_address) || 0) + b.amount_usdc)
        setTopHolders([...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([addr, total]) => ({ addr, total })))
      }
    }
    go()
  }, [selectedMarket?.id, address, dataRefresh])

  // Live info
  useEffect(() => {
    fetch('/api/live-streamers').then(r => r.json()).then(d => {
      const streamer = (d.streamers || []).find((s: any) => s.channel.toLowerCase() === channel)
      if (streamer) setLiveInfo({ viewers: streamer.viewers })
    }).catch(() => {})
  }, [channel])

  // Countdown timer
  useEffect(() => {
    if (!selectedMarket) return
    const update = () => {
      const closes = new Date(selectedMarket.closes_at)
      if (isPast(closes)) { setExpired(true); setTimeLeft('Ended') }
      else { setExpired(false); setTimeLeft(formatDistanceToNow(closes, { addSuffix: true })) }
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [selectedMarket?.closes_at])

  if (loading) {
    return (
      <div style={{ padding: '32px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ height: '24px', width: '120px', background: '#F3F4F6', borderRadius: '6px', marginBottom: '24px' }} />
        <div style={{ height: '400px', background: '#F3F4F6', borderRadius: '12px' }} />
      </div>
    )
  }

  const sm = selectedMarket
  const odds = sm ? calcOdds(sm) : null

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 32px' }}>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <Link href="/" style={{ color: '#6B7280', fontSize: '13px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ← Markets
        </Link>
        <span style={{ color: '#D1D5DB' }}>·</span>
        <span style={{ color: '#111827', fontWeight: '600', fontSize: '15px' }}>{channel}</span>
        {liveInfo && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            background: '#FEF2F2', color: '#DC2626',
            fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '9999px',
          }}>
            <span className="live-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
            LIVE
            {liveInfo.viewers ? ` · ${liveInfo.viewers.toLocaleString()} viewers` : ''}
          </span>
        )}
        <a href={`https://kick.com/${channel}`} target="_blank" rel="noopener noreferrer"
           style={{ color: '#9CA3AF', fontSize: '11px', fontFamily: 'var(--font-mono)', textDecoration: 'none', marginLeft: 'auto' }}>
          kick.com/{channel} ↗
        </a>
      </div>

      {/* Stream */}
      <div style={{ background: '#000', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', width: '100%', marginBottom: '0' }}>
        <iframe
          src={`https://player.kick.com/${channel}?autoplay=true&muted=false&parent=pulse-protocol1.vercel.app`}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allowFullScreen allow="autoplay; fullscreen"
        />
      </div>

      {/* Market tabs */}
      {markets.length > 1 && (
        <div style={{
          display: 'flex', borderBottom: '1px solid #E5E7EB',
          overflowX: 'auto', marginTop: '16px',
        }}>
          {markets.map(m => {
            const active = sm?.id === m.id
            return (
              <button
                key={m.id}
                onClick={() => setSelectedMarket(m)}
                style={{
                  padding: '10px 16px', background: 'transparent', border: 'none',
                  borderBottom: active ? '2px solid #6366F1' : '2px solid transparent',
                  color: active ? '#6366F1' : '#6B7280',
                  cursor: 'pointer', fontSize: '12px', fontWeight: active ? '600' : '400',
                  whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s',
                  marginBottom: '-1px',
                }}
              >
                {m.title.length > 44 ? m.title.slice(0, 44) + '…' : m.title}
              </button>
            )
          })}
        </div>
      )}

      {markets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#6B7280' }}>
          No active markets for this streamer yet.
        </div>
      )}

      {sm && odds && (
        <div style={{ display: 'flex', gap: '24px', marginTop: '20px', alignItems: 'flex-start' }}>
          {/* Left column */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Market question + prob */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                <h2 style={{ color: '#111827', fontSize: '18px', fontWeight: '700', margin: 0, lineHeight: '1.45' }}>
                  {sm.title}
                </h2>
                <span style={{ color: expired ? '#DC2626' : '#6B7280', fontSize: '11px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0, paddingTop: '3px' }}>
                  {timeLeft}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                <span style={{ color: '#2563EB', fontWeight: '700' }}>YES {odds.yesPercent}%</span>
                <span style={{ color: '#9CA3AF' }}>${odds.totalPool.toFixed(0)} volume</span>
                <span style={{ color: '#DC2626', fontWeight: '700' }}>{odds.noPercent}% NO</span>
              </div>
              <div style={{ height: '6px', background: '#E5E7EB', borderRadius: '9999px', overflow: 'hidden', display: 'flex' }}>
                <div style={{ height: '100%', width: odds.yesPercent + '%', background: '#2563EB', transition: 'width 0.5s ease' }} />
                <div style={{ height: '100%', width: odds.noPercent + '%', background: '#DC2626', transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <span style={{ padding: '3px 12px', borderRadius: '9999px', fontSize: '12px', fontFamily: 'var(--font-mono)', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB' }}>Yes ×{odds.yesOdds}</span>
                <span style={{ padding: '3px 12px', borderRadius: '9999px', fontSize: '12px', fontFamily: 'var(--font-mono)', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>No ×{odds.noOdds}</span>
              </div>
            </div>

            {/* Rules */}
            <div style={{ marginBottom: '24px' }}>
              <SectionLabel>Rules</SectionLabel>
              <div style={{ background: '#F7F8FA', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '14px 16px' }}>
                <p style={{ color: '#374151', fontSize: '13px', lineHeight: '1.65', margin: '0 0 8px' }}>
                  This market resolves <strong>YES</strong> if {sm.title.replace(/^Will\s+/i, '').replace(/\?$/, '')}, as verified by live stream data monitored by the Pulse oracle.
                  Resolves <strong>NO</strong> if the event does not occur or the stream ends first.
                </p>
                <p style={{ color: '#9CA3AF', fontSize: '11px', fontFamily: 'var(--font-mono)', margin: 0 }}>
                  Source: Kick stream oracle · Closes {timeLeft}
                </p>
              </div>
            </div>

            {/* Activity */}
            <div>
              <SectionLabel>Activity</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {activity.length === 0 ? (
                  <p style={{ color: '#9CA3AF', fontSize: '13px' }}>No bets yet — be the first!</p>
                ) : activity.map((bet, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '9px 12px', background: '#F7F8FA', border: '1px solid #E5E7EB', borderRadius: '8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', fontFamily: 'var(--font-mono)',
                        background: bet.side === 'yes' ? '#EFF6FF' : '#FEF2F2',
                        color: bet.side === 'yes' ? '#2563EB' : '#DC2626',
                      }}>{bet.side.toUpperCase()}</span>
                      <span style={{ color: '#6B7280', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                        {bet.wallet_address.slice(0, 6)}…{bet.wallet_address.slice(-4)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: '#111827', fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                        ${bet.amount_usdc.toFixed(2)}
                      </span>
                      <span style={{ color: '#D1D5DB', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                        {formatDistanceToNow(new Date(bet.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right sidebar — sticky */}
          <div style={{
            width: '300px', flexShrink: 0,
            position: 'sticky', top: '20px',
            background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px',
            padding: '18px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <SectionLabel>Place Bet</SectionLabel>
            <BetWidget
              market={sm}
              expired={expired}
              onSuccess={() => setDataRefresh(n => n + 1)}
            />

            {positions.length > 0 && (
              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #E5E7EB' }}>
                <SectionLabel>My Positions</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {positions.map((bet, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 10px', background: '#F7F8FA', border: '1px solid #E5E7EB', borderRadius: '8px',
                    }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', fontFamily: 'var(--font-mono)',
                        background: bet.side === 'yes' ? '#EFF6FF' : '#FEF2F2',
                        color: bet.side === 'yes' ? '#2563EB' : '#DC2626',
                      }}>{bet.side.toUpperCase()}</span>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#111827', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>${bet.amount_usdc.toFixed(2)}</div>
                        <div style={{ color: '#9CA3AF', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>→ ${bet.potential_payout_usdc?.toFixed(2) || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {topHolders.length > 0 && (
              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #E5E7EB' }}>
                <SectionLabel>Top Holders</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {topHolders.map((h, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 10px', background: '#F7F8FA', border: '1px solid #E5E7EB', borderRadius: '8px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{ color: '#D1D5DB', fontSize: '10px', fontFamily: 'var(--font-mono)', width: '14px' }}>#{i + 1}</span>
                        <span style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          {h.addr.slice(0, 6)}…{h.addr.slice(-4)}
                        </span>
                      </div>
                      <span style={{ color: '#111827', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                        ${h.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/markets
git commit -m "feat: /markets/[channel] page — full Polymarket-style market page"
```

---

## Task 12: useUserBets Hook Update

**Files:**
- Modify: `frontend/hooks/useUserBets.ts`

The hook needs to join stream data so bet cards can link to `/markets/[channel]`.

- [ ] **Step 1: Update the select query in useUserBets.ts**

```ts
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { supabase, type Bet } from '../lib/supabase'

export function useUserBets() {
  const { address } = useAccount()
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(false)

  const fetchBets = async (addr: string) => {
    const { data } = await supabase
      .from('bets')
      .select('*, markets(title, status, outcome, category, closes_at, streams(stream_key))')
      .eq('wallet_address', addr.toLowerCase())
      .order('placed_at', { ascending: false })
      .limit(50)
    setBets((data as any) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!address) { setBets([]); return }
    setLoading(true)
    fetchBets(address)

    const channel = supabase.channel('user-bets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => fetchBets(address))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'markets' }, () => fetchBets(address))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [address])

  const activeBets = bets.filter(b => b.status === 'confirmed' || b.status === 'pending')
  const settledBets = bets.filter(b => ['won', 'lost', 'refunded'].includes(b.status))
  const totalWon = settledBets.filter(b => b.status === 'won').reduce((s, b) => s + b.potential_payout_usdc, 0)

  return { bets, activeBets, settledBets, totalWon, loading, refetch: () => address && fetchBets(address) }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/hooks/useUserBets.ts
git commit -m "feat: useUserBets joins stream data for market page links"
```

---

## Task 13: My Bets Page Redesign

**Files:**
- Modify: `frontend/app/bets/page.tsx`

- [ ] **Step 1: Rewrite bets/page.tsx**

```tsx
'use client'
import { useState } from 'react'
import { useUserBets } from '../../hooks/useUserBets'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { formatDistanceToNow, isPast } from 'date-fns'
import Link from 'next/link'
import { VAULT_ADDRESS, VAULT_ABI } from '../../lib/wagmi'
import { getStreamerFromTitle } from '../../lib/utils'

type Tab = 'active' | 'settled' | 'all'

export default function BetsPage() {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { bets, activeBets, settledBets, totalWon, loading, refetch } = useUserBets()
  const [tab, setTab] = useState<Tab>('active')

  const totalWagered = bets.reduce((s, b) => s + b.amount_usdc, 0)
  const pnl = totalWon - totalWagered

  const displayBets = tab === 'active' ? activeBets : tab === 'settled' ? settledBets : bets

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '20px' }}>My Bets</h1>

      {!isConnected ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ color: '#6B7280', marginBottom: '16px', fontSize: '15px' }}>Connect your wallet to see your bets</p>
          <button
            onClick={openConnectModal}
            style={{
              padding: '10px 24px', background: '#6366F1', color: 'white',
              border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px',
            }}
          >Connect Wallet</button>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: '80px', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: '12px' }} />
          ))}
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Total Wagered', value: `$${totalWagered.toFixed(2)}` },
              { label: 'Total Won', value: `$${totalWon.toFixed(2)}` },
              { label: 'P&L', value: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`, color: pnl >= 0 ? '#059669' : '#DC2626' },
            ].map(s => (
              <div key={s.label} style={{
                background: '#F7F8FA', border: '1px solid #E5E7EB',
                borderRadius: '10px', padding: '14px', textAlign: 'center',
              }}>
                <p style={{ color: s.color || '#111827', fontSize: '18px', fontWeight: '700', margin: '0 0 3px', fontFamily: 'var(--font-mono)' }}>{s.value}</p>
                <p style={{ color: '#9CA3AF', fontSize: '11px', margin: 0 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', marginBottom: '16px' }}>
            {(['active', 'settled', 'all'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '8px 16px', background: 'transparent', border: 'none',
                  borderBottom: tab === t ? '2px solid #6366F1' : '2px solid transparent',
                  color: tab === t ? '#6366F1' : '#6B7280',
                  fontWeight: tab === t ? '600' : '500',
                  fontSize: '14px', cursor: 'pointer', marginBottom: '-1px',
                  textTransform: 'capitalize',
                }}
              >
                {t} {t === 'active' ? `(${activeBets.length})` : t === 'settled' ? `(${settledBets.length})` : `(${bets.length})`}
              </button>
            ))}
          </div>

          {/* Bet list */}
          {displayBets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF' }}>
              {tab === 'active'
                ? <><p style={{ marginBottom: '8px' }}>No active bets.</p><Link href="/" style={{ color: '#6366F1', fontWeight: '600', fontSize: '14px' }}>Browse markets →</Link></>
                : 'No bets here yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {displayBets.map(bet => <BetCard key={bet.id} bet={bet} onClaimed={refetch} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function BetCard({ bet, onClaimed }: { bet: any; onClaimed: () => void }) {
  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  if (isSuccess) onClaimed()

  const handleClaim = () => {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: bet.status === 'won' ? 'claimWinnings' : 'claimRefund',
      args: [bet.contract_bet_id as `0x${string}`],
    })
  }

  const canClaim = (bet.status === 'won' || bet.status === 'refunded') && !isSuccess && bet.contract_bet_id
  const market = bet.markets
  const channel = market?.streams?.stream_key || (market?.title ? getStreamerFromTitle(market.title) : null)
  const marketExpired = market?.closes_at ? isPast(new Date(market.closes_at)) : false

  const statusStyle = {
    won: { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
    lost: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
    confirmed: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    refunded: { color: '#6B7280', bg: '#F7F8FA', border: '#E5E7EB' },
  }
  const ss = statusStyle[bet.status as keyof typeof statusStyle] || statusStyle.confirmed

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '14px 16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Market title */}
      <div style={{ marginBottom: '10px' }}>
        {channel ? (
          <Link href={`/markets/${channel}`} style={{ textDecoration: 'none' }}>
            <p style={{ color: '#111827', fontSize: '14px', fontWeight: '600', margin: '0 0 2px', lineHeight: '1.4' }}>
              {market?.title || 'Market'}
            </p>
          </Link>
        ) : (
          <p style={{ color: '#111827', fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{market?.title || 'Market'}</p>
        )}
        {channel && <p style={{ color: '#9CA3AF', fontSize: '11px', margin: 0 }}>{channel}</p>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        {/* Left: side + amount */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', fontFamily: 'var(--font-mono)',
            background: bet.side === 'yes' ? '#EFF6FF' : '#FEF2F2',
            color: bet.side === 'yes' ? '#2563EB' : '#DC2626',
          }}>{bet.side.toUpperCase()}</span>
          <span style={{ color: '#111827', fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
            ${bet.amount_usdc.toFixed(2)}
          </span>
          <span style={{ color: '#9CA3AF', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            ×{bet.odds_at_placement?.toFixed(2) || '—'} → ${bet.potential_payout_usdc?.toFixed(2)}
          </span>
        </div>

        {/* Right: status + time + claim */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#9CA3AF', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            {formatDistanceToNow(new Date(bet.placed_at), { addSuffix: true })}
          </span>
          <span style={{
            padding: '2px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', fontFamily: 'var(--font-mono)',
            background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color,
          }}>{bet.status.toUpperCase()}</span>
          {canClaim && (
            <button
              onClick={handleClaim}
              disabled={isPending}
              style={{
                padding: '5px 14px', borderRadius: '8px', border: 'none',
                background: bet.status === 'won' ? '#059669' : '#6B7280',
                color: 'white', fontSize: '12px', fontWeight: '600',
                cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1,
              }}
            >
              {isPending ? '…' : bet.status === 'won' ? 'Claim' : 'Refund'}
            </button>
          )}
          {isSuccess && <span style={{ color: '#059669', fontSize: '12px', fontWeight: '600' }}>✓ Claimed</span>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/bets/page.tsx
git commit -m "feat: My Bets page — light theme, tabs, P&L stats"
```

---

## Task 14: Remove Deprecated Files

**Files:**
- Delete: `frontend/components/StreamerMarketsModal.tsx`
- Delete: `frontend/components/BetModal.tsx`
- Delete: `frontend/components/MarketCard.tsx`
- Delete: `frontend/components/Navbar.tsx`

- [ ] **Step 1: Delete deprecated components**

```bash
rm frontend/components/StreamerMarketsModal.tsx
rm frontend/components/BetModal.tsx
rm frontend/components/MarketCard.tsx
rm frontend/components/Navbar.tsx
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated modal and navbar components"
```

---

## Task 15: Push and Verify

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Check Vercel deployment**

Open https://pulse-protocol1.vercel.app/ after deployment completes (~2 min).

Verify:
- [ ] White background, Inter font, no scanlines
- [ ] Desktop: left sidebar visible, nav links highlight correctly
- [ ] Mobile: top navbar visible, sidebar hidden
- [ ] Home page: streamer cards with thumbnails (or gray placeholder), LIVE badge, YES/NO mini bar
- [ ] Clicking a card navigates to `/markets/[channel]`
- [ ] Market page: stream embed top-left, bet widget right sidebar, activity below
- [ ] Bet widget: YES/NO toggle blue/red, approve → confirm flow works
- [ ] My Bets: tabs, stats row, bet cards with Claim button
