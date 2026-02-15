"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface IntroVideoProps {
  onComplete: () => void;
}

export default function IntroVideo({ onComplete }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);
  const fadingRef = useRef(false);

  const triggerEnd = useCallback(() => {
    if (fadingRef.current) return;
    fadingRef.current = true;
    setFading(true);
    setTimeout(onComplete, 900);
  }, [onComplete]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Safety timeout — skip intro if video stalls or is very long
    const timeout = setTimeout(() => {
      if (!fadingRef.current) triggerEnd();
    }, 12000);

    video.play().catch(() => {
      // Autoplay blocked — skip intro entirely
      onComplete();
    });

    return () => clearTimeout(timeout);
  }, [onComplete, triggerEnd]);

  return (
    <div
      className={`fixed inset-0 z-[100] bg-black flex items-center justify-center transition-opacity duration-[900ms] ease-out ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      onClick={triggerEnd}
    >
      <video
        ref={videoRef}
        src="/intro.mp4"
        muted
        playsInline
        className="w-full h-full object-cover"
        onEnded={triggerEnd}
      />

      {/* Skip button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          triggerEnd();
        }}
        className="absolute bottom-8 right-8 text-white/40 text-sm font-body tracking-[0.15em] uppercase hover:text-white/70 transition-colors duration-300 z-10"
      >
        Skip
      </button>
    </div>
  );
}
