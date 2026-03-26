import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { DottedGlobe } from "@kaartje/shared";

// Globe won't reveal until at least this many ms after mount,
// giving the text animation time to relocate first
const MIN_DELAY_MS = 4000;

export function NetworkSphereView() {
  const [revealed, setRevealed] = useState(false);
  const canvasReady = useRef(false);
  const timerReady = useRef(false);
  const mountTime = useRef(Date.now());

  const tryReveal = useCallback(() => {
    if (canvasReady.current && timerReady.current && !revealed) {
      requestAnimationFrame(() => setRevealed(true));
    }
  }, [revealed]);

  // Minimum delay before globe can appear
  useEffect(() => {
    const remaining = MIN_DELAY_MS - (Date.now() - mountTime.current);
    const timer = setTimeout(() => {
      timerReady.current = true;
      tryReveal();
    }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [tryReveal]);

  const handleCanvasCreated = useCallback(() => {
    canvasReady.current = true;
    tryReveal();
  }, [tryReveal]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transition: "transform 7s cubic-bezier(0.22, 1, 0.36, 1), opacity 2.5s cubic-bezier(0.22, 1, 0.36, 1)",
        transform: revealed ? "translateY(0)" : "translateY(60%)",
        opacity: revealed ? 1 : 0,
      }}
    >
      <Canvas camera={{ position: [0, 2, 8], fov: 45 }} onCreated={handleCanvasCreated}>
        <DottedGlobe arcDelay={10} />
      </Canvas>
    </div>
  );
}
