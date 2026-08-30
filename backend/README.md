# overpass

**What is above this point on the Earth, right now?**

Pick a latitude and longitude on a map, choose a radius in kilometres, and Overpass answers with a live snapshot of the sky and airspace over that point:

| Layer          | Source                    | What you get                                                                                                     |
| -------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Satellites** | CelesTrak GP/OMM elements | Space stations and bright satellites above the horizon, each flagged with whether it is visible to the naked eye |
| **Aircraft**   | OpenSky Network           | Every aircraft within the radius, resolved to airline and flight number, with the timing needed to animate it    |

The selected point is **permanently the centre**. North is always up.
The circle filters aircraft; the same point is the observer the satellites are computed for.

---

## Table of contents

- [overpass](#overpass)
  - [Table of contents](#table-of-contents)
  - [Architecture overview](#architecture-overview)
  - [Requirements](#requirements)
  - [Environment configuration](#environment-configuration)
  - [Obtaining OpenSky credentials](#obtaining-opensky-credentials)
  - [How CelesTrak data is used](#how-celestrak-data-is-used)
  - [How Skyfield ephemeris data is managed](#how-skyfield-ephemeris-data-is-managed)
  - [Two controls, one per layer](#two-controls-one-per-layer)
  - [Aircraft area filtering explained](#aircraft-area-filtering-explained)
  - [Azimuth and altitude explained](#azimuth-and-altitude-explained)
  - [Known limitations](#known-limitations)

---

## Architecture overview

Four layers, each one only allowed to know about the layer beneath it.

```
                       ┌───────────────────────────────────────────────┐
   HTTP / WebSocket    │  app/api                                      │
                       │  routes/*  ·  websocket.py  ·  deps.py        │
                       │  Validation, presentation, DI. No logic.      │
                       └───────────────────┬───────────────────────────┘
                                           │
                       ┌───────────────────▼───────────────────────────┐
   Orchestration       │  app/services                                 │
                       │  scene_service   ← runs the other two         │
                       │    concurrently and isolates their failures   │
                       │  aircraft_service · satellite_service ·       │
                       │  ephemeris_service (the Sun, for visibility)  │
                       └──────────┬────────────────────┬───────────────┘
                                  │                    │
              ┌───────────────────▼────────┐  ┌────────▼──────────────┐
   Providers  │  app/clients               │  │  app/geometry         │
              │  opensky_client (OAuth2)   │  │  geodesy · bounding   │
              │  celestrak_client (GP/OMM) │  │  box · projection     │
              └───────────────────┬────────┘  └────────┬──────────────┘
                                  │                    │
                       ┌──────────▼────────────────────▼───────────────┐
   Domain / data       │  app/domain (frozen dataclasses)              │
                       │  app/models (Pydantic v2 request/response)    │
                       │  app/data  (curated airline catalogue)        │
                       │  app/core  (config · logging · errors · cache)│
                       └───────────────────────────────────────────────┘
```

**Ideas worth knowing before reading the code:**

- **Two coordinate systems, kept apart.**
  Aircraft are map objects: `latitude`/`longitude` plus area-relative `normalized_x`/`normalized_y`.
  Satellites are sky objects: `azimuth_deg`/`elevation_deg`.

  They describe genuinely different spatial concepts, so the API never forces one into the other.
  What they share is the identity fields (`id`, `name`, `object_type`, `subtype`) of the unified `SkyObject` domain model.

- **Failure isolation is a feature.**
  `SceneService` runs the sources with `asyncio.gather(return_exceptions=True)`, not a `TaskGroup`, so a dead aircraft feed cannot cancel the sky.
  Every source contributes a status entry to `sources[]`, and any failure sets `partial: true`. Nothing is silently swallowed.

- **The backend does not animate.**
- It returns each aircraft's state vector plus the `position_time` that state refers to.
- The frontend interpolates, because that is where the animation frames are.

- **No database.**
  Two encapsulated caches do the work a database would otherwise be asked to do: an in-memory TTL cache with single-flight semantics (`app/core/cache.py`),
  and a disk mirror of CelesTrak element sets that survives restarts.

- **No global mutable state.**
- Everything long-lived is built once in the FastAPI lifespan, stored in a `ServiceContainer` on `app.state`, and injected into routes via `Depends`.

## Requirements

- Python **3.12 or newer**
- Outbound HTTPS to `opensky-network.org`, `auth.opensky-network.org`, `celestrak.org`, and (once) a JPL ephemeris mirror
- About 20 MB of disk for `de421.bsp` and the cached element sets

Runtime dependencies: FastAPI, Uvicorn, Pydantic v2, pydantic-settings, httpx, Skyfield, NumPy, websockets, anyio, timezonefinder.

## Environment configuration

All configuration is environment-based, read once at startup through `pydantic-settings`.
Nothing is hardcoded and no secret is ever logged or returned in an API response.
See `.env.example` for the complete list; the ones you are most likely to change:

| Variable                                      | Default                                       | Purpose                                                     |
| --------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `APP_ENV`                                     | `development`                                 | `development` enables Uvicorn reload via the console script |
| `LOG_LEVEL` / `LOG_FORMAT`                    | `INFO` / `console`                            | Set `LOG_FORMAT=json` in production                         |
| `CORS_ORIGINS`                                | `http://localhost:3000,http://localhost:5173` | Comma-separated browser origins                             |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | empty                                         | OAuth2 client credentials                                   |
| `OPENSKY_ALLOW_ANONYMOUS`                     | `true`                                        | Permit unauthenticated OpenSky access as a fallback         |
| `CELESTRAK_GROUPS`                            | `stations,visual`                             | Which CelesTrak groups to track                             |
| `CELESTRAK_NAMES`                             | empty                                         | Name searches for satellites in no curated group; substring |
| `ASTRONOMY_DATA_DIR`                          | `./data`                                      | Ephemeris and orbital-element cache location                |
| `SKYFIELD_ALLOW_DOWNLOADS`                    | `true`                                        | Set `false` to require a pre-staged ephemeris               |
| `AIRCRAFT_CACHE_TTL_SECONDS`                  | `5`                                           | Deliberately tiny; aircraft are meant to be live            |
| `SATELLITE_CACHE_TTL_SECONDS`                 | `7200`                                        | Matches CelesTrak's two-hour refresh cycle                  |
| `RADIUS_MIN_KM` / `RADIUS_MAX_KM`             | `1` / `250`                                   | Accepted radii                                              |
| `MIN_SATELLITE_ELEVATION_DEG`                 | `10`                                          | Below ~10° satellites are behind terrain anyway             |
| `WS_AIRCRAFT_INTERVAL_SECONDS`                | `10`                                          | WebSocket aircraft cadence                                  |
| `WS_SATELLITE_INTERVAL_SECONDS`               | `5`                                           | WebSocket satellite cadence                                 |

## Obtaining OpenSky credentials

OpenSky retired username-and-password basic authentication in **March 2026**.
The API now uses OAuth2 client credentials, which this backend implements.

1. Create a free account at <https://opensky-network.org/>.
2. Go to your account page and open **API clients**.
3. Create a new API client. You are shown a `client_id` and a `client_secret` (also downloadable as `credentials.json`). The secret is displayed once.
4. Put them in `.env`:
   ```bash
   OPENSKY_CLIENT_ID=your-client-id
   OPENSKY_CLIENT_SECRET=your-client-secret
   ```

The client requests a token from `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token`,
caches it, refreshes it a minute before its 30-minute expiry, and retries once if a request comes back `401`.

**Quota.** OpenSky charges credits per request based on the bounding box area, up to 25 square degrees costs 1 credit.
Anonymous callers get 400 credits/day; authenticated callers get 4,000, or 8,000 while actively feeding data.
A `429` is surfaced as HTTP 429 with a `Retry-After` header derived from the provider's own hint.

**Without credentials** the server still starts and still serves satellites.
Aircraft fall back to anonymous access; set `OPENSKY_ALLOW_ANONYMOUS=false` to turn that off, after which aircraft endpoints return a clear `503 configuration_error` instead.

## How CelesTrak data is used

Satellite orbital elements come from CelesTrak's GP endpoint in **OMM JSON** format:

```
https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json
```

OMM keyword records are handed straight to Skyfield's `EarthSatellite.from_omm()`,
so nothing in this codebase parses TLE line columns and nothing assumes a five-digit catalog number, `norad_id` is a string throughout.

CelesTrak asks consumers to download at most once per two-hour refresh window; exceeding that earns a `403` and eventually an IP block. The client is built around that rule:

- an in-memory TTL cache (`SATELLITE_CACHE_TTL_SECONDS`, default 7200 s);
- a **disk mirror** under `${ASTRONOMY_DATA_DIR}/celestrak/<group>.json`,
  written atomically, so a restart re-reads the file instead of re-downloading;
- **single flight**: concurrent requests for a group produce one download;
- **stale fallback**: if CelesTrak is unreachable, cached elements are served with the
  source marked `degraded` and a warning attached, rather than dropping the layer.

Default scope is `stations,visual`: the space stations plus CelesTrak's bright "visual" group, about 180 satellites.
Adding coverage is a configuration change: append a group name to `CELESTRAK_GROUPS`, not a code change.

## How Skyfield ephemeris data is managed

Solar position uses the JPL **DE421** ephemeris (`de421.bsp`, ~17 MB, valid 1900–2050).

- The file lives in `ASTRONOMY_DATA_DIR` (default `./data`), managed by a Skyfield `Loader` bound to that directory.
- On first startup it is downloaded once, and the log says so. Every later start reads it from disk in about 60 ms.
- Set `SKYFIELD_ALLOW_DOWNLOADS=false` in an air-gapped or immutable deployment. Stage the file yourself first:

  ```bash
  mkdir -p data
  curl -L -o data/de421.bsp https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp
  ```

- **Startup never fails because of the ephemeris.**
- If it cannot be loaded, the failure is logged and `/api/v1/health` reports `visibility: unavailable`.
- Satellites still propagate from the timescale alone (which needs no download) and aircraft are unaffected;
- only `is_visible` degrades to `null` rather than to a wrong answer.
- Skyfield is synchronous NumPy code, so every calculation runs in a worker thread with a process-wide lock around the memory-mapped kernel. The event loop is never blocked.
- A different ephemeris (`de440s.bsp`, say) is a one-line change: `SKYFIELD_EPHEMERIS=`.

The ephemeris earns its 17 MB by answering one question: **where is the Sun?**
A satellite is only visible to the naked eye when it is catching sunlight while the ground below is already dark,
so the Sun's altitude at the observer is what turns "a satellite is overhead" into "you could actually see it".
That verdict is `is_visible` on every satellite, and `sky` on the scene.

## Two controls, one per layer

`radius_km` and `min_satellite_elevation_deg` are counterparts.

A circle on the ground is meaningless to something 550 km up:
a satellite plainly overhead can have its ground track hundreds of kilometres away,
so a radius filter would exclude everything, always.
What decides whether a pass is worth knowing about is **how high it climbs**, so the satellite layer is cut by elevation instead.

| Layer      | Field                         | Default | Meaning                         |
| ---------- | ----------------------------- | ------- | ------------------------------- |
| Aircraft   | `radius_km`                   | 50      | Ground distance from the centre |
| Satellites | `min_satellite_elevation_deg` | 10      | Degrees above the horizon       |

`radius_km` has **no effect on satellites**, and the elevation cutoff has none on aircraft.
10° is the usual cutoff in satellite tracking: below it you are looking through so much atmosphere, and, from anywhere with trees or rooftops, through those too, that a pass is not realistically spottable.

## Aircraft area filtering explained

The user picks a centre and a **radius**.
The area is every point within `radius_km` of that centre, measured as ground distance.
The centre never drifts: it is the one input everything else is derived from.

**Providers only accept rectangles.**
So the circle carries a circumscribing bounding box, used purely to ask upstream for a superset.
That box is built with the WGS-84 radii of curvature rather than a fixed "1 degree = 111 km":

- **North/south:** the meridional radius of curvature `M(φ) = a(1−e²) / (1−e²sin²φ)^1.5`,
  evaluated at the midpoint of the arc through two fixed-point iterations, which removes almost all of the single-radius error at continental scales.
- **East/west:** the parallel radius `N(φ)·cos(φ)`, so the box widens in *degrees* exactly as fast as a degree of longitude narrows in *metres*.
  A degree of longitude is 111 km at the equator, 56 km at 60°N and nothing at the pole; a fixed factor would draw a badly wrong box in Oslo.

**Filtering happens twice, deliberately.**
The provider returns everything in that rectangle, and every state vector is then re-tested against the true circle with `AreaGeometry.contains()` before it reaches the response.
For a 50 km radius at Pune the box corner sits 70.8 km from the centre, comfortably inside the rectangle, and correctly rejected by the circle.

**Edge cases that are handled:**

- **Latitude clamping.** Box edges are clamped to ±90°; an area near a pole cannot wrap over it.
- **Antimeridian.** When the box straddles ±180°, `min_longitude > max_longitude` and `crosses_antimeridian: true`.
- OpenSky cannot express a wrapping box, so the query is split in two and the results merged and de-duplicated by ICAO24. Containment itself never notices, because it compares ground distance.
- **Polar caps.** When the half-width would exceed 180° of longitude, the box reaches every meridian and `spans_all_longitudes: true`.

**Normalised coordinates.** Each aircraft carries its position on the unit circle:

```
normalized_x:  -1 ────────── 0 ────────── +1
               west        centre         east

normalized_y:  +1  north edge
                0  centre
               -1  south edge
```

Both axes are scaled by the radius, so anything returned satisfies `x² + y² ≤ 1`.

`normalized_y` **increases towards the north**, matching the geographic convention.
Screen space has y growing downward; that inversion belongs in the frontend, at the point of drawing, so the API stays geographically honest:

```javascript
const screenX = ((aircraft.normalized_x + 1) / 2) * width;
const screenY = ((1 - aircraft.normalized_y) / 2) * height;   // invert here
```

## Azimuth and altitude explained

Aircraft and satellites are both reported in **horizontal (alt-az) coordinates**, the sky as it looks from where the observer is standing.

**Azimuth** is the compass direction, degrees clockwise from true north:

```
              0° North
                 │
   270° West ────┼──── 90° East
                 │
             180° South
```

**Elevation** is the angle up from the horizon:

```
   90°  zenith, straight overhead
   45°  halfway up
    0°  the horizon
```

One vocabulary applies to both:
`azimuth_deg` is where to turn, `elevation_deg` is how far up to look, and *altitude* or *height* always means a physical distance above the ground, never an angle.

Aircraft elevation uses spherical geometry rather than `atan(height / distance)`.
Over a few kilometres the two agree, but the Earth curves away beneath the target: at 250 km the surface has dropped about 4.9 km,
so the naive formula reports 2.29° where the truth is 1.16°.

Placing an object on a dome:

```javascript
const azimuth  = (object.azimuth_deg  * Math.PI) / 180;
const altitude = (object.altitude_deg * Math.PI) / 180;

const x = Math.cos(altitude) * Math.sin(azimuth);   // east
const y = Math.cos(altitude) * Math.cos(azimuth);   // north
const z = Math.sin(altitude);                       // up
```

## Known limitations

**Coverage and data quality**

- OpenSky is crowd-sourced ADS-B. Coverage is excellent over Europe and North America and patchy elsewhere: an empty `aircraft` array over much of Asia, Africa or the open ocean usually means no receivers, not no aircraft.
  Check `sources[]` to tell the difference.
- Aircraft type and registration are not resolved; `subtype` is reserved and stays `null`.
- A typical location has a handful of satellites overhead and often none visible at all.
  Widen `CELESTRAK_GROUPS`, or add `CELESTRAK_NAMES`, for more.
- `is_sunlit` reports whether the *satellite* is lit.
- Whether it is actually visible also depends on the observer being in darkness and on the object's brightness; the API does not compute a visual magnitude for satellites.

**Accuracy**

- Aircraft positions are as fresh as the provider's snapshot: 5-second resolution for authenticated callers, 10-second for anonymous ones.
  Compare `position_time` with `generated_at` before deciding how much to trust a position.
- SGP4 accuracy degrades with element age, typically a kilometre or so per day. Each satellite carries `element_age_days` so a client can judge for itself.
- DE421 is valid for 1900–2050. Requesting an `observation_time` outside that range fails.
- Terrain, buildings and weather are not modelled. "Above the horizon" means above the mathematical horizon at sea level.

**Operational**

- State is per-process and in-memory. Multiple Uvicorn workers means multiple caches and multiplied OpenSky quota use; run one worker unless you have a reason not to.
- There is no authentication, no rate limiting and no request quota on this API itself. Put it behind a gateway before exposing it publicly.
- The WebSocket has no backpressure handling: a client that stops reading will have frames queued by the ASGI server rather than dropped.
- `observation_time` moves the sky but not the aircraft, historical aircraft playback would need OpenSky's time-travel parameter and a paid tier for anything older than an hour.
- No persistence: nothing is recorded between restarts except the cached ephemeris and orbital elements.
