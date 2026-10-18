import { useEffect, useRef } from 'react'

const COLORS = ['#f0606b', '#f6a23c', '#f6d33c', '#5fd068', '#2fbfb0', '#5b8def', '#a77bf3', '#f06bc4']

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  spin: number
  tilt: number
  tiltSpeed: number
  color: string
  round: boolean
}

/** Two confetti cannons fire from the bottom corners whenever `burst` changes. */
export function Confetti({ burst }: { burst: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!burst || !canvas || !context) return

    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    let width = 0
    let height = 0
    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * ratio
      canvas.height = height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    // An idle full-screen canvas still holds memory, so shrink it once the show is over.
    const release = () => {
      canvas.width = 0
      canvas.height = 0
    }

    resize()
    const particles = fire(width, height)
    let frame = 0
    let last = performance.now()

    const draw = (now: number) => {
      const dt = Math.min(2.5, (now - last) / (1000 / 60))
      last = now
      context.clearRect(0, 0, width, height)
      let alive = false
      for (const particle of particles) {
        const drag = 0.986 ** dt
        particle.vx *= drag
        particle.vy = particle.vy * drag + 0.32 * dt
        particle.x += particle.vx * dt
        particle.y += particle.vy * dt
        particle.rotation += particle.spin * dt
        particle.tilt += particle.tiltSpeed * dt
        if (particle.y > height + 40) continue
        alive = true
        context.save()
        context.translate(particle.x, particle.y)
        context.rotate(particle.rotation)
        context.scale(1, Math.cos(particle.tilt))
        context.fillStyle = particle.color
        if (particle.round) {
          context.beginPath()
          context.arc(0, 0, particle.size / 3, 0, Math.PI * 2)
          context.fill()
        } else {
          context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2)
        }
        context.restore()
      }
      if (alive) frame = requestAnimationFrame(draw)
      else release()
    }

    frame = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      release()
    }
  }, [burst])

  return <canvas ref={ref} className="confetti" aria-hidden="true" />
}

function fire(width: number, height: number): Particle[] {
  const particles: Particle[] = []
  const count = width < 600 ? 70 : 110
  const cannons = [
    { x: 0, y: height, angle: -62 },
    { x: width, y: height, angle: -118 },
  ]
  for (const cannon of cannons) {
    for (let i = 0; i < count; i++) {
      const angle = ((cannon.angle + (Math.random() - 0.5) * 36) * Math.PI) / 180
      const speed = (0.65 + Math.random() * 0.5) * Math.sqrt(height) * 1.15
      particles.push({
        x: cannon.x,
        y: cannon.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 7 + Math.random() * 7,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        tilt: Math.random() * Math.PI,
        tiltSpeed: 0.05 + Math.random() * 0.12,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        round: Math.random() < 0.25,
      })
    }
  }
  return particles
}
