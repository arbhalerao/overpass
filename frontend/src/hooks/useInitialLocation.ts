import { useEffect, useState } from 'react'

import type { Observer } from '../api/types'

export type LocationSource = 'locating' | 'device' | 'fallback'

export function useInitialLocation(moved: boolean): {
  center: Observer | null
  source: LocationSource
} {
  const [center, setCenter] = useState<Observer | null>(null)
  const [source, setSource] = useState<LocationSource>(() =>
    'geolocation' in navigator ? 'locating' : 'fallback',
  )

  useEffect(() => {
    if (!('geolocation' in navigator)) return

    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return
        setCenter({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        })
        setSource('device')
      },
      () => {
        if (!cancelled) setSource('fallback')
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    )

    return () => {
      cancelled = true
    }
  }, [])

  return { center: moved ? null : center, source }
}
