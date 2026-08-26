// Procedural sound for the mint. No file, no licence: a drone that rises with
// the field, a tick each time the lines snap, a fall into the collapse, one
// clean tone on the answer, then silence.
//
// Unlike the wishlist version, the length is not known in advance — the churn
// runs until the transaction confirms. So the drone and the ticks are
// scheduled in rolling batches while it waits, and the fall and the bell are
// fired by `resolve()` at the moment the receipt lands.

type MintSound = { resolve: () => void; stop: () => void }

const SILENT: MintSound = { resolve: () => {}, stop: () => {} }

export function startMintSound(): MintSound {
  const Ctx =
    typeof window !== 'undefined' &&
    ((window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctx) return SILENT

  let ctx: AudioContext
  try {
    ctx = new Ctx()
  } catch {
    return SILENT
  }

  const t0 = ctx.currentTime
  let stopped = false
  let resolved = false

  const out = ctx.createGain()
  out.gain.value = 0.42
  out.connect(ctx.destination)

  // A gentle low-pass keeps everything soft: no click edges, no harshness.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.setValueAtTime(700, t0)
  tone.frequency.linearRampToValueAtTime(2100, t0 + 5)
  tone.connect(out)

  // Drone: two detuned sines, so it beats slowly instead of sitting dead still.
  const droneGain = ctx.createGain()
  droneGain.gain.setValueAtTime(0.0001, t0)
  droneGain.gain.exponentialRampToValueAtTime(0.028, t0 + 1.2)
  droneGain.gain.exponentialRampToValueAtTime(0.085, t0 + 5)
  droneGain.connect(tone)

  const drones = [55, 55.6].map(hz => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(hz, t0)
    osc.frequency.linearRampToValueAtTime(hz * 1.5, t0 + 5)
    osc.connect(droneGain)
    osc.start(t0)
    return osc
  })

  // Ticks, scheduled a couple of seconds ahead at a time. The cadence
  // accelerates through the build and then holds, so a long wait sounds like
  // a machine still running rather than a loop repeating.
  const ticks: OscillatorNode[] = []
  let nextTickAt = t0 + 1.2
  let tickIndex = 0

  const scheduleTicks = () => {
    if (stopped || resolved) return
    const horizon = ctx.currentTime + 2
    while (nextTickAt < horizon) {
      const ramp = Math.min(tickIndex / 52, 1)
      const gap = 0.34 - ramp * 0.28
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(880 + (tickIndex % 7) * 110, nextTickAt)
      gain.gain.setValueAtTime(0.0001, nextTickAt)
      gain.gain.exponentialRampToValueAtTime(0.016 + ramp * 0.014, nextTickAt + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, nextTickAt + 0.09)
      osc.connect(gain)
      gain.connect(tone)
      osc.start(nextTickAt)
      osc.stop(nextTickAt + 0.12)
      ticks.push(osc)
      nextTickAt += gap
      tickIndex += 1
    }
  }

  scheduleTicks()
  const pump = setInterval(scheduleTicks, 700)

  const cleanup = () => {
    clearInterval(pump)
    try {
      out.gain.cancelScheduledValues(ctx.currentTime)
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
      ;[...drones, ...ticks].forEach(node => {
        try {
          node.stop()
        } catch {}
      })
      setTimeout(() => ctx.close().catch(() => {}), 160)
    } catch {}
  }

  return {
    resolve() {
      if (stopped || resolved) return
      resolved = true
      clearInterval(pump)
      const now = ctx.currentTime

      // Everything rushing to the middle.
      droneGain.gain.cancelScheduledValues(now)
      droneGain.gain.setValueAtTime(Math.max(droneGain.gain.value, 0.0001), now)
      droneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
      drones.forEach(osc => {
        osc.frequency.cancelScheduledValues(now)
        osc.frequency.linearRampToValueAtTime(33, now + 0.45)
        try {
          osc.stop(now + 0.7)
        } catch {}
      })

      const fall = ctx.createOscillator()
      const fallGain = ctx.createGain()
      fall.type = 'sine'
      fall.frequency.setValueAtTime(900, now)
      fall.frequency.exponentialRampToValueAtTime(90, now + 0.42)
      fallGain.gain.setValueAtTime(0.0001, now)
      fallGain.gain.exponentialRampToValueAtTime(0.075, now + 0.08)
      fallGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
      fall.connect(fallGain)
      fallGain.connect(out)
      fall.start(now)
      fall.stop(now + 0.6)

      // The landed line: one clean tone, held, then gone before the answer.
      const bell = ctx.createOscillator()
      const bellGain = ctx.createGain()
      bell.type = 'sine'
      bell.frequency.setValueAtTime(330, now + 0.42)
      bellGain.gain.setValueAtTime(0.0001, now + 0.42)
      bellGain.gain.exponentialRampToValueAtTime(0.115, now + 0.48)
      bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25)
      bell.connect(bellGain)
      bellGain.connect(out)
      bell.start(now + 0.42)
      bell.stop(now + 1.4)

      // The last stretch is silent on purpose. That is where the answer lands.
      setTimeout(cleanup, 1600)
    },
    stop() {
      if (stopped) return
      stopped = true
      cleanup()
    },
  }
}
