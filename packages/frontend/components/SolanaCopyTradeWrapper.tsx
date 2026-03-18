'use client'

import { useCallback } from 'react'
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana'
import { CopyTradeModal, type CopyTradeModalProps } from './CopyTradeModal'

/**
 * Wrapper that provides Solana wallet hooks to CopyTradeModal.
 * This file is the ONLY place that imports @privy-io/react-auth/solana.
 * It's loaded via next/dynamic with ssr:false + error catch so that
 * if Solana deps fail to load (production WASM issues), the page doesn't crash.
 */
export default function SolanaCopyTradeWrapper(props: Omit<CopyTradeModalProps, 'solanaAddress' | 'solanaSigner'>) {
  const { wallets } = useWallets()
  const { signAndSendTransaction } = useSignAndSendTransaction()

  const solanaAddress = wallets[0]?.address

  const solanaSigner = useCallback(async (tx: Uint8Array): Promise<string> => {
    const wallet = wallets[0]
    if (!wallet) throw new Error('No Solana wallet found. Please connect a Solana wallet.')
    const { signature } = await signAndSendTransaction({ transaction: tx, wallet })
    const bs58 = await import('bs58')
    return bs58.default.encode(signature)
  }, [wallets, signAndSendTransaction])

  return (
    <CopyTradeModal
      {...props}
      solanaAddress={solanaAddress}
      solanaSigner={solanaSigner}
    />
  )
}
