# Overpass frontend

React + Vite + TypeScript client for the [Overpass API](../backend/README.md).
Two radar dials over one live WebSocket subscription, one for aircraft and one for satellites.

Run it with the rest of the stack via [`docker compose`](../README.md); this file covers the frontend itself.

## Running standalone

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

The dev server proxies `/api` and `/ws` to `http://127.0.0.1:8000`,
so a backend running on its default port needs no configuration at all.
Point it elsewhere with:

```bash
BACKEND_ORIGIN=http://192.168.1.20:8000 npm run dev
```

| Script            | What it does                                 |
| ----------------- | -------------------------------------------- |
| `npm run dev`     | Vite dev server with HMR                     |
| `npm run build`   | Type-check (`tsc -b`) then bundle to `dist/` |
| `npm run preview` | Serve the built bundle locally               |
| `npm run lint`    | oxlint                                       |

### Talking to an API on another origin

The production image serves the bundle through nginx, which proxies `/api` and `/ws` to the backend: one origin, no CORS.
If you host the static bundle apart from the API, build with an absolute origin instead:

```bash
VITE_API_BASE_URL=https://overpass-api.example.com npm run build
```

`src/api/config.ts` derives the WebSocket URL from it,
and the backend's `CORS_ORIGINS` then has to include wherever the bundle is served from.

## Decisions worth knowing

**Both dials share an instrument, not a projection.**
The satellite dial is alt-az; the aircraft dial is a plan view,
because aircraft at cruise all sit near the horizon and an alt-az dial crushes them onto the rim (94% outside 0.8R at a 120 km radius).
`RadarDial` owns the chrome: range rings, bearing ticks, crosshair, compass, sweep.
Each view supplies only its marks.

**Each dial sweeps along the axis it measures.**
The aircraft dial turns a beam through bearings; the satellite dial sends a ring outward through elevation.
One cycle is one refresh of that layer, so the motion reports progress rather than decorating.
It follows the socket: no sweep at all while the connection is down, and the slower cadence once the client has fallen back to polling.

**Interpolation happens here, not in the backend.**
The API reports each aircraft's state vector and the `position_time` it refers to.
`projectAircraft` dead-reckons forward along the reported track at the reported ground speed,
on a throttled `requestAnimationFrame` clock, then recomputes azimuth and elevation with the same spherical geometry the backend uses,
so the icon glides instead of jumping.
Past two minutes without a fresh fix it stops projecting and says so, because beyond that the projected position says more about the arithmetic than about the aircraft.

**Layers refresh at their own cadence.**
The socket sends only what changed, aircraft every 10 s and satellites every 5 s, and `useLiveScene` merges one layer at a time into the accumulated scene.
A low-orbit satellite crosses the sky in minutes so it genuinely needs the short interval, while aircraft cost an upstream request that is metered.

**The dome shows visibility, not just position.**
A satellite shines by reflected sunlight, so being overhead is not the same as being seeable.
Ones you could genuinely spot right now are drawn solid and labelled; ones in the Earth's shadow are hollow.
The dome's own tint comes from the Sun's altitude at the observer, which is what makes twilight, not midnight, the good window.

## Airlines

Brand colour appears in the tooltip and the detail card, never on the marks themselves.
Painting every aircraft its own livery would put twenty-odd competing hues on one surface, most of them blue.

## Connection handling

`LiveClient` owns one socket and degrades in stages rather than showing a dead screen:

1. reconnects with exponential backoff (1 → 15 s), re-sending the subscription;
2. heartbeats every 25 s, and recycles a socket that has gone quiet for 90 s without closing, a laptop waking from sleep, or a proxy dropping the pipe;
3. after 20 s without a socket, falls back to polling `POST /api/v1/scene` every 15 s.

The badge in the header shows which state you are in; clicking it forces a reconnect.
It reads the screen rather than the plumbing, so it says `Standby` when both layers are switched off and `Set time` when the scene is computed for a chosen instant.
