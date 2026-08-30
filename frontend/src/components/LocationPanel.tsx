import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ClipboardEvent, FocusEvent } from "react";

import type { Observer } from "../api/types";
import { GlyphFor } from "./Glyphs";
import { formatNumber } from "../lib/format";
import { MapPicker } from "./MapPicker";

// a short list of places with reliably busy skies
// a preset stays marked while the pin is still exactly where it put it
function isAt(center: Observer | null, place: Observer): boolean {
  return (
    center !== null &&
    center.latitude === place.latitude &&
    center.longitude === place.longitude
  );
}

const PRESETS: Array<{ name: string; note: string; observer: Observer }> = [
  {
    name: "Mumbai",
    note: "BOM",
    observer: { latitude: 19.0896, longitude: 72.8656 },
  },
  {
    name: "Heathrow",
    note: "LHR",
    observer: { latitude: 51.47, longitude: -0.4543 },
  },
  {
    name: "New York",
    note: "Manhattan",
    observer: { latitude: 40.7128, longitude: -74.006 },
  },
];

export const DEFAULT_RADIUS_KM = 50;

const RADIUS_STOPS = [10, 25, 50, 75, 100];

const ELEVATION_STOPS = [0, 10, 20, 30, 45];

interface Props {
  open: boolean;
  center: Observer | null;
  radiusKm: number;
  minSatelliteElevationDeg: number;
  onClose: () => void;
  onChange: (center: Observer, radiusKm: number) => void;
  onSizeChange: (radiusKm: number) => void;
  onElevationChange: (degrees: number) => void;
  onRevert: (center: Observer | null, radiusKm: number, elevationDeg: number) => void;
}

// how much of the sky sits above a given elevation, as a share of the whole dome
function skyFraction(elevationDeg: number): number {
  return 1 - Math.sin((elevationDeg * Math.PI) / 180);
}

// a read-only bar, so a chip's effect is visible rather than just numeric
function Gauge({
  tone,
  fill,
  caption,
}: {
  tone: "satellite" | "aircraft";
  fill: number;
  caption: string;
}) {
  return (
    <div className={`gauge gauge--${tone}`}>
      <span className="gauge__track" aria-hidden="true">
        <span className="gauge__fill" style={{ width: `${fill * 100}%` }} />
      </span>
      <span className="gauge__caption">{caption}</span>
    </div>
  );
}

export function LocationPanel({
  open,
  center,
  radiusKm,
  minSatelliteElevationDeg,
  onClose,
  onChange,
  onSizeChange,
  onElevationChange,
  onRevert,
}: Props) {
  const latId = useId();
  const lonId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  // what the panel is showing right now, so opening can snapshot it without
  // re-snapshotting on every later change
  const latest = useRef({ center, radiusKm, minSatelliteElevationDeg });
  useEffect(() => {
    latest.current = { center, radiusKm, minSatelliteElevationDeg };
  });

  const openedWith = useRef({ center, radiusKm, minSatelliteElevationDeg });
  useEffect(() => {
    if (open) openedWith.current = latest.current;
  }, [open]);

  const discard = useCallback(() => {
    const was = openedWith.current;
    onRevert(was.center, was.radiusKm, was.minSatelliteElevationDeg);
    onClose();
  }, [onRevert, onClose]);

  const [latDraft, setLatDraft] = useState<string | null>(null);
  const [lonDraft, setLonDraft] = useState<string | null>(null);
  const latText = latDraft ?? (center ? String(center.latitude) : "");
  const lonText = lonDraft ?? (center ? String(center.longitude) : "");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") discard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, discard]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const next = event.relatedTarget;
    if (next instanceof HTMLElement && next.dataset.coordField !== undefined)
      return;
    commitCoordinates();
  };

  const commitCoordinates = () => {
    const latitude = Number.parseFloat(latText);
    const longitude = Number.parseFloat(lonText);
    setLatDraft(null);
    setLonDraft(null);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    onChange(
      {
        latitude: Math.max(-90, Math.min(90, latitude)),
        longitude: Math.max(-180, Math.min(180, longitude)),
      },
      radiusKm,
    );
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pair = event.clipboardData
      .getData("text")
      .match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;/]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!pair) return;

    const latitude = Number.parseFloat(pair[1]);
    const longitude = Number.parseFloat(pair[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    event.preventDefault();
    setLatDraft(null);
    setLonDraft(null);
    onChange(
      {
        latitude: Math.max(-90, Math.min(90, latitude)),
        longitude: Math.max(-180, Math.min(180, longitude)),
      },
      radiusKm,
    );
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange(
          {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
          },
          radiusKm,
        );
      },
      (error) => {
        setLocating(false);
        setLocateError(
          error.code === error.PERMISSION_DENIED
            ? "Permission denied"
            : "Could not locate",
        );
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

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
        <h2 className="panel__section">Pick a location</h2>

        <span className="field__label">Drop a pin</span>

        <MapPicker
          center={center}
          radiusKm={radiusKm}
          onPick={(next) => onChange(next, DEFAULT_RADIUS_KM)}
        />
        <p className="panel__hint">
          Click the map or drag the pin. The circle is the area the backend
          filters aircraft against.
        </p>

        <div className="field">
          <span className="field__label">or jump to</span>
          <div className="presets">
            <button
              type="button"
              className="preset preset--locate"
              onClick={useMyLocation}
              disabled={locating || !("geolocation" in navigator)}
            >
              <strong>{locating ? "Locating…" : "My location"}</strong>
              <span>
                {locateError ??
                  ("geolocation" in navigator
                    ? "Wherever you are"
                    : "Unavailable")}
              </span>
            </button>
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className={`preset${isAt(center, preset.observer) ? " is-active" : ""}`}
                onClick={() => onChange(preset.observer, radiusKm)}
              >
                <strong>{preset.name}</strong>
                <span>{preset.note}</span>
              </button>
            ))}
          </div>
        </div>

        <span className="field__label">or enter directly</span>

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
              onKeyDown={(event) =>
                event.key === "Enter" && commitCoordinates()
              }
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
              onKeyDown={(event) =>
                event.key === "Enter" && commitCoordinates()
              }
            />
            <span className="field__hint">-180 to 180, positive east</span>
          </div>
        </div>

        <p className="panel__hint">
          You can also paste a lat, long pair in either box
        </p>

        <hr className="panel__rule" />

        <h2 className="panel__section">How far to look</h2>

        <div className="thresholds">
          <div className="field">
            <span className="field__label">
              <GlyphFor type="satellite" size={13} />
              Satellites above <strong>{minSatelliteElevationDeg}°</strong>
            </span>
            <Gauge
              tone="satellite"
              fill={skyFraction(minSatelliteElevationDeg)}
              caption={`${Math.round(skyFraction(minSatelliteElevationDeg) * 100)}% of the sky`}
            />
            <div className="chips">
              {ELEVATION_STOPS.map((degrees) => (
                <button
                  key={degrees}
                  type="button"
                  className={`chip chip--satellite${
                    degrees === minSatelliteElevationDeg ? " is-active" : ""
                  }`}
                  onClick={() => onElevationChange(degrees)}
                >
                  {degrees}°
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field__label">
              <GlyphFor type="aircraft" size={13} />
              Aircraft within <strong>{radiusKm} km</strong>
            </span>
            <Gauge
              tone="aircraft"
              fill={(radiusKm / RADIUS_STOPS[RADIUS_STOPS.length - 1]) ** 2}
              caption={`${formatNumber(Math.round(Math.PI * radiusKm * radiusKm))} km² of ground`}
            />
            <div className="chips">
              {RADIUS_STOPS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`chip${size === radiusKm ? " is-active" : ""}`}
                  onClick={() => onSizeChange(size)}
                >
                  {size} km
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="panel__foot">
          <button type="button" className="button" onClick={discard}>
            Close
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
