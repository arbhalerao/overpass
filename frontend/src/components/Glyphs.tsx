import type { ObjectType } from '../api/types'
import { TYPE_MARK } from '../lib/palette'

interface Props {
  type: ObjectType
  size?: number
  muted?: boolean
}

export function GlyphFor({ type, size = 14, muted = false }: Props) {
  const color = muted ? 'currentColor' : TYPE_MARK[type]

  return (
    <svg
      width={size}
      height={size}
      viewBox="-10 -10 20 20"
      aria-hidden="true"
      style={{ display: 'block', flex: `0 0 ${size}px` }}
    >
      {type === 'aircraft' && (
        <path
          d="M 0,-8 L 1.7,-2.8 L 9,1.7 L 9,3.6 L 1.7,1.7 L 1.7,5.6 L 4,7.4 L 4,8.4 L 0,7.2 L -4,8.4 L -4,7.4 L -1.7,5.6 L -1.7,1.7 L -9,3.6 L -9,1.7 L -1.7,-2.8 Z"
          fill={color}
        />
      )}
      {type === 'satellite' && (
        <path d="M 0,-7 L 7,0 L 0,7 L -7,0 Z" fill={color} />
      )}
    </svg>
  )
}
