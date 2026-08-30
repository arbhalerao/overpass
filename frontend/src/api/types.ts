export type ObjectType = 'aircraft' | 'satellite'

export type SourceState = 'ok' | 'disabled' | 'degraded' | 'error'

export type LayerName = 'aircraft' | 'satellites'

export interface Observer {
  latitude: number
  longitude: number
}

export interface BoundingBox {
  min_latitude: number
  max_latitude: number
  min_longitude: number
  max_longitude: number
  crosses_antimeridian: boolean
  spans_all_longitudes: boolean
}

export interface ObservationContext {
  center: Observer
  radius_km: number
  bounding_box: BoundingBox
  time: string
  timezone: string | null
  utc_offset_minutes: number | null
}

export interface LayerSelection {
  aircraft: boolean
  satellites: boolean
}

export interface SceneRequest {
  center: Observer
  radius_km: number
  min_satellite_elevation_deg: number
  include: LayerSelection
  observation_time?: string | null
}

export interface AirlineInfo {
  icao: string
  iata: string | null
  name: string
  country: string
  radio_callsign: string | null
}

export interface Aircraft {
  id: string
  icao24: string
  name: string
  object_type: ObjectType
  subtype: string | null
  callsign: string | null
  flight_number: string | null
  airline: AirlineInfo | null
  origin_country: string | null
  latitude: number
  longitude: number
  //  -1 at the west edge, 0 at the centre, +1 at the east edge
  normalized_x: number
  //  -1 at the south edge, 0 at the centre, +1 at the NORTH edge
  normalized_y: number
  barometric_altitude_m: number | null
  geometric_altitude_m: number | null
  velocity_mps: number | null
  heading_deg: number | null
  vertical_rate_mps: number | null
  on_ground: boolean
  squawk: string | null
  position_source: string | null
  azimuth_deg: number | null
  elevation_deg: number | null
  distance_from_center_km: number | null
  slant_range_km: number | null
  position_time: string | null
  last_contact: string | null
}

export interface Satellite {
  id: string
  norad_id: string
  name: string
  object_type: ObjectType
  subtype: string | null
  international_designator: string | null
  azimuth_deg: number
  elevation_deg: number
  distance_km: number
  subpoint_latitude: number | null
  subpoint_longitude: number | null
  height_km: number | null
  velocity_mps: number | null
  range_rate_mps: number | null
  is_sunlit: boolean | null
  is_visible: boolean | null
  element_age_days: number | null
  group: string | null
  above_horizon: boolean
  timestamp: string
}

export interface SourceStatus {
  source: string
  status: SourceState
  message: string | null
  error_code: string | null
  object_count: number
  details: Record<string, unknown>
}

export interface SkyConditions {
  sun_altitude_deg: number
  condition: 'day' | 'civil_twilight' | 'nautical_twilight' | 'astronomical_twilight' | 'night'
  is_dark: boolean
}

export interface SceneResponse {
  observation: ObservationContext
  aircraft: Aircraft[]
  satellites: Satellite[]
  sky: SkyConditions | null
  sources: SourceStatus[]
  warnings: string[]
  partial: boolean
  generated_at: string
}

export interface AircraftListResponse {
  observation: ObservationContext
  aircraft: Aircraft[]
  count: number
  source_time: string | null
  generated_at: string
}

export interface HealthResponse {
  status: string
  app_name: string
  environment: string
  version: string
  time: string
  uptime_seconds: number
  services: Record<string, string>
  details: Record<string, unknown>
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

// WebSocket frames

export type TimeMode = 'live' | 'fixed'

export interface SubscribeFrame extends SceneRequest {
  action: 'subscribe'
  time_mode: TimeMode
}

export interface ReadyFrame {
  type: 'ready'
  message: string
  server_time: string
}

export interface SubscribedFrame {
  type: 'subscribed'
  connection_id: string
  observation: ObservationContext
  time_mode: TimeMode
  intervals_seconds: Partial<Record<LayerName, number>>
}

// a refresh of one or more layers
// only the layers in `layers` are present
export interface SceneUpdateFrame {
  type: 'scene_update'
  connection_id: string
  layers: LayerName[]
  observation: ObservationContext
  aircraft?: Aircraft[]
  satellites?: Satellite[]
  sky?: SkyConditions | null
  sources: SourceStatus[]
  warnings: string[]
  partial: boolean
  generated_at: string
}

export interface UnsubscribedFrame {
  type: 'unsubscribed'
}

export interface PongFrame {
  type: 'pong'
  server_time: string
}

export interface ErrorFrame {
  type: 'error'
  error: { code: string; message: string; details?: Record<string, unknown> }
}

export type ServerFrame =
  | ReadyFrame
  | SubscribedFrame
  | SceneUpdateFrame
  | UnsubscribedFrame
  | PongFrame
  | ErrorFrame
