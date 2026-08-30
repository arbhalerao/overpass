import { api } from './client'
import { liveSocketUrl } from './config'
import type { SceneRequest, SceneUpdateFrame, ServerFrame, SubscribeFrame } from './types'

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'polling'

export interface LiveError {
  code: string
  message: string
}

export interface LiveHandlers {
  onState: (state: ConnectionState, detail?: string) => void
  onUpdate: (frame: SceneUpdateFrame) => void
  onError: (error: LiveError) => void
}

const BACKOFF_SCHEDULE_MS = [1_000, 2_000, 4_000, 8_000, 15_000]
const HEARTBEAT_MS = 25_000
//  no frame for this long means the socket is dead even if it never closed
const SILENCE_LIMIT_MS = 90_000
//  start polling once the socket has been unavailable for this long
const POLL_AFTER_MS = 20_000
export const POLL_INTERVAL_MS = 15_000

export class LiveClient {
  private readonly handlers: LiveHandlers
  private socket: WebSocket | null = null
  private subscription: SubscribeFrame | null = null
  private state: ConnectionState = 'idle'

  private attempt = 0
  private stopped = false
  private downSince: number | null = null
  private lastFrameAt = 0

  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private watchdogTimer: number | null = null
  private pollTimer: number | null = null
  private pollAbort: AbortController | null = null

  constructor(handlers: LiveHandlers) {
    this.handlers = handlers
  }

  //  subscribe, or replace an existing subscription in place
  setSubscription(frame: SubscribeFrame): void {
    this.subscription = frame
    this.stopped = false

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send(frame)
      return
    }
    if (this.socket?.readyState === WebSocket.CONNECTING) return
    this.open()
  }

  //  close everything and release every timer
  // safe to call twice
  stop(): void {
    this.stopped = true
    this.subscription = null
    this.clearTimers()
    this.stopPolling()
    if (this.socket) {
      this.socket.onclose = null
      this.socket.onerror = null
      this.socket.onmessage = null
      this.socket.onopen = null
      if (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        this.socket.close(1000, 'client stopped')
      }
      this.socket = null
    }
    this.setState('idle')
  }

  reconnectNow(): void {
    if (!this.subscription) return
    this.attempt = 0
    this.closeSocket()
    this.open()
  }

  // socket lifecycle

  private open(): void {
    if (this.stopped || !this.subscription) return
    this.clearTimer('reconnectTimer')

    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting')

    let socket: WebSocket
    try {
      socket = new WebSocket(liveSocketUrl())
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket

    socket.onopen = () => {
      if (this.socket !== socket) return
      this.attempt = 0
      this.downSince = null
      this.lastFrameAt = Date.now()
      this.stopPolling()
      if (this.subscription) this.send(this.subscription)
      this.startHeartbeat()
      this.startWatchdog()
    }

    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      this.lastFrameAt = Date.now()
      this.handleFrame(event.data)
    }

    socket.onerror = () => {
      // `onclose` always follows; reconnection is handled there so it happens once
    }

    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.socket = null
      this.clearTimer('heartbeatTimer')
      this.clearTimer('watchdogTimer')
      if (this.stopped || event.code === 1000) return
      this.scheduleReconnect()
    }
  }

  private handleFrame(raw: unknown): void {
    if (typeof raw !== 'string') return

    let frame: ServerFrame
    try {
      frame = JSON.parse(raw) as ServerFrame
    } catch {
      this.handlers.onError({
        code: 'invalid_frame',
        message: 'The server sent a message that could not be parsed.',
      })
      return
    }

    switch (frame.type) {
      case 'subscribed':
        this.setState('live')
        break
      case 'scene_update':
        this.setState('live')
        this.handlers.onUpdate(frame)
        break
      case 'error':
        this.handlers.onError(frame.error)
        break
      case 'ready':
      case 'pong':
      case 'unsubscribed':
        break
    }
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    try {
      this.socket.send(JSON.stringify(payload))
    } catch {
      //  the close handler will take it from here
    }
  }

  private closeSocket(): void {
    const socket = this.socket
    this.socket = null
    this.clearTimer('heartbeatTimer')
    this.clearTimer('watchdogTimer')
    if (!socket) return
    socket.onclose = null
    socket.onerror = null
    socket.onmessage = null
    socket.onopen = null
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, 'reconnecting')
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || !this.subscription) return

    this.downSince ??= Date.now()
    const delay = BACKOFF_SCHEDULE_MS[Math.min(this.attempt, BACKOFF_SCHEDULE_MS.length - 1)]
    this.attempt += 1
    this.setState('reconnecting', `retrying in ${Math.round(delay / 1000)}s`)

    // a socket that stays down shouldn't mean a frozen screen
    if (Date.now() - this.downSince >= POLL_AFTER_MS) this.startPolling()

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  private startHeartbeat(): void {
    this.clearTimer('heartbeatTimer')
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ action: 'ping' })
    }, HEARTBEAT_MS)
  }

  private startWatchdog(): void {
    this.clearTimer('watchdogTimer')
    this.watchdogTimer = window.setInterval(() => {
      if (Date.now() - this.lastFrameAt < SILENCE_LIMIT_MS) return
      // open but silent: recycle it rather than waiting for a close that won't come
      this.closeSocket()
      this.scheduleReconnect()
    }, SILENCE_LIMIT_MS / 3)
  }

  // HTTP fallback

  private startPolling(): void {
    if (this.pollTimer !== null || !this.subscription) return
    this.setState('polling')
    void this.pollOnce()
    this.pollTimer = window.setInterval(() => void this.pollOnce(), POLL_INTERVAL_MS)
  }

  private stopPolling(): void {
    this.clearTimer('pollTimer')
    this.pollAbort?.abort()
    this.pollAbort = null
  }

  private async pollOnce(): Promise<void> {
    const subscription = this.subscription
    if (!subscription || this.stopped) return

    this.pollAbort?.abort()
    const controller = new AbortController()
    this.pollAbort = controller

    const request: SceneRequest = {
      center: subscription.center,
      radius_km: subscription.radius_km,
      min_satellite_elevation_deg: subscription.min_satellite_elevation_deg,
      include: subscription.include,
      observation_time:
        subscription.time_mode === 'fixed' ? subscription.observation_time : undefined,
    }

    try {
      const scene = await api.scene(request, controller.signal)
      this.handlers.onUpdate({
        type: 'scene_update',
        connection_id: 'http-poll',
        layers: (['aircraft', 'satellites'] as const).filter(
          (layer) => subscription.include[layer],
        ),
        observation: scene.observation,
        aircraft: scene.aircraft,
        satellites: scene.satellites,
        sky: scene.sky,
        sources: scene.sources,
        warnings: scene.warnings,
        partial: scene.partial,
        generated_at: scene.generated_at,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const message =
        error instanceof Error ? error.message : 'The backend could not be reached.'
      this.handlers.onError({ code: 'poll_failed', message })
    }
  }

  // plumbing

  private setState(state: ConnectionState, detail?: string): void {
    if (this.state === state && !detail) return
    this.state = state
    this.handlers.onState(state, detail)
  }

  private clearTimer(
    name: 'reconnectTimer' | 'heartbeatTimer' | 'watchdogTimer' | 'pollTimer',
  ): void {
    const handle = this[name]
    if (handle === null) return
    if (name === 'heartbeatTimer' || name === 'watchdogTimer' || name === 'pollTimer') {
      window.clearInterval(handle)
    } else {
      window.clearTimeout(handle)
    }
    this[name] = null
  }

  private clearTimers(): void {
    this.clearTimer('reconnectTimer')
    this.clearTimer('heartbeatTimer')
    this.clearTimer('watchdogTimer')
  }
}
