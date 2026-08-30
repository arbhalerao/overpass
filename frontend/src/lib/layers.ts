import type { LayerName, ObjectType } from '../api/types'

export const LAYER_ORDER: readonly LayerName[] = ['satellites', 'aircraft']

export const TYPE_ORDER: readonly ObjectType[] = ['satellite', 'aircraft']

export const LAYER_OF: Record<ObjectType, LayerName> = {
  satellite: 'satellites',
  aircraft: 'aircraft',
}

export function byLayerOrder<T>(items: T[], nameOf: (item: T) => string): T[] {
  const rank = (name: string) => {
    const index = LAYER_ORDER.indexOf(name as LayerName)
    return index === -1 ? LAYER_ORDER.length : index
  }
  return [...items].sort((a, b) => rank(nameOf(a)) - rank(nameOf(b)))
}
