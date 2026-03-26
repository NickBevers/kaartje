import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { router } from "expo-router";
import { Camera } from "react-native-vision-camera";
import { StyleSheet } from "react-native-unistyles";
import { NetworkSphereView } from "../components/NetworkSphereView";

export default function IntroScreen() {
  const handleComplete = () => {
    const status = Camera.getCameraPermissionStatus();
    router.replace(status === "granted" ? "/camera-front" : "/permission");
  };

  return (
    <View style={styles.container}>
      <NetworkSphereView onComplete={handleComplete} />
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
}));
