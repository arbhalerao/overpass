import { useCallback, useMemo, useState } from 'react'

import type { LayerName, LayerSelection, Observer, TimeMode } from './api/types'
import { Header } from './components/Header'
import { ConnectionBadge } from './components/ConnectionBadge'
import { GlyphFor } from './components/Glyphs'
import { InfoPanel } from './components/InfoPanel'
import { DEFAULT_RADIUS_KM, LocationPanel } from './components/LocationPanel'
import { Locus } from './components/Locus'
import { SettingsRow } from './components/SettingsRow'
import { Clocks } from './components/Clocks'
import { SkyDome } from './components/SkyDome'
import { AreaView } from './components/AreaView'
import { POLL_INTERVAL_MS } from './api/live'
import { isInArea, isTracked } from './lib/geo'
import { useLiveScene } from './hooks/useLiveScene'
import type { SceneConfig } from './hooks/useLiveScene'
import { useRafTick } from './hooks/useRafTick'
import { useSecondTick } from './hooks/useSecondTick'


const DEFAULT_MIN_SATELLITE_ELEVATION_DEG = 10
const NO_LAYERS: LayerSelection = { satellites: false, aircraft: false }

const AIRCRAFT_TIME_NOTE = 'Aircraft are live only.'
const NO_PLACE_NOTE = 'Pick a location first.'
const AIRCRAFT_REFRESH_SECONDS = 10
const SATELLITE_REFRESH_SECONDS = 5

export default function App() {
  const [center, setCenter] = useState<Observer | null>(null)
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  const [minSatelliteElevationDeg, setMinSatelliteElevationDeg] = useState(
    DEFAULT_MIN_SATELLITE_ELEVATION_DEG,
  )
  const [include, setInclude] = useState<LayerSelection>(NO_LAYERS)
  const [timeMode, setTimeMode] = useState<TimeMode>('live')
  const [observationTime, setObservationTime] = useState<string | null>(null)
  const [locationOpen, setLocationOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const answered = (layer: string) =>
    scene.sources.find((source) => source.source === layer)?.status !== 'error'

  const located = center !== null
  const aircraftAvailable = timeMode === 'live'
  const activeInclude = useMemo(
    () => ({
      satellites: located && include.satellites,
      aircraft: located && include.aircraft && aircraftAvailable,
    }),
    [located, include.satellites, include.aircraft, aircraftAvailable],
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

  const observation = scene.observation
  const flying = scene.aircraft.filter(
    (item) =>
      !item.on_ground &&
      isTracked(item, now) &&
      (!observation || isInArea(item, observation, now)),
  )
  const shown =
    flying.length === scene.aircraft.length ? scene : { ...scene, aircraft: flying }

  const toggleLayer = useCallback((layer: LayerName) => {
    setInclude((previous) => ({ ...previous, [layer]: !previous[layer] }))
  }, [])

  const changeLocation = useCallback((nextCenter: Observer, nextSize: number) => {
    setCenter(nextCenter)
    setRadiusKm(nextSize)
    setSelectedId(null)
  }, [])

  const revertLocation = useCallback(
    (nextCenter: Observer | null, nextRadius: number, nextElevation: number) => {
      setCenter(nextCenter)
      setRadiusKm(nextRadius)
      setMinSatelliteElevationDeg(nextElevation)
      setSelectedId(null)
    },
    [],
  )

  const changeTimeMode = useCallback((mode: TimeMode, isoTime: string | null) => {
    setTimeMode(mode)
    setObservationTime(isoTime)
  }, [])

  const openLocation = useCallback(() => setLocationOpen(true), [])
  const closeLocation = useCallback(() => setLocationOpen(false), [])

  return (
    <div className="app">
      <Header />

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
              offReason={located ? undefined : NO_PLACE_NOTE}
            />
          </div>
          {activeInclude.satellites && !hasData && (
            <div className="stage__loading">Waiting for the first scene…</div>
          )}
        </section>

        <div className="rail">
          <ConnectionBadge
            status={status}
            detail={statusDetail}
            streaming={activeInclude.satellites || activeInclude.aircraft}
            timeMode={timeMode}
            onReconnect={reconnect}
          />
          <SettingsRow waiting={!located} onOpen={openLocation} />
          <Locus
            center={center}
            radiusKm={radiusKm}
            minSatelliteElevationDeg={minSatelliteElevationDeg}
          />
          <Clocks
            placed={located}
            observation={scene.observation}
            instant={instant}
            timeMode={timeMode}
            onChange={changeTimeMode}
          />
          <InfoPanel
            scene={shown}
            include={include}
            unavailable={aircraftAvailable ? undefined : { aircraft: AIRCRAFT_TIME_NOTE }}
            located={located}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onToggle={toggleLayer}
            now={now}
          />
        </div>

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
          </div>
          <div className="viz-frame">
            <AreaView
              aircraft={shown.aircraft}
              observation={scene.observation}
              now={now}
              selectedId={selectedId}
              onSelect={setSelectedId}
              enabled={activeInclude.aircraft}
              dataOk={answered('aircraft')}
              offReason={located ? (aircraftAvailable ? undefined : AIRCRAFT_TIME_NOTE) : NO_PLACE_NOTE}
              sky={scene.sky}
              refreshSeconds={dataRate(AIRCRAFT_REFRESH_SECONDS)}
            />
          </div>
        </section>

      </main>

      <LocationPanel
        open={locationOpen}
        center={center}
        radiusKm={radiusKm}
        minSatelliteElevationDeg={minSatelliteElevationDeg}
        onClose={closeLocation}
        onChange={changeLocation}
        onSizeChange={setRadiusKm}
        onElevationChange={setMinSatelliteElevationDeg}
        onRevert={revertLocation}
      />
    </div>
  )
}
