import { useMemo, useState } from 'react'

import type { Aircraft, ObservationContext, SkyConditions } from '../api/types'
import { formatDegrees, formatKm, formatMetres, formatSpeed, plural } from '../lib/format'
import { brandColor } from '../data/airlineBrands'
import { clampTooltipPercent, compassPoint, holdInside, projectAircraft, rayToRim } from '../lib/geo'
import type { Projected } from '../lib/geo'
import { AIRCRAFT_DRAWN_AT, GLYPH, glyphRadius, glyphStroke, glyphTransform } from '../lib/glyphs'
import { GlyphSwatch } from './Glyphs'
import { SKY_GRADIENT, TYPE_MARK } from '../lib/palette'
import { RadarDial } from './RadarDial'

const HALF = 100
const VIEW = 115
const LEAD_SECONDS = 60
const LABEL_DENSITY_LIMIT = 28

const MARK_SCALE = 0.62
const MARK_LIMIT = HALF - glyphRadius('aircraft', MARK_SCALE)

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

  const placed = useMemo<Placed[]>(() => {
    if (!observation) return []
    return aircraft.map((item) => {
      const projected = projectAircraft(item, observation, now)
      const point = holdInside(projected.x * HALF, -projected.y * HALF, MARK_LIMIT)
      return { aircraft: item, projected, x: point.x, y: point.y }
    })
  }, [aircraft, observation, now])

  const airlineCount = useMemo(
    () => new Set(placed.map((item) => item.aircraft.airline?.icao).filter(Boolean)).size,
    [placed],
  )

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
          ariaLabel={`Aircraft radar, plan view: ${placed.length} within ${plural(radiusKm, 'kilometre')}`}
          onPointerLeave={() => setHoveredId(null)}
        >
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
                <GlyphSwatch type="aircraft" />
                <strong>{dataOk ? placed.length : '—'}</strong> within {radiusKm} km
              </span>
              <span className="legend__item">
                <GlyphSwatch type="aircraft" faded />
                <strong>{dataOk ? airlineCount : '—'}</strong>{' '}
                {dataOk && airlineCount === 1 ? 'airline' : 'airlines'}
              </span>
            </div>
            {!dataOk ? (
              <p className="dial__note dial__note--fault">Couldn't reach the aircraft feed.</p>
            ) : placed.length === 0 ? (
              <p className="dial__note">Nothing flying within {radiusKm} km of here right now.</p>
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

  const along = {
    x: Math.sin((heading * Math.PI) / 180),
    y: -Math.cos((heading * Math.PI) / 180),
  }
  const lead =
    radiusKm > 0 && aircraft.velocity_mps
      ? ((aircraft.velocity_mps * LEAD_SECONDS) / 1000 / radiusKm) * HALF
      : 0
  //  the lead reaches past the rim for anything fast near the edge: stop it there
  const leadFraction = Math.min(lead, rayToRim({ x, y }, along, HALF))

  const classes = [
    'aircraft',
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

      {leadFraction > 1 && (
        <line
          className="aircraft__vector"
          x1={0}
          y1={0}
          x2={along.x * leadFraction}
          y2={along.y * leadFraction}
        />
      )}


      <path
        className="aircraft__glyph"
        d={GLYPH.aircraft.d}
        transform={glyphTransform('aircraft', MARK_SCALE, heading - AIRCRAFT_DRAWN_AT)}
        strokeWidth={glyphStroke('aircraft', MARK_SCALE, GLYPH.aircraft.weight)}
      />

      {(showLabel || selected) && (
        <text className="aircraft__label" x={x > 0 ? -7 : 7} y={-6} textAnchor={x > 0 ? 'end' : 'start'}>
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
