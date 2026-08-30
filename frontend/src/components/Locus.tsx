import type { Observer } from '../api/types'
import { DASH, formatCoordinate } from '../lib/format'

interface Props {
  center: Observer | null
  radiusKm: number
  minSatelliteElevationDeg: number
}

export function Locus({
  center,
  radiusKm,
  minSatelliteElevationDeg,
}: Props) {
  return (
    <div className="locus">
      <span className="locus__coords">
        {center ? formatCoordinate(center.latitude, center.longitude) : DASH}
      </span>
      <span className="locus__size">
        <em>◆</em> above {minSatelliteElevationDeg}°
        <span className="locus__sep" aria-hidden="true">·</span>
        <em>✈</em> {radiusKm} km
      </span>
    </div>
  )
}
