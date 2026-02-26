/**
 * WebSocket handler
 *
 * 客户端连接后：
 *  - 发送 subscribe { pools: ['0x...', ...] } 订阅特定 pairs
 *  - 收到 price_update { pool, price, change_1m, amount, isBuy, ts }
 *  - 发送 unsubscribe { pools: [...] } 取消订阅
 */

import type { FastifyInstance } from 'fastify'
import type { WebSocket }       from 'ws'
import type { Redis }           from 'ioredis'

interface WsClient {
  ws:            WebSocket
  subscribedTo:  Set<string>  // pool addresses
}

const clients = new Set<WsClient>()

export async function setupPairsWs(app: FastifyInstance, redisSub: Redis) {
  // Subscribe to Redis channel published by IndexerWorker
  await redisSub.subscribe('swap_events')

  redisSub.on('message', (_channel, message) => {
    try {
      const event = JSON.parse(message) as {
        pool: string; price: number; amount: number; isBuy: boolean; ts: number
      }

      const payload = JSON.stringify({
        type: 'price_update',
        data: {
          pool_address: event.pool,
          price_usd:    event.price,
          amount_usd:   event.amount,
          is_buy:       event.isBuy,
        },
        ts: event.ts,
      })

      // Broadcast only to subscribed clients
      for (const client of clients) {
        if (
          client.subscribedTo.size === 0 ||         // subscribed to all
          client.subscribedTo.has(event.pool)
        ) {
          if (client.ws.readyState === 1 /* OPEN */) {
            client.ws.send(payload)
          }
        }
      }
    } catch {
      // ignore bad messages
    }
  })

  // Register WebSocket route
  app.get('/ws/pairs', { websocket: true }, (socket: WebSocket) => {
    const client: WsClient = { ws: socket, subscribedTo: new Set() }
    clients.add(client)

    // Ping every 20s to keep connection alive
    const pingInterval = setInterval(() => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
      }
    }, 20_000)

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: 'subscribe' | 'unsubscribe'
          pools?: string[]
        }

        if (msg.type === 'subscribe') {
          const pools = (msg.pools ?? []).map((p) => p.toLowerCase())
          pools.forEach((p) => client.subscribedTo.add(p))
        } else if (msg.type === 'unsubscribe') {
          const pools = (msg.pools ?? []).map((p) => p.toLowerCase())
          pools.forEach((p) => client.subscribedTo.delete(p))
        }
      } catch {
        // ignore
      }
    })

    socket.on('close', () => {
      clearInterval(pingInterval)
      clients.delete(client)
    })

    socket.on('error', () => {
      clearInterval(pingInterval)
      clients.delete(client)
    })

    // Send welcome
    socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
  })
}
