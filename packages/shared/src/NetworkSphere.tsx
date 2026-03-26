import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export interface NetworkSphereProps {
  /** Number of particles on the sphere */
  particleCount?: number
  /** Number of animated arcs */
  arcCount?: number
  /** Sphere radius */
  radius?: number
  /** Primary color for particles and arcs */
  primaryColor?: string
  /** Glow color for the atmosphere */
  glowColor?: string
  /** Auto-rotation speed (radians per second) */
  rotationSpeed?: number
  /** Base particle size multiplier */
  particleSize?: number
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function fibonacciSphere(count: number, radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = goldenAngle * i

    points.push(
      new THREE.Vector3(
        Math.cos(theta) * r * radius,
        y * radius,
        Math.sin(theta) * r * radius,
      ),
    )
  }

  return points
}

function pickArcPairs(
  points: THREE.Vector3[],
  count: number,
  minDist: number,
) {
  const pairs: {
    start: THREE.Vector3
    end: THREE.Vector3
    speed: number
    offset: number
  }[] = []
  const used = new Set<number>()

  for (let i = 0; i < count; i++) {
    let a = -1
    let b = -1
    let attempts = 0

    while (attempts < 100) {
      a = Math.floor(Math.random() * points.length)
      b = Math.floor(Math.random() * points.length)
      if (
        a !== b &&
        !used.has(a) &&
        !used.has(b) &&
        points[a].distanceTo(points[b]) > minDist
      ) {
        break
      }
      attempts++
    }

    if (a >= 0 && b >= 0) {
      used.add(a)
      used.add(b)
      pairs.push({
        start: points[a],
        end: points[b],
        speed: 0.12 + Math.random() * 0.18,
        offset: Math.random(),
      })
    }
  }

  return pairs
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const particleVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSize;
  varying float vAlpha;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float pulse = 0.8 + 0.2 * sin(uTime * 1.5 + position.x * 5.0 + position.z * 4.0);
    gl_PointSize = aSize * pulse * uPixelRatio * (120.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    vAlpha = pulse;
  }
`

const particleFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float strength = 1.0 - smoothstep(0.0, 0.5, d);
    strength = pow(strength, 1.5);
    gl_FragColor = vec4(uColor, strength * vAlpha * 0.85);
  }
`

const arcVertex = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const arcFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uOffset;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    float progress = fract(uTime * uSpeed + uOffset);
    float head = progress * 1.4 - 0.2;
    float tail = head - 0.35;

    float alpha = smoothstep(tail, tail + 0.08, vUv.x)
                * (1.0 - smoothstep(head - 0.08, head, vUv.x));

    float headGlow = 1.0 - smoothstep(0.0, 0.04, abs(vUv.x - head));
    alpha = max(alpha, headGlow * 0.6);

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vViewPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosphereFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 viewDir = normalize(-vViewPos);
    float fresnel = 1.0 - dot(viewDir, vNormal);
    fresnel = pow(fresnel, 3.5) * 0.65;
    gl_FragColor = vec4(uColor, fresnel);
  }
`

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Particles({
  points,
  color,
  baseSize,
}: {
  points: THREE.Vector3[]
  color: string
  baseSize: number
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null!)
  const { gl } = useThree()

  const { geometry, uniforms } = useMemo(() => {
    const positions = new Float32Array(points.length * 3)
    const sizes = new Float32Array(points.length)

    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x
      positions[i * 3 + 1] = points[i].y
      positions[i * 3 + 2] = points[i].z
      sizes[i] = (Math.random() * 1.5 + 0.5) * baseSize
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uPixelRatio: { value: gl.getPixelRatio() },
      },
    }
  }, [points, color, baseSize, gl])

  useFrame((state) => {
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={particleVertex}
        fragmentShader={particleFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function Arc({
  start,
  end,
  color,
  radius,
  speed,
  offset,
}: {
  start: THREE.Vector3
  end: THREE.Vector3
  color: string
  radius: number
  speed: number
  offset: number
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null!)

  const geometry = useMemo(() => {
    const mid = new THREE.Vector3()
      .addVectors(start, end)
      .multiplyScalar(0.5)
      .normalize()
      .multiplyScalar(radius * 1.4)

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    return new THREE.TubeGeometry(curve, 44, 0.006, 6, false)
  }, [start, end, radius])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uOffset: { value: offset },
      uColor: { value: new THREE.Color(color) },
    }),
    [speed, offset, color],
  )

  useFrame((state) => {
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={arcVertex}
        fragmentShader={arcFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

function Arcs({
  points,
  color,
  count,
  radius,
}: {
  points: THREE.Vector3[]
  color: string
  count: number
  radius: number
}) {
  const arcs = useMemo(
    () => pickArcPairs(points, count, radius * 0.8),
    [points, count, radius],
  )

  return (
    <group>
      {arcs.map((arc, i) => (
        <Arc key={i} {...arc} color={color} radius={radius} />
      ))}
    </group>
  )
}

function Atmosphere({ radius, color }: { radius: number; color: string }) {
  const uniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(color) } }),
    [color],
  )

  return (
    <mesh>
      <sphereGeometry args={[radius * 1.2, 64, 64]} />
      <shaderMaterial
        vertexShader={atmosphereVertex}
        fragmentShader={atmosphereFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function NetworkSphere({
  particleCount = 300,
  arcCount = 6,
  radius = 2,
  primaryColor = '#4fc3f7',
  glowColor = '#1565c0',
  rotationSpeed = 0.15,
  particleSize = 1,
}: NetworkSphereProps = {}) {
  const groupRef = useRef<THREE.Group>(null!)

  const points = useMemo(
    () => fibonacciSphere(particleCount, radius),
    [particleCount, radius],
  )

  useFrame((_, delta) => {
    groupRef.current.rotation.y += delta * rotationSpeed
  })

  return (
    <group ref={groupRef}>
      <Particles points={points} color={primaryColor} baseSize={particleSize} />
      <Arcs points={points} color={primaryColor} count={arcCount} radius={radius} />
      <Atmosphere radius={radius} color={glowColor} />
    </group>
  )
}
