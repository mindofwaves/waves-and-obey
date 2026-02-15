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

  return (
    <main>
      {/* Hero — always behind */}
      <Hero />

      {/* ---- Left arrow trigger ---- */}
      <div
        className={`nav-arrow nav-arrow-left ${anyPanelOpen ? "nav-arrow-hidden" : ""} ${introVisible ? "nav-arrow-hidden" : ""}`}
        onClick={() => setLeftOpen(true)}
      >
        <div className="nav-arrow-bg" />
        <div className="nav-arrow-preview">
          <img src="/blobrender-wvs.png" alt="" draggable={false} />
        </div>
        <div className="nav-arrow-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </div>
        <span className="nav-arrow-label">Covers</span>
      </div>

      {/* ---- Right arrow trigger ---- */}
      <div
        className={`nav-arrow nav-arrow-right ${anyPanelOpen ? "nav-arrow-hidden" : ""} ${introVisible ? "nav-arrow-hidden" : ""}`}
        onClick={() => setRightOpen(true)}
      >
        <div className="nav-arrow-bg" />
        <div className="nav-arrow-preview">
          <img src="/porsche.png" alt="" draggable={false} />
        </div>
        <div className="nav-arrow-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
        <span className="nav-arrow-label">Works</span>
      </div>

      {/* Gallery overlays */}
      <LeftGallery open={leftOpen} onClose={() => setLeftOpen(false)} />
      <Gallery open={rightOpen} onClose={() => setRightOpen(false)} />

      {/* Intro video — on top */}
      {introVisible && <IntroVideo onComplete={handleIntroComplete} />}
    </main>
  );
}
