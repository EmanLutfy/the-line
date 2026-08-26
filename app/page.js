'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'

// Set once the collection is live. Until then the mark is hidden rather than
// pointing at OpenSea's front page, which promises a listing that is not there.
const openSeaUrl = process.env.NEXT_PUBLIC_OPENSEA_URL || ''

const works = [
  ['1586', 'Legendary'], ['0837', 'Legendary'], ['2805', 'Legendary'], ['0371', 'Legendary'],
  ['0245', 'Epic'], ['2293', 'Epic'], ['1426', 'Epic'], ['2012', 'Epic'],
  ['2843', 'Rare'], ['2288', 'Rare'], ['1389', 'Rare'], ['0751', 'Rare'],
  ['0720', 'Rare'], ['0114', 'Epic'], ['0840', 'Legendary'], ['0010', 'Common'],
].map(([token, rarity]) => ({ token, rarity }))

const traitData = {
  '1586': [['Rarity Tier', 'Legendary'], ['Rarity Rank', '2'], ['Line Count', '2'], ['Formation', 'Vertical Field'], ['Position', 'Lower'], ['Length', 'Long'], ['Width', '5 px'], ['Density', 'Minimal']],
  '0837': [['Rarity Tier', 'Legendary'], ['Rarity Rank', '3'], ['Line Count', '3'], ['Formation', 'Cluster'], ['Position', 'Lower'], ['Length', 'Mixed'], ['Width', '5 px'], ['Density', 'Minimal']],
  '2805': [['Rarity Tier', 'Legendary'], ['Rarity Rank', '4'], ['Line Count', '2'], ['Formation', 'Vertical Field'], ['Position', 'Upper'], ['Length', 'Mixed'], ['Width', '5 px'], ['Density', 'Minimal']],
  '0371': [['Rarity Tier', 'Legendary'], ['Rarity Rank', '5'], ['Line Count', '3'], ['Formation', 'Cluster'], ['Position', 'Upper'], ['Length', 'Short'], ['Width', '5 px'], ['Density', 'Minimal']],
  '0245': [['Rarity Tier', 'Epic'], ['Rarity Rank', '17'], ['Line Count', '5'], ['Formation', 'Cluster'], ['Position', 'Lower'], ['Length', 'Short'], ['Width', '5 px'], ['Density', 'Sparse']],
  '2293': [['Rarity Tier', 'Epic'], ['Rarity Rank', '27'], ['Line Count', '4'], ['Formation', 'Cluster'], ['Position', 'Upper + Lower'], ['Length', 'Short'], ['Width', '5 px'], ['Density', 'Sparse']],
  '1426': [['Rarity Tier', 'Epic'], ['Rarity Rank', '32'], ['Line Count', '6'], ['Formation', 'Asymmetric'], ['Position', 'Full Canvas'], ['Length', 'Mixed'], ['Width', '5 px'], ['Density', 'Sparse']],
  '2012': [['Rarity Tier', 'Epic'], ['Rarity Rank', '36'], ['Line Count', '7'], ['Formation', 'Vertical Field'], ['Position', 'Center'], ['Length', 'Medium'], ['Width', '5 px'], ['Density', 'Sparse']],
}

const rarity = [
  ['1,999', 'Common'], ['900', 'Uncommon'], ['300', 'Rare'],
  ['100', 'Epic'], ['33', 'Legendary'], ['1', 'Mythic'],
]

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] } },
}

function IntroLoader({ onComplete }) {
  return <motion.div className="intro-loader" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 1.8, duration: 0.6 }} onAnimationComplete={onComplete}>
    <motion.div className="intro-line" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.6, ease: [0.25, 0.46, 0.45, 0.94] }} />
    <span>The Line</span>
  </motion.div>
}

function Nav({ open, setOpen }) {
  const links = [['Collection', '#collection'], ['FAQ', '#faq']]
  return <header className="nav-wrap">
    <div className="nav-right"><a className="twitter-mark" href="https://x.com/thelinesart" target="_blank" rel="noreferrer" aria-label="The Line on Twitter"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.24-8.28L2.8 2h6.4l4.42 5.84L18.9 2Zm-1.1 17.8h1.73L8.28 4.08H6.43L17.8 19.8Z" /></svg></a>{openSeaUrl && <a className="opensea-mark" href={openSeaUrl} target="_blank" rel="noreferrer" aria-label="The Line on OpenSea"><img src="/opensea-logo.png" alt="" /></a>}<button className="menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Toggle navigation"><span /><span /></button></div>
    <nav className={open ? 'nav-links is-open' : 'nav-links'}>{links.map(([label, href]) => <a key={label} href={href} onClick={() => setOpen(false)}>{label}</a>)}</nav>
    <Link className="nav-draw" href="/mint">Mint</Link>
  </header>
}

function SectionLabel({ children, number }) {
  return <div className="section-label"><span>{number}</span><span>{children}</span></div>
}

function Hero() {
  const first = 'The'.split('')
  const second = 'Line'.split('')
  return <section className="hero section-frame" id="top">
    <div className="hero-art" aria-label="A single white line artwork"><motion.div className="single-line" animate={{ scaleY: [0.8, 1, 0.8] }} transition={{ duration: 8, repeat: Infinity, repeatType: 'loop', ease: 'easeInOut' }} /><span className="hero-coord">LINE / 05PX<br />FORMATION / 01</span></div>
    <div className="hero-copy">
      <h1 aria-label="The Line"><span>{first.map((letter, index) => <motion.i key={`the-${index}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25 + index * .15, duration: .45 }}>{letter}</motion.i>)}</span><br /><span>{second.map((letter, index) => <motion.i key={`line-${index}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .75 + index * .15, duration: .45 }}>{letter}</motion.i>)}</span></h1>
      <span className="hero-japanese" lang="ja">ザ・ライン</span>
    </div>
  </section>
}

function Collection() {
  const selected = works.slice(0, 8)
  return <section className="collection section-frame" id="collection">
    <SectionLabel number="01">The collection</SectionLabel>
    <div className="editorial-intro"><div className="editorial-title"><h2>One element</h2><span className="section-japanese" lang="ja">ひとつの要素</span></div></div>
    <div className="art-grid">{selected.map((work, i) => <Artwork key={work.token} work={work} index={i} />)}</div>
  </section>
}

function Artwork({ work, index }) {
  const { token, rarity: tier } = work
  const [isOpen, setIsOpen] = useState(false)
  const traits = traitData[token] || []
  useEffect(() => {
    if (!isOpen) return undefined
    const closeOnEscape = (event) => event.key === 'Escape' && setIsOpen(false)
    document.addEventListener('keydown', closeOnEscape)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', closeOnEscape); document.body.style.overflow = previousOverflow }
  }, [isOpen])
  return <motion.figure className={`artwork artwork-${index % 4}`} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={fadeUp}>
    <button className="art-image" type="button" onClick={() => setIsOpen(true)} aria-label={`View traits for The Line #${token}`}><Image src={`/images/collection/${token}.png`} alt={`The Line #${token}, ${tier}`} fill sizes="(max-width: 700px) 100vw, 25vw" loading={index < 4 ? 'eager' : 'lazy'} /><span className="art-hover">View</span></button>
    <figcaption><span>THE LINE / #{token}</span><span className={`rarity-${tier.toLowerCase()}`}>{tier}</span></figcaption>
    {isOpen && <div className="trait-modal" role="dialog" aria-modal="true" aria-label={`Traits for The Line #${token}`} onClick={() => setIsOpen(false)}><div className="trait-dialog" onClick={(event) => event.stopPropagation()}><button className="trait-close" type="button" onClick={() => setIsOpen(false)} aria-label="Close traits">×</button><div className="trait-preview"><Image src={`/images/collection/${token}.png`} alt={`The Line #${token}`} fill sizes="(max-width: 700px) 90vw, 42vw" /></div><div className="trait-content"><span className="micro-label">THE LINE / #{token}</span><h3>#{token}</h3><p className={`rarity-${tier.toLowerCase()}`}>{tier}</p><div className="trait-list">{traits.map(([name, value]) => <div className="trait-row" key={name}><span>{name}</span><strong>{value}</strong></div>)}</div></div></div></div>}
  </motion.figure>
}

function About() {
  return <section className="about section-frame" id="about"><SectionLabel number="02">The idea</SectionLabel><div className="about-grid"><h2>One element.<br /><em>3333 variations.</em></h2><div className="about-copy"><p>A line is simple.<br />Its position is not.</p><p>Through position, length, formation and density, a single element becomes thousands of distinct compositions.</p></div></div></section>
}

const systemParameters = [
  { id: 'count', number: '01', label: 'Line count', value: '15 lines' },
  { id: 'formation', number: '02', label: 'Formation', value: 'Asymmetric' },
  { id: 'position', number: '03', label: 'Position', value: 'Upper + lower' },
  { id: 'length', number: '04', label: 'Length', value: 'Long' },
  { id: 'width', number: '05', label: 'Width', value: '5 px' },
  { id: 'density', number: '06', label: 'Density', value: 'Dense' },
]

function SystemArtwork({ active }) {
  const lines = Array.from({ length: 24 }, (_, index) => {
    const baseX = 48 + ((index * 71) % 405)
    const baseY = 44 + ((index * 53) % 425)
    const baseLength = 46 + ((index * 37) % 118)
    const isVisible = active === 'count' ? index < 22 : index < 15
    const length = active === 'length' ? baseLength * 1.22 : active === 'width' ? baseLength * .92 : baseLength
    const x = active === 'position' ? baseX : active === 'formation' ? 52 + ((index * 89) % 385) : baseX
    const y = active === 'position' ? (index % 2 ? baseY + 38 : baseY - 25) : active === 'formation' ? 48 + ((index * 67) % 405) : baseY
    return { index, x, y, x2: x, y2: y + length, isVisible }
  })
  return <div className="system-artwork"><svg viewBox="0 0 512 512" role="img" aria-label="Interactive generative line composition"><rect width="512" height="512" fill="#050505" /><image href="/images/collection/1586.png" x="0" y="0" width="512" height="512" preserveAspectRatio="xMidYMid slice" opacity={active ? .18 : .72} />{lines.map((line) => <line className="system-art-line" key={line.index} x1={line.x} y1={line.y} x2={line.x2} y2={line.y2} stroke="#f5f5f5" strokeWidth={active === 'width' ? 5 : 4} strokeLinecap="square" style={{ opacity: line.isVisible ? (active ? .9 : .28) : 0 }} />)}</svg></div>
}

function GenerativeSystem() {
  const [active, setActive] = useState(null)
  const selectParameter = (id) => setActive(id)
  const resetParameter = () => setActive(null)
  return <section className="system section-frame" id="system"><SectionLabel number="03">Generative system</SectionLabel><div className="system-head"><h2>The system behind<br /><em>the line.</em></h2><p>Every work is defined by six visual parameters: line count, formation, position, length, width and density.</p></div><div className="system-exhibit system-list-only">{systemParameters.map((parameter) => <SystemParameter key={parameter.id} parameter={parameter} active={active} onSelect={selectParameter} onReset={resetParameter} />)}</div></section>
}

function SystemParameter({ parameter, active, onSelect, onReset }) {
  const isActive = active === parameter.id
  return <button className={`system-parameter ${isActive ? 'is-active' : ''}`} type="button" aria-pressed={isActive} aria-label={`${parameter.number} ${parameter.label}, ${parameter.value}`} onMouseEnter={() => onSelect(parameter.id)} onMouseLeave={onReset} onFocus={() => onSelect(parameter.id)} onBlur={onReset} onClick={() => onSelect(parameter.id)}><span className="system-parameter-number">{parameter.number}</span><span className="system-parameter-label">{parameter.label}</span><strong>{parameter.value}</strong></button>
}

function Rarity() {
  return <section className="rarity section-frame" id="rarity"><SectionLabel number="03">Rarity as structure</SectionLabel><div className="rarity-intro"><h2>Different rules.<br /><em>Different worlds.</em></h2><p>Rarity describes the structure of each composition. It is not a measure of value, but a record of how often a particular system appears.</p></div><div className="rarity-list">{rarity.map(([amount, label]) => <div className="rarity-row" key={label}><strong>{amount}</strong><span className={`rarity-${label.toLowerCase()}`}>{label}</span></div>)}</div><div className="mythic"><div><span className="micro-label">The singular study</span><h3>#1791</h3><p>Mythic / 1 of 1</p></div><div className="mythic-art"><Image src="/images/collection/1791.png" alt="The Line #1791, Mythic" fill sizes="(max-width: 700px) 100vw, 42vw" /></div></div></section>
}

function Prereveal() {
  return <section className="prereveal section-frame"><SectionLabel number="04">Pre-reveal</SectionLabel><div className="prereveal-grid"><div className="hidden-art"><span>THE LINE</span><i /></div><div><h2>Some things<br /><em>take shape later.</em></h2><p>All pieces remain concealed until the collection is revealed. The collection will be revealed after the mint concludes. The exact implementation and date will be configured later.</p></div></div></section>
}

const aboutStages = [
  'A LINE.\\nA BEGINNING.',
  'FROM ONE SIMPLE ELEMENT,\\nFORM BEGINS TO EMERGE.',
  'SPACE BECOMES STRUCTURE.\\nSTRUCTURE BECOMES VARIATION.',
  'THE LINE\\n3333 VARIATIONS',
]

function AboutFilm() {
  const canvasRef = useRef(null)
  const sectionRef = useRef(null)
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const section = sectionRef.current
    if (!canvas || !section) return undefined
    const context = canvas.getContext('2d')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let progress = 0
    let targetProgress = 0
    let width = 0
    let height = 0
    let dpr = 1

    const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))
    const ease = (value) => value * value * (3 - 2 * value)
    const seeded = (index, salt = 0) => {
      const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
      return value - Math.floor(value)
    }
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const updateProgress = () => {
      const rect = section.getBoundingClientRect()
      targetProgress = clamp((window.innerHeight * .12 - rect.top) / Math.max(1, rect.height - window.innerHeight * .12))
      setStage(Math.min(3, Math.floor(targetProgress * 4)))
    }
    const line = (x1, y1, x2, y2, alpha = 1, lineWidth = 1) => {
      context.strokeStyle = `rgba(245, 245, 241, ${alpha})`
      context.lineWidth = lineWidth
      context.beginPath()
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.stroke()
    }
    const render = (time = 0) => {
      if (!reduceMotion) progress += (targetProgress - progress) * .075
      else progress = targetProgress
      context.clearRect(0, 0, width, height)
      context.fillStyle = '#000000'
      context.fillRect(0, 0, width, height)
      const cx = width / 2
      const cy = height / 2
      const scale = Math.min(width, height) / 512
      const emergence = ease(clamp((progress - .15) / .3))
      const settle = clamp((progress - .36) / .27)
      const structure = ease(settle)
      const alive = reduceMotion ? 0 : 1

      context.save()
      context.translate(cx, cy)
      context.scale(scale, scale)
      context.beginPath()
      context.rect(-181, -181, 362, 362)
      context.clip()

      const centralLineOpacity = 1 - ease(clamp((progress - .12) / .2))
      const centralBreath = alive * Math.sin(time / 2200) * 2.6
      line(0, -32 - centralBreath, 0, 32 + centralBreath, centralLineOpacity, 2)

      const formationCount = 36
      for (let index = 0; index < formationCount; index += 1) {
        const normalized = index / (formationCount - 1)
        const symmetryIndex = Math.min(index, formationCount - 1 - index)
        const organicX = -166 + normalized * 332
        const organicY = -125 + seeded(symmetryIndex, 3) * 250
        const organicLength = 42 + seeded(symmetryIndex, 4) * 135
        const entry = clamp(emergence * 1.35 - symmetryIndex * .022)
        // Each line settles into the field on its own beat, centre outward.
        // Without this the whole formation snaps as one rigid object.
        const lineSettle = ease(clamp(settle * 1.62 - (17 - symmetryIndex) * .031))
        const fieldX = -181 + normalized * 362
        const x = organicX * entry + fieldX * lineSettle
        // Never fully at rest: a slow drift of well under one percent.
        const life = alive * Math.sin(time / 2600 + symmetryIndex * .74) * 3.2
        const organicTop = organicY - organicLength * .5
        const organicBottom = organicY + organicLength * .5
        const top = organicTop + (-181 - organicTop) * lineSettle - life
        const bottom = organicBottom + (181 - organicBottom) * lineSettle + life
        const presence = entry + lineSettle * (1 - entry)
        const opacity = presence * (.42 + seeded(symmetryIndex, 6) * .58) * (1 + life * .02)
        context.strokeStyle = `rgba(245, 245, 241, ${clamp(opacity)})`
        context.lineWidth = (3.2 + seeded(symmetryIndex, 9) * 1.1) - lineSettle * (1.7 + seeded(symmetryIndex, 9) * 1.1)
        context.beginPath()
        context.moveTo(x, top)
        context.lineTo(x, bottom)
        context.stroke()
      }

      if (structure > 0) {
        context.strokeStyle = `rgba(245, 245, 241, ${structure * .54 + alive * Math.sin(time / 3400) * .03})`
        context.lineWidth = 1
        context.strokeRect(-181, -181, 362, 362)
      }
      context.restore()
      frame = requestAnimationFrame(render)
    }
    resize()
    updateProgress()
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', updateProgress, { passive: true })
    frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('scroll', updateProgress) }
  }, [])

  return <section className="about-film" id="about" ref={sectionRef}><div className="about-film-sticky"><div className="about-film-label section-frame"><SectionLabel number="02">About</SectionLabel></div><div className="about-film-stage"><canvas ref={canvasRef} aria-label="A scroll-driven evolution from one line into a generative formation" /><div className="about-film-copy" aria-live="polite">{aboutStages[stage].split('\\n').map((line, index) => <span key={`${stage}-${index}`}>{line}</span>)}</div></div></div></section>
}

function FAQ() {
  const questions = [
    ['What is The Line?', 'The Line explores the relationship between simplicity and complexity. Beginning with a single element, each work evolves through changes in space, structure and formation, creating 3,333 unique interpretations of the same idea.'],
    ['How do I collect one?', 'Burn 150,000 $LINE on this site and one work is minted straight to your wallet. It is a single transaction: the burn and the mint happen together, or neither happens at all.', 'Go to Mint'],
    ['What do I receive?', 'Every work stays unrevealed until all 3,333 have been collected. While the mint is open, no edition shows anything about itself, so no number is worth more than another at the moment you take it.'],
    ['How is the work drawn?', 'Each piece is drawn from six defined parameters: line count, formation, position, length, width and density.'],
  ]
  const [openIndex, setOpenIndex] = useState(-1)
  return <section className="faq section-frame" id="faq"><SectionLabel number="03">Frequently asked</SectionLabel><div className="faq-grid"><div className="faq-title"><h2>You ask.<br /><em>We answer.</em></h2><span className="section-japanese" lang="ja">問いと答え</span></div><div className="faq-list">{questions.map(([q, a, action], index) => {
    const isOpen = openIndex === index
    return <div className={isOpen ? 'faq-item is-open' : 'faq-item'} key={q}>
      <button className="faq-summary" type="button" id={`faq-q-${index}`} aria-expanded={isOpen} aria-controls={`faq-a-${index}`} onClick={() => setOpenIndex(isOpen ? -1 : index)}>{q}<span aria-hidden="true">+</span></button>
      <div className="faq-answer" id={`faq-a-${index}`} role="region" aria-labelledby={`faq-q-${index}`}><div><p>{a}</p>{action && <Link className="faq-action" href="/mint" tabIndex={isOpen ? 0 : -1}>{action}</Link>}</div></div>
    </div>
  })}</div></div></section>
}

function Footer() {
  return <footer className="footer section-frame"><div className="footer-top"><a className="wordmark" href="#top">The Line</a><span className="footer-note">© 2026</span><div className="footer-links"><a className="twitter-mark" href="https://x.com/thelinesart" target="_blank" rel="noreferrer" aria-label="The Line on Twitter"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.24-8.28L2.8 2h6.4l4.42 5.84L18.9 2Zm-1.1 17.8h1.73L8.28 4.08H6.43L17.8 19.8Z" /></svg></a>{openSeaUrl && <a className="opensea-mark" href={openSeaUrl} target="_blank" rel="noreferrer" aria-label="The Line on OpenSea"><img src="/opensea-logo.png" alt="" /></a>}</div></div></footer>
}

export default function Home() {
  const [showIntro, setShowIntro] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { const timer = window.setTimeout(() => setShowIntro(false), 3200); return () => window.clearTimeout(timer) }, [])
  return <>{showIntro && <IntroLoader onComplete={() => setShowIntro(false)} />}<div className="site-shell"><Nav open={menuOpen} setOpen={setMenuOpen} /><main><Hero /><Collection /><AboutFilm /><FAQ /></main><Footer /></div></>
}
