import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { feature } from 'topojson-client'
import * as THREE from 'three'

export interface DottedGlobeProps {
  /** Spacing between dots in degrees (default: 1.1) */
  dotStep?: number
  /** Globe radius (default: 1.3) */
  radius?: number
  /** Dot color (default: '#ede6db') */
  dotColor?: string
  /** Dot size multiplier (default: 0.55) */
  dotSize?: number
  /** Atmosphere glow color (default: '#1a3a5c') */
  glowColor?: string
  /** Auto-rotation speed in rad/s (default: 0.1) */
  rotationSpeed?: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180
const LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json'

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

function isLand(lng: number, lat: number, geometry: { type: string; coordinates: number[][][] | number[][][][] }): boolean {
  if (geometry.type === 'Polygon') {
    return pointInRing(lng, lat, geometry.coordinates[0] as number[][])
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).some(
      (poly) => pointInRing(lng, lat, poly[0]),
    )
  }
  return false
}

function latLngToVec3(lat: number, lng: number, r: number): [number, number, number] {
  const phi = (90 - lat) * DEG
  const theta = (180 + lng) * DEG
  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ]
}

function collectGeometries(geojson: any): any[] {
  if (geojson.type === 'FeatureCollection') {
    return geojson.features.flatMap((f: any) => collectGeometries(f))
  }
  if (geojson.type === 'Feature') {
    return geojson.geometry ? [geojson.geometry] : []
  }
  if (geojson.type === 'GeometryCollection') {
    return geojson.geometries ?? []
  }
  return [geojson]
}

async function loadLandDots(step: number, radius: number): Promise<Float32Array> {
  const res = await fetch(LAND_URL)
  const topology = await res.json()
  const land = feature(topology, topology.objects.land)
  const geometries = collectGeometries(land)

  const positions: number[] = []
  for (let lat = -90 + step / 2; lat < 90; lat += step) {
    const cosLat = Math.cos(lat * DEG)
    const lngStep = cosLat > 0.05 ? step / cosLat : 360
    for (let lng = -180 + lngStep / 2; lng < 180; lng += lngStep) {
      if (geometries.some((g: any) => isLand(lng, lat, g))) {
        const [x, y, z] = latLngToVec3(lat, lng, radius)
        positions.push(x, y, z)
      }
    }
  }

  return new Float32Array(positions)
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const dotVertex = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uSize;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uPixelRatio * (150.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const dotFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.4) discard;
    gl_FragColor = vec4(uColor, 1.0);
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
    fresnel = pow(fresnel, 3.5) * 0.55;
    gl_FragColor = vec4(uColor, fresnel);
  }
`

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LandDots({
  positions,
  color,
  size,
}: {
  positions: Float32Array
  color: string
  size: number
}) {
  const { gl } = useThree()

  const { geometry, uniforms } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    return {
      geometry: geo,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uPixelRatio: { value: gl.getPixelRatio() },
        uSize: { value: size },
      },
    }
  }, [positions, color, size, gl])

  return (
    <points geometry={geometry}>
      <shaderMaterial
        vertexShader={dotVertex}
        fragmentShader={dotFragment}
        uniforms={uniforms}
      />
    </points>
  )
}

function Atmosphere({ radius, color }: { radius: number; color: string }) {
  const uniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(color) } }),
    [color],
  )

  return (
    <mesh>
      <sphereGeometry args={[radius * 1.15, 64, 64]} />
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

export function DottedGlobe({
  dotStep = 1.1,
  radius = 2.5,
  dotColor = '#ede6db',
  dotSize = 0.55,
  glowColor = '#1a3a5c',
  rotationSpeed = 0.1,
}: DottedGlobeProps = {}) {
  const groupRef = useRef<THREE.Group>(null!)
  const [positions, setPositions] = useState<Float32Array | null>(null)

  useEffect(() => {
    loadLandDots(dotStep, radius).then(setPositions).catch(console.error)
  }, [dotStep, radius])

  useFrame((_, delta) => {
    groupRef.current.rotation.y += delta * rotationSpeed
  })

  return (
    <group ref={groupRef}>
      {positions && (
        <LandDots positions={positions} color={dotColor} size={dotSize} />
      )}
      <Atmosphere radius={radius} color={glowColor} />
    </group>
  )
}
