const DASH = '—'

// english pairs only "1" with a singular, so 0, many, and the dash printed for a failed source all take the plural
export function plural(count: number | string, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatDegrees(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return `${value.toFixed(digits)}°`
}

export function formatKm(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)} million km`
  return `${formatNumber(value, digits)} km`
}

export function formatMetres(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return `${formatNumber(value)} m`
}

export function formatSpeed(mps: number | null | undefined): string {
  if (mps === null || mps === undefined || !Number.isFinite(mps)) return DASH
  return `${formatNumber(mps, 1)} m/s · ${formatNumber(mps * 1.94384)} kt`
}

export function formatVerticalRate(mps: number | null | undefined): string {
  if (mps === null || mps === undefined || !Number.isFinite(mps)) return DASH
  if (Math.abs(mps) < 0.5) return 'level'
  const arrow = mps > 0 ? '▲' : '▼'
  return `${arrow} ${formatNumber(Math.abs(mps), 1)} m/s`
}

export function formatCoordinate(latitude: number, longitude: number, digits = 4): string {
  const ns = latitude >= 0 ? 'N' : 'S'
  const ew = longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(latitude).toFixed(digits)}° ${ns}, ${Math.abs(longitude).toFixed(digits)}° ${ew}`
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return DASH
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return DASH
  return date.toLocaleTimeString(undefined, { hour12: false })
}

export function formatAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return DASH
  if (seconds < 1) return 'just now'
  if (seconds < 60) return `${Math.round(seconds)}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
