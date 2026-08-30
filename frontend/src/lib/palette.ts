import type { ObjectType, SkyConditions } from '../api/types'

export const TYPE_ACCENT: Record<ObjectType, string> = {
  aircraft: '#c2461a',
  satellite: '#12855c',
}

// marks and accents are the same value
export const TYPE_MARK: Record<ObjectType, string> = TYPE_ACCENT

export const TYPE_LABEL: Record<ObjectType, string> = {
  aircraft: 'Aircraft',
  satellite: 'Satellites',
}

export const STATUS_COLOR = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const

export type SkyCondition = SkyConditions['condition']

export const SKY_GRADIENT: Record<SkyCondition, [string, string]> = {
  day: ['#eaf4ff', '#cfe4f8'],
  civil_twilight: ['#eceef9', '#d3d8ee'],
  nautical_twilight: ['#e9e9f6', '#cdcfe8'],
  astronomical_twilight: ['#e6e6f2', '#c7c9e2'],
  night: ['#e6e7ef', '#c3c6da'],
}

export const SKY_CONDITION_NOTE: Record<SkyCondition, string> = {
  day: 'Daylight: these satellites are overhead and sunlit, but the sky outshines them.',
  civil_twilight: 'Civil twilight: still too bright. Satellites appear as the sky darkens.',
  nautical_twilight: 'Nautical twilight: the best window for satellite spotting.',
  astronomical_twilight: 'Astronomical twilight: good viewing, though some are entering shadow.',
  night:
    'Full night: you are deep in the Earth’s shadow, so most satellites overhead are ' +
    'eclipsed too. Twilight is the better window.',
}
