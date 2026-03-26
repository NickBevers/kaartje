import { BlurView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const easeOut = Easing.bezier(0.2, 0.9, 0.1, 1);

export default function HomeScreen() {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);
  const blurIntensity = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 400, easing: easeOut });
    opacity.value = withSequence(
      withTiming(1, { duration: 400, easing: easeOut }),
      // withDelay(1100, withTiming(0, { duration: 350, easing: easeOut })),
    );
    blurIntensity.value = withDelay(
      1500,
      withTiming(100, { duration: 350, easing: easeOut }),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const blurProps = useAnimatedProps(() => ({
    intensity: blurIntensity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, animatedStyle]}>
        <Text style={styles.label}>Postcardware</Text>
        <Text style={styles.title}>Kaartje</Text>
        <Text style={styles.subtitle}>Postcards from around the world.</Text>
      </Animated.View>
      <AnimatedBlurView
        animatedProps={blurProps}
        tint="dark"
        style={styles.overlay}
      />
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.night,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
  },
  overlay: {
    position: "absolute",
    inset: 0,
  },
  label: {
    fontFamily: theme.fonts.sansMedium,
    fontSize: 12,
    color: theme.colors.stamp,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: theme.space(2),
    textAlign: "center",
  },
  title: {
    fontFamily: theme.fonts.serif,
    fontSize: 48,
    color: theme.colors.ink,
    marginBottom: theme.space(2),
    textAlign: "center",
  },
  subtitle: {
    fontFamily: theme.fonts.sans,
    fontSize: 16,
    color: theme.colors.inkFaded,
    textAlign: "center",
  },
}));
