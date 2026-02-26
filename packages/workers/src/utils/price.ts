import type { PublicClient } from 'viem'
import { ADDRESSES, CHAINLINK_ABI, STABLECOINS, WETH_LOWER } from '@dex/shared'

// ─── sqrtPriceX96 → token0/token1 price ───────────────────────

/**
 * 将 Uniswap V3 sqrtPriceX96 转换为 token0 以 token1 计价的价格
 * price = (sqrtPriceX96 / 2^96)^2 × (10^decimals0 / 10^decimals1)
 *
 * 使用 BigInt 精度计算，最后转 float
 */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number
): number {
  if (sqrtPriceX96 === 0n) return 0

  const Q96 = 2n ** 96n

  // price_x192 = sqrtPriceX96^2 (192 bit precision)
  // 为避免溢出，先 /Q96 再 /Q96，用大数做中间计算
  // price_raw = (sqrtPriceX96^2 × 10^18) / 2^192
  const PRECISION = 10n ** 18n
  const priceRaw = (sqrtPriceX96 * sqrtPriceX96 * PRECISION) / (Q96 * Q96)

  // 归一化小数位
  const decimalDiff = decimals0 - decimals1
  let priceFloat = Number(priceRaw) / 1e18

  if (decimalDiff > 0) {
    priceFloat = priceFloat * 10 ** decimalDiff
  } else if (decimalDiff < 0) {
    priceFloat = priceFloat / 10 ** (-decimalDiff)
  }

  return priceFloat
}

// ─── Aerodrome (V2-style): amount-based price ─────────────────

/**
 * 从 Aerodrome/Uniswap V2-style Swap 计算价格
 * price = amountOut / amountIn（均已归一化）
 */
export function aerodromeSwapToPrice(
  amount0In: bigint,
  amount1In: bigint,
  amount0Out: bigint,
  amount1Out: bigint,
  decimals0: number,
  decimals1: number
): number {
  // 找出哪个 token 是输入
  const in0  = Number(amount0In)  / 10 ** decimals0
  const in1  = Number(amount1In)  / 10 ** decimals1
  const out0 = Number(amount0Out) / 10 ** decimals0
  const out1 = Number(amount1Out) / 10 ** decimals1

  if (in0 > 0 && out1 > 0) {
    // token0 in, token1 out → price of token0 in token1
    return out1 / in0
  } else if (in1 > 0 && out0 > 0) {
    // token1 in, token0 out → price of token1 in token0 → invert for token0 price
    return in1 / out0
  }
  return 0
}

// ─── USD price routing ────────────────────────────────────────

/**
 * 给定一个 pool 和对应的 sqrtPriceX96 或 amount-based price，
 * 计算目标 token（非 WETH/稳定币一侧）的 USD 价格
 *
 * 逻辑：
 *   - 如果 token1 是 USDC/USDT/DAI → price_usd = price (token0/token1)
 *   - 如果 token1 是 WETH → price_usd = price × ethUsdPrice
 *   - 如果 token0 是 USDC → price_usd = 1 / price
 *   - 如果 token0 是 WETH → price_usd = (1 / price) × ethUsdPrice
 */
export function routeToUsd(
  token0Addr: string,
  token1Addr: string,
  priceToken0InToken1: number,   // token0 以 token1 计价的价格
  ethUsdPrice: number
): { token0Usd: number; token1Usd: number } {
  const t0 = token0Addr.toLowerCase()
  const t1 = token1Addr.toLowerCase()

  let token0Usd = 0
  let token1Usd = 0

  if (STABLECOINS.has(t1)) {
    // token1 是稳定币
    token0Usd = priceToken0InToken1
    token1Usd = 1
  } else if (t1 === WETH_LOWER) {
    // token1 是 WETH
    token0Usd = priceToken0InToken1 * ethUsdPrice
    token1Usd = ethUsdPrice
  } else if (STABLECOINS.has(t0)) {
    // token0 是稳定币
    token0Usd = 1
    token1Usd = priceToken0InToken1 > 0 ? 1 / priceToken0InToken1 : 0
  } else if (t0 === WETH_LOWER) {
    // token0 是 WETH
    token0Usd = ethUsdPrice
    token1Usd = priceToken0InToken1 > 0 ? ethUsdPrice / priceToken0InToken1 : 0
  } else {
    // 无法路由到 USD（两边都不是主流资产）
    token0Usd = 0
    token1Usd = 0
  }

  return { token0Usd, token1Usd }
}

/**
 * 从 Swap event 计算 USD 金额（最简单：找 WETH/稳定币一侧）
 */
export function calcAmountUsd(
  amount0: number,
  amount1: number,
  token0Usd: number,
  token1Usd: number
): number {
  if (token0Usd > 0) return Math.abs(amount0) * token0Usd
  if (token1Usd > 0) return Math.abs(amount1) * token1Usd
  return 0
}

// ─── Chainlink ETH/USD ────────────────────────────────────────

let cachedEthPrice = 0
let lastPriceFetch = 0

export async function getEthUsdPrice(
  client: PublicClient,
  forceRefresh = false
): Promise<number> {
  const now = Date.now()
  // 缓存 60 秒
  if (!forceRefresh && cachedEthPrice > 0 && now - lastPriceFetch < 60_000) {
    return cachedEthPrice
  }

  try {
    const result = await client.readContract({
      address: ADDRESSES.CHAINLINK_ETH_USD as `0x${string}`,
      abi: CHAINLINK_ABI,
      functionName: 'latestRoundData',
    }) as [bigint, bigint, bigint, bigint, bigint]

    const decimalsResult = await client.readContract({
      address: ADDRESSES.CHAINLINK_ETH_USD as `0x${string}`,
      abi: CHAINLINK_ABI,
      functionName: 'decimals',
    }) as number

    const price = Number(result[1]) / 10 ** decimalsResult
    cachedEthPrice = price
    lastPriceFetch = now
    return price
  } catch (err) {
    console.error('[price] Failed to fetch ETH/USD from Chainlink:', err)
    return cachedEthPrice || 2000 // fallback
  }
}
