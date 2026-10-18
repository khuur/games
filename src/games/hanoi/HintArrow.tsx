import { useId } from 'react'
import type { Move } from './hanoi'
import type { BoardGeometry } from './boardGeometry'

/** A dashed arc from one peg to another, drawn above the pegs. */
export function HintArrow({ geometry, hint }: { geometry: BoardGeometry; hint: Move }) {
  const markerId = `hint-head-${useId().replace(/[^\w-]/g, '')}`
  const direction = Math.sign(hint.to - hint.from)
  const inset = Math.min(geometry.slotWidth * 0.12, 18) * direction
  const from = geometry.towerCenter(hint.from) + inset
  const to = geometry.towerCenter(hint.to) - inset
  const y = geometry.pegTop - geometry.diskHeight * 0.3
  const apex = geometry.liftY + geometry.diskHeight * 0.15
  // A quadratic curve peaks halfway between its ends and its control point.
  const control = 2 * apex - y

  return (
    <svg className="hint-arrow" width={geometry.width} height={geometry.height} aria-hidden="true">
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="4"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
      <path d={`M ${from} ${y} Q ${(from + to) / 2} ${control} ${to} ${y}`} markerEnd={`url(#${markerId})`} />
    </svg>
  )
}
