'use client'

import { useEffect, useState } from 'react'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'

type Handler = (payload: unknown) => void

class WebSocketManager {
  private ws: WebSocket | null = null
  private subscribers = new Map<string, Set<Handler>>()
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 5
  private readonly backoffDelays = [1000, 2000, 4000, 8000, 16000]
  private readonly clientId: string

  constructor() {
    this.clientId = crypto.randomUUID()
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(`${WS_URL}/api/v1/ws/${this.clientId}`)

    this.ws.onopen = () => {
      console.log('[WS] connected, clientId=%s', this.clientId)
      this.reconnectAttempts = 0
      this.emit('__connected', null)
    }

    this.ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { type: string; payload: unknown }
        this.emit(data.type, data.payload)
      } catch {
        console.warn('[WS] unparseable message', event.data)
      }
    }

    this.ws.onerror = (event) => {
      console.error('[WS] error', event)
    }

    this.ws.onclose = () => {
      console.log('[WS] closed, attempt=%d', this.reconnectAttempts)
      this.emit('__disconnected', null)

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = this.backoffDelays[this.reconnectAttempts] ?? 16000
        this.reconnectAttempts++
        setTimeout(() => this.connect(), delay)
      } else {
        console.warn('[WS] max reconnect attempts reached')
      }
    }
  }

  private emit(type: string, payload: unknown): void {
    const handlers = this.subscribers.get(type)
    if (handlers) {
      for (const handler of handlers) {
        handler(payload)
      }
    }
  }

  subscribe(eventType: string, handler: Handler): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set())
    }
    this.subscribers.get(eventType)!.add(handler)
    return () => this.unsubscribe(eventType, handler)
  }

  unsubscribe(eventType: string, handler: Handler): void {
    this.subscribers.get(eventType)?.delete(handler)
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const wsManager = new WebSocketManager()

export function useWebSocket() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    wsManager.connect()

    const unsubConnected = wsManager.subscribe('__connected', () => setConnected(true))
    const unsubDisconnected = wsManager.subscribe('__disconnected', () => setConnected(false))

    // Sync initial state if already connected
    setConnected(wsManager.isConnected)

    return () => {
      unsubConnected()
      unsubDisconnected()
    }
  }, [])

  return {
    connected,
    subscribe: wsManager.subscribe.bind(wsManager),
  }
}
