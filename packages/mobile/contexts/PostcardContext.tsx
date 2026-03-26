import { createContext, useCallback, useContext, useRef } from "react";

export interface Photo {
  path: string;
  width: number;
  height: number;
}

interface PostcardState {
  frontPhoto: Photo | null;
  croppedPhoto: Photo | null;
  message: string;
  senderName: string;
  setFrontPhoto: (photo: Photo) => void;
  setCroppedPhoto: (photo: Photo) => void;
  setMessage: (msg: string) => void;
  setSenderName: (name: string) => void;
  reset: () => void;
}

const PostcardContext = createContext<PostcardState | null>(null);

export function PostcardProvider({ children }: { children: React.ReactNode }) {
  const frontPhoto = useRef<Photo | null>(null);
  const croppedPhoto = useRef<Photo | null>(null);
  const message = useRef("");
  const senderName = useRef("");

  const setFrontPhoto = useCallback((photo: Photo) => {
    frontPhoto.current = photo;
  }, []);

  const setCroppedPhoto = useCallback((photo: Photo) => {
    croppedPhoto.current = photo;
  }, []);

  const setMessage = useCallback((msg: string) => {
    message.current = msg;
  }, []);

  const setSenderName = useCallback((name: string) => {
    senderName.current = name;
  }, []);

  const reset = useCallback(() => {
    frontPhoto.current = null;
    croppedPhoto.current = null;
    message.current = "";
    senderName.current = "";
  }, []);

  return (
    <PostcardContext.Provider
      value={{
        get frontPhoto() {
          return frontPhoto.current;
        },
        get croppedPhoto() {
          return croppedPhoto.current;
        },
        get message() {
          return message.current;
        },
        get senderName() {
          return senderName.current;
        },
        setFrontPhoto,
        setCroppedPhoto,
        setMessage,
        setSenderName,
        reset,
      }}
    >
      {children}
    </PostcardContext.Provider>
  );
}

export function usePostcard() {
  const ctx = useContext(PostcardContext);
  if (!ctx) throw new Error("usePostcard must be used within PostcardProvider");
  return ctx;
}
