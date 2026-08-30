import { API_BASE } from './config'
import type {
  AircraftListResponse,
  ApiErrorBody,
  HealthResponse,
  SceneRequest,
  SceneResponse,
} from './types'

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'network_error', 'Could not reach the Overpass backend.')
  }
  return unwrap<T>(response)
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { signal })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'network_error', 'Could not reach the Overpass backend.')
  }
  return unwrap<T>(response)
}

async function unwrap<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T

  let code = 'http_error'
  let message = `Request failed with status ${response.status}.`
  let details: Record<string, unknown> = {}
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>
    if (body.error) {
      code = body.error.code ?? code
      message = body.error.message ?? message
      details = body.error.details ?? {}
    }
  } catch {
  }
  throw new ApiError(response.status, code, message, details)
}

export const api = {
  health: (signal?: AbortSignal) => get<HealthResponse>('/health', signal),
  scene: (request: SceneRequest, signal?: AbortSignal) =>
    post<SceneResponse>('/scene', request, signal),
  aircraft: (request: SceneRequest, signal?: AbortSignal) =>
    post<AircraftListResponse>('/aircraft', request, signal),
}
