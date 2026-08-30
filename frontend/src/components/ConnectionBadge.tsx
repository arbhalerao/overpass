import type { ConnectionState } from '../api/live'
import type { TimeMode } from '../api/types'
import { STATUS_COLOR } from '../lib/palette'

export function ConnectionBadge({
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
      disabled={!faulted}
      title={hint}
      onClick={onReconnect}
      aria-label={`Connection: ${label}. ${hint}${faulted ? ' Click to reconnect.' : ''}`}
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

