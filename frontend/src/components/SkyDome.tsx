import { useMemo, useState } from 'react'

import type { Satellite, SkyConditions } from '../api/types'
import { formatDegrees, formatKm, plural } from '../lib/format'
import { clampTooltipPercent, compassPoint, skyToDome } from '../lib/geo'
import { SKY_CONDITION_NOTE, SKY_GRADIENT, TYPE_MARK } from '../lib/palette'
import { RadarDial } from './RadarDial'

const R = 100
const VIEW = 115

const LABEL_DENSITY_LIMIT = 10

function elevationRings(floorDeg: number): Array<{ fraction: number; label: string }> {
  const span = 90 - floorDeg
  return [1 / 3, 2 / 3].map((share) => {
    const degrees = Math.round((floorDeg + span * share) / 5) * 5
    return {
      fraction: 1 - (degrees - floorDeg) / span,
      label: `${degrees}°`,
    }
  })
}

interface Props {
  satellites: Satellite[]
  sky: SkyConditions | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  enabled: boolean
  offReason?: string
  dataOk: boolean
  minElevationDeg: number
  refreshSeconds: number | null
}

export function SkyDome({
  satellites,
  sky,
  selectedId,
  onSelect,
  enabled,
  offReason,
  dataOk,
  minElevationDeg,
  refreshSeconds,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const condition = sky?.condition ?? 'night'
  const [skyInner, skyOuter] = SKY_GRADIENT[condition]
  const visibleCount = useMemo(
    () => satellites.filter((satellite) => satellite.is_visible).length,
    [satellites],
  )

  const hollowMeaning = sky?.is_dark
    ? 'up there, but in Earth’s shadow'
    : 'up there, but the sky is too bright'

  const active =
    satellites.find((satellite) => satellite.id === hoveredId) ??
    satellites.find((satellite) => satellite.id === selectedId) ??
    null
  const activePoint = active ? skyToDome(active.azimuth_deg, active.elevation_deg, R, minElevationDeg) : null

  return (
    <div className={`dial${enabled ? '' : ' is-off'}`}>
      <div className="dial__scope">
        <RadarDial
          radius={R}
          view={VIEW}
          tint={[skyInner, skyOuter]}
          id="dome"
          rings={elevationRings(minElevationDeg)}
          rimLabel={minElevationDeg === 0 ? '0°' : `${minElevationDeg}°`}
          sweepSeconds={enabled && refreshSeconds !== null ? refreshSeconds : undefined}
          sweep="pulse"
          sweepColor={TYPE_MARK.satellite}
          ariaLabel={`Satellite radar: ${satellites.length} above the horizon, ${visibleCount} visible`}
          onPointerLeave={() => setHoveredId(null)}
        >
          {satellites.map((satellite) => (
            <SatelliteMark
              key={satellite.id}
              satellite={satellite}
              selected={satellite.id === selectedId}
              showLabel={satellites.length <= LABEL_DENSITY_LIMIT}
              floorDeg={minElevationDeg}
              onHover={setHoveredId}
              onSelect={onSelect}
            />
          ))}
        </RadarDial>

        {active && activePoint && (
          <div
            className="dial__tooltip"
            style={{
              left: `${clampTooltipPercent(((activePoint.x + VIEW) / (VIEW * 2)) * 100)}%`,
              top: `${((activePoint.y + VIEW) / (VIEW * 2)) * 100}%`,
            }}
          >
            <span className="dial__tooltip-name">{shortName(active.name)}</span>
            <span className="dial__tooltip-row">
              {compassPoint(active.azimuth_deg)} {formatDegrees(active.azimuth_deg, 0)} ·{' '}
              {formatDegrees(active.elevation_deg)} up
            </span>
            <span className="dial__tooltip-row dial__tooltip-row--muted">
              {formatKm(active.distance_km, 0)} · {describeVisibility(active)}
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
                  <path d="M 0,-7 L 7,0 L 0,7 L -7,0 Z" fill={TYPE_MARK.satellite} />
                </svg>
                <strong>{dataOk ? visibleCount : '—'}</strong> you could see now
              </span>
              <span className="legend__item">
                <svg width="13" height="13" viewBox="-10 -10 20 20" aria-hidden="true">
                  <path
                    d="M 0,-7 L 7,0 L 0,7 L -7,0 Z"
                    fill="none"
                    stroke={TYPE_MARK.satellite}
                    strokeWidth={1.8}
                  />
                </svg>
                <strong>{dataOk ? satellites.length - visibleCount : '—'}</strong> {hollowMeaning}
              </span>
            </div>
            {!dataOk ? (
              <p className="dial__note dial__note--fault">Couldn't reach the orbit data.</p>
            ) : satellites.length === 0 ? (
              <p className="dial__note">
                Nothing above {minElevationDeg}° from here right now.
              </p>
            ) : (
              sky && <p className="dial__note">{SKY_CONDITION_NOTE[condition]}</p>
            )}
          </>
        ) : (
          <p className="dial__note">{offReason ?? 'Satellite tracking is switched off.'}</p>
        )}
      </div>
    </div>
  )
}

interface MarkProps {
  satellite: Satellite
  selected: boolean
  showLabel: boolean
  floorDeg: number
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
}

function SatelliteMark({
  satellite,
  selected,
  showLabel,
  floorDeg,
  onHover,
  onSelect,
}: MarkProps) {
  const { x, y } = skyToDome(satellite.azimuth_deg, satellite.elevation_deg, R, floorDeg)
  const visible = satellite.is_visible === true

  return (
    <g
      className={`mark mark--satellite${visible ? ' is-visible' : ''}${selected ? ' is-selected' : ''}`}
      transform={`translate(${x} ${y})`}
      onPointerEnter={() => onHover(satellite.id)}
      onPointerDown={() => onSelect(selected ? null : satellite.id)}
      role="button"
      tabIndex={0}
      aria-label={`${satellite.name}, azimuth ${plural(
        Math.round(satellite.azimuth_deg),
        'degree',
      )}, altitude ${plural(Math.round(satellite.elevation_deg), 'degree')}, ${visible ? 'visible' : 'not visible'
        }`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(selected ? null : satellite.id)
        }
      }}
    >
      <circle r={8} className="mark__hit" />
      {selected && <circle r={10} className="mark__ring" />}
      <path
        d="M 0,-4.6 L 4.6,0 L 0,4.6 L -4.6,0 Z"
        fill={visible ? TYPE_MARK.satellite : 'none'}
        stroke={TYPE_MARK.satellite}
        strokeWidth={visible ? 0.8 : 1.1}
        opacity={visible ? 1 : 0.65}
      />
      {(visible || selected || showLabel) && (
        <text className="mark__label" x={x > 0 ? -8 : 8} y={3.5} textAnchor={x > 0 ? 'end' : 'start'}>
          {shortName(satellite.name)}
        </text>
      )}
    </g>
  )
}

function describeVisibility(satellite: Satellite): string {
  if (satellite.is_visible === true) return 'visible now'
  if (satellite.is_sunlit === false) return 'in Earth’s shadow'
  if (satellite.is_sunlit === true) return 'sunlit, but too bright here'
  return 'visibility unknown'
}

function shortName(name: string): string {
  const trimmed = name.replace(/\s*\(.*\)\s*$/, '')
  return trimmed.length > 20 ? `${trimmed.slice(0, 19)}…` : trimmed
}
