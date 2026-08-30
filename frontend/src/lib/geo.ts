import type { Aircraft, ObservationContext } from '../api/types'

const METRES_PER_DEGREE_LATITUDE = 111_320

export const STALE_AFTER_MS = 120_000
export const DROP_AFTER_MS = STALE_AFTER_MS * 2

export interface Projected {
  latitude: number
  longitude: number
  azimuth: number
  elevation: number
  //  -1 west edge .. 0 centre .. +1 east edge, and past that once dead reckoning carries an aircraft out of the area
  x: number
  //  -1 south edge .. 0 centre .. +1 north edge, likewise
  y: number
  //  null when the feed gives no position timestamp: the fix is of unknown age
  ageSeconds: number | null
  stale: boolean
}

//  signed east-positive longitude difference, wrapped into [-180, 180)
export function wrapLongitudeDelta(longitude: number, reference: number): number {
  let delta = (((longitude - reference + 180) % 360) + 360) % 360
  delta -= 180
  return delta
}

//  half-width of the area in degrees, derived from the observation context
export function halfSpans(observation: ObservationContext): { lat: number; lon: number } {
  const { bounding_box: box, center } = observation
  return {
    lat: Math.abs(box.max_latitude - center.latitude) || 1e-9,
    lon: Math.abs(wrapLongitudeDelta(box.max_longitude, center.longitude)) || 1e-9,
  }
}

//  map a geographic position onto the area's unit circle
export function toNormalized(
  latitude: number,
  longitude: number,
  observation: ObservationContext,
): { x: number; y: number } {
  const spans = halfSpans(observation)
  return {
    x: wrapLongitudeDelta(longitude, observation.center.longitude) / spans.lon,
    y: (latitude - observation.center.latitude) / spans.lat,
  }
}

export function holdInside(x: number, y: number, limit: number): { x: number; y: number } {
  const radius = Math.hypot(x, y)
  if (radius <= limit || radius === 0) return { x, y }
  return { x: (x / radius) * limit, y: (y / radius) * limit }
}

export function rayToRim(
  from: { x: number; y: number },
  along: { x: number; y: number },
  radius: number,
): number {
  const projection = from.x * along.x + from.y * along.y
  const gap = radius * radius - (from.x * from.x + from.y * from.y)
  return -projection + Math.sqrt(Math.max(0, projection * projection + gap))
}

function timestampAgeMs(stamp: string | null, atMs: number): number | null {
  if (!stamp) return null
  const ms = Date.parse(stamp)
  return Number.isFinite(ms) ? Math.max(0, atMs - ms) : null
}

//  how long ago the feed last decoded a position, which it may never say
export function fixAgeMs(aircraft: Aircraft, atMs: number): number | null {
  return timestampAgeMs(aircraft.position_time, atMs)
}

//  how long ago anything at all was heard from the transponder
export function contactAgeMs(aircraft: Aircraft, atMs: number): number | null {
  return timestampAgeMs(aircraft.last_contact, atMs)
}

//  a position of unknown age still comes from an aircraft that is out there
//  keep it while the transponder is being heard, and give up on it after that
export function isTracked(aircraft: Aircraft, atMs: number): boolean {
  const age = fixAgeMs(aircraft, atMs) ?? contactAgeMs(aircraft, atMs)
  return age !== null && age <= DROP_AFTER_MS
}

//  dead-reckon an aircraft forward from its last fix
export function projectAircraft(
  aircraft: Aircraft,
  observation: ObservationContext,
  atMs: number,
): Projected {
  const ageMs = fixAgeMs(aircraft, atMs)
  const ageSeconds = ageMs === null ? null : ageMs / 1000
  const stale = ageMs === null || ageMs > STALE_AFTER_MS

  const speed = aircraft.velocity_mps ?? 0
  const heading = aircraft.heading_deg ?? 0

  if (stale || aircraft.on_ground || speed <= 0) {
    return {
      latitude: aircraft.latitude,
      longitude: aircraft.longitude,
      x: aircraft.normalized_x,
      y: aircraft.normalized_y,
      azimuth: aircraft.azimuth_deg ?? 0,
      elevation: aircraft.elevation_deg ?? 0,
      ageSeconds,
      stale,
    }
  }

  const distance = speed * (ageSeconds ?? 0)
  const bearing = (heading * Math.PI) / 180
  const north = distance * Math.cos(bearing)
  const east = distance * Math.sin(bearing)

  const latitude = aircraft.latitude + north / METRES_PER_DEGREE_LATITUDE
  const cosLat = Math.cos((aircraft.latitude * Math.PI) / 180)
  const longitude =
    aircraft.longitude + east / (METRES_PER_DEGREE_LATITUDE * Math.max(cosLat, 1e-6))

  const { x, y } = toNormalized(latitude, longitude, observation)

  const { latitude: obsLat, longitude: obsLon } = observation.center
  const ground = groundDistanceM(obsLat, obsLon, latitude, longitude)
  const height = aircraft.geometric_altitude_m ?? aircraft.barometric_altitude_m ?? 0
  return {
    latitude,
    longitude,
    x,
    y,
    azimuth: bearingDeg(obsLat, obsLon, latitude, longitude),
    elevation: elevationAngleDeg(ground, height),
    ageSeconds,
    stale,
  }
}

export function isInArea(
  aircraft: Aircraft,
  observation: ObservationContext,
  atMs: number,
): boolean {
  const { x, y } = projectAircraft(aircraft, observation, atMs)
  return Math.hypot(x, y) <= 1
}

const EARTH_RADIUS_M = 6_371_008.8

//  where to point your eyes at something `groundDistanceM` away and `heightM` up
export function elevationAngleDeg(groundDistanceM: number, heightM: number): number {
  const theta = groundDistanceM / EARTH_RADIUS_M
  const target = EARTH_RADIUS_M + Math.max(0, heightM)
  const up = target * Math.cos(theta) - EARTH_RADIUS_M
  const horizontal = target * Math.sin(theta)
  if (horizontal <= 0) return up > 0 ? 90 : -90
  return (Math.atan2(up, horizontal) * 180) / Math.PI
}

//  initial true bearing from A to B, degrees clockwise from north
export function bearingDeg(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number {
  const rad = Math.PI / 180
  const lat1 = fromLat * rad
  const lat2 = toLat * rad
  const dLon = wrapLongitudeDelta(toLon, fromLon) * rad
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

//  great-circle ground distance in metres
export function groundDistanceM(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number {
  const rad = Math.PI / 180
  const lat1 = fromLat * rad
  const lat2 = toLat * rad
  const dLat = lat2 - lat1
  const dLon = wrapLongitudeDelta(toLon, fromLon) * rad
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

// place a sky object on the dome
export function skyToDome(
  azimuthDeg: number,
  elevationDeg: number,
  radius: number,
  floorDeg = 0,
): { x: number; y: number } {
  const floor = Math.max(0, Math.min(85, floorDeg))
  // anything at or below the floor is drawn on the rim rather than dropped
  const clamped = Math.max(floor, Math.min(90, elevationDeg))
  const r = radius * (1 - (clamped - floor) / (90 - floor))
  const azimuth = (azimuthDeg * Math.PI) / 180
  return { x: r * Math.sin(azimuth), y: -r * Math.cos(azimuth) }
}

//  keep a tooltip's anchor away from the panel edges so it stays fully readable
export function clampTooltipPercent(value: number): number {
  return Math.max(12, Math.min(88, value))
}

//  compass point for a bearing: N, NNE, NE, …
export function compassPoint(degrees: number): string {
  const points = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ]
  const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16
  return points[index]
}
