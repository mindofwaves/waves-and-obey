"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import HoloCard from "./holo-card";

const initialDesigns = [
  { src: "/porsche.png", title: "GTR 3S Poster" },
  { src: "/waves-piece.png", title: "WAVE$ Piece" },
  { src: "/bmw-dither.png", title: "BMW Dither" },
];

interface GalleryProps {
  open: boolean;
  onClose: () => void;
}

export default function Gallery({ open, onClose }: GalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [designs, setDesigns] = useState(initialDesigns);

  const handleDragEnd = useCallback((fromIndex: number, dropX: number, dropY: number) => {
    if (!gridRef.current) return;
    const cells = Array.from(gridRef.current.querySelectorAll<HTMLElement>("[data-card-index]"));
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const idx = parseInt(cell.dataset.cardIndex || "-1", 10);
      if (idx === fromIndex) continue;
      const rect = cell.getBoundingClientRect();
      if (dropX >= rect.left && dropX <= rect.right && dropY >= rect.top && dropY <= rect.bottom) {
        setDesigns((prev) => {
          const next = [...prev];
          const tmp = next[fromIndex];
          next[fromIndex] = next[idx];
          next[idx] = tmp;
          return next;
        });
        break;
      }
    }
  }, []);

  useEffect(() => {
    const body = document.body;
    if (open) {
      body.style.overflow = "hidden";
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    } else {
      body.style.overflow = "";
    }
    return () => { body.style.overflow = ""; };
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className={`absolute inset-[-120px] gallery-bg-drift transition-opacity duration-1000 ${open ? "opacity-100" : "opacity-0"}`}>
          <img src="/jellyfish-bg.png" alt="" className="w-full h-full object-cover" style={{ filter: "blur(14px) saturate(1.4)" }} draggable={false} />
        </div>
        <div className="absolute inset-0 bg-black/[0.68]" onClick={onClose} />
        <div className="absolute inset-0 gallery-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />
      </div>

      <button onClick={onClose} className="gallery-back-btn" aria-label="Back to home">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span>Back</span>
      </button>

      <div ref={scrollRef} className="relative z-10 w-full h-full overflow-y-auto overscroll-contain gallery-scroll" style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}>
        <div className="min-h-full px-6 sm:px-12 md:px-20 pt-24 sm:pt-32 pb-[max(5rem,calc(2rem+env(safe-area-inset-bottom)))]">
          <h2
            className={`font-display text-3xl sm:text-5xl md:text-6xl text-white font-bold tracking-tight mb-4 sm:mb-6 transition-all duration-700 ease-out ${open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
            style={{ transitionDelay: open ? "150ms" : "0ms" }}
          >
            Selected Works
          </h2>
          <p
            className={`text-white/25 text-sm sm:text-base font-body tracking-[0.15em] uppercase mb-14 sm:mb-20 transition-all duration-700 ease-out ${open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
            style={{ transitionDelay: open ? "200ms" : "0ms" }}
          >
            Drag to reorder
          </p>

          <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 max-w-6xl">
            {designs.map((design, i) => (
              <div key={design.src} data-card-index={i}>
                <HoloCard
                  src={design.src}
                  title={design.title}
                  open={open}
                  delay={280 + i * 130}
                  aspect="3/4"
                  index={i}
                  onDragEnd={handleDragEnd}
                />
              </div>
            ))}
          </div>
          <div className="h-8 sm:h-16" />
        </div>
      </div>
    </div>
  );
}
