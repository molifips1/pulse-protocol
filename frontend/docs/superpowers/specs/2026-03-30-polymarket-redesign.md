# Pulse Protocol — Polymarket-Style Redesign Spec
**Date:** 2026-03-30
**Approach:** Logic-preserve, shell-replace (Option C)
**Scope:** Full visual overhaul of the frontend only — all wagmi hooks, Supabase queries, and contract logic remain untouched.

---

## 1. Design System

### Colors
| Token | Value | Usage |
|---|---|---|
| `bg-primary` | `#FFFFFF` | Page background |
| `bg-secondary` | `#F7F8FA` | Sidebar, card hover |
| `border` | `#E5E7EB` | All dividers and card borders |
| `text-primary` | `#111827` | Headings, values |
| `text-muted` | `#6B7280` | Labels, timestamps, secondary text |
| `yes-bg` | `#EFF6FF` | YES button/pill background |
| `yes-text` | `#2563EB` | YES color (blue-600) |
| `no-bg` | `#FEF2F2` | NO button/pill background |
| `no-text` | `#DC2626` | NO color (red-600) |
| `accent` | `#6366F1` | Active nav item, links |
| `live-red` | `#EF4444` | Live dot indicator |

### Typography
- **Drop** Bebas Neue — replace with Inter 600/700 for all headings and CTAs
- **Keep** IBM Plex Mono for numbers, odds, wallet addresses, amounts
- **Keep** Inter for body text (already installed)

### Borders & Elevation
- Cards: `1px solid #E5E7EB`, `border-radius: 12px`, `box-shadow: 0 1px 3px rgba(0,0,0,0.06)`
- Sidebar: `border-right: 1px solid #E5E7EB`
- No glow effects, no scanlines, no gradient buttons
- Buttons: solid fills, `border-radius: 8px`

### Tailwind Config Updates
Replace the existing `pulse.*` color tokens in `tailwind.config.js` with the new palette above. Keep existing animation utilities (`slide-up`, `fade-in`).

---

## 2. Layout System

### Desktop (≥1024px)
- Fixed left sidebar: **240px wide**, `bg-secondary`, `border-right`
- Main content: fills remaining width
- Within main: sticky top bar (32px tall) with search input + wallet connect button
- Max content width: `1280px`, centered

### Mobile (<1024px)
- Sidebar hidden
- Sticky top navbar: logo left, nav links center, wallet connect right
- Full-width content below

### New Files
- `components/Sidebar.tsx` — desktop sidebar (logo, nav links, chain badge, wallet button)
- `components/TopBar.tsx` — in-page top bar on desktop; full sticky navbar on mobile
- `app/layout.tsx` — updated to render `<Sidebar>` + `<TopBar>` + `{children}`

### Sidebar Contents
1. Pulse logo (top-left)
2. Nav links with active state highlight:
   - Markets (→ `/`)
   - My Bets (→ `/bets`)
   - Live — with animated red dot + count of currently live streamers
3. Bottom section: Base Sepolia chain badge + ConnectButton

---

## 3. Home Page (`/`)

### Layout
- Page heading: "Markets" (Inter 700, 24px)
- Filter tabs below heading: All · FPS · IRL · Sports — underline active style, no pill backgrounds
- Responsive grid: 1 col mobile → 2 col tablet → 3 col desktop → 4 col wide

### StreamerCard Redesign
**Replace `components/StreamerCard.tsx` visual shell entirely. Keep click handler (opens market page).**

- White card, `1px #E5E7EB` border, `border-radius: 12px`
- **Thumbnail:** static `<img>` using the `thumbnail` URL already returned by `/api/live-streamers` (the oracle fetches `d.livestream.thumbnail.url` from Kick's API). The `liveStreams` state in `LiveMarketsGrid` needs to be extended to `{ channel, viewers, thumbnail }`. Falls back to a `#F3F4F6` gray placeholder `<div>` if the URL is null or the image errors.
- **Live badge:** `● LIVE` red pill, top-left of thumbnail, only shown when streamer is live
- **Body:** streamer name (Inter 600, 15px) + kick.com link in muted text
- **Market count:** gray pill "3 markets"
- **Market preview:** first market's truncated question + YES% in blue, NO% in red
- **CTA:** "View markets →" indigo text link
- **Hover state:** `box-shadow` lift (`0 4px 12px rgba(0,0,0,0.1)`), no scale transform

### Loading State
6 skeleton cards with gray animated pulse (keep existing animation).

### Empty State
Centered: radar icon + "Scanning streams. Markets appear when events are detected."

---

## 4. Market Page (`/markets/[channel]`)

**New route replacing StreamerMarketsModal entirely.**

### Navigation
- Back link: `← Markets` top-left
- Page title: channel name + `● LIVE` badge + viewer count
- Kick.com link

### Two-Column Layout
**Left column (flexible width):**
1. Kick stream embed — `aspect-ratio: 16/9`, full column width
2. Market tabs — below the stream, one tab per market (truncated title, 44 chars max)
3. Selected market question — Inter 700, 18px
4. Probability bar — blue fill for YES%, red fill for NO%, with percentage labels and volume
5. Rules section — gray card explaining resolution criteria
6. Activity feed — recent bets list (side pill, wallet address, amount, time ago)

**Right column (320px, sticky):**
1. Bet widget:
   - YES / NO toggle buttons (blue/red fills when active)
   - Amount input with $5 / $10 / $25 / $50 quick-pick buttons
   - Payout preview (potential payout, odds, 0.75% fee)
   - Submit button: "BET YES" (blue) or "BET NO" (red)
   - Approve → confirming spinner states (inline, no popup)
   - Done state: green checkmark + confirmation text
2. My Positions — only shown when wallet connected and bets exist
3. Top Holders — top 5 wallets by total stake

### New Files
- `app/markets/[channel]/page.tsx` — route, fetches markets by channel name from Supabase
- `components/MarketPageLayout.tsx` — two-column shell (stream + tabs + left content + right sidebar)
- `components/BetWidget.tsx` — extracted inline bet widget (logic from `BetModal.tsx`, new visual shell)

### Preserved Logic (no changes)
- All wagmi hooks: `useReadContract`, `useWriteContract`, `useWaitForTransactionReceipt`
- `simulateContract` pattern for capturing `betId`
- Supabase upsert sequence (users → bets)
- `maxUint256` approval, `needsApproval` check

### Route Parameter
`[channel]` matches the Kick channel name (lowercase). The page fetches all open/locked markets with stream joins, then filters client-side using the same logic already in `LiveMarketsGrid`:
```ts
// Fetch
const { data } = await supabase
  .from('markets')
  .select('*, streams(*, streamers(*))')
  .in('status', ['open', 'locked'])

// Filter (reuse getStreamerFromTitle from LiveMarketsGrid)
const channelMarkets = data.filter(m =>
  (m.streams?.stream_key?.toLowerCase() === channel) ||
  getStreamerFromTitle(m.title) === channel
)
```
`getStreamerFromTitle` is moved to `lib/utils.ts` and shared between `LiveMarketsGrid` and the market page.

---

## 5. My Bets Page (`/bets`)

### Layout
- Page heading: "My Bets" + stats row: Total wagered (sum of `amount_usdc` across all bets), Total won (from `useUserBets().totalWon`), P&L (totalWon − totalWagered) — all computed client-side from the bets array
- Three tabs: Active · Settled · All
- Bet cards in a single column, full width up to `720px`

### Bet Card
- Market title (links to `/markets/[channel]` — channel derived from `bet.market.streams?.stream_key` or `getStreamerFromTitle(bet.market.title)`; requires `useUserBets()` to join market + stream data)
- Streamer name in muted text
- Row: YOU BET + side pill (YES blue / NO red) + odds + amount
- Row: STATUS + active/won/lost pill + time remaining or settled date
- Row: PAYOUT + potential (active) or actual (settled)
- "Claim Winnings" button shown when: market resolved, user's side won, not yet claimed
- "Claimed" gray label when already claimed

### Empty States
- Not connected: "Connect your wallet to see your bets"
- Connected, no bets: "No bets yet — browse markets →"

### Preserved Logic
- `useUserBets()` hook — no changes
- `claimWinnings` contract call — visual shell only

---

## 6. Component Inventory

### New Components
| File | Purpose |
|---|---|
| `components/Sidebar.tsx` | Desktop left sidebar |
| `components/TopBar.tsx` | Mobile navbar + desktop top bar |
| `components/BetWidget.tsx` | Inline bet placement (extracted from BetModal) |
| `components/MarketPageLayout.tsx` | Two-column market page shell |
| `app/markets/[channel]/page.tsx` | Market page route |

### Redesigned Components (visual only)
| File | What changes |
|---|---|
| `components/StreamerCard.tsx` | Full visual rewrite, static thumbnail instead of iframe |
| `components/LiveMarketsGrid.tsx` | Filter tab style, grid layout |
| `app/bets/page.tsx` | Full visual rewrite |
| `app/layout.tsx` | New shell with Sidebar + TopBar |
| `app/globals.css` | Remove scanlines, dark variables; add light theme tokens |
| `tailwind.config.js` | Replace pulse.* tokens with new palette |

### Deprecated (remove)
| File | Reason |
|---|---|
| `components/StreamerMarketsModal.tsx` | Replaced by `/markets/[channel]` page |
| `components/BetModal.tsx` | Replaced by `BetWidget.tsx` |
| `components/MarketCard.tsx` | Absorbed into market page layout |

---

## 7. Implementation Order

1. Design tokens — `tailwind.config.js` + `globals.css`
2. Layout shell — `Sidebar.tsx`, `TopBar.tsx`, `app/layout.tsx`
3. StreamerCard redesign — static thumbnail, clean card style
4. Market page route — `app/markets/[channel]/page.tsx` + `MarketPageLayout.tsx`
5. BetWidget — extract + restyle from BetModal logic
6. My Bets page — restyle `/bets`
7. Remove deprecated components
