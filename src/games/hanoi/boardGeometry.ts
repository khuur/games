import { TOWER_COUNT } from './hanoi'

export interface Point {
  x: number
  y: number
}

export interface BoardGeometry {
  width: number
  height: number
  slotWidth: number
  diskHeight: number
  pegWidth: number
  pegTop: number
  baseTop: number
  baseHeight: number
  baseInset: number
  /** Top edge of a lifted disk: high enough to clear every peg. */
  liftY: number
  labelTop: number
  towerCenter: (tower: number) => number
  diskWidth: (size: number) => number
  /** Top-left corner of a disk resting at `level` (0 = bottom) on a tower. */
  restPosition: (size: number, tower: number, level: number) => Point
  liftedPosition: (size: number, tower: number) => Point
}

const TOP_PADDING = 8
const LABEL_SPACE = 40
/** Room above a full stack, in disk heights: the peg tip, a lifted disk and a small gap. */
const HEADROOM = 2.2

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Lays the scene out to fit the board, centred vertically. */
export function computeGeometry(width: number, height: number, diskCount: number): BoardGeometry {
  const slotWidth = width / TOWER_COUNT
  const baseHeight = Math.round(clamp(height * 0.03, 10, 16))
  const fit = (height - TOP_PADDING - baseHeight - LABEL_SPACE) / (diskCount + HEADROOM)
  const diskHeight = Math.floor(clamp(fit, 12, Math.min(48, slotWidth * 0.32)))
  const sceneHeight = TOP_PADDING + (diskCount + HEADROOM) * diskHeight + baseHeight + LABEL_SPACE
  const liftY = Math.round(Math.max(0, (height - sceneHeight) / 2) + TOP_PADDING)
  const baseTop = Math.round(liftY + (diskCount + HEADROOM) * diskHeight)
  const pegTop = baseTop - Math.round((diskCount + 0.7) * diskHeight)

  const maxDiskWidth = slotWidth * 0.92
  const minDiskWidth = Math.max(maxDiskWidth * 0.34, diskHeight * 1.8)
  const towerCenter = (tower: number) => slotWidth * (tower + 0.5)
  const diskWidth = (size: number) =>
    Math.round(
      diskCount > 1
        ? minDiskWidth + ((maxDiskWidth - minDiskWidth) * (size - 1)) / (diskCount - 1)
        : maxDiskWidth,
    )
  const left = (size: number, tower: number) => Math.round(towerCenter(tower) - diskWidth(size) / 2)

  return {
    width,
    height,
    slotWidth,
    diskHeight,
    pegWidth: Math.round(clamp(diskHeight * 0.3, 6, 12)),
    pegTop,
    baseTop,
    baseHeight,
    baseInset: Math.round(slotWidth * 0.04),
    liftY,
    labelTop: baseTop + baseHeight + 8,
    towerCenter,
    diskWidth,
    restPosition: (size, tower, level) => ({ x: left(size, tower), y: baseTop - (level + 1) * diskHeight }),
    liftedPosition: (size, tower) => ({ x: left(size, tower), y: liftY }),
  }
}

const CORNER_RADIUS = 28

function pushCurve(points: Point[], start: Point, corner: Point, end: Point) {
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    const u = 1 - t
    points.push({
      x: u * u * start.x + 2 * u * t * corner.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * corner.y + t * t * end.y,
    })
  }
}

/**
 * Keyframes for a disk flying between two points the way a hand would move it: straight up
 * off its peg, across above every peg, then down, with rounded corners.
 */
export function flightKeyframes(from: Point, to: Point, liftY: number) {
  const points: Point[] = [from]
  if (Math.abs(to.x - from.x) >= 1) {
    const top = Math.min(liftY, from.y, to.y)
    const direction = Math.sign(to.x - from.x)
    const halfSpan = Math.abs(to.x - from.x) / 2
    const rise = Math.min(CORNER_RADIUS, halfSpan, from.y - top)
    const fall = Math.min(CORNER_RADIUS, halfSpan, to.y - top)
    pushCurve(points, { x: from.x, y: top + rise }, { x: from.x, y: top }, { x: from.x + direction * rise, y: top })
    pushCurve(points, { x: to.x - direction * fall, y: top }, { x: to.x, y: top }, { x: to.x, y: top + fall })
  }
  points.push(to)

  const path: Point[] = []
  const distances: number[] = []
  let distance = 0
  for (const point of points) {
    const last = path[path.length - 1]
    const step = last ? Math.hypot(point.x - last.x, point.y - last.y) : 0
    if (last && step < 0.01) continue
    distance += step
    path.push(point)
    distances.push(distance)
  }

  const keyframes: Keyframe[] = path.map((point, i) => ({
    transform: `translate(${point.x}px, ${point.y}px)`,
    offset: distance > 0 ? distances[i] / distance : 0,
    zIndex: 15,
  }))
  return { keyframes, distance }
}

export function flightDuration(distance: number, maxDuration = Infinity): number {
  return Math.min(maxDuration, clamp(120 + distance * 0.45, 140, 460))
}
