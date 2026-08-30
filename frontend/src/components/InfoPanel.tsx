import type { LiveScene } from '../hooks/useLiveScene'
import type {
  Aircraft,
  LayerName,
  LayerSelection,
  Satellite,
  SourceStatus,
} from '../api/types'
import {
  formatAge,
  formatClock,
  formatCoordinate,
  formatDegrees,
  formatKm,
  formatMetres,
  formatNumber,
  formatSpeed,
  formatVerticalRate,
} from '../lib/format'
import { brandColor } from '../data/airlineBrands'
import { LAYER_OF, TYPE_ORDER } from '../lib/layers'
import { compassPoint, projectAircraft } from '../lib/geo'
import { STATUS_COLOR, TYPE_LABEL } from '../lib/palette'
import { LayerToggle } from './LayerToggle'

interface Props {
  scene: LiveScene
  include: LayerSelection
  unavailable?: Partial<Record<LayerName, string>>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onToggle: (layer: LayerName) => void
  now: number
}

export function InfoPanel({
  scene,
  include,
  unavailable,
  selectedId,
  onSelect,
  onToggle,
  now,
}: Props) {
  const sourceOf = new Map(scene.sources.map((source) => [source.source, source]))

  const layers = TYPE_ORDER.map((type) => {
    const layer = LAYER_OF[type]
    const source = sourceOf.get(layer)
    const blocked = unavailable?.[layer]
    const on = include[layer] && !blocked
    return {
      type,
      layer,
      on,
      blocked,
      count: type === 'satellite' ? scene.satellites.length : scene.aircraft.length,
      status: SOURCE_PRESENTATION[on && source ? source.status : 'disabled'],
      message: on ? source?.message : undefined,
      unanswered: source?.status === 'error',
    }
  })

  const seen = new Set<string>()
  const notes = layers.flatMap((entry) =>
    [entry.blocked, entry.message].flatMap((text) => {
      if (!text || seen.has(text)) return []
      seen.add(text)
      return [
        {
          text,
          label: TYPE_LABEL[entry.type],
          color: entry.status.color,
          fatal: entry.unanswered,
        },
      ]
    }),
  )
  const errors = notes.filter((note) => note.fatal).length
  const summary = [
    errors && `${errors} ${errors === 1 ? 'error' : 'errors'}`,
    notes.length - errors &&
      `${notes.length - errors} ${notes.length - errors === 1 ? 'warning' : 'warnings'}`,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <aside className="info">
      <div className="layers">
        {layers.map((entry) => (
          <div key={entry.layer} className={`layer${entry.on ? '' : ' is-off'}`}>
            <span className="layer__label">
              <span
                className="layer__health"
                style={{ color: entry.status.color }}
                data-tip={entry.blocked ? 'Unavailable' : entry.status.label}
                role="img"
                aria-label={`Feed ${entry.blocked ? 'unavailable' : entry.status.label.toLowerCase()}`}
              >
                <em className={`layer__dot${entry.on && !entry.unanswered ? ' is-live' : ''}`} />
              </span>
              {TYPE_LABEL[entry.type]}
            </span>
            <span className="layer__value">
              {!entry.on || entry.unanswered ? '—' : formatNumber(entry.count)}
            </span>
            <div className="layer__foot">
              <LayerToggle
                layer={entry.layer}
                type={entry.type}
                label={TYPE_LABEL[entry.type]}
                active={entry.on}
                disabled={Boolean(entry.blocked)}
                disabledReason={entry.blocked}
                onToggle={onToggle}
              />
            </div>
          </div>
        ))}
      </div>

      {notes.length > 0 && (
        <details className="notes">
          <summary>{summary}</summary>
          <ul>
            {notes.map((note) => (
              <li key={note.text}>
                <em style={{ background: note.color }} aria-hidden="true" />
                <div>
                  <strong>{note.label}</strong>
                  {note.text}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Detail scene={scene} selectedId={selectedId} onSelect={onSelect} now={now} />
    </aside>
  )
}

// selected object

function Detail({
  scene,
  selectedId,
  onSelect,
  now,
}: {
  scene: LiveScene
  selectedId: string | null
  onSelect: (id: string | null) => void
  now: number
}) {
  if (!selectedId) {
    return (
      <section className="card card--hint" aria-label="Nothing selected yet">
        <svg viewBox="0 0 44 40" className="hint__mark" aria-hidden="true">
          <circle cx="18" cy="18" r="11" />
          <circle cx="18" cy="18" r="3.5" />
          <path d="M18 2.5v5M18 28.5v5M2.5 18h5M28.5 18h5" />
          <path className="hint__cursor" d="M24 21.5 39 27l-6.2 1.9L30.4 35z" />
        </svg>
      </section>
    )
  }

  const aircraft = scene.aircraft.find((item) => item.id === selectedId)
  const satellite = scene.satellites.find((item) => item.id === selectedId)

  if (!aircraft && !satellite) {
    return (
      <section className="card card--empty">
        <p>That object is no longer in the scene.</p>
        <button type="button" className="button button--ghost card__clear" onClick={() => onSelect(null)}>
          Close
        </button>
      </section>
    )
  }

  return (
    <section className="card">
      {aircraft && <AircraftDetail aircraft={aircraft} scene={scene} now={now} />}
      {satellite && <SatelliteDetail satellite={satellite} />}
      <button type="button" className="button button--ghost card__clear" onClick={() => onSelect(null)}>
        Close
      </button>
    </section>
  )
}

function DetailHead({
  title,
  subtitle,
  accent,
}: {
  title: string
  subtitle: string
  accent?: string
}) {
  return (
    <header className="card__head">
      {accent && <span className="card__accent" style={{ background: accent }} aria-hidden="true" />}
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </header>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span className="row__label">{label}</span>
      <span className="row__value">{value}</span>
    </div>
  )
}

function AircraftDetail({
  aircraft,
  scene,
  now,
}: {
  aircraft: Aircraft
  scene: LiveScene
  now: number
}) {
  const projected = scene.observation
    ? projectAircraft(aircraft, scene.observation, now)
    : null

  return (
    <>
      <DetailHead
        title={aircraft.flight_number ?? aircraft.callsign ?? aircraft.icao24.toUpperCase()}
        subtitle={
          aircraft.airline
            ? `${aircraft.airline.name} · ${aircraft.airline.country}`
            : `ICAO24 ${aircraft.icao24}${aircraft.origin_country ? ` · ${aircraft.origin_country}` : ''}`
        }
        accent={aircraft.airline ? brandColor(aircraft.airline.icao) : undefined}
      />
      <div className="rows">
        {aircraft.airline && (
          <Row
            label="Airline"
            value={`${aircraft.airline.icao}${aircraft.airline.iata ? ` / ${aircraft.airline.iata}` : ''}`}
          />
        )}
        {aircraft.airline?.radio_callsign && (
          <Row label="Radio callsign" value={`“${aircraft.airline.radio_callsign}”`} />
        )}
        <Row label="Callsign" value={aircraft.callsign ?? '—'} />
        <Row label="Transponder" value={aircraft.icao24.toUpperCase()} />
        <Row
          label="Position"
          value={
            projected
              ? formatCoordinate(projected.latitude, projected.longitude)
              : formatCoordinate(aircraft.latitude, aircraft.longitude)
          }
        />
        <Row
          label="Altitude"
          value={
            aircraft.on_ground
              ? 'on the ground'
              : formatMetres(aircraft.barometric_altitude_m ?? aircraft.geometric_altitude_m)
          }
        />
        <Row label="Ground speed" value={formatSpeed(aircraft.velocity_mps)} />
        <Row
          label="Heading"
          value={
            aircraft.heading_deg !== null
              ? `${formatDegrees(aircraft.heading_deg, 0)} ${compassPoint(aircraft.heading_deg)}`
              : '—'
          }
        />
        <Row label="Vertical rate" value={formatVerticalRate(aircraft.vertical_rate_mps)} />
        <Row
          label="Look toward"
          value={
            aircraft.azimuth_deg !== null
              ? `${compassPoint(aircraft.azimuth_deg)} ${formatDegrees(aircraft.azimuth_deg, 0)}`
              : '—'
          }
        />
        <Row
          label="Look up"
          value={aircraft.elevation_deg !== null ? formatDegrees(aircraft.elevation_deg) : '—'}
        />
        <Row label="Ground distance" value={formatKm(aircraft.distance_from_center_km)} />
        <Row label="Slant range" value={formatKm(aircraft.slant_range_km)} />
        {aircraft.squawk && <Row label="Squawk" value={aircraft.squawk} />}
        {aircraft.position_source && (
          <Row label="Position source" value={aircraft.position_source.toUpperCase()} />
        )}
        <Row
          label="Last fix"
          value={
            projected
              ? `${formatClock(aircraft.position_time)} · ${formatAge(projected.ageSeconds)}`
              : formatClock(aircraft.position_time)
          }
        />
      </div>
    </>
  )
}

function SatelliteDetail({ satellite }: { satellite: Satellite }) {
  return (
    <>
      <DetailHead
        title={satellite.name}
        subtitle={`NORAD ${satellite.norad_id}${satellite.international_designator ? ` · ${satellite.international_designator}` : ''
          }`}
      />
      <div className="rows">
        <Row
          label="Look toward"
          value={`${compassPoint(satellite.azimuth_deg)} ${formatDegrees(satellite.azimuth_deg, 0)}`}
        />
        <Row label="Look up" value={formatDegrees(satellite.elevation_deg)} />
        <Row label="Slant range" value={formatKm(satellite.distance_km, 0)} />
        <Row
          label="Visible now"
          value={
            satellite.is_visible === true
              ? 'yes, sunlit and dark here'
              : satellite.is_visible === false
                ? satellite.is_sunlit === false
                  ? 'no, in Earth’s shadow'
                  : 'no, too bright here'
                : 'unknown'
          }
        />
        {satellite.height_km !== null && (
          <Row label="Height" value={formatKm(satellite.height_km, 0)} />
        )}
        {satellite.subpoint_latitude !== null && satellite.subpoint_longitude !== null && (
          <Row
            label="Ground track"
            value={formatCoordinate(satellite.subpoint_latitude, satellite.subpoint_longitude, 2)}
          />
        )}
        <Row label="Speed" value={formatSpeed(satellite.velocity_mps)} />
        {satellite.range_rate_mps !== null && (
          <Row
            label="Closing"
            value={`${satellite.range_rate_mps < 0 ? 'approaching' : 'receding'} at ${formatNumber(
              Math.abs(satellite.range_rate_mps),
            )} m/s`}
          />
        )}
        {satellite.element_age_days !== null && (
          <Row label="Element age" value={`${formatNumber(satellite.element_age_days, 2)} days`} />
        )}
        {satellite.group && <Row label="CelesTrak group" value={satellite.group} />}
      </div>
    </>
  )
}

// source health

const SOURCE_PRESENTATION: Record<
  SourceStatus['status'],
  { color: string; label: string }
> = {
  ok: { color: STATUS_COLOR.good, label: 'OK' },
  degraded: { color: STATUS_COLOR.warning, label: 'Degraded' },
  error: { color: STATUS_COLOR.critical, label: 'Failed' },
  disabled: { color: '#5c6880', label: 'Off' },
}
