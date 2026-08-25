// Procedural sound for the draw. No file, no licence, a few hundred bytes of
// code: a drone that rises with the field, a tick each time the lines snap, a
// fall into the collapse, one clean tone on the answer, then silence.
//
// Everything is scheduled against the same STAGE fractions the canvas uses, so
// picture and sound cannot drift apart.

export function playDrawSound(durationMs, stage) {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!Ctx) return () => {}

  let ctx
  try {
    ctx = new Ctx()
  } catch {
    return () => {}
  }

  const t0 = ctx.currentTime
  const at = fraction => t0 + (durationMs / 1000) * fraction

  const out = ctx.createGain()
  out.gain.value = 0.9
  out.connect(ctx.destination)

  // A gentle low-pass keeps everything soft: no click edges, no harshness.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.setValueAtTime(700, t0)
  tone.frequency.linearRampToValueAtTime(2100, at(stage.churn))
  tone.frequency.linearRampToValueAtTime(500, at(stage.collapse))
  tone.connect(out)

  // Drone: two detuned sines, so it beats slowly instead of sitting dead still.
  const droneGain = ctx.createGain()
  droneGain.gain.setValueAtTime(0.0001, t0)
  droneGain.gain.exponentialRampToValueAtTime(0.05, at(stage.still))
  droneGain.gain.exponentialRampToValueAtTime(0.16, at(stage.churn))
  droneGain.gain.exponentialRampToValueAtTime(0.0001, at(stage.collapse))
  droneGain.connect(tone)

  const drones = [55, 55.6].map(hz => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(hz, t0)
    osc.frequency.linearRampToValueAtTime(hz * 1.5, at(stage.churn))
    osc.frequency.linearRampToValueAtTime(hz * 0.6, at(stage.collapse))
    osc.connect(droneGain)
    osc.start(t0)
    osc.stop(at(stage.collapse) + 0.3)
    return osc
  })

  // Ticks: one per snap of the field, on the same accelerating cadence.
  const ticks = []
  const buildSpan = stage.churn - stage.still
  for (let i = 0; i < 52; i += 1) {
    const progress = i / 51
    // Matches the canvas: slow discrete snaps first, then faster than the eye.
    const fraction = stage.still + buildSpan * Math.pow(progress, 1 / 2.2)
    const when = at(fraction)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(880 + (i % 7) * 110, when)
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(0.035 + progress * 0.03, when + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.09)
    osc.connect(gain)
    gain.connect(tone)
    osc.start(when)
    osc.stop(when + 0.12)
    ticks.push(osc)
  }

  // Collapse: a short fall, the sound of everything rushing to the middle.
  const fall = ctx.createOscillator()
  const fallGain = ctx.createGain()
  fall.type = 'sine'
  fall.frequency.setValueAtTime(900, at(stage.churn))
  fall.frequency.exponentialRampToValueAtTime(90, at(stage.collapse))
  fallGain.gain.setValueAtTime(0.0001, at(stage.churn))
  fallGain.gain.exponentialRampToValueAtTime(0.14, at(stage.churn) + 0.08)
  fallGain.gain.exponentialRampToValueAtTime(0.0001, at(stage.collapse))
  fall.connect(fallGain)
  fallGain.connect(out)
  fall.start(at(stage.churn))
  fall.stop(at(stage.collapse) + 0.2)

  // The landed line: one clean tone, held, then gone well before the answer.
  const bell = ctx.createOscillator()
  const bellGain = ctx.createGain()
  bell.type = 'sine'
  bell.frequency.setValueAtTime(330, at(stage.collapse))
  bellGain.gain.setValueAtTime(0.0001, at(stage.collapse))
  bellGain.gain.exponentialRampToValueAtTime(0.2, at(stage.collapse) + 0.05)
  bellGain.gain.exponentialRampToValueAtTime(0.0001, at(stage.fade))
  bell.connect(bellGain)
  bellGain.connect(out)
  bell.start(at(stage.collapse))
  bell.stop(at(stage.fade) + 0.2)

  // The last stretch is silent on purpose. That is the tension.

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    try {
      out.gain.cancelScheduledValues(ctx.currentTime)
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
      ;[...drones, ...ticks, fall, bell].forEach(node => { try { node.stop() } catch {} })
      setTimeout(() => ctx.close().catch(() => {}), 120)
    } catch {}
  }
}
