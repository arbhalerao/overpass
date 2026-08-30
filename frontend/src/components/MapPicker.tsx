import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import type { Observer } from '../api/types'
import terminator from '@joergdietrich/leaflet.terminator'

interface Props {
  center: Observer | null
  radiusKm: number
  onPick: (center: Observer) => void
}

export function MapPicker({ center, radiusKm, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const nightRef = useRef<ReturnType<typeof terminator> | null>(null)
  const pickRef = useRef(onPick)
  useEffect(() => {
    pickRef.current = onPick
  }, [onPick])

  const initialRef = useRef({ center, radiusKm })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { center: start, radiusKm: startRadius } = initialRef.current

    const map = L.map(container, {
      center: start ? [start.latitude, start.longitude] : OPENING_VIEW,
      zoom: start ? zoomForSize(startRadius) : OPENING_ZOOM,
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
      // one world, and no zooming out past what the tiles cover
      minZoom: 2,
      maxBounds: [
        [-85, -180],
        [85, 180],
      ],
      maxBoundsViscosity: 1,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
      noWrap: true,
    }).addTo(map)

    const night = terminator({
      stroke: false,
      fillColor: '#10182a',
      fillOpacity: 0.16,
      interactive: false,
    }).addTo(map)
    nightRef.current = night
    const nightTimer = window.setInterval(() => night.setTime(new Date()), 60_000)

    const icon = L.divIcon({
      className: 'map-pin',
      html: '<span class="map-pin__dot"></span>',
      iconSize: [8, 8],
      iconAnchor: [4, 4],
    })

    const marker = L.marker(start ? [start.latitude, start.longitude] : OPENING_VIEW, {
      icon,
      draggable: true,
      keyboard: true,
      title: 'Drag to move the observer',
    })
    if (start) marker.addTo(map)

    marker.on('dragend', () => {
      const position = marker.getLatLng()
      pickRef.current({ latitude: clampLat(position.lat), longitude: wrapLon(position.lng) })
    })

    map.on('click', (event: L.LeafletMouseEvent) => {
      pickRef.current({
        latitude: clampLat(event.latlng.lat),
        longitude: wrapLon(event.latlng.lng),
      })
    })

    mapRef.current = map
    markerRef.current = marker

    const settle = window.setTimeout(() => map.invalidateSize(), 220)
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)

    return () => {
      window.clearTimeout(settle)
      observer.disconnect()
      map.remove()
      mapRef.current = null
      window.clearInterval(nightTimer)
      markerRef.current = null
      circleRef.current = null
      nightRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return

    if (!center) {
      marker.remove()
      return
    }
    marker.addTo(map)

    const target = L.latLng(center.latitude, center.longitude)
    marker.setLatLng(target)
    if (map.distance(target, map.getCenter()) > radiusKm * 500) {
      map.panTo(target, { animate: true })
    }
  }, [center, radiusKm])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!center) {
      circleRef.current?.remove()
      circleRef.current = null
      return
    }

    const latlng = L.latLng(center.latitude, center.longitude)

    if (circleRef.current) {
      circleRef.current.setLatLng(latlng)
      circleRef.current.setRadius(radiusKm * 1000)
    } else {
      circleRef.current = L.circle(latlng, {
        radius: radiusKm * 1000,
        color: '#10182a',
        weight: 1.5,
        opacity: 0.7,
        fillColor: '#10182a',
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(map)
    }

  }, [radiusKm, center])

  return (
    <div
      ref={containerRef}
      className="map-picker"
      role="application"
      aria-label="Map for choosing the observer location"
    />
  )
}

const OPENING_VIEW: [number, number] = [39.5, -79]
const OPENING_ZOOM = 4

function zoomForSize(sizeKm: number): number {
  if (sizeKm <= 5) return 12
  if (sizeKm <= 20) return 10
  if (sizeKm <= 60) return 9
  if (sizeKm <= 150) return 8
  if (sizeKm <= 300) return 7
  return 6
}

function clampLat(value: number): number {
  return Math.max(-90, Math.min(90, Number(value.toFixed(6))))
}

function wrapLon(value: number): number {
  const wrapped = (((value + 180) % 360) + 360) % 360 - 180
  return Number(wrapped.toFixed(6))
}
