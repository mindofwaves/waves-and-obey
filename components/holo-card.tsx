"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";

interface HoloCardProps {
  src: string;
  title: string;
  open: boolean;
  delay: number;
  aspect?: "3/4" | "1/1";
  index?: number;
  onDragEnd?: (fromIndex: number, dropX: number, dropY: number) => void;
}

function HoloCardInner({
  src,
  title,
  open,
  delay,
  aspect = "3/4",
  index = 0,
  onDragEnd,
}: HoloCardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const holoRef = useRef<HTMLDivElement>(null);

  const hoveringRef = useRef(false);
  const [hovering, setHovering] = useState(false);

  const rafId = useRef(0);
  const tiltTarget = useRef({ rx: 0, ry: 0, px: 50, py: 50 });
  const tiltCurrent = useRef({ rx: 0, ry: 0, px: 50, py: 50 });

  const dragPos = useRef({ x: 0, y: 0 });
  const dragTarget = useRef({ x: 0, y: 0 });
  const dragVelocity = useRef({ x: 0, y: 0 });
  const dragPrev = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const dragStartMouse = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const liftAmount = useRef(0);
  const lastPointer = useRef({ x: 0, y: 0 });
  const indexRef = useRef(index);
  indexRef.current = index;

  const isTouchDevice = useRef(false);

  useEffect(() => {
    isTouchDevice.current = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isTouchDevice.current) return;
    e.preventDefault();
    const el = wrapRef.current;
    if (el) el.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    dragVelocity.current = { x: 0, y: 0 };
    dragStartMouse.current = { x: e.clientX, y: e.clientY };
    dragStartPos.current = { x: dragPos.current.x, y: dragPos.current.y };
    lastPointer.current = { x: e.clientX, y: e.clientY };
    if (wrapRef.current) wrapRef.current.style.zIndex = "100";
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartMouse.current.x;
    const dy = e.clientY - dragStartMouse.current.y;
    dragTarget.current = {
      x: dragStartPos.current.x + dx,
      y: dragStartPos.current.y + dy,
    };
    lastPointer.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    dragTarget.current = { x: 0, y: 0 };
    if (wrapRef.current) wrapRef.current.style.zIndex = "";
    if (onDragEnd) {
      onDragEnd(indexRef.current, lastPointer.current.x, lastPointer.current.y);
    }
  }, [onDragEnd]);

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
    if (!draggingRef.current) {
      hoveringRef.current = true;
      setHovering(true);
    }
  }, []);

  const handleLeave = useCallback(() => {
    hoveringRef.current = false;
    setHovering(false);
    tiltTarget.current = { rx: 0, ry: 0, px: 50, py: 50 };
  }, []);

  useEffect(() => {
    const tLerp = 0.08;
    const followLerp = 0.18;
    const springK = 0.055;
    const damping = 0.78;

    const loop = () => {
      const tc = tiltCurrent.current;
      const tt = tiltTarget.current;
      tc.rx += (tt.rx - tc.rx) * tLerp;
      tc.ry += (tt.ry - tc.ry) * tLerp;
      tc.px += (tt.px - tc.px) * tLerp;
      tc.py += (tt.py - tc.py) * tLerp;

      const dp = dragPos.current;
      const dt = dragTarget.current;
      const vel = dragVelocity.current;

      if (draggingRef.current) {
        dragPrev.current = { x: dp.x, y: dp.y };
        dp.x += (dt.x - dp.x) * followLerp;
        dp.y += (dt.y - dp.y) * followLerp;
        vel.x = dp.x - dragPrev.current.x;
        vel.y = dp.y - dragPrev.current.y;
        liftAmount.current = Math.min(liftAmount.current + 0.08, 1);
      } else {
        vel.x += -dp.x * springK;
        vel.y += -dp.y * springK;
        vel.x *= damping;
        vel.y *= damping;
        dp.x += vel.x;
        dp.y += vel.y;
        liftAmount.current *= 0.9;
        if (
          Math.abs(dp.x) < 0.2 && Math.abs(dp.y) < 0.2 &&
          Math.abs(vel.x) < 0.05 && Math.abs(vel.y) < 0.05
        ) {
          dp.x = 0; dp.y = 0; vel.x = 0; vel.y = 0;
          liftAmount.current = 0;
        }
      }

      const lift = liftAmount.current;
      const isHover = hoveringRef.current;

      const wrap = wrapRef.current;
      if (wrap) {
        wrap.style.transform = `translate3d(${dp.x}px, ${dp.y}px, 0)`;
        const glowEl = wrap.querySelector(".card-glow-wrap") as HTMLElement;
        if (glowEl) {
          const hoverS = isHover && lift < 0.1 ? 1 : 0;
          const blur1 = 20 + lift * 50 + hoverS * 20;
          const spread1 = lift * 10;
          const a1 = 0.15 + lift * 0.2 + hoverS * 0.08;
          const blur2 = 40 + lift * 60 + hoverS * 20;
          const a2 = 0.04 + lift * 0.08 + hoverS * 0.04;
          const yOff = 4 + lift * 20;
          glowEl.style.boxShadow = `0 ${yOff}px ${blur1}px ${spread1}px rgba(100,60,220,${a1}), 0 0 ${blur2}px rgba(80,140,255,${a2})`;
        }
      }

      const baseScale = isHover ? 1.05 : 1;
      const liftScale = baseScale + lift * 0.03;
      const card = cardRef.current;
      if (card && !draggingRef.current) {
        card.style.transform = `perspective(900px) rotateX(${tc.rx}deg) rotateY(${tc.ry}deg) scale(${liftScale})`;
      } else if (card) {
        card.style.transform = `perspective(900px) rotateX(1.5deg) scale(${liftScale})`;
      }

      const glare = glareRef.current;
      if (glare) {
        glare.style.background = `radial-gradient(ellipse at ${tc.px}% ${tc.py}%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 30%, transparent 60%)`;
        glare.style.opacity = isHover || lift > 0.1 ? "1" : "0";
      }

      const holo = holoRef.current;
      if (holo) {
        holo.style.backgroundPosition = `${tc.px}% ${tc.py}%`;
        holo.style.opacity = isHover ? "0.5" : "0";
      }

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const aspectClass = aspect === "1/1" ? "aspect-square" : "aspect-[3/4]";

  return (
    <div
      ref={wrapRef}
      className={`transition-opacity ease-out ${
        open ? "opacity-100 duration-700" : "opacity-0 duration-500"
      }`}
      style={{
        transitionDelay: open ? `${delay}ms` : "0ms",
        position: "relative",
        cursor: "grab",
        touchAction: "auto",
        contain: "layout style",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative card-glow-wrap" style={{ borderRadius: "16px" }}>
        <div
          ref={cardRef}
          className="relative will-change-transform"
          style={{
            transformStyle: "preserve-3d",
            transition: hovering ? "none" : "transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
            borderRadius: "16px",
            overflow: "hidden",
          }}
          onMouseMove={handleMove}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
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
            <div className="relative overflow-hidden" style={{ borderRadius: "11px" }}>
              <div className={`relative ${aspectClass} bg-neutral-950`}>
                <img
                  src={src}
                  alt={title}
                  className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
                    hovering ? "scale-[1.04]" : "scale-100"
                  }`}
                  loading="lazy"
                  draggable={false}
                />
                <div
                  ref={holoRef}
                  className="absolute inset-0 pointer-events-none mix-blend-color-dodge"
                  style={{
                    background: "linear-gradient(115deg, transparent 15%, rgba(255,80,180,0.25) 25%, rgba(80,200,255,0.2) 35%, rgba(180,255,80,0.15) 45%, rgba(255,180,80,0.2) 55%, rgba(130,80,255,0.25) 65%, rgba(255,80,180,0.2) 75%, transparent 85%)",
                    backgroundSize: "200% 200%",
                    opacity: 0,
                    transition: "opacity 0.4s ease",
                  }}
                />
                <div
                  className={`absolute inset-0 pointer-events-none mix-blend-overlay transition-opacity duration-400 ${hovering ? "opacity-25" : "opacity-0"}`}
                  style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.04) 1px, rgba(255,255,255,0.04) 2px)" }}
                />
                <div
                  ref={glareRef}
                  className="absolute inset-0 pointer-events-none mix-blend-soft-light"
                  style={{ opacity: 0, transition: "opacity 0.3s ease" }}
                />
              </div>
              <div className="relative h-[1px]">
                <div
                  className={`absolute inset-x-0 h-[1px] transition-opacity duration-400 ${hovering ? "opacity-70" : "opacity-30"}`}
                  style={{ background: "linear-gradient(90deg, transparent, rgba(200,210,255,0.5) 20%, rgba(255,255,255,0.7) 50%, rgba(200,210,255,0.5) 80%, transparent)" }}
                />
              </div>
              <div
                className="relative px-3 py-2.5 sm:px-4 sm:py-3"
                style={{
                  background: "linear-gradient(180deg, rgba(10,10,15,0.85) 0%, rgba(15,15,25,0.92) 100%)",
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
          <div
            className={`absolute inset-0 z-30 pointer-events-none transition-opacity duration-500 ${hovering ? "opacity-80" : "opacity-0"}`}
            style={{
              borderRadius: "16px",
              background: "linear-gradient(135deg, #f472b6, #a78bfa, #38bdf8, #34d399, #facc15, #f472b6)",
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

const HoloCard = memo(HoloCardInner);
export default HoloCard;
