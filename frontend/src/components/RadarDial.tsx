import type { ReactNode } from 'react'

export interface RadarRing {
  fraction: number
  label?: string
}

interface Props {
  radius: number
  view: number
  tint: readonly [string, string]
  id: string
  rings: RadarRing[]
  rimLabel?: string
  sweepSeconds?: number
  sweep?: 'rotate' | 'pulse'
  sweepColor?: string
  ariaLabel: string
  children: ReactNode
  onPointerLeave?: () => void
}

const MINOR_TICK = 10
const MAJOR_TICK = 30

const TRAIL_DEG = 72
const TRAIL_STEPS = 12
const TRAIL_PEAK = 0.12

function wedgePath(radius: number, fromDeg: number, toDeg: number): string {
  const point = (deg: number) => {
    const angle = (deg * Math.PI) / 180
    return `${(radius * Math.sin(angle)).toFixed(3)},${(-radius * Math.cos(angle)).toFixed(3)}`
  }
  return `M 0,0 L ${point(fromDeg)} A ${radius},${radius} 0 0 0 ${point(toDeg)} Z`
}

export function RadarDial({
  radius,
  view,
  tint,
  id,
  rings,
  rimLabel,
  sweepSeconds,
  sweep = 'rotate',
  sweepColor = 'currentColor',
  ariaLabel,
  children,
  onPointerLeave,
}: Props) {
  const fillId = `${id}-fill`
  const trailId = `${id}-trail`
  const pulseTrailId = `${id}-pulse-trail`

  return (
    <svg
      viewBox={`${-view} ${-view} ${view * 2} ${view * 2}`}
      role="img"
      aria-label={ariaLabel}
      onPointerLeave={onPointerLeave}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <circle r={radius} />
        </clipPath>
        <radialGradient id={fillId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={tint[0]} />
          <stop offset="100%" stopColor={tint[1]} />
        </radialGradient>
        <filter
          id={trailId}
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation={radius * 0.024} />
        </filter>
        <radialGradient id={pulseTrailId} cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor={sweepColor} stopOpacity="0" />
          <stop offset="90%" stopColor={sweepColor} stopOpacity="0.07" />
          <stop offset="100%" stopColor={sweepColor} stopOpacity="0.22" />
        </radialGradient>
      </defs>

      <circle r={radius} fill={`url(#${fillId})`} />

      {sweepSeconds !== undefined && sweep === 'rotate' && (
        <g className="radar__sweep" style={{ animationDuration: `${sweepSeconds}s` }}>
          <g filter={`url(#${trailId})`}>
            {Array.from({ length: TRAIL_STEPS }, (_, step) => {
              const width = TRAIL_DEG / TRAIL_STEPS
              const decay = 1 - (step + 0.5) / TRAIL_STEPS
              return (
                <path
                  key={step}
                  d={wedgePath(radius, -step * width, -(step + 1) * width - 0.4)}
                  fill={sweepColor}
                  fillOpacity={TRAIL_PEAK * decay ** 1.5}
                />
              )
            })}
          </g>
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={-radius}
            className="radar__sweep-edge"
            stroke={sweepColor}
          />
        </g>
      )}

      {sweepSeconds !== undefined && sweep === 'pulse' && (
        <g className="radar__pulse" clipPath={`url(#${id}-clip)`}>
          {[0, 0.5].map((offset) => {
            const timing = {
              animationDuration: `${sweepSeconds}s`,
              animationDelay: `${-sweepSeconds * offset}s`,
            }
            return (
              <g key={offset}>
                <circle r={radius} fill={`url(#${pulseTrailId})`} style={timing} />
                <circle
                  r={radius}
                  fill="none"
                  stroke={sweepColor}
                  strokeWidth={1.4}
                  vectorEffect="non-scaling-stroke"
                  style={timing}
                />
              </g>
            )
          })}
        </g>
      )}

      <g className="radar__grid">
        {rings.map((ring) => (
          <circle key={ring.fraction} r={radius * ring.fraction} />
        ))}
        {Array.from({ length: 6 }, (_, index) => {
          const angle = (index * MAJOR_TICK * Math.PI) / 180
          return (
            <line
              key={index}
              x1={-Math.sin(angle) * radius}
              y1={Math.cos(angle) * radius}
              x2={Math.sin(angle) * radius}
              y2={-Math.cos(angle) * radius}
            />
          )
        })}
      </g>

      <g className="radar__ticks">
        {Array.from({ length: 360 / MINOR_TICK }, (_, index) => {
          const degrees = index * MINOR_TICK
          const major = degrees % MAJOR_TICK === 0
          const angle = (degrees * Math.PI) / 180
          const inner = radius - (major ? 6 : 3)
          return (
            <line
              key={degrees}
              className={major ? 'is-major' : undefined}
              x1={Math.sin(angle) * inner}
              y1={-Math.cos(angle) * inner}
              x2={Math.sin(angle) * radius}
              y2={-Math.cos(angle) * radius}
            />
          )
        })}
      </g>

      <circle r={radius} className="radar__rim" />

      <g className="radar__ring-labels">
        {rings.map((ring) =>
          ring.label ? (
            <text key={ring.fraction} x={3} y={-radius * ring.fraction + 4}>
              {ring.label}
            </text>
          ) : null,
        )}
        {rimLabel && (
          <text x={3} y={-radius + 4}>
            {rimLabel}
          </text>
        )}
      </g>

      <g className="radar__compass">
        <text x={0} y={-radius - 14}>N</text>
        <text x={radius + 17} y={0}>E</text>
        <text x={0} y={radius + 19}>S</text>
        <text x={-radius - 17} y={0}>W</text>
      </g>

      <g className="radar__origin">
        <line x1={-5} y1={0} x2={5} y2={0} />
        <line x1={0} y1={-5} x2={0} y2={5} />
        <circle r={2.4} />
      </g>

      {children}
    </svg>
  )
}
