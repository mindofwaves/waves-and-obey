"use client";

import { useState, useCallback } from "react";
import Hero from "@/components/hero";
import IntroVideo from "@/components/intro-video";
import Gallery from "@/components/gallery";

export default function Home() {
  const [introVisible, setIntroVisible] = useState(true);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const handleIntroComplete = useCallback(() => setIntroVisible(false), []);
  const toggleGallery = useCallback(() => setGalleryOpen((p) => !p), []);

  return (
    <main>
      {/* Hero — always rendered behind everything */}
      <Hero />

      {/* Hamburger menu — appears after intro */}
      <button
        onClick={toggleGallery}
        className={`fixed z-[60] flex items-center justify-center w-11 h-11 transition-all duration-500 ease-out
          top-[max(1.75rem,env(safe-area-inset-top,1.75rem))]
          right-[max(1.75rem,env(safe-area-inset-right,1.75rem))]
          sm:top-10 sm:right-10
          md:top-14 md:right-14
          ${introVisible ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto"}`}
        aria-label="Toggle menu"
      >
        <div className="relative w-7 h-5">
          <span
            className={`absolute left-0 w-full h-[2px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              galleryOpen
                ? "top-[9px] bg-white rotate-45"
                : "top-0 bg-[#1a1a1a]"
            }`}
          />
          <span
            className={`absolute left-0 top-[9px] w-full h-[2px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              galleryOpen
                ? "bg-white opacity-0 scale-x-0"
                : "bg-[#1a1a1a] opacity-100 scale-x-100"
            }`}
          />
          <span
            className={`absolute left-0 w-full h-[2px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              galleryOpen
                ? "top-[9px] bg-white -rotate-45"
                : "top-[18px] bg-[#1a1a1a]"
            }`}
          />
        </div>
      </button>

      {/* Gallery overlay */}
      <Gallery open={galleryOpen} onClose={() => setGalleryOpen(false)} />

      {/* Intro video — on top of everything */}
      {introVisible && <IntroVideo onComplete={handleIntroComplete} />}
    </main>
  );
}
