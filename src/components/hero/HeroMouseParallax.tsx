import { useEffect, useRef, useState } from "react";

/**
 * Returns normalized mouse position from -1 to 1 on each axis.
 * Smoothed with lerp for a silky feel.
 */
export function useMouseParallax() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const rawRef = useRef({ x: 0, y: 0 });
  const smoothRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      rawRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      };
    };

    window.addEventListener("mousemove", onMove, { passive: true });

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const FACTOR = 0.06; // lower = smoother/slower

    const tick = () => {
      smoothRef.current.x = lerp(smoothRef.current.x, rawRef.current.x, FACTOR);
      smoothRef.current.y = lerp(smoothRef.current.y, rawRef.current.y, FACTOR);
      setPos({ x: smoothRef.current.x, y: smoothRef.current.y });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return pos;
}
