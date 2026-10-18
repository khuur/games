import { memo, useEffect, useEffectEvent, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { flightDuration, flightKeyframes, type Point } from './boardGeometry'

export type DiskMode = 'rest' | 'lifted' | 'dragging'

interface DiskProps {
  size: number
  /** OKLCH hue and lightness of the disk's colour. */
  hue: number
  lightness: number
  x: number
  y: number
  width: number
  height: number
  /** Position in its stack, 0 = bottom. */
  level: number
  mode: DiskMode
  liftY: number
  /** Changes when the board is resized; positions then snap instead of animating. */
  layoutKey: string
  maxDuration?: number
  reducedMotion: boolean
  hinted: boolean
  celebrating: boolean
  /** A new value shakes the disk, signalling a rejected move. */
  shakeId?: number
  onLand: (size: number) => void
}

const SQUASH: Keyframe[] = [
  { transform: 'scale(1, 1)' },
  { transform: 'scale(1.04, 0.86)', offset: 0.3 },
  { transform: 'scale(1, 1)' },
]

const SHAKE: Keyframe[] = [0, -8, 7, -5, 3, 0].map((x) => ({ translate: `${x}px 0` }))

export const Disk = memo(function Disk({
  size,
  hue,
  lightness,
  x,
  y,
  width,
  height,
  level,
  mode,
  liftY,
  layoutKey,
  maxDuration,
  reducedMotion,
  hinted,
  celebrating,
  shakeId,
  onLand,
}: DiskProps) {
  const ref = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const shown = useRef<(Point & { layoutKey: string }) | null>(null)
  const flight = useRef<Animation | null>(null)

  const land = useEffectEvent(() => {
    onLand(size)
    if (!reducedMotion) bodyRef.current?.animate(SQUASH, { duration: 260, easing: 'ease-out' })
  })

  const enter = useEffectEvent(() => {
    if (reducedMotion) return undefined
    return bodyRef.current?.animate(
      [
        { opacity: 0, translate: '0 -40px' },
        { opacity: 1, translate: '0 0' },
      ],
      { duration: 380, delay: 80 + level * 50, easing: 'cubic-bezier(0.25, 1, 0.5, 1)', fill: 'backwards' },
    )
  })

  // New games drop their disks in from above, bottom first.
  useLayoutEffect(() => {
    const animation = enter()
    return () => animation?.cancel()
  }, [])

  useLayoutEffect(() => {
    const element = ref.current
    const previous = shown.current
    shown.current = { x, y, layoutKey }
    if (!element || !previous) return
    const moved = previous.x !== x || previous.y !== y
    const relayout = previous.layoutKey !== layoutKey
    if (!moved && !relayout) return

    // Continue from wherever the disk is drawn right now, even halfway through another flight.
    let from: Point = previous
    if (flight.current) {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform)
      from = { x: matrix.m41, y: matrix.m42 }
      flight.current.onfinish = null
      flight.current.cancel()
      flight.current = null
    }
    if (relayout || mode === 'dragging') return

    const landing = mode === 'rest'
    const { keyframes, distance } = flightKeyframes(from, { x, y }, liftY)
    const duration = reducedMotion ? 0 : flightDuration(distance, maxDuration)
    if (duration < 16 || keyframes.length < 2) {
      if (landing) land()
      return
    }
    const animation = element.animate(keyframes, { duration, easing: 'cubic-bezier(0.3, 0, 0.25, 1)' })
    flight.current = animation
    animation.onfinish = () => {
      flight.current = null
      if (landing) land()
    }
  }, [x, y, mode, layoutKey, liftY, maxDuration, reducedMotion])

  useEffect(() => {
    if (shakeId === undefined || reducedMotion) return
    bodyRef.current?.animate(SHAKE, { duration: 380, easing: 'ease-in-out' })
  }, [shakeId, reducedMotion])

  const style = {
    width,
    height,
    transform: `translate(${x}px, ${y}px)`,
    zIndex: mode === 'dragging' ? 30 : mode === 'lifted' ? 20 : undefined,
    // Gradient stops are worked out here rather than with calc() in CSS, which older Safari
    // versions do not support inside oklch().
    '--hue': hue,
    '--l-top': (lightness + 0.11).toFixed(3),
    '--l-mid': lightness.toFixed(3),
    '--l-bottom': (lightness - 0.13).toFixed(3),
    '--level': level,
  } as CSSProperties

  const bodyClass = ['disk-body', hinted && 'is-hinted', celebrating && 'is-celebrating'].filter(Boolean).join(' ')

  return (
    <div ref={ref} className={`disk is-${mode}`} style={style}>
      <div ref={bodyRef} className={bodyClass}>
        {height >= 16 && <span className="disk-label">{size}</span>}
      </div>
    </div>
  )
})
