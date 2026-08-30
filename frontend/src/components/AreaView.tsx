import { useEffect, useMemo, useRef, useState } from 'react'

import type { Aircraft, ObservationContext, SkyConditions } from '../api/types'
import { formatDegrees, formatKm, formatMetres, formatSpeed, plural } from '../lib/format'
import { brandColor } from '../data/airlineBrands'
import { clampTooltipPercent, compassPoint, projectAircraft } from '../lib/geo'
import type { Projected } from '../lib/geo'
import { SKY_GRADIENT, TYPE_MARK } from '../lib/palette'
import { RadarDial } from './RadarDial'

const HALF = 100
const VIEW = 128
const TRAIL_LENGTH = 20
const TRAIL_SAMPLE_MS = 1000
const LEAD_SECONDS = 60
const LABEL_DENSITY_LIMIT = 28

const AIRCRAFT_PATH =
  'M 0,-7 L 1.5,-2.5 L 8,1.5 L 8,3.2 L 1.5,1.5 L 1.5,5 L 3.5,6.6 L 3.5,7.5 L 0,6.4 ' +
  'L -3.5,7.5 L -3.5,6.6 L -1.5,5 L -1.5,1.5 L -8,3.2 L -8,1.5 L -1.5,-2.5 Z'

interface Props {
  aircraft: Aircraft[]
  observation: ObservationContext | null
  now: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  enabled: boolean
  dataOk: boolean
  offReason?: string
  sky: SkyConditions | null
  refreshSeconds: number | null
}

interface Placed {
  aircraft: Aircraft
  projected: Projected
  x: number
  y: number
}

export function AreaView({
  aircraft,
  observation,
  now,
  selectedId,
  onSelect,
  enabled,
  dataOk,
  offReason,
  sky,
  refreshSeconds,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const airlineCount = useMemo(
    () => new Set(aircraft.map((item) => item.airline?.icao).filter(Boolean)).size,
    [aircraft],
  )

  const placed = useMemo<Placed[]>(() => {
    if (!observation) return []
    return aircraft.map((item) => {
      const projected = projectAircraft(item, observation, now)
      return {
        aircraft: item,
        projected,
        x: projected.x * HALF,
        y: -projected.y * HALF,
      }
    })
  }, [aircraft, observation, now])

  const trails = useTrails(placed, now)

  const active =
    placed.find((item) => item.aircraft.id === hoveredId) ??
    placed.find((item) => item.aircraft.id === selectedId) ??
    null

  const radiusKm = observation?.radius_km ?? 0
  const [tintInner, tintOuter] = SKY_GRADIENT[sky?.condition ?? 'night']

  return (
    <div className={`dial${enabled ? '' : ' is-off'}`}>
      {/* strictly square: see the note in SkyDome about what belongs in here */}
      <div className="dial__scope">
        <RadarDial
          radius={HALF}
          view={VIEW}
          tint={[tintInner, tintOuter]}
          id="area"
          rings={[
            { fraction: 1 / 3, label: formatRing(radiusKm / 3) },
            { fraction: 2 / 3, label: formatRing((radiusKm * 2) / 3) },
          ]}
          rimLabel={radiusKm > 0 ? formatRing(radiusKm) : undefined}
          sweepSeconds={enabled && refreshSeconds !== null ? refreshSeconds : undefined}
          sweep="rotate"
          sweepColor={TYPE_MARK.aircraft}
          ariaLabel={`Aircraft radar, plan view: ${aircraft.length} within ${plural(radiusKm, 'kilometre')}`}
          onPointerLeave={() => setHoveredId(null)}
        >
          {placed.map((item) => (
            <Trail key={`trail-${item.aircraft.id}`} points={trails.get(item.aircraft.id) ?? []} />
          ))}
          {placed.map((item) => (
            <AircraftMark
              key={item.aircraft.id}
              item={item}
              radiusKm={radiusKm}
              selected={item.aircraft.id === selectedId}
              showLabel={placed.length <= LABEL_DENSITY_LIMIT || item.aircraft.id === hoveredId}
              onHover={setHoveredId}
              onSelect={onSelect}
            />
          ))}
        </RadarDial>

        {active && (
          <div
            className="dial__tooltip"
            style={{
              left: `${clampTooltipPercent(((active.x + VIEW) / (VIEW * 2)) * 100)}%`,
              top: `${((active.y + VIEW) / (VIEW * 2)) * 100}%`,
            }}
          >
            <span className="dial__tooltip-name">
              {active.aircraft.flight_number ??
                active.aircraft.callsign ??
                active.aircraft.icao24.toUpperCase()}
            </span>
            {active.aircraft.airline && (
              <span className="dial__tooltip-row dial__tooltip-row--airline">
                <span
                  className="airline__swatch"
                  style={{ background: brandColor(active.aircraft.airline.icao) }}
                />
                {active.aircraft.airline.name}
              </span>
            )}
            <span className="dial__tooltip-row">
              {formatKm(active.aircraft.distance_from_center_km)}{' '}
              {compassPoint(active.projected.azimuth)} ·{' '}
              {formatDegrees(active.projected.elevation)} up
            </span>
            <span className="dial__tooltip-row dial__tooltip-row--muted">
              {formatMetres(
                active.aircraft.barometric_altitude_m ?? active.aircraft.geometric_altitude_m,
              )}{' '}
              · {formatSpeed(active.aircraft.velocity_mps)}
              {active.projected.stale ? ' · stale fix' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="dial__footer">
        {enabled ? (
          <>
            <div className="legend legend--counted">
              <span className="legend__item">
                <svg width="13" height="13" viewBox="-10 -10 20 20" aria-hidden="true">
                  <path d={AIRCRAFT_PATH} transform="scale(1.1)" fill={TYPE_MARK.aircraft} />
                </svg>
                <strong>{dataOk ? aircraft.length : '—'}</strong> within {radiusKm} km
              </span>
              <span className="legend__item">
                <svg width="13" height="13" viewBox="-10 -10 20 20" aria-hidden="true">
                  <path
                    d={AIRCRAFT_PATH}
                    transform="scale(1.1)"
                    fill="none"
                    stroke={TYPE_MARK.aircraft}
                    strokeWidth={1.6}
                  />
                </svg>
                <strong>{dataOk ? airlineCount : '—'}</strong>{' '}
                {dataOk && airlineCount === 1 ? 'airline' : 'airlines'}
              </span>
            </div>
            {!dataOk ? (
              <p className="dial__note dial__note--fault">Couldn't reach the aircraft feed.</p>
            ) : aircraft.length === 0 ? (
              <p className="dial__note">Nothing within {radiusKm} km of here right now.</p>
            ) : (
              <p className="dial__note">
                Nose points along the true track; the dashed lead reaches where it will be
                in 60 seconds.
              </p>
            )}
          </>
        ) : (
          <p className="dial__note">{offReason ?? 'Aircraft tracking is switched off.'}</p>
        )}
      </div>
    </div>
  )
}

interface MarkProps {
  item: Placed
  radiusKm: number
  selected: boolean
  showLabel: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
}

function AircraftMark({
  item,
  radiusKm,
  selected,
  showLabel,
  onHover,
  onSelect,
}: MarkProps) {
  const { aircraft, projected, x, y } = item
  const heading = aircraft.heading_deg ?? 0
  const label = aircraft.flight_number ?? aircraft.callsign ?? aircraft.icao24.toUpperCase()

  const leadFraction =
    radiusKm > 0 && aircraft.velocity_mps
      ? ((aircraft.velocity_mps * LEAD_SECONDS) / 1000 / radiusKm) * HALF
      : 0

  const classes = [
    'aircraft',
    aircraft.on_ground ? 'aircraft--ground' : '',
    projected.stale ? 'aircraft--stale' : '',
    selected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <g
      className={classes}
      transform={`translate(${x} ${y})`}
      onPointerEnter={() => onHover(aircraft.id)}
      onPointerDown={() => onSelect(selected ? null : aircraft.id)}
      role="button"
      tabIndex={0}
      aria-label={`${label}, heading ${plural(Math.round(heading), 'degree')}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(selected ? null : aircraft.id)
        }
      }}
    >
      <circle r={11} className="aircraft__hit" />
      {selected && <circle r={13} className="aircraft__ring" />}

      {!aircraft.on_ground && leadFraction > 1 && (
        <line
          className="aircraft__vector"
          x1={0}
          y1={0}
          x2={Math.sin((heading * Math.PI) / 180) * leadFraction}
          y2={-Math.cos((heading * Math.PI) / 180) * leadFraction}
        />
      )}


      {aircraft.on_ground ? (
        <rect
          x={-3}
          y={-3}
          width={6}
          height={6}
          className="aircraft__ground-glyph"
        />
      ) : (
        <path
          className="aircraft__glyph"
          d={AIRCRAFT_PATH}
          transform={`rotate(${heading}) scale(0.62)`}
        />
      )}

      {(showLabel || selected) && (
        <text className="aircraft__label" x={7} y={-6}>
          {label}
        </text>
      )}
    </g>
  )
}

function formatRing(km: number): string {
  if (km >= 5) return `${Math.round(km)} km`
  if (km >= 1) return `${km.toFixed(1)} km`
  return `${Math.round(km * 1000)} m`
}

function Trail({ points }: { points: Array<{ x: number; y: number }> }) {
  if (points.length < 2) return null
  return (
    <polyline
      className="aircraft__trail"
      points={points.map((point) => `${point.x},${point.y}`).join(' ')}
    />
  )
}


type TrailMap = Map<string, Array<{ x: number; y: number }>>

const NO_TRAILS: TrailMap = new Map()

function useTrails(placed: Placed[], now: number): TrailMap {
  const [trails, setTrails] = useState<TrailMap>(NO_TRAILS)
  const lastSampleRef = useRef(0)

  useEffect(() => {
    if (now - lastSampleRef.current < TRAIL_SAMPLE_MS) return
    lastSampleRef.current = now

    setTrails((previous) => {
      const next: TrailMap = new Map()
      for (const item of placed) {
        const points = previous.get(item.aircraft.id) ?? []
        const grown = [...points, { x: item.x, y: item.y }]
        next.set(item.aircraft.id, grown.slice(-TRAIL_LENGTH))
      }
      // aircraft that left the area drop out: absent keys are simply not copied
      return next
    })
  }, [placed, now])

  return trails
}
