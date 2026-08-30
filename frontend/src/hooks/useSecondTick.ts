import { useEffect, useState } from 'react'

export function useSecondTick(enabled: boolean): string {
  const [iso, setIso] = useState(() => new Date().toISOString())

  useEffect(() => {
    if (!enabled) return
    let interval: number | undefined
    const align = window.setTimeout(() => {
      setIso(new Date().toISOString())
      interval = window.setInterval(() => setIso(new Date().toISOString()), 1000)
    }, 1000 - (Date.now() % 1000))

    return () => {
      window.clearTimeout(align)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [enabled])

  return iso
}
