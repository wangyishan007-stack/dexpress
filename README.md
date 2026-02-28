# dex.express

Real-time token & pair analytics on Base chain — a DEX screener similar to dexscreener.com.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 + TailwindCSS + SWR + lightweight-charts |
| API | Fastify + WebSocket |
| Workers | viem (PairDiscovery / Indexer / Aggregator) |
| Database | PostgreSQL 16 + Redis 7 |
| Monorepo | pnpm workspaces |
| Deploy | Vercel (frontend) + Docker Compose (infra) |

## Packages

```
packages/
  frontend/   @dex/frontend   — Next.js 14 app
  api/        @dex/api        — Fastify REST + WebSocket server
  workers/    @dex/workers    — Chain indexer workers
  database/   @dex/database   — pg + ioredis, schema, migrations
  shared/     @dex/shared     — Types, constants, ABIs
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start Postgres + Redis
docker compose up -d

# Run database migrations
pnpm --filter='@dex/database' migrate

# Start API server
pnpm --filter='@dex/api' dev

# Start workers
pnpm --filter='@dex/workers' dev

# Start frontend
pnpm --filter='@dex/frontend' dev
```

Open http://localhost:3000

## Mobile Responsive Adaptation

Breakpoint: `md` (768px) — below = mobile, above = desktop (mobile-first approach).

### Changes (11 files)

**globals.css**
- Base font-size 13px (mobile), 14px (desktop via `@media min-width: 768px`)
- `.scrollbar-hide` utility class for horizontal scroll containers

**layout.tsx**
- Added `viewport` export for mobile meta (`width=device-width, initial-scale=1`)
- Flex container: `flex-col` on mobile (vertical), `md:flex-row` on desktop (horizontal)

**Sidebar/index.tsx** (largest change)
- Mobile: top bar (28px logo + hamburger button) + slide-out drawer with backdrop overlay
- Desktop: static 239px sidebar (unchanged)
- Auto-closes drawer on route change via `useEffect` + `usePathname`

**PairRow.tsx**
- Dual-render approach:
  - Mobile card (`md:hidden`): rank, single avatar (28px), token name, price, 24h change, mcap
  - Desktop grid (`hidden md:grid`): original 13-column layout unchanged
- Header row hidden on mobile (cards are self-descriptive)

**PairList/index.tsx**
- `isMobile` detection via `window.matchMedia('(max-width: 767px)')`
- Row height: 64px (mobile) / 70px (desktop)
- Container height: `calc(100vh - 160px)` mobile / `calc(100vh - 190px)` desktop

**FilterBar/index.tsx**
- Mobile: stacked layout (`flex-col`), horizontal scroll for button group
- Desktop: row layout with `flex-wrap` (unchanged behavior)
- Buttons: `h-[30px] text-[12px]` mobile / `h-[36px] text-[14px]` desktop
- Hidden on mobile: "Rank by:" label, "Filters" text (icon only), Settings button

**StatsBar/index.tsx**
- Responsive card: `h-[40px] rounded-[6px]` mobile / `h-[50px] rounded-[8px]` desktop
- Font sizes: label `text-[10px]`/`text-[12px]`, value `text-[12px]`/`text-[14px]`

**Page files** (page.tsx, new-pairs/page.tsx, gainers/page.tsx)
- Responsive padding: `px-3 pt-3` mobile / `px-5 pt-4` desktop
- Heading font: `text-[14px]` mobile / `text-[16px]` desktop

**PairDetailClient.tsx**
- Two-column → stacked: `flex-col md:flex-row`
- Right column: `w-full` mobile / `w-[340px]` desktop
- Chart min-height: 200px mobile / 300px desktop
- Price text: `text-[20px]` mobile / `text-[26px]` desktop
- Transaction table: hide Token & Price columns on mobile (4-col grid → 6-col grid)

### Testing

- Chrome DevTools responsive mode: 375px (iPhone SE), 390px (iPhone 14)
- Verify: hamburger opens/closes, closes on nav + backdrop click
- Verify: token list card layout, virtual scroll works
- Verify: filter bar scrolls horizontally on mobile
- Verify: detail page stacks vertically
- Verify: no horizontal overflow on any page
- Build: `pnpm --filter='@dex/frontend' build`

## Token Logo Pipeline

1. **PairDiscoveryWorker** loads 1inch token list → saves `logo_url` to DB
2. **API tokenEnrichment** enriches null `logo_url` before API response
3. **Trust Wallet fallback**: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/{CHECKSUM}/logo.png`
4. **Frontend TokenAvatar**: shows `logo_url`, on error falls back to HSL-colored circle with initials

## License

Private — all rights reserved.
