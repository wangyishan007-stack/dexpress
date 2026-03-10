import { redirect } from 'next/navigation'
import { DEFAULT_CHAIN } from '@/lib/chains'

export default function LegacyPairPage({ params }: { params: { address: string } }) {
  redirect(`/${DEFAULT_CHAIN}/pair/${params.address}`)
}
