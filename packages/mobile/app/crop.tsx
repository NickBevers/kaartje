import { router } from "expo-router";
import { usePostcard } from "../contexts/PostcardContext";
import { CropView } from "../components/CropView";

export default function CropScreen() {
  const { frontPhoto, setCroppedPhoto } = usePostcard();

  if (!frontPhoto) {
    router.replace("/camera-front");
    return null;
  }

  return (
    <CropView
      photo={frontPhoto}
      onDismiss={() => router.back()}
      onCropped={(photo) => {
        setCroppedPhoto(photo);
        router.push("/details");
      }}
    />
  );
}
