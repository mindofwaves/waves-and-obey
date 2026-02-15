"use client";

import { useRef, useEffect, useCallback } from "react";

/* ================================================================== */
/*  GLSL Shaders                                                       */
/* ================================================================== */

const VERT_SRC = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_mesh;
uniform sampler2D u_blob;
uniform vec2 u_resolution;
uniform vec2 u_meshSize;
uniform vec2 u_blobSize;
uniform vec2 u_cursor;
uniform float u_radius;
uniform float u_time;
uniform float u_opacity;

#define MAX_ECHOES 16
uniform vec4 u_echoes[MAX_ECHOES];
uniform int u_echoCount;

/* ---- helpers ---------------------------------------------------- */

vec2 coverUV(vec2 uv, vec2 imgSize, vec2 canvas) {
    float ia = imgSize.x / imgSize.y;
    float ca = canvas.x  / canvas.y;
    vec2 r = vec2(min(ca / ia, 1.0), min(ia / ca, 1.0));
    return uv * r + (1.0 - r) * 0.5;
}

vec3 sampleFrosted(vec2 uv, vec2 imgSize, vec2 canvas) {
    float blur = 0.0035;
    vec3 acc = vec3(0.0);
    acc += texture(u_mesh, coverUV(uv, imgSize, canvas)).rgb * 2.0;
    for (int i = 0; i < 12; i++) {
        float a = float(i) * 6.2831853 / 12.0;
        vec2 off = vec2(cos(a), sin(a)) * blur;
        acc += texture(u_mesh, coverUV(uv + off, imgSize, canvas)).rgb;
    }
    return acc / 14.0;
}

/* Glass mask — tighter edge to prevent overlapping artifacts */
float glassMask(vec2 uv, vec2 center, float r, float aspect) {
    vec2 ac = vec2(1.0, 1.0 / aspect);
    float d = distance(uv * ac, center * ac);
    return smoothstep(r, r * 0.65, d);
}

vec3 sampleGlass(vec2 uv, vec2 center, float r, float strength) {
    vec2 delta = uv - center;
    float d    = length(delta);
    float nd   = clamp(d / r, 0.0, 1.0);

    float power    = (1.0 - nd * nd) * 0.20 * strength;
    vec2  displaced = uv - delta * power;
    vec2  bUV       = coverUV(displaced, u_blobSize, u_resolution);

    float ca    = nd * 0.007 * strength;
    vec2  caDir = d > 0.001 ? normalize(delta) : vec2(1.0, 0.0);

    float rv = texture(u_blob, coverUV(displaced + caDir * ca, u_blobSize, u_resolution)).r;
    float gv = texture(u_blob, bUV).g;
    float bv = texture(u_blob, coverUV(displaced - caDir * ca, u_blobSize, u_resolution)).b;

    return vec3(rv, gv, bv);
}

vec3 applyGlass(vec3 bg, vec2 uv, vec2 center, float r, float strength, float aspect) {
    float mask = glassMask(uv, center, r, aspect) * strength;
    if (mask < 0.001) return bg;

    vec2 ac = vec2(1.0, 1.0 / aspect);
    float d = distance(uv * ac, center * ac);

    vec3 glass = sampleGlass(uv, center, r, strength);

    float ring = smoothstep(r * 0.98, r * 0.78, d)
               * smoothstep(r * 0.5, r * 0.65, d);
    float fresnel = ring * 0.15 * strength;

    vec3 result = mix(bg, glass, mask);
    result += vec3(fresnel);
    result += vec3(0.01, 0.015, 0.04) * mask;

    return result;
}

/* ================================================================= */

void main() {
    vec2 uv     = v_uv;
    float aspect = u_resolution.x / u_resolution.y;

    vec3 frosted = sampleFrosted(uv, u_meshSize, u_resolution);
    vec3 base    = mix(frosted, vec3(1.0), 0.32);

    vec2 cur  = u_cursor / u_resolution;
    cur.y     = 1.0 - cur.y;
    float rN  = u_radius / u_resolution.y;

    vec3 color = base;

    color = applyGlass(color, uv, cur, rN, u_opacity, aspect);

    for (int i = 0; i < MAX_ECHOES; i++) {
        if (i >= u_echoCount) break;
        vec4  e  = u_echoes[i];
        vec2  eP = e.xy / u_resolution;
        eP.y     = 1.0 - eP.y;
        float eR = e.z / u_resolution.y;
        float eA = e.w;
        color = applyGlass(color, uv, eP, eR, eA, aspect);
    }

    outColor = vec4(color, 1.0);
}
`;

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */
const RADIUS_DESKTOP = 250;
const RADIUS_MOBILE = 170;
const LERP_DESKTOP = 0.07;
const LERP_MOBILE = 0.12;
const ECHO_SPEED = 10;
const ECHO_LIFE = 700;
const MAX_ECHOES = 16;
const PARALLAX = 14;
const TOUCH_FADE_MS = 600;
const AMBIENT_RADIUS_MOBILE = 130;

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */
interface Echo {
  x: number;
  y: number;
  r: number;
  alpha: number;
  birth: number;
}

/* ================================================================== */
/*  WebGL helpers                                                      */
/* ================================================================== */

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader compile error: ${log}`);
  }
  return s;
}

function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`Program link error: ${log}`);
  }
  return p;
}

function uploadTexture(gl: WebGL2RenderingContext, img: HTMLImageElement): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

function circleRectOverlap(cx: number, cy: number, r: number, rect: DOMRect): boolean {
  const nearX = Math.max(rect.left, Math.min(cx, rect.right));
  const nearY = Math.max(rect.top, Math.min(cy, rect.bottom));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy <= r * r;
}

function isTouchPrimary(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0 || window.matchMedia("(hover: none)").matches;
}

/** Build CSS mask from cursor + echoes, relative to an element's rect. */
function buildRevealMask(
  sx: number, sy: number, glassOpacity: number, radius: number,
  echoArr: Echo[], now: number, rect: DOMRect
): string {
  const masks: string[] = [];

  if (glassOpacity > 0.01 && sx > -1000) {
    const rx = sx - rect.left;
    const ry = sy - rect.top;
    masks.push(
      `radial-gradient(circle ${radius}px at ${rx}px ${ry}px, rgba(0,0,0,${glassOpacity}) 55%, transparent 100%)`
    );
  }

  for (const echo of echoArr) {
    const age = (now - echo.birth) / ECHO_LIFE;
    const alpha = echo.alpha * (1 - age * age);
    const r = echo.r * (1 + age * 0.5);
    if (alpha > 0.1) {
      const rx = echo.x - rect.left;
      const ry = echo.y - rect.top;
      masks.push(
        `radial-gradient(circle ${r}px at ${rx}px ${ry}px, rgba(0,0,0,${alpha}) 40%, transparent 100%)`
      );
    }
  }

  return masks.length > 0 ? masks.join(", ") : "none";
}

/* ================================================================== */
/*  Shared text content                                                */
/* ================================================================== */
function NameText({ className }: { className?: string }) {
  return (
    <div className={className}>
      <h1 className="font-display text-[2.5rem] sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.88] tracking-tight">
        OBEYTHESIXTH
      </h1>
      <h1 className="font-display text-[1.75rem] sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[0.88] tracking-tight mt-2">
        &amp; WAVE$ ARTWORKS
      </h1>
    </div>
  );
}

function SocialIcons({ className }: { className?: string }) {
  return (
    <div className={`flex gap-6 sm:gap-5 ${className ?? ""}`}>
      <a
        href="https://instagram.com/wavesandobey"
        target="_blank"
        rel="noopener noreferrer"
        className="social-tap hover:opacity-70 transition-opacity duration-200"
        aria-label="Instagram"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="sm:w-[22px] sm:h-[22px] w-6 h-6">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      </a>
      <a
        href="https://x.com/wavesandobey"
        target="_blank"
        rel="noopener noreferrer"
        className="social-tap hover:opacity-70 transition-opacity duration-200"
        aria-label="X (Twitter)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="sm:w-5 sm:h-5 w-6 h-6">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
    </div>
  );
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /* Wrapper refs for parallax + inversion */
  const nameWrapRef = useRef<HTMLDivElement>(null);
  const socialWrapRef = useRef<HTMLDivElement>(null);

  /* Reveal overlay refs (for CSS mask) */
  const nameRevealRef = useRef<HTMLDivElement>(null);
  const socialRevealRef = useRef<HTMLDivElement>(null);

  /* Cursor state */
  const mouse = useRef({ x: -9999, y: -9999 });
  const smooth = useRef({ x: -9999, y: -9999 });
  const prev = useRef({ x: -9999, y: -9999 });
  const echoes = useRef<Echo[]>([]);
  const raf = useRef(0);

  /* Mobile state */
  const isTouch = useRef(false);
  const touchActive = useRef(false);
  const touchFadeStart = useRef(0);
  const lastTouchPos = useRef({ x: 0, y: 0 });
  const orient = useRef({ x: 0, y: 0 });

  /* WebGL refs */
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const uniRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const texReady = useRef(0);
  const meshSize = useRef({ w: 0, h: 0 });
  const blobSize = useRef({ w: 0, h: 0 });
  const startTime = useRef(performance.now());

  /* ---- Setup ---------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    isTouch.current = isTouchPrimary();

    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return;
    glRef.current = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = linkProgram(gl, vs, fs);
    progRef.current = prog;
    gl.useProgram(prog);

    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uNames = [
      "u_mesh", "u_blob", "u_resolution", "u_meshSize", "u_blobSize",
      "u_cursor", "u_radius", "u_time", "u_echoCount", "u_opacity",
    ];
    const locs: Record<string, WebGLUniformLocation | null> = {};
    for (const n of uNames) locs[n] = gl.getUniformLocation(prog, n);
    for (let i = 0; i < MAX_ECHOES; i++) locs[`u_echoes_${i}`] = gl.getUniformLocation(prog, `u_echoes[${i}]`);
    uniRef.current = locs;

    gl.uniform1i(locs.u_mesh, 0);
    gl.uniform1i(locs.u_blob, 1);

    const loadTex = (src: string, unit: number, sizeRef: typeof meshSize) => {
      const img = new Image();
      img.onload = () => {
        if (!glRef.current) return;
        const g = glRef.current;
        g.activeTexture(g.TEXTURE0 + unit);
        uploadTexture(g, img);
        sizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
        texReady.current++;
      };
      img.src = src;
    };
    loadTex("/mesh.png", 0, meshSize);
    loadTex("/blobrender.png", 1, blobSize);

    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = isTouch.current ? Math.min(window.devicePixelRatio || 1, 2) : (window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      if (glRef.current) glRef.current.viewport(0, 0, w * dpr, h * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouse = (e: MouseEvent) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchActive.current = true;
        touchFadeStart.current = 0;
        mouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastTouchPos.current = { ...mouse.current };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastTouchPos.current = { ...mouse.current };
      }
    };
    const onTouchEnd = () => {
      touchActive.current = false;
      touchFadeStart.current = performance.now();
    };
    const onOrientation = (e: DeviceOrientationEvent) => {
      orient.current = {
        x: Math.max(-1, Math.min(1, (e.gamma || 0) / 30)),
        y: Math.max(-1, Math.min(1, ((e.beta || 0) - 45) / 30)),
      };
    };

    window.addEventListener("mousemove", onMouse);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("deviceorientation", onOrientation);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("deviceorientation", onOrientation);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  /* ---- Render loop ---------------------------------------------- */
  const animate = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const u = uniRef.current;

    if (!gl || !prog || texReady.current < 2) {
      raf.current = requestAnimationFrame(animate);
      return;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = isTouch.current ? Math.min(window.devicePixelRatio || 1, 2) : (window.devicePixelRatio || 1);
    const now = performance.now();
    const t = (now - startTime.current) / 1000;

    const isMobile = isTouch.current;
    const radius = isMobile ? RADIUS_MOBILE : RADIUS_DESKTOP;
    const lerp = isMobile ? LERP_MOBILE : LERP_DESKTOP;

    /* ---- Cursor target & opacity -------------------------------- */
    let cursorTarget = { x: mouse.current.x, y: mouse.current.y };
    let glassOpacity = 1.0;

    if (isMobile) {
      if (touchActive.current) {
        cursorTarget = { x: mouse.current.x, y: mouse.current.y };
        glassOpacity = 1.0;
      } else if (touchFadeStart.current > 0) {
        const fadeAge = now - touchFadeStart.current;
        if (fadeAge < TOUCH_FADE_MS) {
          cursorTarget = lastTouchPos.current;
          glassOpacity = 1 - fadeAge / TOUCH_FADE_MS;
        } else {
          touchFadeStart.current = 0;
        }
      }
      if (!touchActive.current && touchFadeStart.current === 0) {
        cursorTarget = {
          x: w * 0.5 + Math.sin(t * 0.25) * w * 0.22,
          y: h * 0.45 + Math.cos(t * 0.18) * h * 0.18,
        };
        glassOpacity = 0.6;
      }
    }

    /* Smooth lerp */
    if (smooth.current.x < -5000) {
      smooth.current = { ...cursorTarget };
    } else {
      smooth.current.x += (cursorTarget.x - smooth.current.x) * lerp;
      smooth.current.y += (cursorTarget.y - smooth.current.y) * lerp;
    }
    const sx = smooth.current.x;
    const sy = smooth.current.y;

    /* Echoes (desktop only) */
    if (!isMobile) {
      const dx = sx - prev.current.x;
      const dy = sy - prev.current.y;
      const spd = Math.sqrt(dx * dx + dy * dy);
      if (spd > ECHO_SPEED && sx > -1000) {
        echoes.current.push({ x: sx, y: sy, r: radius * 0.55, alpha: Math.min(spd / 40, 0.7), birth: now });
        if (echoes.current.length > MAX_ECHOES) echoes.current.shift();
      }
    }
    prev.current = { x: sx, y: sy };
    echoes.current = echoes.current.filter((e) => now - e.birth < ECHO_LIFE);

    const effectiveRadius = isMobile && !touchActive.current && touchFadeStart.current === 0
      ? AMBIENT_RADIUS_MOBILE : radius;

    /* ---- WebGL uniforms ----------------------------------------- */
    gl.viewport(0, 0, w * dpr, h * dpr);
    gl.uniform2f(u.u_resolution, w, h);
    gl.uniform2f(u.u_meshSize, meshSize.current.w, meshSize.current.h);
    gl.uniform2f(u.u_blobSize, blobSize.current.w, blobSize.current.h);
    gl.uniform2f(u.u_cursor, sx, sy);
    gl.uniform1f(u.u_radius, effectiveRadius);
    gl.uniform1f(u.u_time, t);
    gl.uniform1f(u.u_opacity, glassOpacity);

    const echoArr = echoes.current;
    gl.uniform1i(u.u_echoCount, echoArr.length);
    for (let i = 0; i < MAX_ECHOES; i++) {
      const loc = u[`u_echoes_${i}`];
      if (!loc) continue;
      if (i < echoArr.length) {
        const e = echoArr[i];
        const age = (now - e.birth) / ECHO_LIFE;
        gl.uniform4f(loc, e.x, e.y, e.r * (1 + age * 0.5), e.alpha * (1 - age * age));
      } else {
        gl.uniform4f(loc, 0, 0, 0, 0);
      }
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    /* ---- DOM: parallax ------------------------------------------ */
    let px: number, py: number;
    if (isMobile) {
      px = orient.current.x;
      py = orient.current.y;
    } else {
      px = sx > -1000 ? (mouse.current.x - w / 2) / (w / 2) : 0;
      py = sx > -1000 ? (mouse.current.y - h / 2) / (h / 2) : 0;
    }

    const setParallax = (el: HTMLElement | null, s: number) => {
      if (el) el.style.transform = `translate(${-px * s}px, ${-py * s}px)`;
    };
    setParallax(nameWrapRef.current, PARALLAX);
    setParallax(socialWrapRef.current, PARALLAX * 0.5);

    if (gridRef.current) {
      gridRef.current.style.transform = `perspective(800px) rotateX(${py * 2}deg) rotateY(${-px * 2}deg) translate(${-px * 6}px, ${-py * 6}px)`;
    }

    /* ---- DOM: reveal mask on text ------------------------------- */
    const applyMask = (wrapEl: HTMLElement | null, revealEl: HTMLElement | null) => {
      if (!wrapEl || !revealEl) return;
      const rect = wrapEl.getBoundingClientRect();
      const mask = buildRevealMask(sx, sy, glassOpacity, effectiveRadius, echoArr, now, rect);
      revealEl.style.webkitMaskImage = mask;
      revealEl.style.maskImage = mask;
    };

    applyMask(nameWrapRef.current, nameRevealRef.current);
    applyMask(socialWrapRef.current, socialRevealRef.current);

    raf.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [animate]);

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <div className="hero-container relative w-screen overflow-hidden select-none bg-[#f5f5f5]" style={{ height: "100dvh" }}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      <div
        ref={gridRef}
        className="grid-pattern absolute inset-[-30px] pointer-events-none transition-transform duration-75"
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-between w-full h-full safe-padding pointer-events-none">
        {/* Top — name centered horizontally */}
        <div className="flex justify-center">
          <div ref={nameWrapRef} className="relative text-center">
            <NameText className="text-el" />
            <div ref={nameRevealRef} className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <NameText className="text-reveal" />
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="flex justify-end items-end">
          <div ref={socialWrapRef} className="relative">
            <SocialIcons className="text-el pointer-events-auto" />
            <div ref={socialRevealRef} className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <SocialIcons className="text-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
