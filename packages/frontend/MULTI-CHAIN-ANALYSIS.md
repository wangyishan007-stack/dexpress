# 多链架构迁移分析文档

> 目标：将 Base-only 前端改造为多链架构，支持 Base / BNB Chain / Solana，并且可扩展到更多链。
> 当前状态：后端 Workers 未运行，前端完全依赖 GeckoTerminal (GT) API 获取数据。
> 路由方案：URL 前缀 `/base/...`、`/bsc/...`、`/solana/...`

---

## 1. 当前硬编码 Base 引用完整清单

### 1.1 GeckoTerminal API URL（16 处）

| 文件 | 行号 | 硬编码内容 |
|------|------|-----------|
| `lib/dexscreener-client.ts` | 342 | `networks/base/trending_pools?duration=5m` |
| | 343 | `networks/base/trending_pools?duration=1h` |
| | 344 | `networks/base/trending_pools?duration=6h` |
| | 345 | `networks/base/trending_pools?duration=24h` |
| | 347 | `networks/base/new_pools` |
| | 348 | `networks/base/pools?sort=h24_volume_usd_desc&page=1` |
| | 349 | `networks/base/pools?sort=h24_volume_usd_desc&page=2` |
| | 473 | `networks/base/tokens/${tokenAddress}/info` |
| | 520 | `networks/base/pools/${address}/trades?...` |
| | 582 | `networks/base/tokens/${tokenAddress}/pools?...` |
| | 658 | `networks/base/pools/${address}?include=base_token,quote_token` |
| | 659 | `networks/base/pools/${address}/trades?...` |
| `app/pair/[address]/opengraph-image.tsx` | 25 | `networks/base/pools/${address}?include=...` |
| `lib/dexscreener.ts` | 141 | `fetchDexScreenerPairs(chain = 'base')` (已有参数但默认值) |
| | 180 | 注释 "Filter to only include pairs from Base chain" |

**GT 网络标识映射**：`base` → `bsc` → `solana`（GT 已支持全部三条链）

### 1.2 区块浏览器链接（12 处）

| 文件 | 行号 | 类型 | 链接 |
|------|------|------|------|
| `PairDetailClient.tsx` | 771 | address | `basescan.org/address/${pair.address}` |
| | 783 | token | `basescan.org/token/${base.address}` |
| | 795 | token | `basescan.org/token/${quote.address}` |
| `HoldersTable.tsx` | 67 | address | `basescan.org/address/${h.owner_address}` |
| | 93 | address | `basescan.org/address/${h.owner_address}` |
| `TopTradersTable.tsx` | 117 | address | `basescan.org/address/${t.address}` |
| | 134 | address | `basescan.org/address/${t.address}` |
| `LiquidityTable.tsx` | 48 | address | `basescan.org/address/${lp.owner_address}` |
| | 70 | address | `basescan.org/address/${lp.owner_address}` |
| | 111 | address | `basescan.org/address/${lp.address}` |
| | 134 | address | `basescan.org/address/${lp.address}` |
| `TransactionsTable.tsx` | 518 | tx | `basescan.org/tx/${s.tx_hash}` |

**目标映射**：
- Base → `basescan.org`
- BNB → `bscscan.com`
- Solana → `solscan.io`（注意：Solana 的 tx 路径是 `/tx/` 而非 `/address/`）

### 1.3 WETH/USDC 硬编码地址（10 个文件）

以下文件中硬编码了 Base 链的 USDC 地址 `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`，用于判断 quote token 以确定显示格式：

| 文件 | 行号 | 用途 |
|------|------|------|
| `PairDetailClient.tsx` | 148 | `QUOTE_ADDRS` 集合，判断哪个是 base/quote token |
| `PairRow.tsx` | 14 | 同上，列表中判断 |
| `WatchlistPanel.tsx` | 14 | 同上 |
| `SearchModal.tsx` | 56 | 同上 |
| `AddPairModal.tsx` | 11 | 同上 |
| `OtherPairsModal.tsx` | 14 | 同上 |
| `TrendingTicker.tsx` | 12 | 同上 |
| `dexscreener.ts` | 131 | `BASE_TOP_TOKENS` 列表 |
| `mockData.ts` | 102, 117 | Mock 数据中的 USDC |

**注意**：这些文件同时也硬编码了 WETH 地址 `0x4200000000000000000000000000000006`（在同一个 QUOTE_ADDRS 集合中）。

### 1.4 RPC & Chain ID（5 处）

| 文件 | 行号 | 内容 |
|------|------|------|
| `hooks/useStats.ts` | 17 | `BASE_RPC = 'https://mainnet.base.org'` |
| `components/StatsBar/index.tsx` | 9 | `BASE_RPC = 'https://mainnet.base.org'` |
| `components/Providers.tsx` | 10 | `id: 8453` |
| | 15 | `http: ['https://mainnet.base.org']` |
| `lib/goplus.ts` | 8 | `BASE_CHAIN_ID = '8453'` |

### 1.5 外部服务链参数（5 处）

| 文件 | 行号 | 服务 | 硬编码 |
|------|------|------|--------|
| `PairDetailClient.tsx` | 729 | Uniswap Swap | `chain=base&inputCurrency=ETH` |
| `BubblePlaceholder.tsx` | 28 | Bubblemaps iframe | `chain=base` |
| `BubblePlaceholder.tsx` | 47 | Bubblemaps 链接 | `https://app.bubblemaps.io/base/token/...` |
| `app/api/moralis/route.ts` | 21 | Moralis | `chain=base` |
| | 24 | Moralis | `chain=base` |
| `app/api/subgraph/route.ts` | 4 | The Graph | Base Uniswap V3 subgraph ID |

### 1.6 SEO 元数据（8 处）

| 文件 | 内容 |
|------|------|
| `app/layout.tsx:11` | `'dex.express — Base Chain DEX Screener'` |
| `app/layout.tsx:14` | `'Real-time token & pair analytics on Base chain...'` |
| `app/layout.tsx:15` | `keywords: ['Base chain', ...]` |
| `app/pair/[address]/page.tsx:17` | `'Pair ${short} — Base DEX Analytics'` |
| `app/pair/[address]/page.tsx:18,21,27` | `'...on Base chain...'` (3处) |
| `app/gainers/layout.tsx:5` | `'...on Base chain DEX...'` |
| `app/new-pairs/layout.tsx:5` | `'...on Base chain DEX...'` |
| `app/watchlist/layout.tsx:5` | `'...on Base chain...'` |

### 1.7 Token 描述 fallback（1 处）

| 文件 | 行号 | 内容 |
|------|------|------|
| `PairDetailClient.tsx` | 999 | `${base.symbol} on Base chain · ${dexLabel}` |

### 1.8 UI 硬编码链名/图标（3 处）

| 文件 | 行号 | 内容 |
|------|------|------|
| `PairDetailClient.tsx` | 425 | `<img src="/branding/base-icon.svg" alt="Base" width={14} height={14} />` |
| `PairDetailClient.tsx` | 426 | `<span className="text-[14px] text-sub">Base</span>` |
| `PairDetailClient.tsx` | 431-436 | DEX icon/name 仅处理 Aerodrome/Uniswap（Base DEXes），BNB 的 PancakeSwap、Solana 的 Raydium/Orca 不在判断分支中 |

### 1.9 localStorage 非链隔离（2 处）

| 文件 | 行号 | Key | 问题 |
|------|------|-----|------|
| `hooks/useWatchlist.ts` | 7 | `watchlists_v1` | `pairIds: string[]` 存裸地址，不含 chain 信息。切链后同地址不同 token 会混淆 |
| `lib/columnConfig.ts` | 38 | `screener_columns_v1` | 列配置按页面区分但不按链区分。不同链可能需要不同默认列 |

### 1.10 原生货币命名硬编码（1 处）

| 文件 | 行号 | 内容 |
|------|------|------|
| `TransactionsTable.tsx` | 37-38 | `ethMin: string; ethMax: string` 筛选字段名写死 ETH |
| | 50 | `FilterKey = 'date' \| 'type' \| 'usd' \| 'eth' \| 'maker'` 中 `'eth'` 应改为通用的 `'native'` 或 `'amount'` |

### 1.11 Trust Wallet Logo CDN（1 处）

| 文件 | 行号 | 内容 |
|------|------|------|
| `mockData.ts` | 44 | `blockchains/base/assets/${addr}/logo.png` |

**映射**：`base` → `binance` → `solana`（Trust Wallet GitHub 仓库用 `binance` 不是 `bsc`）

### 1.12 Mock 数据中的 Base 链 Token（1 文件）

| 文件 | 内容 |
|------|------|
| `lib/dexscreener.ts:121-137` | `BASE_TOP_TOKENS` — 13 个 Base 链 token 地址 |
| `lib/mockData.ts` | 所有 mock pool 用 Base 链 token 真实地址 |

---

## 2. 链配置架构设计

### 2.1 核心：`ChainConfig` 接口

创建一个统一的链配置对象，所有链特定的值集中在一处：

```typescript
// lib/chains.ts（前端专用，不依赖后端）

export type ChainSlug = 'base' | 'bsc' | 'solana'

export interface ChainConfig {
  // 基本信息
  slug:              ChainSlug
  name:              string           // 'Base' | 'BNB Chain' | 'Solana'
  shortName:         string           // 'Base' | 'BNB' | 'SOL'
  icon:              string           // '/branding/base-icon.svg'
  color:             string           // '#0052FF' | '#F0B90B' | '#9945FF'
  chainType:         'evm' | 'svm'

  // 原生资产
  nativeCurrency:    { symbol: string; name: string; decimals: number }
  wrappedNative:     string           // WETH / WBNB / wSOL 地址
  stablecoins:       Set<string>      // USDC/USDT 等地址（lowercase）

  // 外部 API 标识
  geckoTerminalSlug: string           // GT API: 'base' | 'bsc' | 'solana'
  goplusChainId:     string           // '8453' | '56' | 'solana'
  moralisChain:      string           // 'base' | 'bsc' | 'solana'
  bubblemapsChain:   string           // 'base' | 'bsc' | 'sol'

  // 区块浏览器
  explorer: {
    url:     string                   // 'https://basescan.org'
    name:    string                   // 'BaseScan'
    addressPath: string               // '/address/' (EVM) 或 '/account/' (Solana)
    tokenPath:   string               // '/token/' (EVM) 或 '/token/' (Solana)
    txPath:      string               // '/tx/'
  }

  // RPC
  rpcUrl:            string           // 公共 RPC

  // Token Logo
  trustWalletChain:  string           // 'base' | 'binance' | 'solana'

  // Swap 跳转
  swapUrl: (tokenAddr: string, dex?: string) => string

  // 地址格式验证
  isValidAddress: (addr: string) => boolean

  // Subgraph ID（可选，有些链没有）
  subgraphId?:       string

  // 该链的 DEX 列表
  dexes:             string[]
}
```

### 2.2 三条链的具体配置

```typescript
export const CHAINS: Record<ChainSlug, ChainConfig> = {
  base: {
    slug: 'base',
    name: 'Base',
    shortName: 'Base',
    icon: '/branding/base-icon.svg',
    color: '#0052FF',
    chainType: 'evm',
    nativeCurrency: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    wrappedNative: '0x4200000000000000000000000000000000000006',
    stablecoins: new Set([
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
      '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', // USDT
      '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
    ]),
    geckoTerminalSlug: 'base',
    goplusChainId: '8453',
    moralisChain: 'base',
    bubblemapsChain: 'base',
    explorer: {
      url: 'https://basescan.org',
      name: 'BaseScan',
      addressPath: '/address/',
      tokenPath: '/token/',
      txPath: '/tx/',
    },
    rpcUrl: 'https://mainnet.base.org',
    trustWalletChain: 'base',
    swapUrl: (addr, dex) =>
      dex === 'aerodrome'
        ? `https://aerodrome.finance/swap?from=eth&to=${addr}`
        : `https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=${addr}`,
    isValidAddress: (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
    subgraphId: 'HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1',
    dexes: ['uniswap_v3', 'uniswap_v4', 'aerodrome'],
  },

  bsc: {
    slug: 'bsc',
    name: 'BNB Chain',
    shortName: 'BNB',
    icon: '/branding/bnb-icon.svg',       // 需要新增
    color: '#F0B90B',
    chainType: 'evm',
    nativeCurrency: { symbol: 'BNB', name: 'BNB', decimals: 18 },
    wrappedNative: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    stablecoins: new Set([
      '0x55d398326f99059ff775485246999027b3197955', // USDT (BSC)
      '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC (BSC)
      '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD
    ]),
    geckoTerminalSlug: 'bsc',
    goplusChainId: '56',
    moralisChain: 'bsc',
    bubblemapsChain: 'bsc',
    explorer: {
      url: 'https://bscscan.com',
      name: 'BscScan',
      addressPath: '/address/',
      tokenPath: '/token/',
      txPath: '/tx/',
    },
    rpcUrl: 'https://bsc-dataseed.binance.org',
    trustWalletChain: 'binance',
    swapUrl: (addr) =>
      `https://pancakeswap.finance/swap?outputCurrency=${addr}&chain=bsc`,
    isValidAddress: (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
    subgraphId: undefined,  // PancakeSwap 有自己的 subgraph，后续按需加
    dexes: ['pancakeswap_v3', 'pancakeswap_v2'],
  },

  solana: {
    slug: 'solana',
    name: 'Solana',
    shortName: 'SOL',
    icon: '/branding/solana-icon.svg',    // 需要新增
    color: '#9945FF',
    chainType: 'svm',
    nativeCurrency: { symbol: 'SOL', name: 'Solana', decimals: 9 },
    wrappedNative: 'So11111111111111111111111111111111111111112',
    stablecoins: new Set([
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'.toLowerCase(), // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'.toLowerCase(), // USDT
    ]),
    geckoTerminalSlug: 'solana',
    goplusChainId: 'solana',
    moralisChain: 'solana',
    bubblemapsChain: 'sol',
    explorer: {
      url: 'https://solscan.io',
      name: 'Solscan',
      addressPath: '/account/',           // ⚠️ 注意：Solana 是 /account/ 不是 /address/
      tokenPath: '/token/',
      txPath: '/tx/',
    },
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    trustWalletChain: 'solana',
    swapUrl: (addr) => `https://jup.ag/swap/SOL-${addr}`,
    isValidAddress: (addr) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr),
    subgraphId: undefined,               // Solana 没有 The Graph 子图
    dexes: ['raydium', 'orca', 'meteora'],
  },
}
```

### 2.3 工具函数

```typescript
export const DEFAULT_CHAIN: ChainSlug = 'base'
export const SUPPORTED_CHAINS = Object.keys(CHAINS) as ChainSlug[]

export function getChain(slug: ChainSlug): ChainConfig {
  return CHAINS[slug] ?? CHAINS[DEFAULT_CHAIN]
}

export function explorerLink(chain: ChainSlug, type: 'address' | 'token' | 'tx', value: string): string {
  const c = getChain(chain)
  const path = type === 'address' ? c.explorer.addressPath
             : type === 'token'   ? c.explorer.tokenPath
             : c.explorer.txPath
  return `${c.explorer.url}${path}${value}`
}

export function isQuoteToken(chain: ChainSlug, address: string): boolean {
  const c = getChain(chain)
  const lower = address.toLowerCase()
  return lower === c.wrappedNative.toLowerCase() || c.stablecoins.has(lower)
}

export function trustWalletLogo(chain: ChainSlug, address: string): string {
  const c = getChain(chain)
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${c.trustWalletChain}/assets/${address}/logo.png`
}
```

### 2.4 扩展新链只需一步

未来加 Arbitrum、Polygon 等链，只需在 `CHAINS` 对象中新增一个条目，不需要改任何业务代码：

```typescript
// 例：未来加 Arbitrum
CHAINS.arbitrum = {
  slug: 'arbitrum',
  name: 'Arbitrum',
  geckoTerminalSlug: 'arbitrum',
  // ...
}
```

---

## 3. Next.js 路由重构方案

### 3.1 当前路由 → 目标路由

```
当前                              目标
─────────────────────────────     ────────────────────────────────────
app/page.tsx                →    app/page.tsx (redirect → /base)
app/pair/[address]/page.tsx →    app/[chain]/pair/[address]/page.tsx
app/new-pairs/page.tsx      →    app/[chain]/new-pairs/page.tsx
app/gainers/page.tsx        →    app/[chain]/gainers/page.tsx
app/watchlist/page.tsx      →    app/[chain]/watchlist/page.tsx
```

### 3.2 实现方式

```
app/
  page.tsx                          ← redirect 到 /base
  [chain]/
    layout.tsx                      ← 验证 chain slug，注入 ChainProvider
    page.tsx                        ← 原 app/page.tsx（All Coins）
    pair/[address]/
      page.tsx                      ← 原 pair 详情页
      opengraph-image.tsx
    new-pairs/
      page.tsx
      layout.tsx                    ← SEO 元数据（动态按链）
    gainers/
      page.tsx
      layout.tsx
    watchlist/
      page.tsx
      layout.tsx
  api/                              ← API routes 不变（不受 [chain] 影响）
    moralis/route.ts
    subgraph/route.ts
```

### 3.3 `[chain]/layout.tsx` 实现

```typescript
import { notFound } from 'next/navigation'
import { SUPPORTED_CHAINS, type ChainSlug } from '@/lib/chains'
import { ChainProvider } from '@/contexts/ChainContext'

export function generateStaticParams() {
  return SUPPORTED_CHAINS.map(chain => ({ chain }))
}

export default function ChainLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { chain: string }
}) {
  if (!SUPPORTED_CHAINS.includes(params.chain as ChainSlug)) {
    notFound()
  }
  return <ChainProvider initialChain={params.chain as ChainSlug}>{children}</ChainProvider>
}
```

### 3.4 向后兼容 redirect

旧 URL `/pair/0x...` 需要 301 redirect 到 `/base/pair/0x...`：

```typescript
// app/pair/[address]/page.tsx（保留旧路由作 redirect）
import { redirect } from 'next/navigation'
export default function LegacyPairPage({ params }: { params: { address: string } }) {
  redirect(`/base/pair/${params.address}`)
}
```

---

## 4. GeckoTerminal API 参数化

### 4.1 核心改动：`dexscreener-client.ts`

**当前问题**：15 处硬编码 `networks/base`

**方案**：所有函数加 `network` 参数，默认从 ChainContext 获取

```typescript
// Before
const GT_ALL_URLS = [
  `${GT_BASE}/networks/base/trending_pools?duration=5m`,
  ...
]

// After
function buildGtUrls(network: string): string[] {
  return [
    `${GT_BASE}/networks/${network}/trending_pools?duration=5m`,
    `${GT_BASE}/networks/${network}/trending_pools?duration=1h`,
    `${GT_BASE}/networks/${network}/trending_pools?duration=6h`,
    `${GT_BASE}/networks/${network}/trending_pools?duration=24h`,
    `${GT_BASE}/networks/${network}/new_pools`,
    `${GT_BASE}/networks/${network}/pools?sort=h24_volume_usd_desc&page=1`,
    `${GT_BASE}/networks/${network}/pools?sort=h24_volume_usd_desc&page=2`,
  ]
}
```

### 4.2 缓存按链隔离

```typescript
// Before: 全局单缓存
let _cachedPools: Pool[] = []
let _cacheTs = 0

// After: per-chain 缓存
const _cachePerChain = new Map<string, { pools: Pool[]; ts: number; refreshing: boolean }>()

export async function fetchDexScreenerClient(network = 'base'): Promise<Pool[]> {
  let entry = _cachePerChain.get(network)
  if (!entry) {
    entry = { pools: [], ts: 0, refreshing: false }
    _cachePerChain.set(network, entry)
  }
  // ...其余 stale-while-revalidate 逻辑不变，只是用 entry 替代全局变量
}
```

### 4.3 所有需要加 `network` 参数的函数

| 函数 | 当前签名 | 改为 |
|------|---------|------|
| `fetchDexScreenerClient()` | `()` | `(network?: string)` |
| `fetchTokenInfo(addr)` | `(addr)` | `(addr, network?)` |
| `fetchPoolTrades(addr, before?)` | `(addr, before?)` | `(addr, before?, network?)` |
| `fetchPoolsByToken(addr)` | `(addr)` | `(addr, network?)` |
| `fetchPairByAddress(addr)` | `(addr)` | `(addr, network?)` |
| `searchGeckoTerminal(query)` | `(query)` | `(query, network?)` |

### 4.4 `mapPool()` 注入 chain 字段

```typescript
function mapPool(p: GTPool, logos?: LogoMap, chain: ChainSlug = 'base'): Pool | null {
  // ...existing mapping logic...
  return {
    chain,              // ← 新增
    address: a.address,
    dex: mapDex(a.name),
    // ...
  }
}
```

---

## 5. 外部服务参数化

### 5.1 GoPlus Security API

```typescript
// lib/goplus.ts
// Before:
const BASE_CHAIN_ID = '8453'

// After:
import { getChain, type ChainSlug } from '@/lib/chains'

export async function fetchTokenSecurity(tokenAddress: string, chain: ChainSlug = 'base') {
  const chainId = getChain(chain).goplusChainId
  const res = await fetch(`${GOPLUS_BASE}/token_security/${chainId}?contract_addresses=${tokenAddress}`)
  // ...
}
```

**注意**：GoPlus 对 Solana 支持有限，某些检查项（如 buy/sell tax、honeypot）不适用于 Solana SPL Token → 需要 UI 层面判断 chain 来决定显示哪些审计项。

### 5.2 Moralis API

```typescript
// app/api/moralis/route.ts
// Before:
upstreamUrl = `${MORALIS_BASE}/erc20/${address}/owners?chain=base&...`

// After:
const chain = searchParams.get('chain') ?? 'base'
upstreamUrl = `${MORALIS_BASE}/erc20/${address}/owners?chain=${chain}&...`
```

**注意**：Moralis 的 Solana API 端点和 EVM 不同（不是 `/erc20/`）。需要按 chain 分支：

```typescript
if (chainType === 'svm') {
  upstreamUrl = `${MORALIS_BASE}/token/mainnet/${address}/owners?...`
} else {
  upstreamUrl = `${MORALIS_BASE}/erc20/${address}/owners?chain=${moralisChain}&...`
}
```

### 5.3 The Graph (Subgraph)

```typescript
// app/api/subgraph/route.ts
// Before:
const SUBGRAPH_ID = 'HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1' // Base UniV3

// After:
const chain = searchParams.get('chain') ?? 'base'
const config = getChain(chain as ChainSlug)
if (!config.subgraphId) {
  return NextResponse.json({ error: 'No subgraph for this chain' }, { status: 404 })
}
const GRAPH_URL = `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/${config.subgraphId}`
```

**注意**：BNB 有 PancakeSwap subgraph（需要查 subgraph ID），Solana 没有 The Graph 子图。

### 5.4 Bubblemaps

```typescript
// BubblePlaceholder.tsx
// Before:
const src = `https://iframe.bubblemaps.io/map?chain=base&address=${tokenAddress}&partnerId=${PARTNER_ID}`

// After:
const { chainConfig } = useChain()
const src = `https://iframe.bubblemaps.io/map?chain=${chainConfig.bubblemapsChain}&address=${tokenAddress}&partnerId=${PARTNER_ID}`
```

**注意**：Bubblemaps 对 Solana 的支持需确认（slug 是 `sol` 还是 `solana`）。

### 5.5 Swap URL

```typescript
// PairDetailClient.tsx
// Before:
`https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=${base.address}`

// After:
chainConfig.swapUrl(base.address, pair.dex)
// Base → Uniswap / Aerodrome
// BNB → PancakeSwap
// Solana → Jupiter
```

### 5.6 StatsBar / Block Number

```typescript
// Before:
const BASE_RPC = 'https://mainnet.base.org'
const res = await fetch(BASE_RPC, { method: 'POST', body: JSON.stringify({ method: 'eth_blockNumber', ... }) })

// After:
const { chainConfig } = useChain()
// ⚠️ Solana 没有 eth_blockNumber，需要用 getSlot
if (chainConfig.chainType === 'evm') {
  const res = await fetch(chainConfig.rpcUrl, { method: 'POST', body: '{"method":"eth_blockNumber",...}' })
} else {
  const res = await fetch(chainConfig.rpcUrl, { method: 'POST', body: '{"method":"getSlot",...}' })
}
```

---

## 6. 风险清单与应对方案

### 🔴 高风险

#### R1: Solana 地址大小写敏感
- **问题**：EVM 地址不区分大小写（`0xABC` == `0xabc`），代码中大量 `.toLowerCase()` 比较。Solana 地址是 base58，**大小写敏感**（`So1...` ≠ `so1...`）。
- **影响范围**：所有用 `.toLowerCase()` 比较地址的逻辑（QUOTE_ADDRS、stablecoins、缓存 key、搜索匹配）
- **方案**：
  - `isQuoteToken()` 工具函数内部根据 chainType 决定是否 toLowerCase
  - 或：Solana stablecoins Set 存原始大小写，比较时不转换
  - 全局搜索 `.toLowerCase()` 确保 Solana 分支不误转

#### R2: 同地址跨链冲突
- **问题**：理论上同一个 EVM 地址可以在 Base 和 BNB 上都有合约。前端缓存、watchlist、URL 如果只用 address 做 key 会冲突。
- **影响范围**：SWR 缓存、localStorage watchlist、URL 路由
- **方案**：
  - 所有缓存 key 格式：`${chain}:${address}`
  - Watchlist 条目存 `{ chain, address }` 而非纯 address
  - URL 中 chain 是必须的路径段，不会省略

#### R3: GT API 限流 ×3
- **问题**：当前已有 3 层缓存防 429。多链后如果用户频繁切链，GT API 调用量 ×3。
- **影响范围**：GT API 全部端点
- **方案**：
  - 只获取当前选中链的数据，不预取其他链
  - 切链时显示 loading，不要 stale 数据
  - 每链独立缓存 TTL（当前 30s 足够）

#### R4: 路由迁移的 SEO 影响
- **问题**：已有的 `/pair/0x...` URL 被搜索引擎索引，改为 `/base/pair/0x...` 会丢排名。
- **方案**：
  - 旧路径保留为 301 permanent redirect
  - `next.config.js` 中配置 redirects
  - 确认 Vercel 上 redirect 生效
  - robots.txt / sitemap.xml 更新

### 🟡 中风险

#### R5: GoPlus Solana 兼容性
- **问题**：GoPlus 对 Solana 的支持不如 EVM 完善。部分检测项（honeypot、buy/sell tax、proxy contract）不适用于 SPL Token。
- **方案**：
  - Security 面板根据 `chainConfig.chainType` 隐藏不适用的检测项
  - Solana 可能需要用 RugCheck（rugcheck.xyz）替代或补充 GoPlus

#### R6: Moralis Solana API 端点不同
- **问题**：Moralis EVM 端点 `/erc20/{address}/owners` 不适用于 Solana。Solana 需要不同的路径和参数。
- **方案**：
  - `moralis/route.ts` 中按 chainType 分支调用不同端点
  - 或：Solana 的 Holders 数据改用 Helius API（`https://api.helius.xyz/v0/token-metadata?...`）

#### R7: Subgraph 缺失（BNB + Solana）
- **问题**：当前 LP 数据从 Base Uniswap V3 subgraph 获取。BNB 链需要 PancakeSwap subgraph，Solana 完全没有 The Graph 子图。
- **方案**：
  - BNB：查找 PancakeSwap V3 BSC subgraph ID（存在于 The Graph 网络）
  - Solana：LP 数据从 Raydium/Orca API 获取，或显示 "LP data unavailable"
  - 在 UI 上优雅降级：无 subgraph 时隐藏 LP tab 或显示提示

#### R8: Privy 钱包多链支持
- **问题**：`Providers.tsx` 中 Privy 只配置了 Base 链。登录后的钱包功能（如果有）需要支持多链。
- **影响范围**：login/logout、钱包地址显示
- **方案**：
  - `supportedChains` 添加 BNB Chain 对象
  - Solana 需要额外的 Solana wallet adapter（Phantom/Solflare）
  - 当前登录主要用于 watchlist，与链无关，影响较小

#### R9: 切链时 WebSocket 连接
- **问题**：当前 WS 连接到自有后端（`useWebSocket.ts`），后端没跑所以实际没数据。但架构上切链需要重连或重新订阅。
- **方案**：
  - 当前后端没跑，可以暂时忽略
  - 如果未来接入，WS subscribe 消息需加 chain 字段

#### R9b: localStorage 跨链数据混淆
- **问题**：`useWatchlist.ts` 的 `watchlists_v1` 和 `columnConfig.ts` 的 `screener_columns_v1` 不含链标识。切链后 watchlist 中的地址指向错误的 token。
- **影响范围**：Watchlist 面板、Customize Screener 列配置
- **方案**：
  - Watchlist: 条目改为 `{ chain: ChainSlug, address: string }`，storage key 改为 `watchlists_v2`（版本升级触发迁移）
  - ColumnConfig: storage prefix 改为 `screener_columns_v2_{chain}`
  - 旧数据迁移：读到 v1 格式时，默认归属 `base` 链

#### R9c: TransactionsTable 原生货币命名
- **问题**：`ethMin`/`ethMax` 字段名和 `'eth'` FilterKey 写死 ETH。BNB 链应是 BNB，Solana 应是 SOL。
- **影响**：筛选功能逻辑和 UI 标签
- **方案**：
  - FilterKey `'eth'` 改为 `'native'` 或 `'amount'`
  - 接口字段 `ethMin`/`ethMax` 改为 `nativeMin`/`nativeMax`
  - UI 标签用 `chainConfig.nativeCurrency.symbol` 动态显示

### 🟢 低风险

#### R10: Token Logo CDN 路径
- **问题**：Trust Wallet CDN 用不同的链名（`base` / `binance` / `solana`），且不同链的 checksum 格式不同。
- **方案**：`trustWalletLogo()` 工具函数已在 chains.ts 中定义，统一处理

#### R11: 地址显示格式
- **问题**：Solana 地址 32-44 字符（vs EVM 42字符），`shortAddr()` 截断逻辑需适配。
- **方案**：统一用 `addr.slice(0,6)...addr.slice(-4)` 对两种格式都 OK

#### R12: OG 图片生成
- **问题**：`opengraph-image.tsx` 中 GT API URL 硬编码 `networks/base`
- **方案**：从 URL 参数中提取 chain，用对应的 GT slug

#### R13: 前端包体积
- **问题**：如果未来 Solana 需要 `@solana/web3.js`，包体积增加 ~300KB
- **方案**：当前纯 GT API 方式不需要任何 Solana 库，无影响。未来如需加钱包连接，用 `dynamic(() => import(...))` 按需加载

#### R14: 多语言 × 多链
- **问题**：刚完成的 i18n 系统中，部分翻译 key 含 "Base" 字样（如 `pairDetail.backToAllCoins: "← 返回全部代币"`）。链名是否需要翻译？
- **方案**：
  - 链名保持英文（Base, BNB Chain, Solana），不翻译
  - SEO 元数据中的链名用 `chainConfig.name`，不走翻译系统
  - `pairDetail` namespace 中不含链名，无影响

---

## 7. 分阶段实施步骤

### Phase 0: 基础设施（~0.5 天）

| 步骤 | 文件 | 描述 |
|------|------|------|
| 0.1 | `lib/chains.ts` (新建) | ChainConfig 接口 + CHAINS 配置 + 工具函数 |
| 0.2 | `contexts/ChainContext.tsx` (新建) | React Context + useChain hook |
| 0.3 | `public/branding/bnb-icon.svg` (新建) | BNB 链图标 |
| 0.4 | `public/branding/solana-icon.svg` (新建) | Solana 链图标 |

### Phase 1: 路由重构（~1 天）

| 步骤 | 描述 |
|------|------|
| 1.1 | 创建 `app/[chain]/layout.tsx` — 验证 slug + ChainProvider |
| 1.2 | 将 `app/page.tsx` 内容移动到 `app/[chain]/page.tsx` |
| 1.3 | 将 `app/pair/[address]/` 移动到 `app/[chain]/pair/[address]/` |
| 1.4 | 将 `app/new-pairs/`、`app/gainers/`、`app/watchlist/` 移动到 `app/[chain]/` 下 |
| 1.5 | `app/page.tsx` 改为 redirect → `/base` |
| 1.6 | 旧路由保留 301 redirect（`/pair/[address]` → `/base/pair/[address]`）|
| 1.7 | 更新 Sidebar 导航链接加 `/${chain}/` 前缀 |
| 1.8 | 更新所有 `useRouter().push()` / `<Link href>` 加 chain 前缀 |

### Phase 2: GT API 参数化（~1 天）

| 步骤 | 文件 | 描述 |
|------|------|------|
| 2.1 | `lib/dexscreener-client.ts` | 15 处 `networks/base` → `networks/${network}`，缓存按链隔离 |
| 2.2 | `lib/dataProvider.ts` | 传递 chain 到 fetchDexScreenerClient |
| 2.3 | 各页面 `page.tsx` | 从 URL params 取 chain，传给 dataProvider |
| 2.4 | SWR hooks | key 加 chain 前缀 |

### Phase 3: 硬编码替换（~1 天）

| 步骤 | 文件 | 描述 |
|------|------|------|
| 3.1 | 12 处 basescan.org | → `explorerLink(chain, type, value)` |
| 3.2 | 10 个文件 QUOTE_ADDRS | → `isQuoteToken(chain, addr)` |
| 3.3 | `PairDetailClient.tsx` swap URL | → `chainConfig.swapUrl()` |
| 3.4 | `BubblePlaceholder.tsx` | → `chainConfig.bubblemapsChain` |
| 3.5 | `StatsBar` + `useStats.ts` | → `chainConfig.rpcUrl` + Solana getSlot 分支 |
| 3.6 | `Providers.tsx` | → 多链 supportedChains |
| 3.7 | `mockData.ts` Trust Wallet CDN | → `trustWalletLogo(chain, addr)` |
| 3.8 | `PairDetailClient.tsx:999` fallback | → `${base.symbol} on ${chainConfig.name}` |
| 3.9 | 8 处 SEO 元数据 | → 使用 `chainConfig.name` 动态生成 |
| 3.10 | `PairDetailClient.tsx:425-436` | 链图标/名称/DEX badge → `chainConfig.icon`/`chainConfig.name`/DEX 分支扩展 |
| 3.11 | `TransactionsTable.tsx:37-50` | `ethMin`/`ethMax` → `nativeMin`/`nativeMax`，FilterKey `'eth'` → `'native'` |

### Phase 4: 外部服务参数化（~0.5 天）

| 步骤 | 文件 | 描述 |
|------|------|------|
| 4.1 | `lib/goplus.ts` | `BASE_CHAIN_ID` → `chainConfig.goplusChainId` |
| 4.2 | `app/api/moralis/route.ts` | `chain=base` → query param |
| 4.3 | `app/api/subgraph/route.ts` | hardcoded ID → `chainConfig.subgraphId` |
| 4.4 | Security 面板 | Solana 隐藏不适用的审计项 |

### Phase 5: UI 组件（~0.5 天）

| 步骤 | 文件 | 描述 |
|------|------|------|
| 5.1 | `components/ChainSelector.tsx` (新建) | 链切换下拉菜单 |
| 5.2 | `components/Sidebar/index.tsx` | 集成 ChainSelector |
| 5.3 | localStorage 隔离 | filters/columns/watchlist key 加 chain 前缀 |
| 5.4 | Watchlist 数据模型 | 条目存 `{ chain, address }`，storage key 升级 v2 + 迁移旧数据 |
| 5.5 | `lib/columnConfig.ts` | `STORAGE_PREFIX` 加 chain 段 |

### Phase 6: 验证（~0.5 天）

- [ ] `tsc --noEmit` 通过
- [ ] `/base` 页面正常（不影响现有功能）
- [ ] `/bsc` 页面 GT API 数据正确展示
- [ ] `/solana` 页面 GT API 数据正确展示
- [ ] 切链后 SWR 缓存不混淆
- [ ] basescan/bscscan/solscan 链接正确
- [ ] GoPlus 安全检测三链都能查
- [ ] Swap 跳转到正确的 DEX
- [ ] Bubblemaps 三链都能加载
- [ ] 旧 URL `/pair/0x...` redirect 正常
- [ ] 刷新页面后链选择保持

---

## 附录 A: GeckoTerminal 多链 API 确认

GT API 的 network slug 对照：

| 链 | GT slug | 示例 URL |
|----|---------|---------|
| Base | `base` | `api.geckoterminal.com/api/v2/networks/base/trending_pools` |
| BNB | `bsc` | `api.geckoterminal.com/api/v2/networks/bsc/trending_pools` |
| Solana | `solana` | `api.geckoterminal.com/api/v2/networks/solana/trending_pools` |
| Ethereum | `eth` | 未来可扩展 |
| Arbitrum | `arbitrum` | 未来可扩展 |
| Polygon | `polygon_pos` | 未来可扩展 |

GT API 响应格式在不同链上**完全一致**，不需要特殊解析。

## 附录 B: 需新增的静态资源

| 文件 | 来源 |
|------|------|
| `/public/branding/bnb-icon.svg` | BNB 品牌 kit |
| `/public/branding/solana-icon.svg` | Solana 品牌 kit |
| (可选) `/public/branding/pancakeswap-icon.svg` | PancakeSwap DEX badge |
| (可选) `/public/branding/raydium-icon.svg` | Raydium DEX badge |
| (可选) `/public/branding/jupiter-icon.svg` | Jupiter DEX badge |

## 附录 C: 工作量估算

| Phase | 预计时间 | 难度 |
|-------|---------|------|
| Phase 0: 基础设施 | 0.5 天 | 低 |
| Phase 1: 路由重构 | 1 天 | 中（文件移动多，需仔细检查 import） |
| Phase 2: GT API 参数化 | 1 天 | 中（dexscreener-client.ts 改动大） |
| Phase 3: 硬编码替换 | 1 天 | 低（机械替换，但数量多） |
| Phase 4: 外部服务参数化 | 0.5 天 | 低 |
| Phase 5: UI 组件 | 0.5 天 | 低 |
| Phase 6: 验证 | 0.5 天 | — |
| **合计** | **~5 天** | |
