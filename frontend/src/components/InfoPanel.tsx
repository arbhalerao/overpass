import type { LiveScene } from '../hooks/useLiveScene'
import type {
  Aircraft,
  LayerName,
  LayerSelection,
  ObjectType,
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
  titleCase,
} from '../lib/format'
import { brandColor } from '../data/airlineBrands'
import { LAYER_OF, TYPE_ORDER, byLayerOrder } from '../lib/layers'
import { compassPoint, projectAircraft } from '../lib/geo'
import { STATUS_COLOR, TYPE_LABEL } from '../lib/palette'
import { GlyphFor } from './Glyphs'

interface Props {
  scene: LiveScene
  include: LayerSelection
  unavailable?: Partial<Record<LayerName, string>>
  selectedId: string | null
  onSelect: (id: string | null) => void
  now: number
}

export function InfoPanel({ scene, include, unavailable, selectedId, onSelect, now }: Props) {
  const visibleSatellites = scene.satellites.filter((satellite) => satellite.is_visible).length
  const unanswered = new Set(
    scene.sources.filter((source) => source.status === 'error').map((source) => source.source),
  )
  const countByType: Record<ObjectType, { value: number; enabled: boolean; note?: string }> = {
    satellite: {
      value: scene.satellites.length,
      enabled: include.satellites,
      note: scene.satellites.length ? `${visibleSatellites} visible now` : undefined,
    },
    aircraft: { value: scene.aircraft.length, enabled: include.aircraft },
  }
  const counts = TYPE_ORDER.map((type) => ({ type, ...countByType[type] }))

  return (
    <aside className="info">
      <div className="counts">
        {counts.map((count) => (
          <div key={count.type} className={`tile${count.enabled ? '' : ' is-off'}`}>
            <div className="tile__head">
              <GlyphFor type={count.type} size={13} muted={!count.enabled} />
              <span className="tile__label">{TYPE_LABEL[count.type]}</span>
            </div>
            <span className="tile__value">
              {!count.enabled || unanswered.has(LAYER_OF[count.type])
                ? '—'
                : formatNumber(count.value)}
            </span>
            {count.enabled &&
              (unanswered.has(LAYER_OF[count.type]) ? (
                <span className="tile__note">no data</span>
              ) : (
                count.note && <span className="tile__note">{count.note}</span>
              ))}
          </div>
        ))}
      </div>

      <Sources
        sources={scene.sources}
        warnings={scene.warnings}
        partial={scene.partial}
        include={include}
        unavailable={unavailable}
      />

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
      <section className="card card--empty">
        <p>
          Select anything on either dial to see everything the backend knows
          about it.
        </p>
      </section>
    )
  }

  const aircraft = scene.aircraft.find((item) => item.id === selectedId)
  const satellite = scene.satellites.find((item) => item.id === selectedId)

  if (!aircraft && !satellite) {
    return (
      <section className="card card--empty">
        <p>That object is no longer in the scene.</p>
        <button type="button" className="button button--ghost" onClick={() => onSelect(null)}>
          Clear selection
        </button>
      </section>
    )
  }

  return (
    <section className="card">
      {aircraft && <AircraftDetail aircraft={aircraft} scene={scene} now={now} />}
      {satellite && <SatelliteDetail satellite={satellite} />}
      <button type="button" className="button button--ghost card__clear" onClick={() => onSelect(null)}>
        Clear selection
      </button>
    </section>
  )
}

function DetailHead({
  type,
  title,
  subtitle,
  accent,
}: {
  type: ObjectType
  title: string
  subtitle: string
  accent?: string
}) {
  return (
    <header className="card__head">
      {accent ? (
        <span className="card__accent" style={{ background: accent }} aria-hidden="true" />
      ) : (
        <GlyphFor type={type} size={18} />
      )}
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
        type="aircraft"
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
      <p className="card__note">
        {projected?.stale
          ? 'This fix is over two minutes old, so the icon sits at its last reported position rather than a projected one.'
          : 'The icon is dead-reckoned from the last fix using heading and ground speed. The backend does not extrapolate.'}
      </p>
    </>
  )
}

function SatelliteDetail({ satellite }: { satellite: Satellite }) {
  return (
    <>
      <DetailHead
        type="satellite"
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
      <p className="card__note">
        Propagated with SGP4 from cached CelesTrak elements. Accuracy degrades roughly a
        kilometre per day of element age. A satellite is only visible to the eye when it
        is still catching sunlight while the ground below is already dark.
      </p>
    </>
  )
}

// source health

const SOURCE_PRESENTATION: Record<
  SourceStatus['status'],
  { color: string; icon: string; label: string }
> = {
  ok: { color: STATUS_COLOR.good, icon: '●', label: 'OK' },
  degraded: { color: STATUS_COLOR.warning, icon: '▲', label: 'Degraded' },
  error: { color: STATUS_COLOR.critical, icon: '✕', label: 'Failed' },
  disabled: { color: '#5c6880', icon: '○', label: 'Off' },
}

function Sources({
  sources,
  warnings,
  partial,
  include,
  unavailable,
}: {
  sources: SourceStatus[]
  warnings: string[]
  partial: boolean
  include: LayerSelection
  unavailable?: Partial<Record<LayerName, string>>
}) {
  if (sources.length === 0) return null

  const isOn = (source: SourceStatus) => include[source.source as LayerName] ?? true
  const silenced = new Set(
    sources.filter((source) => !isOn(source) && source.message).map((source) => source.message),
  )
  const live = sources.filter(isOn)
  const stillPartial = partial && live.some((source) => source.status !== 'ok')
  const shown = warnings.filter((warning) => !silenced.has(warning))

  const blocked = Object.entries(unavailable ?? {}) as Array<[LayerName, string]>
  const withReasons = [...shown, ...blocked.map(([, reason]) => reason)]
  const inWarnings = new Set(withReasons)

  return (
    <section className="card card--sources">
      <header className="card__head card__head--plain">
        <h3>Data sources</h3>
        {stillPartial && <span className="badge badge--warn">Partial scene</span>}
      </header>

      <ul className="sources">
        {byLayerOrder(sources, (source) => source.source).map((source) => {
          const blockedReason = unavailable?.[source.source as LayerName]
          const on = isOn(source) && !blockedReason
          const presentation = SOURCE_PRESENTATION[on ? source.status : 'disabled']
          return (
            <li key={source.source} className={`source${on ? '' : ' is-off'}`}>
              <span className="source__icon" style={{ color: presentation.color }} aria-hidden="true">
                {presentation.icon}
              </span>
              <span className="source__name">{titleCase(source.source)}</span>
              <span className="source__state" style={{ color: presentation.color }}>
                {blockedReason ? 'Unavailable' : presentation.label}
              </span>
              <span className="source__count">
                {on && source.status !== 'disabled' ? formatNumber(source.object_count) : ''}
              </span>
              {on && source.message && !inWarnings.has(source.message) && (
                <p className="source__message">{source.message}</p>
              )}
            </li>
          )
        })}
      </ul>

      {withReasons.length > 0 && (
        <ul className="warnings">
          {withReasons.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
