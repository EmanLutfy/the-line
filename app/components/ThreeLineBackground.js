'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

const POINTS = 160
const STRAND_COUNT = 3
const DASH_COUNT = 14

const vertexShader = `
  attribute float lineProgress;
  attribute float strandId;
  attribute float dashPhase;
  varying float vProgress;
  varying float vStrandId;
  varying float vDashPhase;
  varying vec3 vWorldPos;
  void main() {
    vProgress = lineProgress;
    vStrandId = strandId;
    vDashPhase = dashPhase;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
    float width = mix(2.0, 4.2, smoothstep(0.0, 1.0, vProgress)) * (1.0 - vStrandId * 0.12);
    gl_PointSize = width * (300.0 / -mvPosition.z);
  }
`

const fragmentShader = `
  varying float vProgress;
  varying float vStrandId;
  varying float vDashPhase;
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec2 uResolution;
  uniform float uDashSpeed;
  uniform float uDashCount;
  uniform float uDashWidth;
  uniform float uGapWidth;
  
  vec3 filmic(vec3 color) {
    vec3 x = max(vec3(0.0), color - 0.004);
    return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
  }
  
  float dashPattern(float progress, float phase, float count, float dashWidth, float gapWidth, float speed, float time) {
    float p = progress * count + phase + time * speed;
    float cycle = dashWidth + gapWidth;
    float pos = mod(p, cycle);
    float dash = smoothstep(0.0, 0.015, pos) * (1.0 - smoothstep(dashWidth, dashWidth + 0.015, pos));
    return dash;
  }
  
  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center) * 2.0;
    float alpha = smoothstep(1.0, 0.0, dist);
    
    float dash = dashPattern(vProgress, vDashPhase, uDashCount, uDashWidth, uGapWidth, uDashSpeed, uTime);
    alpha *= dash;
    
    float pulse = sin(vProgress * 35.0 + uTime * 6.0) * 0.08 + 0.92;
    alpha *= pulse * uIntensity * (1.0 - vStrandId * 0.18);
    
    float depthFade = smoothstep(65.0, 12.0, length(vWorldPos - vec3(0.0, 0.0, -20.0)));
    vec3 color = uColor * depthFade;
    
    float cycle = uDashWidth + uGapWidth;
    float p = vProgress * uDashCount + vDashPhase + uTime * uDashSpeed;
    float pos = mod(p, cycle);
    float edgeGlow = smoothstep(uDashWidth - 0.04, uDashWidth, pos) * 1.2;
    color += uColor * edgeGlow * 0.7;
    
    float trailFade = smoothstep(uDashWidth - 0.08, uDashWidth - 0.02, pos) * 0.3;
    color += uColor * trailFade * 0.4;
    
    float ca = dist * 0.08 * dash;
    color.r += ca * 0.05;
    color.b -= ca * 0.05;
    
    gl_FragColor = vec4(filmic(color), alpha);
    
    if (gl_FragColor.a < 0.008) discard;
  }
`

function generateBasePoints() {
  const points = []
  for (let i = 0; i < POINTS; i++) {
    const t = i / (POINTS - 1)
    const x = (t - 0.5) * 40
    const y = Math.sin(t * Math.PI * 4) * 3 * Math.sin(t * Math.PI)
    const z = Math.cos(t * Math.PI * 3) * 3 * Math.cos(t * Math.PI * 0.7)
    points.push(new THREE.Vector3(x, y, z))
  }
  return points
}

export function ThreeLineBackground() {
  const containerRef = useRef(null)
  const animationRef = useRef()
  const basePoints = useRef(generateBasePoints())
  const strands = useRef([])
  const camera = useRef()
  const renderer = useRef()
  const scene = useRef()
  const shaderMaterial = useRef()
  const startTime = useRef(performance.now() / 1000)
  const targetMouse = useRef({ x: 0.5, y: 0.5 })
  const currentMouse = useRef({ x: 0.5, y: 0.5 })
  const cameraPath = useRef([
    { pos: new THREE.Vector3(0, 0, 35), lookAt: new THREE.Vector3(0, 0, -20), fov: 40, duration: 10 },
    { pos: new THREE.Vector3(4, 2.5, 32), lookAt: new THREE.Vector3(-1.5, 0, -22), fov: 38, duration: 12 },
    { pos: new THREE.Vector3(-3, -1.5, 38), lookAt: new THREE.Vector3(1.5, 0, -18), fov: 42, duration: 11 },
    { pos: new THREE.Vector3(0, 2, 30), lookAt: new THREE.Vector3(0, -0.5, -25), fov: 35, duration: 14 },
  ])
  const pathIndex = useRef(0)
  const pathProgress = useRef(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const container = containerRef.current
    if (!container) return

    scene.current = new THREE.Scene()
    scene.current.fog = new THREE.FogExp2(0x0a0a0a, 0.007)

    camera.current = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200)
    camera.current.position.set(0, 0, 35)

    renderer.current = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    })
    renderer.current.setSize(window.innerWidth, window.innerHeight)
    renderer.current.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.current.setClearColor(0x0a0a0a, 1)
    renderer.current.toneMapping = THREE.CineonToneMapping
    renderer.current.toneMappingExposure = 1.25
    container.appendChild(renderer.current.domElement)

    shaderMaterial.current = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uTime: { value: 0 },
        uIntensity: { value: 1.0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uDashSpeed: { value: 0.06 },
        uDashCount: { value: DASH_COUNT },
        uDashWidth: { value: 0.52 },
        uGapWidth: { value: 0.48 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    })

    const colors = [0xffffff, 0xfafafa, 0xf0f4ff]
    const intensities = [1.0, 0.78, 0.55]

    for (let s = 0; s < STRAND_COUNT; s++) {
      const positions = new Float32Array(POINTS * 3)
      const lineProgress = new Float32Array(POINTS)
      const strandId = new Float32Array(POINTS)
      const dashPhase = new Float32Array(POINTS)

      basePoints.current.forEach((p, i) => {
        positions[i * 3] = p.x
        positions[i * 3 + 1] = p.y
        positions[i * 3 + 2] = p.z
        lineProgress[i] = i / (POINTS - 1)
        strandId[i] = s
        dashPhase[i] = s * 4.1 + Math.sin(i * 0.18) * 1.2
      })

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('lineProgress', new THREE.BufferAttribute(lineProgress, 1))
      geometry.setAttribute('strandId', new THREE.BufferAttribute(strandId, 1))
      geometry.setAttribute('dashPhase', new THREE.BufferAttribute(dashPhase, 1))

      const material = shaderMaterial.current.clone()
      material.uniforms.uColor.value.setHex(colors[s])
      material.uniforms.uIntensity.value = intensities[s]
      material.uniforms.uDashSpeed.value = 0.06 + s * 0.015
      material.uniforms.uDashCount.value = DASH_COUNT
      material.uniforms.uDashWidth.value = 0.52
      material.uniforms.uGapWidth.value = 0.48

      const points = new THREE.Points(geometry, material)
      points.renderOrder = s
      scene.current.add(points)
      strands.current.push({ 
        geometry, 
        material, 
        points,
        basePoints: basePoints.current, 
        index: s,
        color: colors[s],
        intensity: intensities[s]
      })
    }

    const onMouseMove = (e) => {
      targetMouse.current.x = e.clientX / window.innerWidth
      targetMouse.current.y = 1 - e.clientY / window.innerHeight
    }
    window.addEventListener('mousemove', onMouseMove)

    const onResize = () => {
      if (!camera.current || !renderer.current) return
      camera.current.aspect = window.innerWidth / window.innerHeight
      camera.current.updateProjectionMatrix()
      renderer.current.setSize(window.innerWidth, window.innerHeight)
      strands.current.forEach(({ material }) => {
        material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
      })
    }
    window.addEventListener('resize', onResize)

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate)
      const elapsed = performance.now() / 1000 - startTime.current
      const time = elapsed * 0.55
      
      strands.current.forEach(({ material }) => {
        material.uniforms.uTime.value = time
      })

      currentMouse.current.x += (targetMouse.current.x - currentMouse.current.x) * 0.03
      currentMouse.current.y += (targetMouse.current.y - currentMouse.current.y) * 0.03

      const currentKey = cameraPath.current[pathIndex.current]
      const nextKey = cameraPath.current[(pathIndex.current + 1) % cameraPath.current.length]
      pathProgress.current += 1 / (currentKey.duration * 60)
      
      if (pathProgress.current >= 1) {
        pathProgress.current = 0
        pathIndex.current = (pathIndex.current + 1) % cameraPath.current.length
      }
      
      const eased = pathProgress.current * pathProgress.current * (3 - 2 * pathProgress.current)
      
      camera.current.position.lerpVectors(currentKey.pos, nextKey.pos, eased)
      const lookTarget = new THREE.Vector3().lerpVectors(currentKey.lookAt, nextKey.lookAt, eased)
      camera.current.fov = THREE.MathUtils.lerp(currentKey.fov, nextKey.fov, eased)
      camera.current.updateProjectionMatrix()
      camera.current.lookAt(lookTarget)

      camera.current.position.x += (currentMouse.current.x - 0.5) * 0.8
      camera.current.position.y += (currentMouse.current.y - 0.5) * 0.5

      strands.current.forEach(({ geometry, basePoints, index, intensity }) => {
        const positions = geometry.attributes.position.array
        const strandTime = time * 0.09 + index * 3.1

        for (let i = 0; i < POINTS; i++) {
          const p = i / (POINTS - 1)
          const base = basePoints[i]

          const wave1 = Math.sin(p * Math.PI * 7 + strandTime * 1.0) * 0.65
          const wave2 = Math.cos(p * Math.PI * 4.5 - strandTime * 0.75) * 0.35
          const wave3 = Math.sin(p * Math.PI * 10 + strandTime * 0.45) * 0.18
          const noise = (Math.sin(p * 37.3 + strandTime * 1.5) * Math.cos(p * 25.7 - strandTime * 1.1)) * 0.25

          const mx = (currentMouse.current.x - 0.5) * 2.5 * intensity
          const my = (currentMouse.current.y - 0.5) * 1.6 * intensity

          positions[i * 3] = base.x + wave1 + wave2 + wave3 + noise + mx * p
          positions[i * 3 + 1] = base.y + wave1 * 0.55 + wave2 * 1.05 + noise * 0.35 + my * (1 - p)
          positions[i * 3 + 2] = base.z + wave2 * 0.6 + wave3 * 0.9 + noise * 0.18
        }

        geometry.attributes.position.needsUpdate = true
      })

      renderer.current.render(scene.current, camera.current)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      if (renderer.current) {
        renderer.current.dispose()
        container.removeChild(renderer.current.domElement)
      }
      strands.current.forEach(({ geometry, material }) => {
        geometry.dispose()
        material.dispose()
      })
      if (shaderMaterial.current) {
        shaderMaterial.current.dispose()
      }
    }
  }, [])

  if (!mounted) {
    return <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#0a0a0a' }} />
  }

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
}

export default ThreeLineBackground

// ===== SOUND TOGGLE COMPONENT =====
export function SoundToggle({ autoStart = false }) {
  const [enabled, setEnabled] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const audioCtxRef = useRef(null)
  const oscRef = useRef(null)
  const gainRef = useRef(null)
  const lfoRef = useRef(null)
  const lfoGainRef = useRef(null)
  const startedRef = useRef(false)

  const initAudio = () => {
    if (audioCtxRef.current) return
    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    
    gainRef.current = audioCtxRef.current.createGain()
    gainRef.current.gain.value = 0.08
    gainRef.current.connect(audioCtxRef.current.destination)
    
    oscRef.current = audioCtxRef.current.createOscillator()
    oscRef.current.type = 'sine'
    oscRef.current.frequency.value = 55
    oscRef.current.connect(gainRef.current)
    
    lfoRef.current = audioCtxRef.current.createOscillator()
    lfoRef.current.type = 'sine'
    lfoRef.current.frequency.value = 0.15
    lfoGainRef.current = audioCtxRef.current.createGain()
    lfoGainRef.current.gain.value = 8
    lfoRef.current.connect(lfoGainRef.current)
    lfoGainRef.current.connect(oscRef.current.frequency)
    
    const osc2 = audioCtxRef.current.createOscillator()
    osc2.type = 'triangle'
    osc2.frequency.value = 110
    const gain2 = audioCtxRef.current.createGain()
    gain2.gain.value = 0.03
    osc2.connect(gain2)
    gain2.connect(gainRef.current)
    
    const bufferSize = 4096
    const noiseBuffer = audioCtxRef.current.createBuffer(1, bufferSize, audioCtxRef.current.sampleRate)
    const noiseData = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      noiseData[i] = Math.random() * 2 - 1
    }
    const noise = audioCtxRef.current.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true
    const noiseFilter = audioCtxRef.current.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 200
    noiseFilter.Q.value = 0.5
    const noiseGain = audioCtxRef.current.createGain()
    noiseGain.gain.value = 0.008
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(gainRef.current)
    
    oscRef.current.start()
    lfoRef.current.start()
    osc2.start()
    noise.start()
    startedRef.current = true
  }

  const start = async () => {
    if (startedRef.current) return
    initAudio()
    try {
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
      setEnabled(true)
      setBlocked(false)
    } catch (e) {
      setBlocked(true)
    }
  }

  const stop = () => {
    if (audioCtxRef.current) {
      audioCtxRef.current.suspend()
    }
    setEnabled(false)
  }

  const toggle = () => {
    if (!enabled) {
      start()
    } else {
      stop()
    }
  }

  // Try immediate autoplay on mount
  useEffect(() => {
    if (autoStart) {
      start()
    }
  }, [autoStart])

  // Fallback: enable on first interaction if blocked
  useEffect(() => {
    if (!autoStart || !blocked) return
    const onInteraction = () => {
      start()
      window.removeEventListener('click', onInteraction)
      window.removeEventListener('keydown', onInteraction)
      window.removeEventListener('touchstart', onInteraction)
    }
    window.addEventListener('click', onInteraction, { once: true })
    window.addEventListener('keydown', onInteraction, { once: true })
    window.addEventListener('touchstart', onInteraction, { once: true })
    return () => {
      window.removeEventListener('click', onInteraction)
      window.removeEventListener('keydown', onInteraction)
      window.removeEventListener('touchstart', onInteraction)
    }
  }, [autoStart, blocked])

  return (
    <button
      onClick={toggle}
      style={{
        position: 'fixed',
        bottom: '32px',
        right: '32px',
        zIndex: 1000,
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.15)',
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(10px)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease',
        boxShadow: enabled 
          ? '0 0 30px rgba(255,255,255,0.1), inset 0 0 20px rgba(255,255,255,0.05)'
          : '0 4px 20px rgba(0,0,0,0.4)',
        opacity: blocked ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        e.target.style.borderColor = 'rgba(255,255,255,0.4)'
        e.target.style.transform = 'scale(1.05)'
      }}
      onMouseLeave={(e) => {
        e.target.style.borderColor = 'rgba(255,255,255,0.15)'
        e.target.style.transform = 'scale(1)'
      }}
      aria-label={enabled ? 'Disable ambient sound' : 'Enable ambient sound'}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke={enabled ? '#ffffff' : blocked ? '#ff6b6b' : '#737373'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: 'all 0.3s ease', filter: enabled ? 'drop-shadow(0 0 4px rgba(255,255,255,0.5))' : 'none' }}
      >
        {enabled ? (
          <>
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </>
        ) : blocked ? (
          <>
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
            <circle cx="12" cy="12" r="3" strokeWidth="2" />
          </>
        ) : (
          <>
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </>
        )}
      </svg>
    </button>
  )
}
