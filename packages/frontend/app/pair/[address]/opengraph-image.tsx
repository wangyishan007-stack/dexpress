import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Token pair on dex.express'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const GT_BASE = 'https://api.geckoterminal.com/api/v2'

export default async function OGImage({ params }: { params: { address: string } }) {
  const address = params.address

  // Fetch pool data from GeckoTerminal
  let symbol = '???'
  let name = ''
  let quoteSymbol = ''
  let priceUsd = ''
  let change24h = 0
  let liquidity = ''
  let volume24h = ''
  let logoUrl: string | null = null

  try {
    const res = await fetch(
      `${GT_BASE}/networks/base/pools/${address}?include=base_token,quote_token`,
      { next: { revalidate: 300 } }
    )
    if (res.ok) {
      const json = await res.json()
      const pool = json.data?.attributes
      const included = json.included || []
      const baseToken = included.find((t: any) => t.type === 'token' && t.id !== `base_${pool?.quote_token_id}`)
      const quoteToken = included.find((t: any) => t.type === 'token' && t.id !== baseToken?.id)

      symbol = baseToken?.attributes?.symbol || pool?.name?.split('/')[0]?.trim() || '???'
      name = baseToken?.attributes?.name || symbol
      quoteSymbol = quoteToken?.attributes?.symbol || pool?.name?.split('/')[1]?.trim() || ''
      priceUsd = pool?.base_token_price_usd || '0'
      change24h = parseFloat(pool?.price_change_percentage?.h24 || '0')
      logoUrl = baseToken?.attributes?.image_url || null

      const liq = parseFloat(pool?.reserve_in_usd || '0')
      liquidity = liq >= 1e6 ? `$${(liq / 1e6).toFixed(1)}M` : liq >= 1e3 ? `$${(liq / 1e3).toFixed(1)}K` : `$${liq.toFixed(0)}`

      const vol = parseFloat(pool?.volume_usd?.h24 || '0')
      volume24h = vol >= 1e6 ? `$${(vol / 1e6).toFixed(1)}M` : vol >= 1e3 ? `$${(vol / 1e3).toFixed(1)}K` : `$${vol.toFixed(0)}`
    }
  } catch {}

  // Format price
  const p = parseFloat(priceUsd)
  const formattedPrice = p >= 1 ? `$${p.toFixed(2)}` : p >= 0.0001 ? `$${p.toFixed(6)}` : p > 0 ? `$${p.toExponential(4)}` : '$0'

  const changeStr = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`
  const changeColor = change24h >= 0 ? '#22c55e' : '#ef4444'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #000000 0%, #0a0a1a 50%, #000000 100%)',
          fontFamily: 'sans-serif',
          padding: '60px 80px',
        }}
      >
        {/* Top bar: logo + branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="40" height="34" viewBox="0 0 58 49" fill="none">
            <path d="M24.9238 4.15868e-06C26.5289 4.11453e-06 26.9316 4.66623e-05 28.6387 0.10059H28.6406C30.452 0.207281 31.6326 0.276668 33.5625 0.703129C36.1898 1.28373 37.5514 2.42794 39.1865 3.80176L39.2656 3.86817C39.9401 4.43469 40.6167 4.99988 41.2676 5.59278C41.5279 5.82992 41.7903 5.92344 42.1377 5.92286C46.9918 5.91464 51.2435 5.91777 56.0977 5.91895C56.8229 5.91913 56.7909 5.92532 56.8682 6.66504C57.1059 8.94051 57.2674 11.2209 57.207 13.5078C57.1487 15.7173 56.983 17.9159 56.167 20.0127C54.662 23.8797 51.8223 26.2625 47.9307 27.4981C45.8185 28.1686 44.2341 28.4849 42.0645 28.8838C38.6234 29.5164 35.2401 30.1405 32.0449 31.6162C29.3792 32.8475 26.9184 34.4054 24.6162 36.2207C20.3501 39.5848 16.639 43.5151 13.0586 47.5772C12.9162 47.7387 12.6869 47.9255 12.6572 47.9551C12.6289 47.9836 12.5318 48.0813 12.3701 48.1426C13.6665 44.5668 15.4683 41.3823 17.7383 38.415C20.9825 34.2341 24.8875 30.9018 29.6338 28.5957C32.6289 27.1405 35.8089 26.4749 39.0693 25.8594C41.661 25.3702 43.6906 25.0889 46.2383 24.374C48.4866 23.7431 50.4318 22.6414 51.8008 20.6836C52.8343 19.2056 53.3695 17.5448 53.5566 15.7637C53.751 13.9137 53.6624 12.0584 53.6377 10.2051C53.627 9.40139 53.6047 9.40131 52.7812 9.40137C48.762 9.40167 45.3454 9.39792 41.3262 9.41016C40.9277 9.41135 40.6235 9.29694 40.3252 9.03711C39.3346 8.17431 38.3073 7.35251 37.3252 6.48047C35.6908 5.0293 34.9691 4.52202 31.6533 3.86817C29.4426 3.35785 28.2364 3.35743 24.8164 3.35743C23.3543 3.25206 21.8557 3.47426 20.3828 3.56153C18.4672 3.67503 16.7861 4.35087 15.4697 5.75489C13.0494 8.33633 10.6719 10.9579 8.27734 13.5635C7.64984 14.2463 7.02376 14.9305 6.39844 15.6152C6.24426 15.7841 6.07111 15.9417 5.99414 16.1758C6.04465 16.23 6.07871 16.2881 6.12891 16.3164C7.72045 17.2148 8.78832 18.6527 9.92285 20.0166C11.3968 21.7885 13.2772 22.7211 15.5664 22.9238C17.6609 23.1092 19.6533 22.7387 21.6016 22.0059L21.6074 22.0039C21.8885 21.8982 22.4125 21.7009 22.9111 21.1025C23.8155 20.0977 23.6346 16.9208 22.9111 11.958C22.9281 11.9729 26.3453 14.988 26.127 21.1025C26.0731 22.6098 24.8545 24.1354 23.8496 24.6455C21.5816 25.7967 20.4285 26.0575 17.8848 26.2705C13.4943 26.6382 9.73713 25.3799 6.85547 21.9072C6.25435 21.1828 5.67678 20.4352 4.97559 19.7969C4.56965 19.4274 4.12274 19.1426 3.61035 18.9434C2.54476 18.5292 1.48506 18.0977 0.424805 17.6699C0.286006 17.614 0.122131 17.5924 0 17.376C0.392257 16.9406 0.795496 16.4836 1.20898 16.0361C4.06209 12.9489 6.91691 9.86323 9.77148 6.77735C10.999 5.45032 12.1624 4.05976 13.4824 2.82325C15.2282 1.18796 17.346 0.387884 19.7119 0.16016C21.3411 0.0033517 23.2126 -0.000153851 24.9209 4.15868e-06H24.9238ZM33.2715 9.04493C34.4511 7.93474 36.1122 8.17016 36.7705 9.51075C37.1988 10.3831 36.9478 11.4979 36.1846 12.1123C35.4431 12.7091 34.3119 12.7099 33.5703 12.1143C32.7723 11.4732 32.5308 10.3912 32.9883 9.48145C33.0606 9.33761 33.1609 9.20791 33.2715 9.04493Z" fill="#2744FF"/>
          </svg>
          <span style={{ color: '#666', fontSize: 24 }}>dex.express</span>
          <span style={{ color: '#333', fontSize: 24, marginLeft: 8 }}>|</span>
          <span style={{ color: '#444', fontSize: 22, marginLeft: 8 }}>Base Chain</span>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 48 }}>
          {/* Token logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 140,
              height: 140,
              borderRadius: 24,
              background: logoUrl ? 'transparent' : '#1a1a2e',
              border: '2px solid #333',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} width={140} height={140} alt="" style={{ objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 56, fontWeight: 800, color: '#2744FF' }}>
                {symbol.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          {/* Token info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
              <span style={{ fontSize: 56, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>
                ${symbol}
              </span>
              {quoteSymbol && (
                <span style={{ fontSize: 28, color: '#666' }}>/ {quoteSymbol}</span>
              )}
            </div>
            {name && name !== symbol && (
              <span style={{ fontSize: 24, color: '#888' }}>{name}</span>
            )}

            {/* Price + Change */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 12 }}>
              <span style={{ fontSize: 48, fontWeight: 700, color: '#fff' }}>{formattedPrice}</span>
              <span style={{ fontSize: 32, fontWeight: 700, color: changeColor }}>{changeStr}</span>
            </div>
          </div>
        </div>

        {/* Bottom stats */}
        <div style={{ display: 'flex', gap: 48 }}>
          {[
            { label: '24H Volume', value: volume24h },
            { label: 'Liquidity', value: liquidity },
          ].map((stat) => (
            <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20, color: '#666' }}>{stat.label}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#ccc' }}>{stat.value}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
