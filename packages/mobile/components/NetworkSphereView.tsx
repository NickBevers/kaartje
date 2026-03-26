import { Canvas } from '@react-three/fiber'
import { NetworkSphere } from '@kaartje/shared'
import { View } from 'react-native'
import { StyleSheet } from 'react-native-unistyles'

export function NetworkSphereView() {
  return (
    <View style={styles.container}>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <NetworkSphere />
      </Canvas>
    </View>
  )
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.night,
  },
}))
