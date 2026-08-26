'use client'

import { useEffect, useRef } from 'react'
import { startMintSound } from './mintAudio'
import styles from './mint.module.css'

/**
 * The same field-to-single-line piece as the wishlist, with one structural
 * difference: the wishlist knew its own length, because the outcome was
 * already decided before the animation started. Here the wait is a real
 * transaction, and nobody knows whether it takes four seconds or forty.
 *
 * So the churn does not run to a deadline — it runs until `resolved` turns
 * true, and only then collapses. The tension is not staged. It is the actual
 * time the chain takes, and it ends the moment the receipt lands.
 */

const STILL = 1200 // one line, breathing — nothing has happened yet
const BUILD = 3200 // the field fills, in countable snaps
const CHURN_MIN = 1600 // hold here at least this long, however fast the chain is
const COLLAPSE = 420 // everything rushes to the middle
const LAND = 420 // held as one line, long enough to register
const FADE = 320 // and then nothing, just before the answer

const SLOTS = 41

type Props = {
  active: boolean
  resolved: boolean
  muted?: boolean
  onComplete: () => void
}

export function MintAnimation({ active, resolved, muted, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Both are read inside the animation frame rather than closed over, so a
  // parent re-render never restarts a run that is already in flight.
  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !active) return undefined
    const context = canvas.getContext('2d')
    if (!context) return undefined

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let startedAt: number | null = null
    let releasedAt: number | null = null
    let finished = false
    let size = 260

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      size = Math.max(240, Math.min(canvas.clientWidth, 640))
      canvas.width = size * ratio
      canvas.height = size * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const sound = muted || reducedMotion ? null : startMintSound()
    let soundResolved = false

    const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
    const smooth = (value: number) => value * value * (3 - 2 * value)
    const easeIn = (value: number) => value * value * value
    const noise = (index: number, seed: number) => {
      const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453
      return value - Math.floor(value)
    }

    const draw = (time: number) => {
      if (startedAt === null) startedAt = time
      const elapsed = time - startedAt
      const center = size / 2
      const span = size * 0.78

      // The gate: once the churn has run its minimum and the chain has
      // answered, note the moment and let the collapse begin.
      const churnStart = STILL + BUILD
      if (releasedAt === null && resolvedRef.current && elapsed >= churnStart + CHURN_MIN) {
        releasedAt = elapsed
        if (sound && !soundResolved) {
          soundResolved = true
          sound.resolve()
        }
      }

      const churning = releasedAt === null && elapsed > churnStart
      // During the fast phase the canvas is dimmed instead of cleared, so each
      // frame leaves a short trail. That reads as speed without particles,
      // blur filters or any colour entering the piece.
      context.fillStyle = churning ? 'rgba(0,0,0,.32)' : '#000'
      context.fillRect(0, 0, size, size)

      const stroke = (x: number, top: number, bottom: number, alpha: number, width: number) => {
        if (alpha <= 0.004) return
        context.strokeStyle = `rgba(245,245,245,${alpha})`
        context.lineWidth = width
        context.beginPath()
        context.moveTo(x, top)
        context.lineTo(x, bottom)
        context.stroke()
      }

      if (elapsed < STILL) {
        // One line, breathing. Nothing is happening yet, and the waiting is the point.
        const breath = 0.5 + 0.5 * Math.sin(elapsed / 420)
        const half = size * (0.085 + breath * 0.014)
        stroke(center, center - half, center + half, 0.5 + breath * 0.4, 1.4)
      } else if (releasedAt === null) {
        const build = clamp((elapsed - STILL) / BUILD)
        const held = Math.max(0, elapsed - churnStart)
        const churn = clamp(held / CHURN_MIN)
        const count = Math.round(1 + Math.pow(build, 1.6) * 15 + churn * 26)

        // The field re-seeds on a cadence that accelerates: countable snaps at
        // first, then faster than the eye. Once the cadence is at full speed it
        // keeps re-seeding for as long as the wait lasts, so a slow block looks
        // like a machine still working rather than a loop stuck on repeat.
        let seed = Math.floor(build * 9)
        if (held > 0) seed = 12 + Math.floor((held / 42) % 4096)

        for (let index = 0; index < count; index += 1) {
          const slot = Math.floor(noise(index, seed) * SLOTS)
          const x = center + (slot / (SLOTS - 1) - 0.5) * span
          const half = size * (0.06 + noise(index, seed + 7) * 0.2)
          const y = center + (noise(index, seed + 13) - 0.5) * size * 0.2
          const entry = held > 0 ? 1 : clamp(build * 3)
          stroke(
            x,
            y - half,
            y + half,
            (0.25 + noise(index, seed + 21) * 0.6) * entry,
            churn > 0.5 ? 1 : 1.3,
          )
        }
      } else {
        const since = elapsed - releasedAt
        if (since < COLLAPSE) {
          // Everything rushes to the middle and lands as a single line.
          const k = easeIn(clamp(since / COLLAPSE))
          const seed = 12 + Math.floor((releasedAt / 42) % 4096)
          const target = size * 0.13
          for (let index = 0; index < 42; index += 1) {
            const slot = Math.floor(noise(index, seed) * SLOTS)
            const startX = center + (slot / (SLOTS - 1) - 0.5) * span
            const startHalf = size * (0.06 + noise(index, seed + 7) * 0.2)
            const startY = center + (noise(index, seed + 13) - 0.5) * size * 0.2
            const x = startX + (center - startX) * k
            const y = startY + (center - startY) * k
            const half = startHalf + (target - startHalf) * k
            stroke(
              x,
              y - half,
              y + half,
              (0.25 + noise(index, seed + 21) * 0.6) * (1 - k * 0.3),
              1 + k * 1.2,
            )
          }
        } else {
          // It has landed as one line. That reading is held long enough to
          // register, fades, and then there is nothing at all — and the silence
          // before the number is where this actually lands.
          const after = since - COLLAPSE
          const alpha = after <= LAND ? 1 : 1 - smooth(clamp((after - LAND) / FADE))
          stroke(center, center - size * 0.13, center + size * 0.13, alpha, 2.2)

          if (after >= LAND + FADE && !finished) {
            finished = true
            cancelAnimationFrame(frame)
            onCompleteRef.current()
            return
          }
        }
      }

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      if (sound) sound.stop()
    }
    // `muted` is read once at the start on purpose: toggling mid-run would
    // restart the animation, and a run in progress cannot start over halfway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return <canvas ref={canvasRef} className={styles.canvas} aria-label="Collecting your line" />
}
