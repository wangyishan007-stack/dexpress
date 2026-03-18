'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana'
import { CopyTradeModal, type CopyTradeModalProps } from './CopyTradeModal'

/** Fetch SOL balance in lamports via JSON-RPC */
async function fetchSolBalance(address: string): Promise<number> {
  try {
    const rpc = 'https://api.mainnet-beta.solana.com'
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
    })
    const data = await res.json()
    return data?.result?.value ?? 0
  } catch { return 0 }
}

export default function SolanaCopyTradeWrapper(props: Omit<CopyTradeModalProps, 'solanaAddress' | 'solanaSigner' | 'solanaBalanceSol'>) {
  const { wallets } = useWallets()
  const { signAndSendTransaction } = useSignAndSendTransaction()

  const solanaAddress = wallets[0]?.address
  const [balanceSol, setBalanceSol] = useState<number | null>(null)

  useEffect(() => {
    if (!solanaAddress) { setBalanceSol(null); return }
    fetchSolBalance(solanaAddress).then(lamports => setBalanceSol(lamports / 1e9))
  }, [solanaAddress])

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
      solanaBalanceSol={balanceSol}
    />
  )
}
