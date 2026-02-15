"use client";

import { useState, useCallback } from "react";
import Hero from "@/components/hero";
import IntroVideo from "@/components/intro-video";
import Gallery from "@/components/gallery";
import LeftGallery from "@/components/left-gallery";

export default function Home() {
  const [introVisible, setIntroVisible] = useState(true);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const handleIntroComplete = useCallback(() => setIntroVisible(false), []);

  const anyPanelOpen = leftOpen || rightOpen;
  const showArrows = !anyPanelOpen && !introVisible;

  return (
    <main>
      <Hero />

      {/* Left arrow — floating pill */}
      <button
        className={`nav-pill nav-pill-left ${showArrows ? "" : "nav-pill-hidden"}`}
        onClick={() => setLeftOpen(true)}
        aria-label="Open cover artworks"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span className="nav-pill-text">Covers</span>
      </button>

      {/* Right arrow — floating pill */}
      <button
        className={`nav-pill nav-pill-right ${showArrows ? "" : "nav-pill-hidden"}`}
        onClick={() => setRightOpen(true)}
        aria-label="Open selected works"
      >
        <span className="nav-pill-text">Works</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <LeftGallery open={leftOpen} onClose={() => setLeftOpen(false)} />
      <Gallery open={rightOpen} onClose={() => setRightOpen(false)} />

      {introVisible && <IntroVideo onComplete={handleIntroComplete} />}
    </main>
  );
}
