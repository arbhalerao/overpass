import type { ObjectType } from '../api/types'
import { TYPE_MARK } from './palette'

const AIRCRAFT_D =
  'M496.079,15.928C485.804,5.652,472.131,0,457.581,0c-0.005,0-0.005,0-0.005,0c-14.561,0-28.244,5.658-38.524,15.942 l-77.59,77.582L88.678,30.329c-3.701-0.909-7.636,0.16-10.344,2.866L39.832,71.697c-2.51,2.505-3.637,6.079-3.031,9.573 c0.612,3.494,2.882,6.472,6.095,7.982l205.926,96.911l-91.848,91.848L34.354,295.869c-2.324,0.34-4.473,1.42-6.132,3.079 L3.19,323.975c-2.712,2.712-3.797,6.653-2.856,10.37c0.941,3.723,3.771,6.674,7.445,7.77l107.063,31.903l20.778,20.772 l34.312,109.573c1.138,3.637,4.095,6.414,7.791,7.323c0.862,0.213,1.734,0.314,2.601,0.314c2.856,0,5.637-1.122,7.701-3.191 l25.027-25.032c1.659-1.659,2.739-3.808,3.079-6.132l17.858-122.618l91.226-91.231l89.769,197.475 c1.479,3.255,4.456,5.573,7.972,6.212c3.489,0.633,7.121-0.489,9.642-3.016l38.508-38.508c2.654-2.654,3.755-6.488,2.914-10.152 l-56.403-244.407l78.447-78.449C517.303,71.71,517.313,37.156,496.079,15.928z M480.661,77.547l-82.717,82.717 c-2.654,2.654-3.755,6.488-2.914,10.152l56.403,244.407l-23.123,23.128l-89.769-197.475c-1.479-3.255-4.456-5.573-7.972-6.212 c-3.499-0.638-7.121,0.489-9.642,3.015L216.029,342.178c-1.659,1.659-2.739,3.808-3.079,6.132l-17.858,122.618l-9.748,9.759 l-29.739-94.959c-0.521-1.675-1.446-3.201-2.691-4.446l-24.617-24.617c-1.276-1.282-2.856-2.223-4.589-2.739l-92.194-27.468 l9.551-9.551l122.624-17.858c2.324-0.34,4.473-1.42,6.132-3.079l105.361-105.361c2.51-2.505,3.638-6.078,3.031-9.572 c-0.612-3.494-2.888-6.472-6.095-7.982L66.193,76.143l23.182-23.187l252.783,63.195c3.723,0.931,7.637-0.154,10.344-2.866 l81.951-81.946c6.169-6.169,14.38-9.567,23.123-9.567c8.738,0,16.943,3.393,23.101,9.551 C493.414,44.064,493.409,64.799,480.661,77.547z'

const SATELLITE_D =
  'M17.135,12.37a5.447,5.447,0,0,0,3.42-1.2.982.982,0,0,0,.37-.72,1.04,1.04,0,0,0-.31-.8l-2.78-2.78c.39-.39.8-.8,1.19-1.2.08-.07.15-.14.23-.22a.511.511,0,0,0,0-.7.5.5,0,0,0-.71,0c-.48.47-.94.94-1.42,1.41l-2.78-2.78a1.077,1.077,0,0,0-.8-.31,1,1,0,0,0-.72.37,5.454,5.454,0,0,0-1.19,3.67l-1.45,1.46L7.855,6.24a.978.978,0,0,0-1.41,0L3.365,9.32a1,1,0,0,0,0,1.41L5.7,13.06l-.41.4a2.65,2.65,0,0,0,0,3.74L6.8,18.71a2.632,2.632,0,0,0,3.74,0l.4-.4,2.33,2.33a1,1,0,0,0,1.41,0l3.08-3.09a1,1,0,0,0,0-1.41l-2.32-2.32,1.45-1.46A2.09,2.09,0,0,0,17.135,12.37ZM4.065,10.03l3.09-3.09,2.32,2.33L6.4,12.35Zm12.99,6.82-3.08,3.08-2.33-2.33,3.08-3.08Zm-5.23-8.51a5.482,5.482,0,0,0,3.84,3.83l-5.84,5.84a1.642,1.642,0,0,1-2.32,0l-1.52-1.52a1.642,1.642,0,0,1,0-2.32Zm2.12,1.71a4.417,4.417,0,0,1-.3-5.96l3.13,3.13,3.14,3.14.02.03A4.5,4.5,0,0,1,13.945,10.05Z'

interface Glyph {
  d: string
  fit: string
  fill: number
  strokeUnit: number
  weight: number
}

export const GLYPH: Record<ObjectType, Glyph> = {
  aircraft: {
    d: AIRCRAFT_D,
    fit: 'scale(0.039063) translate(-256 -256)',
    fill: 0.85,
    strokeUnit: 25.6,
    weight: 0.6,
  },
  satellite: {
    d: SATELLITE_D,
    fit: 'scale(0.833333) translate(-12 -12)',
    fill: 1.25,
    strokeUnit: 1.2,
    weight: 0.55,
  },
}

// `scale` is relative to the glyph's own inline size, so 1 matches GlyphFor.
export function glyphTransform(
  type: ObjectType,
  scale = 1,
  rotateDeg = 0,
): string {
  const spin = rotateDeg ? `rotate(${rotateDeg}) ` : ''
  return `${spin}scale(${GLYPH[type].fill * scale}) ${GLYPH[type].fit}`.trim()
}

// Stroke widths are scaled by the transform, so express them in source units.
export function glyphStroke(type: ObjectType, scale = 1, width = 1.1): number {
  return (width * GLYPH[type].strokeUnit) / (GLYPH[type].fill * scale)
}

// what a mark drops to when the thing is there but not showing: an eclipsed
// satellite, or a legend swatch standing for a count rather than a craft
export const FADED_OPACITY = 0.4

// aircraft.svg is drawn nose-northeast rather than nose-up, so anything applying
// a true bearing has to take that back out first
export const AIRCRAFT_DRAWN_AT = 45

// Both glyphs are line art, so every use lays a stroke over the fill in the same
// paint to hold the drawing together once the transform has scaled it down.
export function glyphPaint(
  type: ObjectType,
  scale = 1,
  color?: string,
  rotateDeg = 0,
) {
  const paint = color ?? TYPE_MARK[type]
  return {
    d: GLYPH[type].d,
    transform: glyphTransform(type, scale, rotateDeg),
    fill: paint,
    stroke: paint,
    strokeWidth: glyphStroke(type, scale, GLYPH[type].weight),
    strokeLinejoin: 'round' as const,
  }
}
