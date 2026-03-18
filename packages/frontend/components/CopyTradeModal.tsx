'use client'

import { useState, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useSwapQuote } from '@/hooks/useSwapQuote'
import { useExecuteSwap } from '@/hooks/useExecuteSwap'
import { useFollowedWallets } from '@/hooks/useFollowedWallets'
import { fmtUsd, shortAddr } from '@/lib/formatters'
import { explorerLink, getChain, type ChainSlug } from '@/lib/chains'
// Safe wrapper — @privy-io/react-auth/solana hooks can crash if Solana provider isn't ready
let _useSolanaWallets: any, _useSignAndSendTransaction: any
try {
  const mod = require('@privy-io/react-auth/solana')
  _useSolanaWallets = mod.useWallets
  _useSignAndSendTransaction = mod.useSignAndSendTransaction
} catch { /* Solana hooks unavailable */ }

function useSafeSolanaWallets() {
  try { return _useSolanaWallets ? _useSolanaWallets() : { wallets: [] } }
  catch { return { wallets: [] } }
}
function useSafeSignAndSendTransaction() {
  try { return _useSignAndSendTransaction ? _useSignAndSendTransaction() : { signAndSendTransaction: async () => { throw new Error('Solana not available') } } }
  catch { return { signAndSendTransaction: async () => { throw new Error('Solana not available') } } }
}

/* ── Types ────────────────────────────────────────────── */

export interface CopyTradeModalProps {
  isOpen: boolean
  onClose: () => void
  tokenAddress: string
  tokenSymbol: string
  tokenLogo?: string | null
  walletAddress: string
  walletPnlPct: number
  chain: ChainSlug
  tokenDecimals?: number
}

/* ── Helpers ──────────────────────────────────────────── */

function TokenIcon({ logo, symbol, size = 28 }: { logo?: string | null; symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const hue = symbol.split('').reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)

  if (!logo || failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${Math.abs(hue) % 360}, 55%, 45%)` }}
      >
        {symbol.charAt(0)}
      </div>
    )
  }

  return (
    <img src={logo} alt={symbol} width={size} height={size}
      className="rounded-full flex-shrink-0" style={{ width: size, height: size }}
      onError={() => setFailed(true)} />
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-border/30 rounded ${className}`} />
}

/* ── Slippage options ────────────────────────────────── */
const SLIPPAGE_OPTIONS = [0.5, 1, 2, 3]
const AMOUNT_OPTIONS = [50, 100, 500]

/* ── Component ───────────────────────────────────────── */

export function CopyTradeModal({
  isOpen,
  onClose,
  tokenAddress,
  tokenSymbol,
  tokenLogo,
  walletAddress,
  walletPnlPct,
  chain,
  tokenDecimals,
}: CopyTradeModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const { authenticated, user, login } = useAuth()
  const { follow, isFollowing } = useFollowedWallets()

  const chainConfig = getChain(chain)
  const nativeSymbol = chainConfig.nativeCurrency.symbol
  const isSolana = chainConfig.chainType === 'svm'

  // Solana wallet hooks (safe wrappers — won't crash if provider unavailable)
  const { wallets: solanaWallets } = useSafeSolanaWallets()
  const { signAndSendTransaction } = useSafeSignAndSendTransaction()

  // Solana signer — wraps Privy hook for useExecuteSwap
  const solanaSigner = useCallback(async (tx: Uint8Array): Promise<string> => {
    const wallet = solanaWallets[0]
    if (!wallet) throw new Error('No Solana wallet found. Please connect a Solana wallet.')
    const { signature } = await signAndSendTransaction({ transaction: tx, wallet })
    // Convert Uint8Array signature to base58 for explorer links
    const bs58 = await import('bs58')
    return bs58.default.encode(signature)
  }, [solanaWallets, signAndSendTransaction])

  // State
  const [selectedAmount, setSelectedAmount] = useState<number>(100)
  const [customAmount, setCustomAmount] = useState('')
  const [slippage, setSlippage] = useState(1)
  const [followWallet, setFollowWallet] = useState(!isFollowing(walletAddress))

  const sellAmountUsd = customAmount ? Number(customAmount) || 0 : selectedAmount

  // Get user's wallet address
  const solanaAddr = solanaWallets[0]?.address
  const takerAddress = isSolana
    ? solanaAddr ?? undefined
    : user?.wallet?.address ?? undefined

  // Fetch quote
  const { quote, isLoading: quoteLoading, error: quoteError } = useSwapQuote(
    chain, tokenAddress, tokenSymbol, tokenDecimals ?? 18, sellAmountUsd, takerAddress,
  )

  // Execute — pass Solana signer for SVM chains
  const { execute, status, txHash, error: execError, reset } = useExecuteSwap(
    chain, isSolana ? solanaSigner : undefined,
  )

  // Check for no route — only check buyAmount (Solana may lack serializedTransaction when no wallet connected)
  const noRoute = quote && (
    Number(quote.buyAmount) <= 0 ||
    (!isSolana && !quote.transaction.to && !quote.transaction.data)
  )

  if (!isOpen) return null

  const handleExecute = async () => {
    if (!authenticated) {
      login()
      return
    }
    if (!quote) return

    // Solana: need serializedTransaction to execute — re-fetch with taker if missing
    if (isSolana && !quote.transaction.serializedTransaction) {
      if (!solanaAddr) {
        // User has no Solana wallet — prompt login to create one
        login()
        return
      }
      // Refetch quote with taker to get serializedTransaction
      // For now, show error
      reset()
      return
    }

    const success = await execute(quote)

    // Follow wallet only on success
    if (success && followWallet && !isFollowing(walletAddress)) {
      follow(walletAddress, chain)
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const pnlStr = walletPnlPct >= 0
    ? `+${walletPnlPct >= 1000 ? `${(walletPnlPct / 1000).toFixed(1)}K` : walletPnlPct.toFixed(0)}%`
    : `${walletPnlPct.toFixed(0)}%`

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === backdropRef.current) handleClose() }}
    >
      <div className="w-full max-w-[420px] mx-4 rounded-xl border border-border bg-[#111] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[16px] font-bold text-text">Copy Trade</h2>
          <button onClick={handleClose} className="w-[28px] h-[28px] rounded-md flex items-center justify-center text-sub hover:text-text hover:bg-border/40 transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4">

          {/* Token info */}
          <div className="flex items-center gap-3">
            <TokenIcon logo={tokenLogo} symbol={tokenSymbol} size={36} />
            <div>
              <span className="text-[15px] font-bold text-text">${tokenSymbol}</span>
              <div className="text-[12px] text-sub mt-0.5">
                Smart wallet profited{' '}
                <span className={walletPnlPct >= 0 ? 'text-green font-medium' : 'text-red font-medium'}>
                  {pnlStr}
                </span>
              </div>
            </div>
          </div>

          {/* Amount selection */}
          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-sub font-medium">You pay</span>
            <div className="flex items-center gap-2">
              {AMOUNT_OPTIONS.map(amt => (
                <button
                  key={amt}
                  onClick={() => { setSelectedAmount(amt); setCustomAmount('') }}
                  className={`flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                    !customAmount && selectedAmount === amt
                      ? 'bg-blue text-white'
                      : 'bg-border/30 text-sub hover:text-text hover:bg-border/50'
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Custom amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="flex-1 px-3 py-2 border border-border rounded-lg bg-transparent text-[13px] text-text outline-none focus:border-blue placeholder:text-sub/50"
              />
              <span className="text-[13px] text-sub font-medium w-10 text-right">USD</span>
            </div>
          </div>

          {/* Estimated receive */}
          <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-surface/50 border border-border">
            <span className="text-[12px] text-sub font-medium">You receive (estimated)</span>
            {quoteLoading ? (
              <Skeleton className="h-6 w-32" />
            ) : noRoute ? (
              <span className="text-[13px] text-red">No liquidity — swap route not available for this token</span>
            ) : quote ? (
              <span className="text-[18px] font-bold text-text tabular">
                ≈ {quote.buyAmountFormatted} {quote.buySymbol}
              </span>
            ) : quoteError ? (
              <span className="text-[13px] text-red">Failed to get quote</span>
            ) : (
              <span className="text-[14px] text-sub">—</span>
            )}
          </div>

          {/* Fee details */}
          {quote && !noRoute && (
            <div className="flex flex-col gap-1 text-[11px] text-sub">
              <div className="flex justify-between">
                <span>Price impact</span>
                <span className={quote.priceImpact > 3 ? 'text-red' : 'text-text'}>
                  {quote.priceImpact.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Platform fee</span>
                <span className="text-text">1% ({fmtUsd(quote.platformFee)})</span>
              </div>
              <div className="flex justify-between">
                <span>Est. gas</span>
                <span className="text-text">~${(Number(quote.estimatedGas) * 0.00001).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Slippage */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-sub font-medium">Slippage tolerance</span>
            <div className="flex items-center gap-1.5">
              {SLIPPAGE_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setSlippage(s)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    slippage === s
                      ? 'bg-blue/15 text-blue border border-blue/30'
                      : 'bg-border/20 text-sub hover:text-text'
                  }`}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>

          {/* Execute button */}
          {!authenticated ? (
            <button
              onClick={() => login()}
              className="w-full py-3 rounded-lg bg-blue text-white text-[14px] font-medium hover:bg-blue/90 transition-colors"
            >
              Connect Wallet
            </button>
          ) : status === 'success' && txHash ? (
            <a
              href={explorerLink(chain, 'tx', txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-lg bg-green text-white text-[14px] font-medium text-center flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Trade Executed
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="ml-1">
                <path d="M5.5 2.5H3.5a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8.5M8.5 2.5h3v3M11.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          ) : status === 'error' ? (
            <div className="flex flex-col gap-2">
              <div className="w-full py-3 rounded-lg bg-red/15 border border-red/30 text-red text-[13px] text-center px-3">
                {execError || 'Transaction failed'}
              </div>
              <button
                onClick={reset}
                className="w-full py-2.5 rounded-lg border border-border text-[13px] font-medium text-sub hover:text-text transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <button
              onClick={handleExecute}
              disabled={status === 'pending' || quoteLoading || !quote || !!noRoute}
              className="w-full py-3 rounded-lg bg-blue text-white text-[14px] font-medium hover:bg-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'pending' ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Confirming...
                </>
              ) : quoteLoading ? (
                'Getting quote...'
              ) : (
                <>Execute Trade →</>
              )}
            </button>
          )}

          {/* Follow checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={followWallet}
              onChange={(e) => setFollowWallet(e.target.checked)}
              className="w-4 h-4 rounded border border-border bg-transparent accent-blue"
            />
            <span className="text-[12px] text-sub">
              Also follow wallet {shortAddr(walletAddress)}
            </span>
          </label>

        </div>
      </div>
    </div>
  )
}
