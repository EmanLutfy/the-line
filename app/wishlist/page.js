'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import styles from './wishlist.module.css'
import { playDrawSound } from './wishlistAudio'

// Stage boundaries as a fraction of the run. The tension comes from how
// unevenly the time is spent: a long silence, an accelerating build, a churn
// that outruns the eye, a hard collapse, then nothing at all before the answer.
const STAGE = { still: .13, build: .50, churn: .84, collapse: .88, land: .915, fade: .94 }
const SLOTS = 41

// The project account. The homepage nav and footer point at the same one.
const X_PROFILE = 'https://x.com/thelinesart'
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

function DrawAnimation({ active, muted, onComplete }) {
  const canvasRef = useRef(null)
  // Held in a ref so a parent re-render can never re-run the effect and
  // restart the 10s animation from zero.
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !active) return undefined
    const context = canvas.getContext('2d')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame
    let startedAt = null
    let finished = false
    let size = 260

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      size = Math.max(260, Math.min(canvas.clientWidth, 620))
      canvas.width = size * ratio
      canvas.height = size * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const duration = reducedMotion ? 600 : 10000
    // Sound is scheduled once, against the same stage fractions the canvas
    // uses, so picture and sound cannot drift apart.
    const stopSound = muted || reducedMotion ? null : playDrawSound(duration, STAGE)
    const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))
    const smooth = value => value * value * (3 - 2 * value)
    const easeIn = value => value * value * value
    const noise = (index, seed) => {
      const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453
      return value - Math.floor(value)
    }

    const draw = time => {
      if (startedAt === null) startedAt = time
      const progress = clamp((time - startedAt) / duration)
      const center = size / 2
      const span = size * .78
      const churning = progress > STAGE.build && progress < STAGE.churn

      // During the fast phase the canvas is dimmed instead of cleared, so each
      // frame leaves a short trail. That reads as speed without particles,
      // blur filters or any colour entering the piece.
      context.fillStyle = churning ? 'rgba(0,0,0,.32)' : '#000'
      context.fillRect(0, 0, size, size)

      const stroke = (x, top, bottom, alpha, width) => {
        if (alpha <= .004) return
        context.strokeStyle = `rgba(245,245,245,${alpha})`
        context.lineWidth = width
        context.beginPath()
        context.moveTo(x, top)
        context.lineTo(x, bottom)
        context.stroke()
      }

      if (progress < STAGE.still) {
        // One line, breathing. Nothing is happening yet, and the waiting is the point.
        const breath = .5 + .5 * Math.sin((time - startedAt) / 420)
        const half = size * (.085 + breath * .014)
        stroke(center, center - half, center + half, .5 + breath * .4, 1.4)
      } else if (progress < STAGE.churn) {
        const build = clamp((progress - STAGE.still) / (STAGE.build - STAGE.still))
        const churn = clamp((progress - STAGE.build) / (STAGE.churn - STAGE.build))
        const count = Math.round(1 + Math.pow(build, 1.6) * 15 + churn * 26)

        // The field re-seeds on a cadence that accelerates: discrete, countable
        // snaps at first, then faster than the eye can follow.
        let seed = Math.floor(build * 9)
        if (churn > 0) {
          seed = 12 + Math.floor(Math.pow(churn, 2.2) * 52)
          // One hesitation near the end — it almost settles, then goes again.
          if (churn > .86 && churn < .93) seed = 12 + Math.floor(Math.pow(.86, 2.2) * 52)
        }

        for (let index = 0; index < count; index += 1) {
          const slot = Math.floor(noise(index, seed) * SLOTS)
          const x = center + (slot / (SLOTS - 1) - .5) * span
          const half = size * (.06 + noise(index, seed + 7) * .2)
          const y = center + (noise(index, seed + 13) - .5) * size * .2
          const entry = churn > 0 ? 1 : clamp(build * 3)
          stroke(x, y - half, y + half, (.25 + noise(index, seed + 21) * .6) * entry, churn > .5 ? 1 : 1.3)
        }
      } else if (progress < STAGE.collapse) {
        // Everything rushes to the middle and lands as a single line.
        const k = easeIn(clamp((progress - STAGE.churn) / (STAGE.collapse - STAGE.churn)))
        const seed = 12 + 52
        const target = size * .13
        for (let index = 0; index < 42; index += 1) {
          const slot = Math.floor(noise(index, seed) * SLOTS)
          const startX = center + (slot / (SLOTS - 1) - .5) * span
          const startHalf = size * (.06 + noise(index, seed + 7) * .2)
          const startY = center + (noise(index, seed + 13) - .5) * size * .2
          const x = startX + (center - startX) * k
          const y = startY + (center - startY) * k
          const half = startHalf + (target - startHalf) * k
          stroke(x, y - half, y + half, (.25 + noise(index, seed + 21) * .6) * (1 - k * .3), 1 + k * 1.2)
        }
      } else {
        // It has landed as one line. That reading is held long enough to
        // register, fades, and then there is nothing at all — and the silence
        // before the answer is where the tension actually lives.
        const alpha = progress <= STAGE.land ? 1
          : 1 - smooth(clamp((progress - STAGE.land) / (STAGE.fade - STAGE.land)))
        stroke(center, center - size * .13, center + size * .13, alpha, 2.2)
      }

      if (progress >= 1) {
        if (!finished) {
          finished = true
          cancelAnimationFrame(frame)
          onCompleteRef.current()
        }
        return
      }
      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      if (stopSound) stopSound()
    }
    // `muted` is read once at the start on purpose: toggling mid-run would
    // restart the animation, and a 10s run cannot start over halfway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return <canvas ref={canvasRef} className={styles.animationCanvas} aria-label="Wishlist animation" />
}

function ResultView({ onClose }) {
  return <div className={styles.result} role="status" aria-live="polite">
    <span className={styles.resultKicker}>THE LINE</span>
    <h2>You&apos;re In.</h2>
    <p className={styles.resultHeadline}>WISHLIST CONFIRMED</p>
    <button className={styles.textButton} type="button" onClick={onClose}>CLOSE</button>
  </div>
}

function ClosedView() {
  return <div className={styles.result} role="status" aria-live="polite">
    <span className={styles.resultKicker}>THE LINE</span>
    <h2>Closed.</h2>
    <p className={styles.resultHeadline}>THE WISHLIST IS CLOSED</p>
    <p className={styles.resultBody}>The list is final. Mint details are announced on X.</p>
    <a className={styles.textButton} href={X_PROFILE} target="_blank" rel="noreferrer">FOLLOW ON X</a>
  </div>
}

export default function DrawPage() {
  const [wallet, setWallet] = useState('')
  const [handle, setHandle] = useState('')
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const [visitedX, setVisitedX] = useState(false)
  const [muted, setMuted] = useState(false)
  const pending = useRef(false)
  const artRef = useRef(null)
  const turnstileBox = useRef(null)
  const turnstileWidget = useRef(null)
  const [turnstileToken, setTurnstileToken] = useState('')

  // Rendered explicitly rather than by class name: React re-renders would
  // otherwise let Turnstile mount a second widget into the same form.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return undefined
    const scriptId = 'cf-turnstile'
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      document.head.appendChild(script)
    }
    let stopped = false
    const mount = () => {
      if (stopped) return
      if (window.turnstile && turnstileBox.current && turnstileWidget.current === null) {
        turnstileWidget.current = window.turnstile.render(turnstileBox.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          callback: setTurnstileToken,
          'expired-callback': () => setTurnstileToken(''),
          'error-callback': () => setTurnstileToken(''),
        })
        return
      }
      window.setTimeout(mount, 200)
    }
    mount()
    return () => { stopped = true }
  }, [])

  const submit = async event => {
    event.preventDefault()
    // Close the keyboard before the 10s run starts, otherwise it covers the
    // canvas for the whole animation on a phone.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
    setError('')
    if (!handle.trim()) {
      setError('Enter your X handle to continue.')
      return
    }
    if (!wallet.trim()) {
      setError('Enter a wallet address to continue.')
      return
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError('Verification is still running. Try again in a moment.')
      return
    }
    if (pending.current) return
    pending.current = true
    try {
      const response = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet, twitterHandle: handle, turnstileToken }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (data.code === 'ALREADY_ENTERED') setError('ALREADY ON THE LIST — This wallet is already registered.')
        else if (data.code === 'INVALID_WALLET') setError('INVALID ADDRESS — Enter a full wallet address (0x + 40 characters).')
        else if (data.code === 'INVALID_HANDLE') setError('INVALID HANDLE — Letters, numbers and underscore, up to 15 characters.')
        else if (data.code === 'DRAW_CLOSED') { setState('closed'); return }
        else if (data.code === 'NOT_AUTHENTICATED') setError('REGISTRATION IS NOT OPEN.')
        else if (data.code === 'VERIFICATION_FAILED') setError('VERIFICATION FAILED — Reload the page and try again.')
        else setError(`The wishlist is not available right now.${data.code ? ` (${data.code})` : ''}`)
        if (window.turnstile && turnstileWidget.current !== null) {
          window.turnstile.reset(turnstileWidget.current)
          setTurnstileToken('')
        }
        return
      }
      setState('drawing')
      // Stacked layout on a phone puts the canvas above the form, so the person
      // is looking at the wrong half when the animation begins.
      if (artRef.current) {
        window.requestAnimationFrame(() => artRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      }
    } catch {
      setError('Connection failed. Try again.')
    } finally {
      pending.current = false
    }
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/wishlist')
      .then(response => response.json())
      .then(data => {
        if (cancelled || !data || !data.draw) return
        if (data.draw.status !== 'open') setState('closed')
      })
      // A failed check leaves the form up: the server rejects a closed entry
      // anyway, so the worst case is one wasted submit, not a list that keeps
      // taking entries after it shut.
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const finishDrawing = () => setState('result')

  return <main className={styles.page}>
    <header className={styles.nav}>
      <Link className={styles.wordmark} href="/">The Line</Link>
      <span className={styles.navMeta}>Wishlist</span>
    </header>
    <section className={styles.hero} aria-label="Wishlist entry">
      <div className={styles.drawArt} ref={artRef} aria-label="Wishlist line artwork">
        {state === 'drawing'
          ? <DrawAnimation active muted={muted} onComplete={finishDrawing} />
          : <div className={styles.drawStill} aria-hidden="true"><i /></div>}
      </div>
      <div className={styles.heroCopy}>
        {state === 'closed' ? <ClosedView /> : state === 'drawing' ? <div className={styles.drawingCopy}><span>What Happen.</span><p>One line. One place held.</p></div> : state === 'result' ? <ResultView onClose={() => setState('idle')} /> : <form className={styles.entry} onSubmit={submit}>
          <div className={styles.field}>
            <label className={styles.inputLabel} htmlFor="twitter-handle">X / TWITTER</label>
            <input className={styles.walletInput} id="twitter-handle" name="twitterHandle" type="text" inputMode="text" autoComplete="off" spellCheck="false" maxLength={16} placeholder="@handle" value={handle} onChange={event => setHandle(event.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.inputLabel} htmlFor="wallet-address">WALLET ADDRESS</label>
            <input className={styles.walletInput} id="wallet-address" name="walletAddress" type="text" inputMode="text" autoComplete="off" spellCheck="false" placeholder="0x..." value={wallet} onChange={event => setWallet(event.target.value)} />
          </div>
          {TURNSTILE_SITE_KEY && <div className={styles.turnstile} ref={turnstileBox} />}
          {visitedX
            ? <button className={styles.primaryButton} type="submit">SUBMIT</button>
            : <a className={styles.primaryButton} href={X_PROFILE} target="_blank" rel="noreferrer" onClick={() => setVisitedX(true)}>FOLLOW ON X</a>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>}
      </div>
    </section>
    <button className={styles.soundToggle} type="button" onClick={() => setMuted(!muted)} aria-pressed={muted}>
      {muted ? 'SOUND OFF' : 'SOUND ON'}
    </button>
  </main>
}
