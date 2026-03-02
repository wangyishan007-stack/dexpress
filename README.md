# Base DEX Screener

Real-time DEX token screener for the **Base** chain — inspired by [DexScreener](https://dexscreener.com).

**Live**: https://base-dex-screener.vercel.app
**API**: https://api-production-69b0.up.railway.app

---

## Features

- **Token Screener** — browse all Base trading pairs with real-time price, volume, liquidity, market cap
- **New Pairs** — discover newly created pools as they appear on-chain
- **Gainers** — ranked tokens by price change across multiple time windows
- **Watchlist** — custom watchlists with wallet login (Privy); shareable via link
- **Pair Detail** — interactive price chart, trade history, token info, [Bubblemaps](https://bubblemaps.io) holder visualization
- **Advanced Filtering** — custom filters for price, volume, liquidity, market cap, etc.
- **Customizable Columns** — drag-and-drop ordering + visibility toggles, persisted per page
- **Multi-Window Sorting** — independent data window (24H) and trending window (5M/1H/6H/24H)
- **Real-time Updates** — WebSocket push for live price and trade data
- **Search** — fuzzy search across all tokens and pairs
- **Responsive** — collapsible sidebar, frozen-column desktop table, mobile-optimized card layout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React 18, TailwindCSS, SWR, lightweight-charts |
| **API** | Fastify, WebSocket, Pino |
| **Workers** | viem (Base chain RPC via Alchemy) |
| **Database** | PostgreSQL 16 (partitioned tables), Redis 7 (cache + pub/sub) |
| **Auth** | Privy (wallet-based login) |
| **Monorepo** | pnpm workspaces |

## Architecture

```
packages/
├── frontend/   @dex/frontend   — Next.js 14 + TailwindCSS
├── api/        @dex/api        — Fastify REST + WebSocket server
├── workers/    @dex/workers    — On-chain indexers (viem)
├── database/   @dex/database   — pg + ioredis, schema, migrations
└── shared/     @dex/shared     — Types, constants, ABIs
```

### Data Pipeline

```
  Base Chain (RPC)
        │
        ▼
  ┌───────────┐      ┌────────────┐      ┌──────────┐
  │  Workers   │─────▶│ PostgreSQL │◀────▶│   API    │
  │            │      │  + Redis   │      │  Server  │
  │ • Discover │      │            │      │          │── REST ──▶ Frontend
  │ • Indexer  │      │ • tokens   │      │ • pairs  │
  │ • Aggregat │      │ • pools    │      │ • search │── WS ───▶ Frontend
  │            │      │ • swaps    │      │ • candles│
  └───────────┘      │ • snapshots│      │ • stats  │
                     └────────────┘      └──────────┘
```

- **PairDiscoveryWorker** — listens for `PoolCreated` events, registers new pools & tokens, loads logos from 1inch token list
- **IndexerWorker** — indexes `Swap` events into partitioned trade history
- **AggregatorWorker** — computes rolling metrics (volume, price change, trending scores)

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- Docker & Docker Compose

### Setup

```bash
git clone https://github.com/your-username/base-dex-screener.git
cd base-dex-screener
pnpm install

# Start Postgres + Redis
docker compose up -d

# Run database migration
pnpm db:migrate
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://dex:dex@localhost:5432/dexscreener
REDIS_URL=redis://localhost:6379

# Alchemy (for workers)
ALCHEMY_HTTP_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
ALCHEMY_WS_URL=wss://base-mainnet.g.alchemy.com/v2/YOUR_KEY

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
```

### Run

```bash
# Run all services
pnpm dev

# Or individually
pnpm frontend   # Next.js on :3000
pnpm api        # Fastify on :3001
pnpm workers    # Chain indexers
```

Open http://localhost:3000

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/pairs` | List pairs (sorting, filtering, pagination) |
| GET | `/api/tokens/:address` | Token details |
| GET | `/api/search?q=` | Fuzzy search tokens & pairs |
| GET | `/api/candles/:pool` | OHLCV candle data |
| GET | `/api/stats` | Platform-wide statistics |
| WS | `/ws/pairs` | Real-time pair updates |

## Database

PostgreSQL with native range partitioning for high-throughput trade data:

- **tokens** — address, symbol, name, decimals, logo, verified status
- **pools** — trading pairs with 20+ real-time metrics (price, volume, txns, trending per time window)
- **swaps** — trade history, partitioned by month
- **price_snapshots** — 1-min OHLCV candles, partitioned by year
- **trending_scores** — pre-computed rankings (5m / 1h / 6h / 24h)
- **pairs_view** — pools + tokens join with computed market cap

## Token Logo Pipeline

1. **PairDiscoveryWorker** loads 1inch token list → saves `logo_url` to DB
2. **API tokenEnrichment** enriches missing logos before response
3. **Trust Wallet fallback**: GitHub raw CDN with checksum addresses
4. **Frontend TokenAvatar**: shows logo, on error falls back to HSL-colored circle with initials

## Deployment

| Service | Platform | Method |
|---------|----------|--------|
| Frontend | Vercel | Auto-deploy from `main` branch |
| API | Railway | Docker (`Dockerfile.api`) via `railway up` |
| Database | Railway | Built-in PostgreSQL + Redis plugins |
| Workers | — | Pending (requires Alchemy RPC config) |

## License

Private — all rights reserved.
