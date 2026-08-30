import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import type { Observer } from '../api/types'

interface Props {
  center: Observer
  radiusKm: number
  onPick: (center: Observer) => void
}

export function MapPicker({ center, radiusKm, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
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
      center: [start.latitude, start.longitude],
      zoom: zoomForSize(startRadius),
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    const icon = L.divIcon({
      className: 'map-pin',
      html: '<span class="map-pin__dot"></span><span class="map-pin__pulse"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })

    const marker = L.marker([start.latitude, start.longitude], {
      icon,
      draggable: true,
      keyboard: true,
      title: 'Drag to move the observer',
    }).addTo(map)

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
      markerRef.current = null
      circleRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return

    const target = L.latLng(center.latitude, center.longitude)
    marker.setLatLng(target)
    if (map.distance(target, map.getCenter()) > radiusKm * 500) {
      map.panTo(target, { animate: true })
    }
  }, [center.latitude, center.longitude, radiusKm])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    circleRef.current?.remove()
    circleRef.current = L.circle([center.latitude, center.longitude], {
      radius: radiusKm * 1000,
      color: '#c2461a',
      weight: 1.5,
      opacity: 0.9,
      fillColor: '#c2461a',
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(map)
  }, [radiusKm, center.latitude, center.longitude])

  return (
    <div
      ref={containerRef}
      className="map-picker"
      role="application"
      aria-label="Map for choosing the observer location"
    />
  )
}

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
