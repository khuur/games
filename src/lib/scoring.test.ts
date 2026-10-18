import { describe, expect, it } from 'vitest'
import { starRating } from './scoring'

describe('starRating', () => {
  it('gives three stars only for a perfect solve', () => {
    expect(starRating(7, 7)).toBe(3)
    expect(starRating(8, 7)).toBe(2)
    expect(starRating(11, 7)).toBe(2)
    expect(starRating(12, 7)).toBe(1)
  })

  it('leaves room for one wasted pair of moves on small puzzles', () => {
    expect(starRating(5, 3)).toBe(2)
    expect(starRating(6, 3)).toBe(1)
  })
})
