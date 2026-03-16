'use client'

import { useState, useCallback } from 'react'
import { useWallets } from '@privy-io/react-auth'
import type { SwapQuote } from '@/app/api/swap/quote/route'
import type { ChainSlug } from '@/lib/chains'

type SwapStatus = 'idle' | 'pending' | 'success' | 'error'

/** Solana signer function — passed in from component that calls Privy Solana hooks */
export type SolanaSigner = (tx: Uint8Array) => Promise<string>

interface UseExecuteSwapReturn {
  execute: (quote: SwapQuote) => Promise<boolean>
  status: SwapStatus
  txHash: string | null
  error: string | null
  reset: () => void
}

export function useExecuteSwap(_chain: ChainSlug, solanaSigner?: SolanaSigner): UseExecuteSwapReturn {
  const { wallets } = useWallets()
  const [status, setStatus] = useState<SwapStatus>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setTxHash(null)
    setError(null)
  }, [])

  const execute = useCallback(async (quote: SwapQuote): Promise<boolean> => {
    setStatus('pending')
    setError(null)
    setTxHash(null)

    try {
      // ── Solana path ──────────────────────────────────────
      if (quote.transaction.serializedTransaction) {
        if (!solanaSigner) {
          throw new Error('No Solana wallet connected. Please connect Phantom or another Solana wallet.')
        }

        const txBytes = Uint8Array.from(
          atob(quote.transaction.serializedTransaction),
          c => c.charCodeAt(0),
        )

        const signature = await solanaSigner(txBytes)
        setTxHash(signature)
        setStatus('success')
        return true
      }

      // ── EVM path ─────────────────────────────────────────
      const wallet = wallets.find(w => w.walletClientType !== 'privy') ?? wallets[0]
      if (!wallet) throw new Error('No wallet connected. Please connect a wallet first.')

      const provider = await wallet.getEthereumProvider()

      // Switch to correct chain if needed (e.g. Base → BSC)
      if (quote.chainId) {
        const targetChainHex = `0x${quote.chainId.toString(16)}`
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: targetChainHex }],
          })
        } catch (switchErr: any) {
          if (switchErr?.code === 4902 && quote.chainId === 56) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: targetChainHex,
                chainName: 'BNB Smart Chain',
                nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                rpcUrls: ['https://bsc-dataseed.binance.org'],
                blockExplorerUrls: ['https://bscscan.com'],
              }],
            })
          } else {
            throw switchErr
          }
        }
      }

      const valueHex = quote.transaction.value
        ? `0x${BigInt(quote.transaction.value).toString(16)}`
        : '0x0'

      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: wallet.address,
          to: quote.transaction.to,
          data: quote.transaction.data ?? '0x',
          value: valueHex,
        }],
      }) as string

      setTxHash(hash)
      setStatus('success')
      return true
    } catch (err: unknown) {
      console.error('[executeSwap] error:', err)
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled') || msg.includes('User rejected')) {
        setError('Transaction cancelled')
      } else {
        setError(msg.length > 120 ? msg.slice(0, 120) + '...' : msg)
      }
      setStatus('error')
      return false
    }
  }, [wallets, solanaSigner])

  return { execute, status, txHash, error, reset }
}
