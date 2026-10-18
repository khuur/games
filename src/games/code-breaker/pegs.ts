import type { Feedback } from './codeBreaker'

/**
 * The peg colours. Every colour also carries its own shape, so codes can be told apart without
 * relying on colour vision.
 */
export interface PegStyle {
  name: string
  base: string
  light: string
  dark: string
  /** Colour of the shape drawn on the peg. */
  ink: string
  /** The shape, as an SVG path in a 24×24 box. */
  shape: string
}

export const PEGS: readonly PegStyle[] = [
  {
    name: 'red',
    base: '#e5484d',
    light: '#ff9a9d',
    dark: '#a8262c',
    ink: 'rgb(255 255 255 / 0.6)',
    shape: 'M12 6.3a5.7 5.7 0 1 0 0 11.4a5.7 5.7 0 1 0 0-11.4z',
  },
  {
    name: 'blue',
    base: '#3b7bf6',
    light: '#9cc0ff',
    dark: '#1f4fb5',
    ink: 'rgb(255 255 255 / 0.62)',
    shape: 'M7 7h10v10H7z',
  },
  {
    name: 'yellow',
    base: '#f5c21b',
    light: '#fff0a6',
    dark: '#b98a00',
    ink: 'rgb(90 60 0 / 0.42)',
    shape: 'M12 5.6l6.8 11.8H5.2z',
  },
  {
    name: 'green',
    base: '#2fb36d',
    light: '#9be8bd',
    dark: '#17804a',
    ink: 'rgb(255 255 255 / 0.6)',
    shape: 'M12 4.8l7.2 7.2-7.2 7.2-7.2-7.2z',
  },
  {
    name: 'purple',
    base: '#9b5de5',
    light: '#d4b6ff',
    dark: '#6936ad',
    ink: 'rgb(255 255 255 / 0.62)',
    shape: 'M12 4.6l1.9 4.9 5.2.3-4.1 3.3 1.4 5.1L12 15.3l-4.4 2.9 1.4-5.1-4.1-3.3 5.2-.3z',
  },
  {
    name: 'orange',
    base: '#f7801a',
    light: '#ffc58f',
    dark: '#b8560a',
    ink: 'rgb(255 255 255 / 0.62)',
    shape: 'M10 5.5h4V10h4.5v4H14v4.5h-4V14H5.5v-4H10z',
  },
  {
    name: 'teal',
    base: '#14b3c2',
    light: '#8ce6ee',
    dark: '#0b7c87',
    ink: 'rgb(255 255 255 / 0.6)',
    shape: 'M12 5l6.1 3.5v7L12 19l-6.1-3.5v-7z',
  },
  {
    name: 'pink',
    base: '#ec4899',
    light: '#ffa8d2',
    dark: '#b0256c',
    ink: 'rgb(255 255 255 / 0.62)',
    shape: 'M12 18.6s-6.6-4.1-6.6-8.5A3.6 3.6 0 0 1 12 8.2a3.6 3.6 0 0 1 6.6 1.9c0 4.4-6.6 8.5-6.6 8.5z',
  },
]

export const colorName = (color: number) => PEGS[color].name

export const describeCode = (code: readonly number[]) => code.map(colorName).join(', ')

export function describeFeedback({ exact, near }: Feedback): string {
  if (exact + near === 0) return 'No colour right'
  const parts = []
  if (exact) parts.push(`${exact} in the right place`)
  if (near) parts.push(`${near} in the wrong place`)
  return parts.join(', ')
}
