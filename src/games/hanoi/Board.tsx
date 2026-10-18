import { Flag } from 'lucide-react'
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { GOAL_TOWER, START_TOWER, TOWER_COUNT, topDisk, validateMove, type Move, type Towers } from './hanoi'
import { useElementSize } from '../../hooks/useElementSize'
import { clamp, computeGeometry, type Point } from './boardGeometry'
import { Disk, type DiskMode } from './Disk'
import { HintArrow } from './HintArrow'
import './Board.css'

export interface RejectedMove {
  id: number
  tower: number
  /** The disk that was refused, if any. */
  disk?: number
}

interface BoardProps {
  towers: Towers
  diskCount: number
  gameId: number
  selected: number | null
  hint: Move | null
  locked: boolean
  won: boolean
  rejected: RejectedMove | null
  maxMoveDuration?: number
  reducedMotion: boolean
  onTowerActivate: (tower: number) => void
  onDragStart: (tower: number) => void
  onDrop: (from: number, to: number) => void
  onDiskLand: (size: number) => void
}

/** A press on a tower that may turn into a drag once the pointer travels far enough. */
interface Gesture {
  pointerId: number
  from: number
  disk: number
  origin: Point
  startX: number
  startY: number
  threshold: number
  active: boolean
}

interface Drag {
  from: number
  disk: number
  position: Point
  over: number
}

const TOWERS = Array.from({ length: TOWER_COUNT }, (_, tower) => tower)

/** A rainbow from red (smallest disk) to purple (largest), as OKLCH hue and lightness. */
function diskColor(size: number, diskCount: number) {
  const hue = diskCount > 1 ? 25 + ((size - 1) * 295) / (diskCount - 1) : 25
  // Yellows and greens turn muddy unless they are lighter than the other hues.
  const yellowness = Math.max(0, 1 - Math.abs(hue - 105) / 50)
  return { hue, lightness: 0.72 + 0.12 * yellowness }
}

export function Board({
  towers,
  diskCount,
  gameId,
  selected,
  hint,
  locked,
  won,
  rejected,
  maxMoveDuration,
  reducedMotion,
  onTowerActivate,
  onDragStart,
  onDrop,
  onDiskLand,
}: BoardProps) {
  const [boardRef, size] = useElementSize<HTMLDivElement>()
  const towerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const gesture = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const [dragState, setDrag] = useState<Drag | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  const geometry = useMemo(
    () => (size && size.width > 0 && size.height > 0 ? computeGeometry(size.width, size.height, diskCount) : null),
    [size, diskCount],
  )
  const drag = locked ? null : dragState
  const source = drag ? drag.from : selected
  const sourceDisk = source === null ? undefined : topDisk(towers[source])
  const previewTower = drag ? drag.over : selected !== null ? hovered : null
  const canDropOn = (tower: number) =>
    source !== null && tower !== source && validateMove(towers, { from: source, to: tower }) === null

  const towerAt = (clientX: number) => {
    const rect = boardRef.current!.getBoundingClientRect()
    return clamp(Math.floor(((clientX - rect.left) / rect.width) * TOWER_COUNT), 0, TOWER_COUNT - 1)
  }

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, tower: number) => {
    suppressClick.current = false
    if (locked || !geometry || gesture.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const disk = topDisk(towers[tower])
    if (disk === undefined) return
    const origin =
      selected === tower
        ? geometry.liftedPosition(disk, tower)
        : geometry.restPosition(disk, tower, towers[tower].length - 1)
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = {
      pointerId: event.pointerId,
      from: tower,
      disk,
      origin,
      startX: event.clientX,
      startY: event.clientY,
      threshold: event.pointerType === 'mouse' ? 5 : 10,
      active: false,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId || !geometry) return
    if (locked) {
      gesture.current = null
      setDrag(null)
      return
    }
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!current.active) {
      if (Math.hypot(dx, dy) < current.threshold) return
      current.active = true
      onDragStart(current.from)
    }
    const width = geometry.diskWidth(current.disk)
    setDrag({
      from: current.from,
      disk: current.disk,
      position: {
        x: clamp(current.origin.x + dx, -width / 2, geometry.width - width / 2),
        y: clamp(current.origin.y + dy, -geometry.diskHeight, geometry.height - geometry.diskHeight),
      },
      over: towerAt(event.clientX),
    })
  }

  const finishGesture = (event: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    gesture.current = null
    if (!current.active) return
    // The browser follows a drag with a click on the tower it started from; ignore that one.
    suppressClick.current = true
    setDrag(null)
    if (!cancelled && !locked) onDrop(current.from, towerAt(event.clientX))
  }

  const handleClick = (tower: number) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (!locked) onTowerActivate(tower)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tower: number) => {
    const target = {
      ArrowLeft: (tower + TOWER_COUNT - 1) % TOWER_COUNT,
      ArrowRight: (tower + 1) % TOWER_COUNT,
      Home: 0,
      End: TOWER_COUNT - 1,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    towerRefs.current[target]?.focus()
  }

  const towerLabel = (tower: number) => {
    const stack = towers[tower]
    const name = `Tower ${tower + 1}${tower === GOAL_TOWER ? ' (goal)' : ''}`
    const contents =
      stack.length === 0
        ? 'empty'
        : `${stack.length} disk${stack.length === 1 ? '' : 's'}, top disk ${topDisk(stack)}`
    let action = ''
    if (selected === tower) action = '. Disk picked up, press again to put it back'
    else if (selected !== null) action = canDropOn(tower) ? `. Place disk ${sourceDisk} here` : '. Cannot place here'
    return `${name}: ${contents}${action}`
  }

  const disks = geometry
    ? towers
        .flatMap((stack, tower) =>
          stack.map((disk, level) => {
            let mode: DiskMode = 'rest'
            let position = geometry.restPosition(disk, tower, level)
            if (drag?.disk === disk) {
              mode = 'dragging'
              position = drag.position
            } else if (selected === tower && level === stack.length - 1) {
              mode = 'lifted'
              position = geometry.liftedPosition(disk, tower)
            }
            return { disk, tower, level, mode, position }
          }),
        )
        // Smaller disks are drawn last, so their shadows fall on the disks below.
        .sort((a, b) => b.disk - a.disk)
    : []

  const ghost =
    geometry && sourceDisk !== undefined && previewTower !== null && canDropOn(previewTower)
      ? { ...geometry.restPosition(sourceDisk, previewTower, towers[previewTower].length), ...diskColor(sourceDisk, diskCount) }
      : null

  const layoutKey = geometry ? `${geometry.width}x${geometry.height}/${diskCount}` : ''
  const boardClass = ['board', drag && 'is-dragging', locked && 'is-locked'].filter(Boolean).join(' ')

  return (
    <div
      ref={boardRef}
      className={boardClass}
      role="group"
      aria-label="Towers"
      style={geometry ? ({ '--disk-h': `${geometry.diskHeight}px` } as CSSProperties) : undefined}
      onContextMenu={(event) => event.preventDefault()}
    >
      {geometry && (
        <>
          {TOWERS.map((tower) => {
            const className = [
              'tower',
              towers[tower].length > 0 && 'has-disks',
              tower === source && 'is-source',
              tower === previewTower && 'is-over',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={tower}
                ref={(element) => {
                  towerRefs.current[tower] = element
                }}
                type="button"
                className={className}
                data-drop={source !== null && tower !== source ? (canDropOn(tower) ? 'valid' : 'invalid') : undefined}
                style={{ left: tower * geometry.slotWidth, width: geometry.slotWidth }}
                aria-label={towerLabel(tower)}
                aria-disabled={locked || undefined}
                onPointerDown={(event) => handlePointerDown(event, tower)}
                onPointerMove={handlePointerMove}
                onPointerUp={(event) => finishGesture(event, false)}
                onPointerCancel={(event) => finishGesture(event, true)}
                onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(tower)}
                onPointerLeave={(event) =>
                  event.pointerType === 'mouse' && setHovered((current) => (current === tower ? null : current))
                }
                onClick={() => handleClick(tower)}
                onKeyDown={(event) => handleKeyDown(event, tower)}
              >
                {rejected?.tower === tower && <span key={rejected.id} className="tower-flash" />}
              </button>
            )
          })}

          <div
            className="board-base"
            style={{
              left: geometry.baseInset,
              width: geometry.width - 2 * geometry.baseInset,
              top: geometry.baseTop,
              height: geometry.baseHeight,
            }}
          />
          {TOWERS.map((tower) => (
            <div
              key={tower}
              className={`peg${tower === GOAL_TOWER ? ' is-goal' : ''}`}
              style={{
                left: geometry.towerCenter(tower) - geometry.pegWidth / 2,
                width: geometry.pegWidth,
                top: geometry.pegTop,
                height: geometry.baseTop - geometry.pegTop + 2,
              }}
            />
          ))}
          {TOWERS.map((tower) => (
            <div
              key={tower}
              className="tower-label"
              style={{ left: tower * geometry.slotWidth, width: geometry.slotWidth, top: geometry.labelTop }}
              aria-hidden="true"
            >
              <kbd>{tower + 1}</kbd>
              {tower === START_TOWER && <span>Start</span>}
              {tower === GOAL_TOWER && (
                <span className="goal-label">
                  <Flag size={14} strokeWidth={2.5} /> Goal
                </span>
              )}
            </div>
          ))}

          {ghost && sourceDisk !== undefined && (
            <div
              className="disk-ghost"
              style={
                {
                  width: geometry.diskWidth(sourceDisk),
                  height: geometry.diskHeight,
                  transform: `translate(${ghost.x}px, ${ghost.y}px)`,
                  '--hue': ghost.hue,
                  '--l-mid': ghost.lightness.toFixed(3),
                } as CSSProperties
              }
            />
          )}

          <div key={gameId} className="disk-layer" aria-hidden="true">
            {disks.map(({ disk, tower, level, mode, position }) => (
              <Disk
                key={disk}
                size={disk}
                {...diskColor(disk, diskCount)}
                x={position.x}
                y={position.y}
                width={geometry.diskWidth(disk)}
                height={geometry.diskHeight}
                level={level}
                mode={mode}
                liftY={geometry.liftY}
                layoutKey={layoutKey}
                maxDuration={maxMoveDuration}
                reducedMotion={reducedMotion}
                hinted={hint !== null && hint.from === tower && level === towers[tower].length - 1}
                celebrating={won && tower === GOAL_TOWER}
                shakeId={rejected?.disk === disk ? rejected.id : undefined}
                onLand={onDiskLand}
              />
            ))}
          </div>

          {hint && !drag && <HintArrow geometry={geometry} hint={hint} />}
        </>
      )}
    </div>
  )
}
