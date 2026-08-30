# overpass

**What is above this point on the Earth, right now?**

Pick a latitude and longitude on a map, choose how far to look, and Overpass answers with a live view of the airspace and the satellites over that point.

| Layer          | Source                    | What you get                                                                                                 |
| -------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Satellites** | CelesTrak GP/OMM elements | Space stations and bright satellites overhead, each flagged with whether you could actually see it right now |
| **Aircraft**   | OpenSky Network           | Every aircraft within the radius, by airline and flight number, dead-reckoned between updates                |

The chosen point is **permanently the centre**. The area is a circle of the radius you choose, and north is always up.

```
overpass/
├── docker-compose.yml                 production stack
├── docker-compose.override.yml        development overrides (applied automatically)
├── .env.example
├── backend/    FastAPI              → backend/README.md
└── frontend/   React + Vite         → frontend/README.md
```

---

## Quick start

```bash
git clone https://github.com/arbhalerao/overpass.git
cd overpass
cp .env.example .env

docker compose up --build
```

Then open **<http://localhost:51800>**.

|                    | URL                                    |
| ------------------ | -------------------------------------- |
| Web app            | <http://localhost:51800>               |
| API docs (Swagger) | <http://localhost:51801/docs>          |
| API health         | <http://localhost:51801/api/v1/health> |

First boot takes about a minute: the backend downloads the JPL ephemeris (~17 MB) and the current CelesTrak element sets into a named volume.
Later starts take seconds.

## Development vs production

Compose merges `docker-compose.override.yml` automatically, so the default is the development stack:

```bash
# Development - Vite HMR, uvicorn --reload, source bind-mounted.
docker compose up --build

# Production - bundle built and served by nginx, no source mounts.
docker compose -f docker-compose.yml up --build
```

## What the two views show

**Two dials, one instrument, two projections.**
Both wear the same radar chrome: north up, concentric rings, bearing ticks, crosshair, and a sweep that completes one cycle per refresh,
but they are not the same projection, because the two subjects are not the same shape.

The **satellite dial** is alt-azimuth: straight up at the centre, your elevation cutoff at the rim, with the rings recomputed to divide whatever band is left. It answers *where do I point my eyes*.

The **aircraft dial** is a plan view: you at the centre, north up, rings in kilometres.

Each dial has its own control, because the two subjects are filtered by different things:
aircraft by **distance** (`radius_km`, default 50 km) and satellites by **angle** (`min_satellite_elevation_deg`, default 10°).
Neither control affects the other layer.

## Configuration

Everything is set in the root `.env`, read by compose and passed to the backend.
See `.env.example` for the full list; the ones that matter:

| Variable                                      | Default                   | Purpose                            |
| --------------------------------------------- | ------------------------- | ---------------------------------- |
| `FRONTEND_PORT` / `BACKEND_PORT`              | `51800` / `51801`         | Published host ports               |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | empty                     | See below                          |
| `CELESTRAK_GROUPS`                            | `stations,visual`         | Which satellites to track          |
| `LOG_FORMAT`                                  | `json` (`console` in dev) | Structured or human-readable logs  |
| `APP_ENV`                                     | `production`              | `development` in the override file |

### Aircraft credentials (optional)

Without credentials the aircraft layer uses OpenSky's anonymous quota, 400 credits a day, which is roughly a few hours of watching one place.
Satellites are unaffected and always work.

For a real quota (4,000/day), create an API client at
<https://opensky-network.org/my-opensky/api-clients> and put it in `.env`:

```bash
OPENSKY_CLIENT_ID=your-client-id
OPENSKY_CLIENT_SECRET=your-client-secret
```

Then `docker compose up -d --force-recreate backend`.

## Data sources and their rules

- **OpenSky** charges credits per request by bounding-box area, so a bigger radius costs more.
  Rate limits surface as HTTP 429 with `Retry-After`.
- **CelesTrak** refreshes GP data every two hours and blocks clients that pull more often.
  Do not point `CELESTRAK_GROUPS` at the full catalogue.
- **OpenStreetMap** tiles back the location picker. They need no API key and are shown unmodified.

## Known limitations

- `observation_time` moves the satellites only. Aircraft are a live-only source, so choosing a time switches them off rather than showing present-day traffic under a past timestamp.
- Satellite positions come from SGP4 and drift roughly a kilometre per day of element age; each satellite reports its own `element_age_days`.
- "Above the horizon" means the mathematical horizon at sea level. Terrain, buildings and weather are not modelled, and `is_visible` does not account for cloud or for how bright a given satellite actually is.
- Backend state is per-process and in-memory. Scaling to multiple replicas multiplies OpenSky quota use; run one.
