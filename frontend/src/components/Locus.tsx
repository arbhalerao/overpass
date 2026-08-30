import type { LocationSource } from '../hooks/useInitialLocation'
import type { Observer } from '../api/types'
import { formatCoordinate } from '../lib/format'

interface Props {
  center: Observer
  radiusKm: number
  minSatelliteElevationDeg: number
  locationSource: LocationSource
  onOpen: () => void
}

export function Locus({
  center,
  radiusKm,
  minSatelliteElevationDeg,
  locationSource,
  onOpen,
}: Props) {
  return (
    <button type="button" className="locus" onClick={onOpen}>
      <span className="locus__coords">
        {formatCoordinate(center.latitude, center.longitude)}
        {locationSource === 'locating' && <em className="locus__state">locating…</em>}
        {locationSource === 'fallback' && <em className="locus__state">set a location</em>}
      </span>
      <span className="locus__size">
        <em>◆</em> above {minSatelliteElevationDeg}°
        <span className="locus__sep" aria-hidden="true">·</span>
        <em>✈</em> {radiusKm} km
      </span>
    </button>
  )
}
