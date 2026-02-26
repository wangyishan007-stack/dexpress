import { PairDetailClient } from './PairDetailClient'

interface Props {
  params: { address: string }
}

export default function PairPage({ params }: Props) {
  return <PairDetailClient address={params.address} />
}

export function generateMetadata({ params }: Props) {
  return { title: `Pair ${params.address.slice(0, 8)}… — Base DEX Screener` }
}
