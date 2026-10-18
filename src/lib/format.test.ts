import { describe, expect, it } from 'vitest'
import { formatTime, plural } from './format'

describe('formatTime', () => {
  it('shows minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(4_999)).toBe('0:04')
    expect(formatTime(83_000)).toBe('1:23')
  })

  it('adds hours when needed', () => {
    expect(formatTime(3_723_000)).toBe('1:02:03')
  })

  it('can show tenths of a second', () => {
    expect(formatTime(4_560, true)).toBe('0:04.5')
    expect(formatTime(60_000, true)).toBe('1:00.0')
  })

  it('never shows negative time', () => {
    expect(formatTime(-500, true)).toBe('0:00.0')
  })
})

describe('plural', () => {
  it('only pluralises counts other than one', () => {
    expect(plural(1, 'move')).toBe('1 move')
    expect(plural(0, 'move')).toBe('0 moves')
    expect(plural(7, 'hint')).toBe('7 hints')
  })

  it('accepts an irregular plural', () => {
    expect(plural(2, 'press', 'presses')).toBe('2 presses')
    expect(plural(1, 'press', 'presses')).toBe('1 press')
  })
})
