import { describe, expect, it } from 'vitest'
import {
  allCodes,
  bestGuess,
  isSolved,
  isValidCode,
  LEVELS,
  possibleCodes,
  randomCode,
  score,
  type Guess,
  type LevelDefinition,
} from './codeBreaker'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Plays the computer's strategy against a code; returns the number of guesses it took. */
function crack(level: LevelDefinition, secret: number[], random: () => number): number {
  const guesses: Guess[] = []
  while (guesses.length < 20) {
    const code = bestGuess(level, guesses, random)
    const feedback = score(secret, code)
    guesses.push({ code, feedback })
    if (isSolved(feedback, level)) return guesses.length
  }
  return Infinity
}

/** Feedback worked out the slow, obvious way: match exact pegs first, then hunt for colours. */
function slowScore(secret: number[], guess: number[]) {
  const secretLeft: (number | null)[] = [...secret]
  const guessLeft: (number | null)[] = [...guess]
  let exact = 0
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) {
      exact++
      secretLeft[i] = guessLeft[i] = null
    }
  }
  let near = 0
  for (const color of guessLeft) {
    const at = color === null ? -1 : secretLeft.indexOf(color)
    if (at >= 0) {
      near++
      secretLeft[at] = null
    }
  }
  return { exact, near }
}

describe('score', () => {
  it('counts right colours in the right and the wrong place', () => {
    expect(score([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ exact: 4, near: 0 })
    expect(score([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ exact: 0, near: 4 })
    expect(score([0, 1, 2, 3], [4, 4, 0, 0])).toEqual({ exact: 0, near: 1 })
    expect(score([0, 0, 1, 1], [0, 1, 0, 1])).toEqual({ exact: 2, near: 2 })
    expect(score([1, 1, 2, 2], [1, 1, 1, 1])).toEqual({ exact: 2, near: 0 })
    expect(score([5, 4, 3, 2, 1], [6, 7, 6, 7, 6])).toEqual({ exact: 0, near: 0 })
  })

  it('agrees with a slow reference on random codes', () => {
    const random = seededRandom(1)
    for (let i = 0; i < 2000; i++) {
      const secret = randomCode(LEVELS.hard, random)
      const guess = randomCode(LEVELS.hard, random)
      expect(score(secret, guess)).toEqual(slowScore(secret, guess))
    }
  })
})

describe('codes', () => {
  it('lists every code a level allows', () => {
    expect(allCodes(LEVELS.easy)).toHaveLength(6 * 5 * 4 * 3)
    expect(allCodes(LEVELS.classic)).toHaveLength(6 ** 4)
    expect(allCodes(LEVELS.hard)).toHaveLength(8 ** 5)
    expect(new Set(allCodes(LEVELS.classic).map((code) => code.join())).size).toBe(6 ** 4)
  })

  it('only repeats colours where the level allows it', () => {
    expect(isValidCode(LEVELS.easy, [0, 1, 2, 3])).toBe(true)
    expect(isValidCode(LEVELS.easy, [0, 1, 1, 3])).toBe(false)
    expect(isValidCode(LEVELS.classic, [0, 1, 1, 3])).toBe(true)
    expect(isValidCode(LEVELS.classic, [0, 1, 6, 3])).toBe(false)
    expect(isValidCode(LEVELS.classic, [0, 1, 2])).toBe(false)
    expect(isValidCode(LEVELS.hard, [7, 7, 7, 7, 7])).toBe(true)
    expect(isValidCode(LEVELS.hard, [0, 1, 2, 3, 1.5])).toBe(false)
    const random = seededRandom(2)
    for (let i = 0; i < 200; i++) expect(isValidCode(LEVELS.easy, randomCode(LEVELS.easy, random))).toBe(true)
  })

  it('keeps exactly the codes that fit every answer', () => {
    const level = LEVELS.classic
    const secret = [2, 2, 5, 0]
    const guesses: Guess[] = [[0, 0, 1, 1], [2, 3, 4, 5]].map((code) => ({ code, feedback: score(secret, code) }))
    const left = possibleCodes(level, guesses)
    expect(left.some((code) => code.join() === secret.join())).toBe(true)
    const brute = allCodes(level).filter((code) =>
      guesses.every((guess) => {
        const result = slowScore(code, guess.code)
        return result.exact === guess.feedback.exact && result.near === guess.feedback.near
      }),
    )
    expect(left).toEqual(brute)
  })
})

describe('bestGuess', () => {
  it('opens with the level opening', () => {
    expect(bestGuess(LEVELS.classic, [])).toEqual([0, 0, 1, 1])
  })

  it('names the code once only one fits', () => {
    const secret = [3, 1, 4, 1]
    const guesses: Guess[] = []
    const random = seededRandom(3)
    while (possibleCodes(LEVELS.classic, guesses).length > 1) {
      const code = bestGuess(LEVELS.classic, guesses, random)
      guesses.push({ code, feedback: score(secret, code) })
    }
    expect(bestGuess(LEVELS.classic, guesses)).toEqual(secret)
  })

  it('cracks every Easy code within par', () => {
    const random = seededRandom(4)
    const worst = Math.max(...allCodes(LEVELS.easy).map((secret) => crack(LEVELS.easy, secret, random)))
    expect(worst).toBeLessThanOrEqual(LEVELS.easy.par)
  })

  it('cracks Classic codes within par', () => {
    const random = seededRandom(5)
    const codes = allCodes(LEVELS.classic)
    for (let i = 0; i < 150; i++) {
      const secret = codes[Math.floor(random() * codes.length)]
      expect(crack(LEVELS.classic, secret, random)).toBeLessThanOrEqual(LEVELS.classic.par)
    }
  })

  it('cracks Hard codes well within the guesses allowed', () => {
    const random = seededRandom(6)
    const results = Array.from({ length: 25 }, () => crack(LEVELS.hard, randomCode(LEVELS.hard, random), random))
    expect(Math.max(...results)).toBeLessThanOrEqual(LEVELS.hard.par + 1)
    expect(results.reduce((sum, count) => sum + count, 0) / results.length).toBeLessThan(6.2)
  })
})
