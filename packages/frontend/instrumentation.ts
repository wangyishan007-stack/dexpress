export async function register() {
  // Make Node.js fetch() respect HTTP_PROXY / HTTPS_PROXY env vars
  // Required for dev environments that route through a local proxy
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY
    if (proxyUrl) {
      const { setGlobalDispatcher, ProxyAgent } = await import('undici')
      setGlobalDispatcher(new ProxyAgent(proxyUrl))
      console.log(`[instrumentation] Global proxy set: ${proxyUrl}`)
    }
  }
}
