import type { LayerName, ObjectType } from '../api/types'
import { TYPE_ACCENT } from '../lib/palette'

interface Props {
  layer: LayerName
  type: ObjectType
  label: string
  active: boolean
  disabled?: boolean
  disabledReason?: string
  onToggle: (layer: LayerName) => void
}

export function LayerToggle({
  layer,
  type,
  label,
  active,
  disabled = false,
  disabledReason,
  onToggle,
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      className={`switch${active ? ' is-on' : ''}`}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      style={active ? { ['--accent' as string]: TYPE_ACCENT[type] } : undefined}
      aria-label={`Show ${label.toLowerCase()}`}
      onClick={() => onToggle(layer)}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__state">{disabled ? 'N/A' : active ? 'ON' : 'OFF'}</span>
        <span className="switch__knob" />
      </span>
    </button>
  )
}
