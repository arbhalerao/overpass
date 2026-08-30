import { useEffect, useId, useRef, useState } from 'react'
import type { ClipboardEvent, FocusEvent } from 'react'

import type { Observer } from '../api/types'
import { formatCoordinate } from '../lib/format'
import { GlyphFor } from './Glyphs'
import { MapPicker } from './MapPicker'

// a short list of places with reliably busy skies
const PRESETS: Array<{ name: string; note: string; observer: Observer }> = [
  {
    name: 'Mumbai',
    note: 'Chhatrapati Shivaji',
    observer: { latitude: 19.0896, longitude: 72.8656 },
  },
  {
    name: 'Heathrow',
    note: "Europe's busiest",
    observer: { latitude: 51.47, longitude: -0.4543 },
  },
  {
    name: 'New York',
    note: 'JFK, LGA and EWR',
    observer: { latitude: 40.7128, longitude: -74.006 },
  },
]

const MIN_RADIUS_KM = 1
const MAX_RADIUS_KM = 250

const MIN_ELEVATION_DEG = 0
const MAX_ELEVATION_DEG = 45

interface Props {
  open: boolean
  center: Observer
  radiusKm: number
  minSatelliteElevationDeg: number
  onClose: () => void
  onChange: (center: Observer, radiusKm: number) => void
  onElevationChange: (degrees: number) => void
}

function LocateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.4v2.4M8 12.2v2.4M1.4 8h2.4M12.2 8h2.4"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function LocationPanel({
  open,
  center,
  radiusKm,
  minSatelliteElevationDeg,
  onClose,
  onChange,
  onElevationChange,
}: Props) {
  const latId = useId()
  const lonId = useId()
  const sizeId = useId()
  const elevationId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [latDraft, setLatDraft] = useState<string | null>(null)
  const [lonDraft, setLonDraft] = useState<string | null>(null)
  const latText = latDraft ?? String(center.latitude)
  const lonText = lonDraft ?? String(center.longitude)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  if (!open) return null

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const next = event.relatedTarget
    if (next instanceof HTMLElement && next.dataset.coordField !== undefined) return
    commitCoordinates()
  }

  const commitCoordinates = () => {
    const latitude = Number.parseFloat(latText)
    const longitude = Number.parseFloat(lonText)
    setLatDraft(null)
    setLonDraft(null)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    onChange(
      {
        latitude: Math.max(-90, Math.min(90, latitude)),
        longitude: Math.max(-180, Math.min(180, longitude)),
      },
      radiusKm,
    )
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pair = event.clipboardData
      .getData('text')
      .match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;/]\s*(-?\d+(?:\.\d+)?)\s*$/)
    if (!pair) return

    const latitude = Number.parseFloat(pair[1])
    const longitude = Number.parseFloat(pair[2])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

    event.preventDefault()
    setLatDraft(null)
    setLonDraft(null)
    onChange(
      {
        latitude: Math.max(-90, Math.min(90, latitude)),
        longitude: Math.max(-180, Math.min(180, longitude)),
      },
      radiusKm,
    )
  }

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) return
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        onChange(
          {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
          },
          radiusKm,
        )
      },
      (error) => {
        setLocating(false)
        setLocateError(
          error.code === error.PERMISSION_DENIED ? 'Permission denied' : 'Could not locate',
        )
      },
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  return (
    <div className="overlay" onPointerDown={onClose}>
      <div
        ref={dialogRef}
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label="Choose observer location"
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="panel__head">
          <p>{formatCoordinate(center.latitude, center.longitude)}</p>
        </header>

        <MapPicker
          center={center}
          radiusKm={radiusKm}
          onPick={(next) => onChange(next, radiusKm)}
        />
        <p className="panel__hint">
          Click the map or drag the pin. The circle is the area the backend filters
          aircraft against.
        </p>

        <div className="panel__grid">
          <div className="field">
            <label htmlFor={latId}>Latitude</label>
            <input
              id={latId}
              data-coord-field=""
              inputMode="decimal"
              value={latText}
              onChange={(event) => setLatDraft(event.target.value)}
              onPaste={handlePaste}
              onBlur={handleBlur}
              onKeyDown={(event) => event.key === 'Enter' && commitCoordinates()}
            />
            <span className="field__hint">-90 to 90, positive north</span>
          </div>
          <div className="field">
            <label htmlFor={lonId}>Longitude</label>
            <input
              id={lonId}
              data-coord-field=""
              inputMode="decimal"
              value={lonText}
              onChange={(event) => setLonDraft(event.target.value)}
              onPaste={handlePaste}
              onBlur={handleBlur}
              onKeyDown={(event) => event.key === 'Enter' && commitCoordinates()}
            />
            <span className="field__hint">
              -180 to 180, positive east. A pasted “lat, lon” pair works in either box.
            </span>
          </div>
        </div>

        <div className="field">
          <label htmlFor={elevationId}>
            <GlyphFor type="satellite" size={13} />
            Satellites above <strong>{minSatelliteElevationDeg}°</strong>
          </label>
          <input
            id={elevationId}
            type="range"
            className="range range--satellite"
            min={MIN_ELEVATION_DEG}
            max={MAX_ELEVATION_DEG}
            step={1}
            value={minSatelliteElevationDeg}
            onChange={(event) => onElevationChange(Number(event.target.value))}
          />
          <div className="chips">
            {[0, 10, 20, 30, 45].map((degrees) => (
              <button
                key={degrees}
                type="button"
                className={`chip chip--satellite${degrees === minSatelliteElevationDeg ? ' is-active' : ''
                  }`}
                onClick={() => onElevationChange(degrees)}
              >
                {degrees}°
              </button>
            ))}
          </div>
          <span className="field__hint">
            How high a pass must climb to count. Distance means nothing to something
            550 km up, so this is the satellite equivalent of the radius. 10° is the
            usual cutoff; below it, atmosphere and rooftops hide everything.
          </span>
        </div>

        <div className="field">
          <label htmlFor={sizeId}>
            <GlyphFor type="aircraft" size={13} />
            Aircraft within <strong>{radiusKm} km</strong>
          </label>
          <input
            id={sizeId}
            type="range"
            className="range range--aircraft"
            min={MIN_RADIUS_KM}
            max={MAX_RADIUS_KM}
            step={1}
            value={radiusKm}
            onChange={(event) => onChange(center, Number(event.target.value))}
          />
          <div className="chips">
            {[5, 10, 25, 50, 100, 200].map((size) => (
              <button
                key={size}
                type="button"
                className={`chip${size === radiusKm ? ' is-active' : ''}`}
                onClick={() => onChange(center, size)}
              >
                {size} km
              </button>
            ))}
          </div>
          <span className="field__hint">
            Ground distance from the pin. A larger circle costs the aircraft provider
            more quota per request.
          </span>
        </div>

        <div className="field">
          <span className="field__label">Jump to</span>
          <div className="presets">
            <button
              type="button"
              className="preset preset--locate"
              onClick={useMyLocation}
              disabled={locating || !('geolocation' in navigator)}
            >
              <strong>
                <LocateIcon />
                {locating ? 'Locating…' : 'My location'}
              </strong>
              <span>
                {locateError ?? ('geolocation' in navigator ? 'Wherever you are' : 'Unavailable')}
              </span>
            </button>
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="preset"
                onClick={() => onChange(preset.observer, radiusKm)}
              >
                <strong>{preset.name}</strong>
                <span>{preset.note}</span>
              </button>
            ))}
          </div>
        </div>

        <footer className="panel__foot">
          <button type="button" className="button button--primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
