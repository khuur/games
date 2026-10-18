/**
 * Tiny synthesized sound effects, so the games ship without audio files.
 * Moves play notes of the pentatonic scale, which makes any sequence of them (including an
 * auto-solver at full speed) sound like a little melody.
 */

interface NoteOptions {
  type?: OscillatorType
  /** Seconds from now. */
  delay?: number
  attack?: number
  /** Seconds the note takes to fade out. */
  decay?: number
  volume?: number
  /** Frequency to glide to while fading. */
  glideTo?: number
}

const PENTATONIC = [0, 2, 4, 7, 9]
const LOWEST_NOTE = 261.63 // C4: small speakers struggle below this.

/** The frequency of a step up the pentatonic scale from the lowest note. */
function scaleNote(step: number): number {
  const semitones = 12 * Math.floor(step / PENTATONIC.length) + PENTATONIC[step % PENTATONIC.length]
  return LOWEST_NOTE * 2 ** (semitones / 12)
}

/** The largest disk plays the lowest note. */
function pitchFor(size: number, diskCount: number): number {
  return scaleNote(Math.max(0, diskCount - size))
}

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }

class SoundEngine {
  enabled = true
  private context: AudioContext | null = null
  private output: GainNode | null = null

  /** Browsers only start audio after a user gesture, so call this from one. */
  unlock(): void {
    if (this.enabled) this.ensureContext()
  }

  private ensureContext(): AudioContext | null {
    if (!this.context) {
      const AudioContextClass = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
      if (!AudioContextClass) return null
      const context = new AudioContextClass()
      const output = context.createGain()
      const limiter = context.createDynamicsCompressor()
      output.gain.value = 0.7
      output.connect(limiter)
      limiter.connect(context.destination)
      this.context = context
      this.output = output
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {})
    return this.context
  }

  private note(frequency: number, options: NoteOptions = {}): void {
    const { type = 'sine', delay = 0, attack = 0.005, decay = 0.25, volume = 0.25, glideTo } = options
    if (!this.enabled) return
    const context = this.ensureContext()
    if (!context || !this.output) return

    const start = context.currentTime + delay
    const end = start + attack + decay
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    if (glideTo) oscillator.frequency.exponentialRampToValueAtTime(glideTo, end)
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(volume, start + attack)
    envelope.gain.exponentialRampToValueAtTime(0.0001, end)
    oscillator.connect(envelope)
    envelope.connect(this.output)
    oscillator.start(start)
    oscillator.stop(end + 0.05)
  }

  pick(size: number, diskCount: number): void {
    const pitch = pitchFor(size, diskCount) * 2
    this.note(pitch, { decay: 0.08, volume: 0.1, glideTo: pitch * 1.3 })
  }

  drop(size: number, diskCount: number): void {
    const pitch = pitchFor(size, diskCount)
    this.note(pitch, { type: 'triangle', decay: 0.3, volume: 0.3 })
    this.note(pitch * 2, { decay: 0.12, volume: 0.08 })
  }

  /** A press in Lights Out; the note climbs as the board gets darker (progress from 0 to 1). */
  light(progress: number): void {
    const pitch = scaleNote(Math.round(Math.min(1, Math.max(0, progress)) * 9))
    this.note(pitch, { decay: 0.2, volume: 0.22 })
    this.note(pitch * 2, { type: 'triangle', decay: 0.07, volume: 0.05 })
  }

  /** A tile sliding in the 15 Puzzle; brighter when it lands where it belongs. */
  slide(intoPlace: boolean): void {
    this.note(intoPlace ? scaleNote(9) : scaleNote(4), { type: 'triangle', decay: 0.08, volume: 0.18 })
    this.note(140, { decay: 0.04, volume: 0.08, glideTo: 90 })
  }

  /** A peg jumping: a pop as the jumped peg comes off, then the landing, higher as the board clears. */
  jump(progress: number): void {
    const pitch = scaleNote(Math.round(Math.min(1, Math.max(0, progress)) * 11))
    this.note(pitch * 1.5, { delay: 0.04, decay: 0.06, volume: 0.07, glideTo: pitch * 0.7 })
    this.note(pitch, { type: 'triangle', delay: 0.16, decay: 0.16, volume: 0.22 })
  }

  /** A light tap, for picking something up or putting it back. */
  lift(): void {
    this.note(scaleNote(7), { decay: 0.06, volume: 0.1, glideTo: scaleNote(9) })
  }

  /**
   * Water pouring into a tube, rising as it fills (fullness from 0 to 1), timed to the pour
   * animation; a chime follows when the tube ends up full of one colour.
   */
  pour(fullness: number, completes: boolean): void {
    const pitch = scaleNote(Math.round(Math.min(1, Math.max(0, fullness)) * 9))
    this.note(pitch * 0.75, { delay: 0.2, attack: 0.03, decay: 0.28, volume: 0.16, glideTo: pitch * 1.3 })
    this.note(pitch * 1.5, { delay: 0.26, decay: 0.16, volume: 0.06, glideTo: pitch * 2 })
    if (completes) {
      this.note(scaleNote(10), { type: 'triangle', delay: 0.55, decay: 0.3, volume: 0.18 })
      this.note(scaleNote(12), { type: 'triangle', delay: 0.63, decay: 0.4, volume: 0.16 })
    }
  }

  error(): void {
    this.note(220, { type: 'square', decay: 0.07, volume: 0.045, glideTo: 185 })
    this.note(165, { type: 'square', delay: 0.09, decay: 0.12, volume: 0.045, glideTo: 130 })
    if (this.enabled) navigator.vibrate?.(30)
  }

  win(): void {
    const arpeggio = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    arpeggio.forEach((frequency, i) => {
      this.note(frequency, { type: 'triangle', delay: i * 0.09, decay: 0.4, volume: 0.22 })
    })
    for (const frequency of [1046.5, 1318.51, 1567.98]) {
      this.note(frequency, { delay: 0.4, attack: 0.02, decay: 0.9, volume: 0.07 })
    }
  }
}

export const sound = new SoundEngine()
