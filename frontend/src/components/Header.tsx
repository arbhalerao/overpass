import type { ConnectionState } from '../api/live'
import type { LocationSource } from '../hooks/useInitialLocation'
import type { ObservationContext, Observer, TimeMode } from '../api/types'
import { formatCoordinate } from '../lib/format'
import { STATUS_COLOR } from '../lib/palette'
import { Clocks } from './Clocks'

interface Props {
  center: Observer
  radiusKm: number
  minSatelliteElevationDeg: number
  locationSource: LocationSource
  timeMode: TimeMode
  instant: string | null
  observation: ObservationContext | null
  status: ConnectionState
  statusDetail: string | null
  streaming: boolean
  onOpenLocation: () => void
  onTimeModeChange: (mode: TimeMode, isoTime: string | null) => void
  onReconnect: () => void
}

export function Header({
  center,
  radiusKm,
  minSatelliteElevationDeg,
  locationSource,
  timeMode,
  instant,
  observation,
  status,
  statusDetail,
  streaming,
  onOpenLocation,
  onTimeModeChange,
  onReconnect,
}: Props) {
  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__mark" aria-hidden="true" />
        <span className="header__word">
          OVER<em>PASS</em>
        </span>
      </div>

      <ConnectionBadge
        status={status}
        detail={statusDetail}
        streaming={streaming}
        timeMode={timeMode}
        onReconnect={onReconnect}
      />

      <Clocks
        observation={observation}
        instant={instant}
        timeMode={timeMode}
        onChange={onTimeModeChange}
      />

      <button type="button" className="locus" onClick={onOpenLocation}>
        <span className="locus__coords">
          {formatCoordinate(center.latitude, center.longitude)}
          {locationSource === 'locating' && <em className="locus__state">locating…</em>}
          {locationSource === 'fallback' && <em className="locus__state">set a location</em>}
        </span>
        <span className="locus__size">
          {/* each number says which dial it governs; one used to imply both */}
          <em>✈</em> {radiusKm} km
          <span className="locus__sep" aria-hidden="true">·</span>
          <em>◆</em> above {minSatelliteElevationDeg}°
        </span>
      </button>
    </header>
  )
}

function ConnectionBadge({
  status,
  detail,
  streaming,
  timeMode,
  onReconnect,
}: {
  status: ConnectionState
  detail: string | null
  streaming: boolean
  timeMode: TimeMode
  onReconnect: () => void
}) {
  const presentation: Record<ConnectionState, { color: string; label: string; hint: string }> = {
    idle: { color: '#5c6880', label: 'Idle', hint: 'Not subscribed.' },
    connecting: { color: STATUS_COLOR.warning, label: 'Connecting', hint: 'Opening the live socket.' },
    live: { color: STATUS_COLOR.good, label: 'Live', hint: 'Streaming scene updates.' },
    reconnecting: {
      color: STATUS_COLOR.warning,
      label: 'Reconnecting',
      hint: detail ?? 'The socket dropped; retrying.',
    },
    polling: {
      color: STATUS_COLOR.serious,
      label: 'Polling',
      hint: 'The socket is unavailable; falling back to periodic requests.',
    },
  }

  const faulted = status === 'connecting' || status === 'reconnecting' || status === 'polling'
  const { color, label, hint } = faulted
    ? presentation[status]
    : timeMode === 'fixed'
      ? {
          color: STATUS_COLOR.warning,
          label: 'Set time',
          hint: 'Computed for a chosen instant, not for now.',
        }
      : !streaming
        ? {
            color: '#5c6880',
            label: 'Standby',
            hint: 'Connected. Nothing is being tracked right now.',
          }
        : presentation[status]

  return (
    <button
      type="button"
      className="conn"
      title={hint}
      onClick={onReconnect}
      aria-label={`Connection: ${label}. ${hint} Click to reconnect.`}
    >
      <span
        className={`conn__dot${
          status === 'live' && streaming && timeMode === 'live' ? ' is-pulsing' : ''
        }`}
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className="conn__label">{label}</span>
    </button>
  )
}

