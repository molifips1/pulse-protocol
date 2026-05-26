# Pulse Protocol

Live prediction markets for Kick streamers. Viewers bet USDC on in-stream events (peak viewership, milestones) during a betting window. An oracle signs resolutions on-chain; winners claim from the vault contract.

## Architecture

```
frontend/          Next.js 16 app — UI, API routes, wallet integration (RainbowKit + wagmi)
oracle/            Node.js signing service — market creation, resolution, live-streamer cache
contracts/         PulseVault.sol — holds USDC, creates/resolves markets, pays out winners
supabase/          DB schema migrations — markets, bets, streams, viewer_snapshots tables
```

**Data flow:**
1. Oracle detects a live streamer → creates a market in Supabase + on-chain via `PulseVault`
2. Frontend polls `/api/live-streamers` → shows open markets
3. User places a bet → frontend calls `/api/bet` → Supabase row + on-chain `placeBet`
4. Oracle resolves outcome → signs resolution → calls `/api/oracle/resolve` on frontend → Supabase updated
5. User claims winnings on-chain via `claimWinnings`

---

## Local Setup

### Prerequisites

- Node.js 20+
- Two terminal windows (frontend + oracle run separately)

### 1. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # then fill in values — see Env Vars section below
npm run dev                  # http://localhost:3000
```

### 2. Oracle

```bash
cd oracle
npm install
cp .env.example .env         # then fill in values — see Env Vars section below
npm run dev                  # http://localhost:3001
```

### 3. Supabase

Run migrations against your Supabase project:

```bash
# Install the Supabase CLI if needed: npm i -g supabase
supabase db push --db-url postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

Or apply the SQL files in `supabase/migrations/` manually via the Supabase dashboard SQL editor, in chronological order.

---

## Env Vars

### `frontend/.env.local`

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key (public, requires correct RLS) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect / Reown project ID |
| `NEXT_PUBLIC_VAULT_ADDRESS` | Deployed `PulseVault` contract address |
| `NEXT_PUBLIC_USDC_ADDRESS` | USDC contract address (mock on testnet, real on mainnet) |
| `SUPABASE_URL` | Supabase project URL (server-only) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-only, never expose publicly) |
| `ORACLE_URL` | Oracle service base URL — `http://localhost:3001` locally, Railway URL in production |
| `WEBHOOK_SECRET` | Shared secret for oracle → frontend webhook calls |
| `CRON_SECRET` | Auth token for cron-triggered market creation |

### `oracle/.env`

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `ORACLE_PRIVATE_KEY` | Private key of the oracle wallet that signs resolutions |
| `VAULT_CONTRACT_ADDRESS` | Deployed `PulseVault` contract address |
| `USDC_ADDRESS` | USDC contract address |
| `WEBHOOK_SECRET` | Shared secret matching the frontend value |
| `FRONTEND_URL` | Frontend base URL — `http://localhost:3000` locally |
| `ORACLE_URL` | This oracle's own base URL (used by detector) |
| `GROQ_API_KEY` | Groq API key for detector market generation / resolution |
| `ANTHROPIC_API_KEY` | Optional Claude fallback for detector |
| `BASE_SEPOLIA_RPC` | RPC endpoint (defaults to `https://sepolia.base.org`) |
| `CHECK_INTERVAL` | Detector polling interval in seconds (default: `60`) |
| `PORT` | Oracle service port (default: `3001`) |

---

## Deployment

### Frontend — Vercel

The `frontend/` directory deploys to Vercel automatically on push to `main`. Set all `frontend/.env.local` variables as Vercel environment variables. No extra build config needed — `vercel.json` is in the root.

### Oracle — Railway

The `oracle/` directory is a standalone Node.js service deployed to Railway using the included `Dockerfile` / `nixpacks.toml`. Set all `oracle/.env` variables as Railway environment variables. Entry point: `node index.js`.

Update `ORACLE_URL` in Vercel to point at the Railway service URL once deployed.

### Smart Contract — Base Sepolia / Base Mainnet

`contracts/PulseVault.sol` is deployed manually using Hardhat or Foundry. After deployment:

1. Set `NEXT_PUBLIC_VAULT_ADDRESS` (frontend) and `VAULT_CONTRACT_ADDRESS` (oracle) to the new address.
2. Call `transferOracleSigner` on the vault to set the oracle wallet address.
3. Fund the oracle wallet with a small amount of ETH for gas.

---

## TODO — Kick API Access

### Current situation

Kick's public REST API (`kick.com/api/v1`, `kick.com/api/v2`) is protected by Cloudflare bot detection. Every server-side request returns `403` regardless of headers or user-agent. This means `/api/live-streamers` currently falls back to an in-memory oracle cache, which is only populated if the oracle polls Kick successfully — which it cannot do from a server environment.

**In practice: streamers who are live do not appear on the site.**

### Fix — apply for Kick API access

Kick offers an official OAuth developer API at `api.kick.com`. Registering an app provides:

- `client_id` + `client_secret` for the client-credentials OAuth flow
- Access to `GET /public/v1/channels?broadcaster_username=...` — returns `is_live`, viewer count, stream title, category, all without Cloudflare interference
- Webhook event subscriptions — Kick pushes `stream.online` / `stream.offline` events to a registered endpoint, eliminating the need to poll at all
- Stable, versioned API with an SLA — not subject to scraping countermeasures

**Steps to apply:**
1. Go to [kick.com/dashboard/apps](https://kick.com/dashboard/apps)
2. Create an app, set the redirect URI to the oracle's `/oauth/callback` endpoint
3. Request the `channel:read` scope
4. Wait for Kick's approval (typically days to a couple of weeks)

Once approved, replace the `tryBatch` fetch in `frontend/app/api/live-streamers/route.ts` with an authenticated call to `api.kick.com` using a cached bearer token, and register a webhook in the oracle for `stream.online` / `stream.offline` events.

### Interim alternatives (if approval is slow)

- **Kick Pusher WebSocket** — Kick's frontend uses Pusher app key `eb1d5f283081a78b932c` for real-time channel events. WebSocket upgrades bypass Cloudflare. Requires a one-time lookup of numeric channel IDs per streamer.
- **Puppeteer-stealth** — headless browser sidecar that passes CF fingerprinting. Works immediately but fragile; CF updates can silently break it.
- **Scraping proxy** (ZenRows / ScraperAPI / BrightData) — residential proxy with CF bypass, ~$50/mo at low volume.
