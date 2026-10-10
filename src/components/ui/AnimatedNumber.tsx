/**
 * AnimatedNumber — smoothly ticks a numeric value up/down when it changes.
 * Used for balance displays so new incoming USDC feels alive.
 */
import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  decimals?: number
  duration?: number   // ms
  prefix?: string
  suffix?: string
  style?: React.CSSProperties
  className?: string
}

export function AnimatedNumber({
  value,
  decimals = 2,
  duration = 600,
  prefix = '',
  suffix = '',
  style,
  className,
}: Props) {
  const [displayed, setDisplayed] = useState(value)
  const prevRef = useRef(value)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    if (from === to) return

    prevRef.current = to

    const start = performance.now()

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(from + (to - from) * eased)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        setDisplayed(to)
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  return (
    <span style={style} className={className}>
      {prefix}{displayed.toFixed(decimals)}{suffix}
    </span>
  )
}
