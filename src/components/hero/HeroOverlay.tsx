import { memo } from "react";

export const HeroOverlay = memo(function HeroOverlay() {
  return (
    <>
      {/* Primary dark veil */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(to bottom, rgba(4,4,6,0.82) 0%, rgba(4,4,6,0.70) 50%, rgba(4,4,6,0.88) 100%)",
        }}
      />

      {/* Radial spotlight on center — keeps middle slightly brighter */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% 48%, rgba(255,90,0,0.07) 0%, transparent 70%)",
        }}
      />

      {/* Edge vignette — deepens the edges */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "radial-gradient(ellipse 110% 100% at 50% 50%, transparent 40%, rgba(0,0,0,0.65) 100%)",
        }}
      />
    </>
  );
});
