import type { ObjectType } from '../api/types'
import { FADED_OPACITY, glyphPaint } from '../lib/glyphs'

const SWATCH_SIZE = 13
const ARROW_SIZE = 9

const CARET_D = 'M -8,4 L 0,-5 L 8,4 L 5.2,6.6 L 0,-0.4 L -5.2,6.6 Z'

interface Props {
  type: ObjectType
  size?: number
  muted?: boolean
}

export function GlyphFor({ type, size = 14, muted = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-10 -10 20 20"
      aria-hidden="true"
      style={{ display: 'block', flex: `0 0 ${size}px` }}
    >
      <path {...glyphPaint(type, 1, muted ? 'currentColor' : undefined)} />
    </svg>
  )
}

export function GlyphSwatch({ type, faded = false }: { type: ObjectType; faded?: boolean }) {
  return (
    <svg width={SWATCH_SIZE} height={SWATCH_SIZE} viewBox="-10 -10 20 20" aria-hidden="true">
      <path {...glyphPaint(type)} opacity={faded ? FADED_OPACITY : 1} />
    </svg>
  )
}

export function RateArrow({ rising }: { rising: boolean }) {
  return (
    <svg
      width={ARROW_SIZE}
      height={ARROW_SIZE}
      viewBox="-10 -10 20 20"
      aria-hidden="true"
      style={{ display: 'inline-block', marginRight: 3 }}
    >
      <path d={CARET_D} fill="currentColor" transform={rising ? undefined : 'rotate(180)'} />
    </svg>
  )
}
