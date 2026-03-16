---
name: 0x-swap
description: 0x Protocol DEX 聚合器集成指南。在涉及 swap、CopyTrade、交易执行、报价获取、手续费配置时使用。
user-invocable: false
---

# 0x Protocol DEX 聚合器集成

## 架构概览

```
用户点击 Swap/CopyTrade
    ↓
前端 useSwapQuote hook (SWR, 600ms debounce)
    ↓
Next.js API Route: /api/swap/quote
    ↓
0x API: api.0x.org/swap/allowance-holder/quote (v2)
    ↓ 返回报价 + 可签名的交易数据
前端 useExecuteSwap hook
    ↓
Privy 钱包签名 → 链上成交
```

## 关键文件

| 文件 | 作用 |
|------|------|
| `app/api/swap/quote/route.ts` | 后端代理，调 0x API 获取报价 |
| `hooks/useSwapQuote.ts` | SWR hook，前端获取报价 |
| `hooks/useExecuteSwap.ts` | 执行交易（Privy sendTransaction） |
| `components/CopyTradeModal.tsx` | CopyTrade 弹窗 UI |

## 0x API 调用

### 请求

```
GET https://api.0x.org/swap/allowance-holder/quote
Headers:
  0x-api-key: {ZERO_EX_API_KEY}
  0x-version: v2

Params:
  sellToken:  0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE (原生代币)
  buyToken:   {目标 token 合约地址}
  sellAmount: {wei 数量}
  taker:      {用户钱包地址}
  chainId:    8453 (Base) | 56 (BSC)

  # 平台手续费（可选）
  swapFeeRecipient: {FEE_RECIPIENT_ADDRESS}
  swapFeeBps:       100  (1%)
  swapFeeToken:     {buyToken}
```

### 响应

```json
{
  "sellAmount": "33000000000000000",
  "buyAmount": "1234567890000000000000",
  "transaction": {
    "to": "0x...",
    "data": "0x...",
    "value": "0x...",
    "gas": "210000"
  }
}
```

### 执行

前端拿到 `transaction` 后直接通过 Privy 签名发送：
```typescript
const tx = await walletClient.sendTransaction({
  to: quote.transaction.to,
  data: quote.transaction.data,
  value: BigInt(quote.transaction.value),
})
```

## 支持的链

| 链 | chainId | 原生代币 | 聚合的 DEX |
|----|---------|----------|-----------|
| Base | 8453 | ETH | Uniswap V2/V3/V4, Aerodrome, BaseSwap |
| BSC | 56 | BNB | PancakeSwap V2/V3, Uniswap, BiSwap |

Solana **不支持** 0x，需要用 Jupiter API。

## 手续费模型

- **0x 对开发者**: API 调用有免费额度，超量按调用次数收费
- **0x 对用户**: 不收费，无协议费
- **我们对用户**: 1% 平台费 (`swapFeeBps: 100`)，从买入 token 中扣除，打到 `FEE_RECIPIENT_ADDRESS`
- 如果 `FEE_RECIPIENT_ADDRESS` 未设置，不收费

## 环境变量

| 变量 | 说明 |
|------|------|
| `ZERO_EX_API_KEY` | 0x API 密钥（必需） |
| `FEE_RECIPIENT_ADDRESS` | 平台手续费接收地址（可选，不设则不收费） |

## 价格计算流程

1. 用户选择 USD 金额（$50/$100/$500 或自定义）
2. 后端通过 CoinGecko 获取原生代币价格（ETH/BNB）
3. 换算为 wei: `sellAmountWei = (usdAmount / nativePrice) * 10^18`
4. 用 wei 数量调 0x API 获取 buyAmount
5. 前端格式化显示预估收到的 token 数量

## 错误处理

- `ZERO_EX_API_KEY not configured` → 环境变量未设置
- `0x API error 400` → 参数错误（如 taker 地址无效、token 不存在）
- `No liquidity` → 0x 找不到该 token 的交易路由
- CoinGecko 失败 → 使用 fallback 价格（ETH=$3000, BNB=$600）

## 添加新链

1. 在 `CHAIN_MAP` 添加链配置（chainId, nativeAddress, nativeDecimals, nativeSymbol, type）
2. 在 `fetchNativePrice` 添加 CoinGecko ID 映射
3. 确认 0x 支持该链（参考 https://0x.org/docs）
4. 前端 `CopyTradeModal` 无需修改（通用逻辑）

## Solana 替代方案（Jupiter）

Solana 不走 0x，走 Jupiter API：
- Quote: `GET https://quote-api.jup.ag/v6/quote`
- Swap: `POST https://quote-api.jup.ag/v6/swap`
- 返回序列化交易，需要 Solana 钱包签名（非 EVM sendTransaction）
- 平台费: `platformFeeBps` 参数，Jupiter 分走 0.2%
- 代码中 `route.ts` 已有 Jupiter 路由框架，缺少前端 Solana 钱包签名执行
