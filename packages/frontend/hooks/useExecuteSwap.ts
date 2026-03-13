'use client'

import { useState, useCallback } from 'react'
import { useWallets } from '@privy-io/react-auth'
import type { SwapQuote } from '@/app/api/swap/quote/route'
import type { ChainSlug } from '@/lib/chains'

type SwapStatus = 'idle' | 'pending' | 'success' | 'error'

interface UseExecuteSwapReturn {
  execute: (quote: SwapQuote) => Promise<boolean>
  status: SwapStatus
  txHash: string | null
  error: string | null
  reset: () => void
}

export function useExecuteSwap(_chain: ChainSlug): UseExecuteSwapReturn {
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
      if (quote.transaction.serializedTransaction) {
        throw new Error('Solana swap coming soon. Please use Jupiter directly.')
      }

      // Find active EVM wallet (prefer first connected)
      const wallet = wallets.find(w => w.walletClientType !== 'privy') ?? wallets[0]
      if (!wallet) throw new Error('No wallet connected. Please connect a wallet first.')

      // Use wallet's EIP-1193 provider — works for both embedded and external wallets
      const provider = await wallet.getEthereumProvider()

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
  }, [wallets])

  return { execute, status, txHash, error, reset }
}
