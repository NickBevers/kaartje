import { Canvas } from '@react-three/fiber'
import { NetworkSphere } from '@kaartje/shared'

export function NetworkSphereView() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <NetworkSphere />
      </Canvas>
    </div>
  )
}
