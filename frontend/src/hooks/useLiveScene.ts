import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { LiveClient } from '../api/live'
import type { ConnectionState, LiveError } from '../api/live'
import type {
  Aircraft,
  LayerName,
  LayerSelection,
  ObservationContext,
  Observer,
  Satellite,
  SkyConditions,
  SourceStatus,
  SubscribeFrame,
  TimeMode,
} from '../api/types'

export interface SceneConfig {
  center: Observer
  radiusKm: number
  minSatelliteElevationDeg: number
  include: LayerSelection
  timeMode: TimeMode
  observationTime: string | null
}

export interface LiveScene {
  observation: ObservationContext | null
  aircraft: Aircraft[]
  satellites: Satellite[]
  sky: SkyConditions | null
  sources: SourceStatus[]
  warnings: string[]
  partial: boolean
  generatedAt: string | null
  layerUpdatedAt: Partial<Record<LayerName, string>>
}

const EMPTY_LIST: never[] = []

const EMPTY_SCENE: LiveScene = {
  observation: null,
  aircraft: [],
  satellites: [],
  sky: null,
  sources: [],
  warnings: [],
  partial: false,
  generatedAt: null,
  layerUpdatedAt: {},
}

function toSubscribeFrame(config: SceneConfig): SubscribeFrame {
  return {
    action: 'subscribe',
    center: config.center,
    radius_km: config.radiusKm,
    min_satellite_elevation_deg: config.minSatelliteElevationDeg,
    include: config.include,
    time_mode: config.timeMode,
    observation_time: config.timeMode === 'fixed' ? config.observationTime : null,
  }
}

export interface UseLiveSceneResult {
  scene: LiveScene
  status: ConnectionState
  statusDetail: string | null
  lastError: LiveError | null
  hasData: boolean
  reconnect: () => void
}

export function useLiveScene(config: SceneConfig): UseLiveSceneResult {
  const [scene, setScene] = useState<LiveScene>(EMPTY_SCENE)
  const [status, setStatus] = useState<ConnectionState>('idle')
  const [statusDetail, setStatusDetail] = useState<string | null>(null)
  const [lastError, setLastError] = useState<LiveError | null>(null)
  const [hasData, setHasData] = useState(false)

  const clientRef = useRef<LiveClient | null>(null)

  const frame = useMemo(() => toSubscribeFrame(config), [config])
  const frameKey = useMemo(() => JSON.stringify(frame), [frame])

  const geometryKey = `${config.center.latitude},${config.center.longitude},${config.radiusKm}`
  const [lastGeometryKey, setLastGeometryKey] = useState(geometryKey)
  if (lastGeometryKey !== geometryKey) {
    setLastGeometryKey(geometryKey)
    setScene(EMPTY_SCENE)
    setHasData(false)
  }

  useEffect(() => {
    const client = new LiveClient({
      onState: (next, detail) => {
        setStatus(next)
        setStatusDetail(detail ?? null)
        if (next === 'live') setLastError(null)
      },
      onError: (error) => setLastError(error),
      onUpdate: (update) => {
        setHasData(true)
        setScene((previous) => {
          const sources = mergeSources(previous.sources, update.sources, update.layers)

          const failures = sources.filter(
            (source) => source.status === 'error' && source.message,
          )
          const next: LiveScene = {
            ...previous,
            observation: update.observation,
            sources,
            warnings: [
              ...new Set([
                ...update.warnings,
                ...failures.map((source) => source.message as string),
              ]),
            ],
            partial: sources.some((source) => source.status === 'error'),
            generatedAt: update.generated_at,
            layerUpdatedAt: { ...previous.layerUpdatedAt },
          }
          for (const layer of update.layers) {
            next.layerUpdatedAt[layer] = update.generated_at
          }
          if (update.aircraft) next.aircraft = update.aircraft
          if (update.satellites) next.satellites = update.satellites
          if (update.sky !== undefined) next.sky = update.sky
          return next
        })
      },
    })

    clientRef.current = client
    return () => {
      client.stop()
      clientRef.current = null
    }
  }, [])

  useEffect(() => {
    clientRef.current?.setSubscription(JSON.parse(frameKey) as SubscribeFrame)
  }, [frameKey])

  const visibleScene = useMemo<LiveScene>(() => {
    const { include } = config
    if (include.aircraft && include.satellites) return scene
    return {
      ...scene,
      aircraft: include.aircraft ? scene.aircraft : EMPTY_LIST,
      satellites: include.satellites ? scene.satellites : EMPTY_LIST,
    }
  }, [scene, config])

  const reconnect = useCallback(() => {
    setLastError(null)
    clientRef.current?.reconnectNow()
  }, [])

  return { scene: visibleScene, status, statusDetail, lastError, hasData, reconnect }
}

function mergeSources(
  previous: SourceStatus[],
  incoming: SourceStatus[],
  layers: LayerName[],
): SourceStatus[] {
  const refreshed = new Set<string>(layers)
  const byName = new Map<string, SourceStatus>()
  for (const source of previous) {
    if (!refreshed.has(source.source)) byName.set(source.source, source)
  }
  for (const source of incoming) byName.set(source.source, source)

  const order: LayerName[] = ['satellites', 'aircraft']
  return order.flatMap((name) => {
    const source = byName.get(name)
    return source ? [source] : []
  })
}
