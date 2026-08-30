import { useCallback, useMemo, useState } from 'react'

import type { LayerName, LayerSelection, Observer, TimeMode } from './api/types'
import { Header } from './components/Header'
import { GlyphFor } from './components/Glyphs'
import { LayerToggle } from './components/LayerToggle'
import { InfoPanel } from './components/InfoPanel'
import { LocationPanel } from './components/LocationPanel'
import { SkyDome } from './components/SkyDome'
import { AreaView } from './components/AreaView'
import { useInitialLocation } from './hooks/useInitialLocation'
import { POLL_INTERVAL_MS } from './api/live'
import { useLiveScene } from './hooks/useLiveScene'
import type { SceneConfig } from './hooks/useLiveScene'
import { useRafTick } from './hooks/useRafTick'
import { useSecondTick } from './hooks/useSecondTick'

const FALLBACK_CENTER: Observer = { latitude: 19.0896, longitude: 72.8656 }
const DEFAULT_RADIUS_KM = 50

const DEFAULT_MIN_SATELLITE_ELEVATION_DEG = 10
const ALL_LAYERS: LayerSelection = { aircraft: true, satellites: true }

const AIRCRAFT_TIME_NOTE = 'Aircraft are live only.'
const AIRCRAFT_REFRESH_SECONDS = 10
const SATELLITE_REFRESH_SECONDS = 5

export default function App() {
  const [center, setCenter] = useState<Observer>(FALLBACK_CENTER)
  const [pinnedByUser, setPinnedByUser] = useState(false)
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  const [minSatelliteElevationDeg, setMinSatelliteElevationDeg] = useState(
    DEFAULT_MIN_SATELLITE_ELEVATION_DEG,
  )
  const [include, setInclude] = useState<LayerSelection>(ALL_LAYERS)
  const [timeMode, setTimeMode] = useState<TimeMode>('live')
  const [observationTime, setObservationTime] = useState<string | null>(null)
  const [locationOpen, setLocationOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const answered = (layer: string) =>
    scene.sources.find((source) => source.source === layer)?.status !== 'error'

  const aircraftAvailable = timeMode === 'live'
  const activeInclude = useMemo(
    () => ({ satellites: include.satellites, aircraft: include.aircraft && aircraftAvailable }),
    [include.satellites, include.aircraft, aircraftAvailable],
  )

  const config = useMemo<SceneConfig>(
    () => ({
      center,
      radiusKm,
      minSatelliteElevationDeg,
      include: activeInclude,
      timeMode,
      observationTime,
    }),
    [center, radiusKm, minSatelliteElevationDeg, activeInclude, timeMode, observationTime],
  )

  const { center: deviceCenter, source: locationSource } = useInitialLocation(pinnedByUser)
  const [adoptedFix, setAdoptedFix] = useState<Observer | null>(null)
  if (deviceCenter && deviceCenter !== adoptedFix) {
    setAdoptedFix(deviceCenter)
    setCenter(deviceCenter)
  }

  const { scene, status, statusDetail, lastError, hasData, reconnect } = useLiveScene(config)

  const dataRate = (base: number): number | null => {
    if (status === 'live') return base
    if (status === 'polling') return POLL_INTERVAL_MS / 1000
    return null
  }

  const liveNowIso = useSecondTick(timeMode === 'live')
  const instant = timeMode === 'live' ? liveNowIso : observationTime

  const tickEnabled = include.aircraft && scene.aircraft.length > 0 && timeMode === 'live'
  const now = useRafTick(20, tickEnabled)

  const toggleLayer = useCallback((layer: LayerName) => {
    setInclude((previous) => ({ ...previous, [layer]: !previous[layer] }))
  }, [])

  const changeLocation = useCallback((nextCenter: Observer, nextSize: number) => {
    setPinnedByUser(true)
    setCenter(nextCenter)
    setRadiusKm(nextSize)
    setSelectedId(null)
  }, [])

  const changeTimeMode = useCallback((mode: TimeMode, isoTime: string | null) => {
    setTimeMode(mode)
    setObservationTime(isoTime)
  }, [])

  const openLocation = useCallback(() => setLocationOpen(true), [])
  const closeLocation = useCallback(() => setLocationOpen(false), [])

  return (
    <div className="app">
      <Header
        center={center}
        radiusKm={radiusKm}
        minSatelliteElevationDeg={minSatelliteElevationDeg}
        timeMode={timeMode}
        instant={instant}
        observation={scene.observation}
        status={status}
        statusDetail={statusDetail}
        streaming={activeInclude.satellites || activeInclude.aircraft}
        locationSource={locationSource}
        onOpenLocation={openLocation}
        onTimeModeChange={changeTimeMode}
        onReconnect={reconnect}
      />

      {lastError && (
        <div className="banner" role="status">
          <strong>{lastError.code}</strong>
          <span>{lastError.message}</span>
        </div>
      )}

      <main className="stage">
        <section className="stage__sky" aria-label="Satellites overhead">
          <div className="stage__head">
            <div className="stage__caption">
              <h2>
                <GlyphFor type="satellite" size={12} />
                Satellites
              </h2>
              <p>
                The sky above you: straight overhead at the centre,{' '}
                {minSatelliteElevationDeg === 0
                  ? 'the horizon'
                  : `${minSatelliteElevationDeg}° above the horizon`}{' '}
                at the edge, north at the top.
              </p>
            </div>
            <LayerToggle
              layer="satellites"
              type="satellite"
              label="Satellites"
              active={include.satellites}
              onToggle={toggleLayer}
            />
          </div>
          <div className="viz-frame">
            <SkyDome
              satellites={scene.satellites}
              sky={scene.sky}
              selectedId={selectedId}
              onSelect={setSelectedId}
              enabled={activeInclude.satellites}
              dataOk={answered('satellites')}
              minElevationDeg={minSatelliteElevationDeg}
              refreshSeconds={dataRate(SATELLITE_REFRESH_SECONDS)}
            />
          </div>
          {!hasData && <div className="stage__loading">Waiting for the first scene…</div>}
        </section>

        <section className="stage__area" aria-label="Aircraft around you">
          <div className="stage__head">
            <div className="stage__caption">
              <h2>
                <GlyphFor type="aircraft" size={12} />
                Aircraft
              </h2>
              <p>
                The ground around you: you at the centre, {radiusKm} km out at the edge,
                north at the top. Each plane points the way it is flying.
              </p>
            </div>
            <LayerToggle
              layer="aircraft"
              type="aircraft"
              label="Aircraft"
              active={include.aircraft && aircraftAvailable}
              disabled={!aircraftAvailable}
              disabledReason={AIRCRAFT_TIME_NOTE}
              onToggle={toggleLayer}
            />
          </div>
          <div className="viz-frame">
            <AreaView
              aircraft={scene.aircraft}
              observation={scene.observation}
              now={now}
              selectedId={selectedId}
              onSelect={setSelectedId}
              enabled={activeInclude.aircraft}
              dataOk={answered('aircraft')}
              offReason={aircraftAvailable ? undefined : AIRCRAFT_TIME_NOTE}
              sky={scene.sky}
              refreshSeconds={dataRate(AIRCRAFT_REFRESH_SECONDS)}
            />
          </div>
        </section>

        <div className="rail">
          <InfoPanel
            scene={scene}
            include={activeInclude}
            unavailable={aircraftAvailable ? undefined : { aircraft: AIRCRAFT_TIME_NOTE }}
            selectedId={selectedId}
            onSelect={setSelectedId}
            now={now}
          />
        </div>
      </main>

      <LocationPanel
        open={locationOpen}
        center={center}
        radiusKm={radiusKm}
        minSatelliteElevationDeg={minSatelliteElevationDeg}
        onClose={closeLocation}
        onChange={changeLocation}
        onElevationChange={setMinSatelliteElevationDeg}
      />
    </div>
  )
}
