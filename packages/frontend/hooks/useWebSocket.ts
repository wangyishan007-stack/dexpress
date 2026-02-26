'use client'

import { useEffect, useRef, useCallback } from 'react'

export interface PriceUpdateEvent {
  pool_address: string
  price_usd:    number
  amount_usd:   number
  is_buy:       boolean
}

type Handler = (event: PriceUpdateEvent) => void

export function usePairWebSocket(
  poolAddresses: string[],
  onPriceUpdate: Handler
) {
  const ws         = useRef<WebSocket | null>(null)
  const handlers   = useRef<Handler>(onPriceUpdate)
  const reconnectT = useRef<ReturnType<typeof setTimeout>>()

  // Always use the latest handler without re-subscribing
  handlers.current = onPriceUpdate

  const connect = useCallback(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'
    const socket = new WebSocket(`${url}/ws/pairs`)

    socket.onopen = () => {
      if (poolAddresses.length > 0) {
        socket.send(JSON.stringify({ type: 'subscribe', pools: poolAddresses }))
      }
    }

    socket.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.type === 'price_update') {
          handlers.current(msg.data)
        }
      } catch {}
    }

    socket.onclose = () => {
      reconnectT.current = setTimeout(connect, 3_000)
    }

    socket.onerror = () => {
      socket.close()
    }

    ws.current = socket
  }, [poolAddresses.join(',')])  // eslint-disable-line

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectT.current)
      ws.current?.close()
    }
  }, [connect])

  // Allow caller to add/remove subscriptions dynamically
  const subscribe = useCallback((pools: string[]) => {
    ws.current?.send(JSON.stringify({ type: 'subscribe', pools }))
  }, [])

  const unsubscribe = useCallback((pools: string[]) => {
    ws.current?.send(JSON.stringify({ type: 'unsubscribe', pools }))
  }, [])

  return { subscribe, unsubscribe }
}
