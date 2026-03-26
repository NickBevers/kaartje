import { router } from "expo-router";
import { usePostcard } from "../contexts/PostcardContext";
import { DetailsView } from "../components/DetailsView";

export default function DetailsScreen() {
  const { croppedPhoto, setMessage, setSenderName } = usePostcard();

  if (!croppedPhoto) {
    router.replace("/camera-front");
    return null;
  }

  return (
    <DetailsView
      onBack={() => router.back()}
      onContinue={(message, senderName) => {
        setMessage(message);
        setSenderName(senderName);
        router.push("/preview");
      }}
    />
  );
}
