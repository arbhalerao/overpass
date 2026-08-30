import { useEffect, useState } from 'react'

export function useRafTick(fps = 20, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const interval = 1000 / fps
    let frame = 0
    let last = 0

    const step = (timestamp: number) => {
      frame = requestAnimationFrame(step)
      if (timestamp - last < interval) return
      last = timestamp
      setNow(Date.now())
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [fps, enabled])

  return now
}
