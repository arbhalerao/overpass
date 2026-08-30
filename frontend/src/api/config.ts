const RAW_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim()

export const API_ORIGIN = RAW_BASE.replace(/\/+$/, '')

export const API_BASE = `${API_ORIGIN}/api/v1`

export function liveSocketUrl(): string {
  const origin = API_ORIGIN || window.location.origin
  const url = new URL('/ws/live', origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
