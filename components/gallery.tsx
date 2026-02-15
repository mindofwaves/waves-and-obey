"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ================================================================== */
/*  Data                                                               */
/* ================================================================== */
const designs = [
  { src: "/porsche.png", title: "GTR 3S Poster" },
  { src: "/waves-piece.png", title: "WAVE$ Piece" },
  { src: "/bmw-dither.png", title: "BMW Dither" },
];

/* ================================================================== */
/*  HoloCard — glass frame, holo, 3D tilt, smooth drag                */
/* ================================================================== */
function HoloCard({
  src,
  title,
  open,
  delay,
}: {
  src: string;
  title: string;
  open: boolean;
  delay: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const holoRef = useRef<HTMLDivElement>(null);

  const [hovering, setHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const rafId = useRef(0);
  const tiltTarget = useRef({ rx: 0, ry: 0, px: 50, py: 50 });
  const tiltCurrent = useRef({ rx: 0, ry: 0, px: 50, py: 50 });

  /* Drag state — all in refs for zero-rerender smoothness */
  const dragPos = useRef({ x: 0, y: 0 });
  const dragTarget = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const dragStartMouse = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });

  /* --- Drag --- */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setIsDragging(true);
    dragStartMouse.current = { x: e.clientX, y: e.clientY };
    dragStartPos.current = { ...dragTarget.current };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartMouse.current.x;
    const dy = e.clientY - dragStartMouse.current.y;
    dragTarget.current = {
      x: dragStartPos.current.x + dx,
      y: dragStartPos.current.y + dy,
    };
  }, []);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    setIsDragging(false);
  }, []);

  /* --- Tilt (only when not dragging) --- */
  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingRef.current) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    tiltTarget.current = {
      rx: (y - 0.5) * -22,
      ry: (x - 0.5) * 22,
      px: x * 100,
      py: y * 100,
    };
  }, []);

  const handleEnter = useCallback(() => {
    if (!draggingRef.current) setHovering(true);
  }, []);
  const handleLeave = useCallback(() => {
    setHovering(false);
    tiltTarget.current = { rx: 0, ry: 0, px: 50, py: 50 };
  }, []);

  /* --- Single rAF loop for tilt + drag --- */
  useEffect(() => {
    const tLerp = 0.08;
    const dLerp = 0.15; // drag follows faster for responsiveness

    const loop = () => {
      const tc = tiltCurrent.current;
      const tt = tiltTarget.current;
      tc.rx += (tt.rx - tc.rx) * tLerp;
      tc.ry += (tt.ry - tc.ry) * tLerp;
      tc.px += (tt.px - tc.px) * tLerp;
      tc.py += (tt.py - tc.py) * tLerp;

      /* Smooth drag position */
      const dp = dragPos.current;
      const dt = dragTarget.current;
      dp.x += (dt.x - dp.x) * dLerp;
      dp.y += (dt.y - dp.y) * dLerp;

      /* Apply drag to wrapper */
      const wrap = wrapRef.current;
      if (wrap) {
        wrap.style.transform = `translate(${dp.x}px, ${dp.y}px)`;
      }

      /* Apply tilt to card */
      const card = cardRef.current;
      if (card && !draggingRef.current) {
        card.style.transform = `perspective(900px) rotateX(${tc.rx}deg) rotateY(${tc.ry}deg) scale(${hovering ? 1.05 : 1})`;
      } else if (card && draggingRef.current) {
        card.style.transform = `perspective(900px) rotateX(1.5deg) scale(1.07)`;
      }

      /* Glare */
      const glare = glareRef.current;
      if (glare) {
        glare.style.background = `radial-gradient(
          ellipse at ${tc.px}% ${tc.py}%,
          rgba(255,255,255,0.28) 0%,
          rgba(255,255,255,0.08) 30%,
          transparent 60%
        )`;
        glare.style.opacity = hovering || draggingRef.current ? "1" : "0";
      }

      /* Holo */
      const holo = holoRef.current;
      if (holo) {
        holo.style.backgroundPosition = `${tc.px}% ${tc.py}%`;
        holo.style.opacity = hovering ? "0.5" : "0";
      }

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [hovering]);

  return (
    <div
      ref={wrapRef}
      className={`transition-opacity ease-out ${
        open ? "opacity-100 duration-700" : "opacity-0 duration-500"
      }`}
      style={{
        transitionDelay: open ? `${delay}ms` : "0ms",
        zIndex: isDragging ? 100 : "auto",
        position: "relative",
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Outer glow */}
      <div
        className="relative transition-shadow duration-500"
        style={{
          boxShadow: isDragging
            ? "0 25px 70px rgba(100,60,220,0.3), 0 0 100px rgba(80,140,255,0.12)"
            : hovering
              ? "0 8px 40px rgba(100,60,220,0.2), 0 0 60px rgba(80,140,255,0.08)"
              : "0 4px 20px rgba(0,0,0,0.35)",
          borderRadius: "16px",
        }}
      >
        {/* Card with 3D tilt */}
        <div
          ref={cardRef}
          className="relative will-change-transform"
          style={{
            transformStyle: "preserve-3d",
            transition:
              isDragging || hovering
                ? "none"
                : "transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
            borderRadius: "16px",
            overflow: "hidden",
          }}
          onMouseMove={handleMove}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {/* ---- Glass frame border ---- */}
          <div
            className="p-[5px] sm:p-[6px]"
            style={{
              borderRadius: "16px",
              background: hovering
                ? "linear-gradient(145deg, rgba(255,255,255,0.25) 0%, rgba(180,200,255,0.18) 30%, rgba(255,255,255,0.12) 50%, rgba(200,180,255,0.18) 70%, rgba(255,255,255,0.25) 100%)"
                : "linear-gradient(145deg, rgba(255,255,255,0.10) 0%, rgba(160,180,220,0.08) 50%, rgba(255,255,255,0.10) 100%)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              transition: "background 0.5s ease",
            }}
          >
            {/* Inner card */}
            <div
              className="relative overflow-hidden"
              style={{ borderRadius: "11px" }}
            >
              {/* Image */}
              <div className="relative aspect-[3/4] bg-neutral-950">
                <img
                  src={src}
                  alt={title}
                  className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
                    hovering ? "scale-[1.04]" : "scale-100"
                  }`}
                  loading="lazy"
                  draggable={false}
                />

                {/* Holographic prismatic overlay */}
                <div
                  ref={holoRef}
                  className="absolute inset-0 pointer-events-none transition-opacity duration-400 mix-blend-color-dodge"
                  style={{
                    background:
                      "linear-gradient(115deg, transparent 15%, rgba(255,80,180,0.25) 25%, rgba(80,200,255,0.2) 35%, rgba(180,255,80,0.15) 45%, rgba(255,180,80,0.2) 55%, rgba(130,80,255,0.25) 65%, rgba(255,80,180,0.2) 75%, transparent 85%)",
                    backgroundSize: "200% 200%",
                    opacity: 0,
                  }}
                />

                {/* Scan-line texture */}
                <div
                  className={`absolute inset-0 pointer-events-none transition-opacity duration-400 mix-blend-overlay ${
                    hovering ? "opacity-25" : "opacity-0"
                  }`}
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.04) 1px, rgba(255,255,255,0.04) 2px)",
                  }}
                />

                {/* Glare spotlight */}
                <div
                  ref={glareRef}
                  className="absolute inset-0 pointer-events-none transition-opacity duration-300 mix-blend-soft-light"
                  style={{ opacity: 0 }}
                />
              </div>

              {/* ---- Glass divider ---- */}
              <div className="relative h-[1px]">
                <div
                  className={`absolute inset-x-0 h-[1px] transition-opacity duration-400 ${
                    hovering ? "opacity-70" : "opacity-30"
                  }`}
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(200,210,255,0.5) 20%, rgba(255,255,255,0.7) 50%, rgba(200,210,255,0.5) 80%, transparent)",
                  }}
                />
                <div
                  className={`absolute -top-[3px] inset-x-0 h-[7px] transition-opacity duration-400 ${
                    hovering ? "opacity-40" : "opacity-10"
                  }`}
                  style={{
                    background:
                      "linear-gradient(180deg, transparent, rgba(180,200,255,0.06) 40%, rgba(255,255,255,0.05) 60%, transparent)",
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                  }}
                />
              </div>

              {/* ---- Name plate — frosted glass ---- */}
              <div
                className="relative px-3 py-2.5 sm:px-4 sm:py-3"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(10,10,15,0.85) 0%, rgba(15,15,25,0.92) 100%)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <p className="text-white/80 text-[11px] sm:text-xs font-body tracking-[0.2em] uppercase font-semibold truncate">
                  {title}
                </p>
              </div>
            </div>
          </div>

          {/* Rainbow border glow — hover only */}
          <div
            className={`absolute inset-0 z-30 pointer-events-none transition-opacity duration-500 ${
              hovering ? "opacity-80" : "opacity-0"
            }`}
            style={{
              borderRadius: "16px",
              background:
                "linear-gradient(135deg, #f472b6, #a78bfa, #38bdf8, #34d399, #facc15, #f472b6)",
              backgroundSize: "400% 400%",
              animation: hovering ? "borderShift 2.5s linear infinite" : "none",
              mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              maskComposite: "exclude",
              WebkitMaskComposite: "xor",
              padding: "1.5px",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Gallery                                                            */
/* ================================================================== */
interface GalleryProps {
  open: boolean;
  onClose: () => void;
}

export default function Gallery({ open, onClose }: GalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (open) {
      body.style.overflow = "hidden";
      body.style.touchAction = "auto";
      html.style.touchAction = "auto";
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    } else {
      body.style.overflow = "";
      body.style.touchAction = "";
      html.style.touchAction = "";
    }
    return () => {
      body.style.overflow = "";
      body.style.touchAction = "";
      html.style.touchAction = "";
    };
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
    >
      {/* ---- Animated background ---- */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div
          className={`absolute inset-[-120px] gallery-bg-drift transition-opacity duration-1000 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        >
          <img
            src="/jellyfish-bg.png"
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: "blur(14px) saturate(1.4)" }}
            draggable={false}
          />
        </div>
        <div className="absolute inset-0 bg-black/[0.68]" onClick={onClose} />
        <div className="absolute inset-0 gallery-noise opacity-[0.04] mix-blend-overlay pointer-events-none" />
      </div>

      {/* ---- Scrollable content ---- */}
      <div
        ref={scrollRef}
        className="relative z-10 w-full h-full overflow-y-auto overscroll-contain gallery-scroll"
        style={{ touchAction: "pan-y" }}
      >
        <div className="min-h-full px-6 sm:px-12 md:px-20 py-24 sm:py-32">
          <h2
            className={`font-display text-3xl sm:text-5xl md:text-6xl text-white font-bold tracking-tight mb-4 sm:mb-6 transition-all duration-700 ease-out ${
              open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: open ? "150ms" : "0ms" }}
          >
            Selected Works
          </h2>
          <p
            className={`text-white/25 text-sm sm:text-base font-body tracking-[0.15em] uppercase mb-14 sm:mb-20 transition-all duration-700 ease-out ${
              open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
            style={{ transitionDelay: open ? "200ms" : "0ms" }}
          >
            Drag &amp; hover to interact
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 max-w-6xl">
            {designs.map((design, i) => (
              <HoloCard
                key={i}
                src={design.src}
                title={design.title}
                open={open}
                delay={280 + i * 130}
              />
            ))}
          </div>

          <div className="h-20 sm:h-32" />
        </div>
      </div>
    </div>
  );
}
