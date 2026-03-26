import { router } from "expo-router";
import { usePostcard } from "../contexts/PostcardContext";
import { CameraView } from "../components/CameraView";

export default function CameraFrontScreen() {
  const { setFrontPhoto } = usePostcard();

  return (
    <CameraView
      title="Scan the front of the postcard"
      onDismiss={() => router.replace("/")}
      onPhotoTaken={(photo) => {
        setFrontPhoto(photo);
        router.push("/crop");
      }}
    />
  );
}
