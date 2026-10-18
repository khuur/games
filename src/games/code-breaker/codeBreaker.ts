/**
 * Code Breaker rules (the classic game of Mastermind). The computer hides a row of coloured pegs;
 * every guess is marked with how many pegs are the right colour in the right place, and how many
 * more are a right colour in the wrong place.
 */

export type Code = readonly number[]
export type LevelId = 'easy' | 'classic' | 'hard'

export interface Feedback {
  /** Right colour, right place. */
  exact: number
  /** Right colour, wrong place. */
  near: number
}

export interface Guess {
  code: number[]
  feedback: Feedback
}

export interface LevelDefinition {
  id: LevelId
  name: string
  pegs: number
  colors: number
  /** Whether a colour may appear more than once in the code. */
  repeats: boolean
  guesses: number
  /**
   * The most guesses the computer's own strategy needs on this level (checked against every code on
   * the smaller levels, and a large sample on Hard); three stars for matching it.
   */
  par: number
  /** A strong first guess, worked out once rather than at every game. */
  opening: number[]
}

export const LEVELS: Record<LevelId, LevelDefinition> = {
  easy: { id: 'easy', name: 'Easy', pegs: 4, colors: 6, repeats: false, guesses: 10, par: 5, opening: [0, 1, 2, 3] },
  classic: { id: 'classic', name: 'Classic', pegs: 4, colors: 6, repeats: true, guesses: 10, par: 5, opening: [0, 0, 1, 1] },
  hard: { id: 'hard', name: 'Hard', pegs: 5, colors: 8, repeats: true, guesses: 12, par: 7, opening: [0, 0, 1, 1, 2] },
}

export const LEVEL_IDS: readonly LevelId[] = ['easy', 'classic', 'hard']
export const DEFAULT_LEVEL: LevelId = 'classic'

export function isLevelId(value: unknown): value is LevelId {
  return value === 'easy' || value === 'classic' || value === 'hard'
}

/** Pegs left over after the exact matches, counted per colour; shared to keep scoring allocation-free. */
const secretLeft = new Uint8Array(10)
const guessLeft = new Uint8Array(10)

/** The feedback as one number (exact × 10 + near), which is what the solver compares. */
function scoreKey(secret: Code, guess: Code): number {
  secretLeft.fill(0)
  guessLeft.fill(0)
  let exact = 0
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) exact++
    else {
      secretLeft[secret[i]]++
      guessLeft[guess[i]]++
    }
  }
  let near = 0
  for (let color = 0; color < 10; color++) near += Math.min(secretLeft[color], guessLeft[color])
  return exact * 10 + near
}

export function score(secret: Code, guess: Code): Feedback {
  const key = scoreKey(secret, guess)
  return { exact: Math.floor(key / 10), near: key % 10 }
}

export function isValidCode(level: LevelDefinition, code: readonly unknown[]): code is number[] {
  if (code.length !== level.pegs) return false
  if (!code.every((peg) => Number.isInteger(peg) && (peg as number) >= 0 && (peg as number) < level.colors)) return false
  return level.repeats || new Set(code).size === code.length
}

const allCodesCache = new Map<LevelId, number[][]>()

/** Every code the level allows. */
export function allCodes(level: LevelDefinition): number[][] {
  const cached = allCodesCache.get(level.id)
  if (cached) return cached
  const codes: number[][] = []
  const build = (prefix: number[]) => {
    if (prefix.length === level.pegs) {
      codes.push(prefix)
      return
    }
    for (let color = 0; color < level.colors; color++) {
      if (!level.repeats && prefix.includes(color)) continue
      build([...prefix, color])
    }
  }
  build([])
  allCodesCache.set(level.id, codes)
  return codes
}

export function randomCode(level: LevelDefinition, random: () => number = Math.random): number[] {
  const codes = allCodes(level)
  return codes[Math.floor(random() * codes.length)].slice()
}

/** Codes that would have produced exactly the feedback seen so far. */
export function possibleCodes(level: LevelDefinition, guesses: readonly Guess[]): number[][] {
  const keys = guesses.map(({ feedback }) => feedback.exact * 10 + feedback.near)
  return allCodes(level).filter((code) => guesses.every(({ code: guess }, i) => scoreKey(code, guess) === keys[i]))
}

function sample<T>(items: readonly T[], count: number, random: () => number): T[] {
  if (items.length <= count) return items.slice()
  const picked = new Set<number>()
  while (picked.size < count) picked.add(Math.floor(random() * items.length))
  return [...picked].map((index) => items[index])
}

/**
 * A strong next guess (Knuth's minimax rule): the guess whose worst possible answer leaves the
 * fewest codes in play, preferring guesses that could be the code itself. On the big hard level
 * both the guesses and the codes are sampled, which keeps it quick.
 */
export function bestGuess(level: LevelDefinition, guesses: readonly Guess[], random: () => number = Math.random): number[] {
  if (guesses.length === 0) return level.opening.slice()
  const candidates = possibleCodes(level, guesses)
  if (candidates.length === 0) return level.opening.slice()
  if (candidates.length <= 2) return candidates[0].slice()
  const everything = allCodes(level)
  const small = everything.length <= 1500
  const pool = small ? everything : [...sample(everything, 300, random), ...sample(candidates, 300, random)]
  const targets = candidates.length <= 1500 ? candidates : sample(candidates, 1500, random)
  const isCandidate = new Set(candidates.map((code) => code.join()))

  let best = candidates[0]
  let bestWorst = Infinity
  let bestIsCandidate = true
  const counts = new Uint16Array(64)
  for (const guess of pool) {
    counts.fill(0)
    let worst = 0
    for (const code of targets) {
      const count = ++counts[scoreKey(code, guess)]
      if (count > worst) worst = count
      if (worst > bestWorst) break
    }
    const candidate = isCandidate.has(guess.join())
    if (worst < bestWorst || (worst === bestWorst && candidate && !bestIsCandidate)) {
      best = guess
      bestWorst = worst
      bestIsCandidate = candidate
    }
  }
  return best.slice()
}

/** The most codes that could still fit after this guess, whatever marks it gets. */
export function worstCase(level: LevelDefinition, guesses: readonly Guess[], guess: Code): number {
  const counts = new Uint16Array(64)
  let worst = 0
  for (const code of possibleCodes(level, guesses)) worst = Math.max(worst, ++counts[scoreKey(code, guess)])
  return worst
}

export function isSolved(feedback: Feedback, level: LevelDefinition): boolean {
  return feedback.exact === level.pegs
}
