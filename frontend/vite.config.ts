import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The dev server proxies to the Overpass backend so the browser talks to a single origin and CORS never enters the picture.
 *
 *   bare metal   BACKEND_ORIGIN defaults to http://127.0.0.1:8000
 *   compose dev  BACKEND_ORIGIN=http://backend:8000 (see docker-compose.override.yml)
 *
 * In the production image nginx does the same proxying, so the bundle is built with no absolute API origin at all.
 * VITE_API_BASE_URL exists for the case where the static bundle is hosted apart from the API.
 */
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000'

/** Host port the dev server is published on, so HMR can find its way back. */
const HMR_CLIENT_PORT = Number(process.env.HMR_CLIENT_PORT ?? 5173)

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on all interfaces so the container is reachable from the host
    host: true,
    strictPort: true,
    hmr: { clientPort: HMR_CLIENT_PORT },
    // Bind mounts on some filesystems don't deliver inotify events; polling is the reliable fallback inside a container
    watch: process.env.CHOKIDAR_USEPOLLING
      ? { usePolling: true, interval: 300 }
      : undefined,
    proxy: {
      '/api': { target: BACKEND_ORIGIN, changeOrigin: true },
      '/ws': { target: BACKEND_ORIGIN, changeOrigin: true, ws: true },
    },
  },
  preview: { port: 4173, host: true },
  build: { outDir: 'dist', sourcemap: true },
})
