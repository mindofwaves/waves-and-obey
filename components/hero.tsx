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
uniform vec2 u_cursor;        // smooth cursor in px (screen space, top-left origin)
uniform float u_radius;       // spotlight radius in px
uniform float u_time;

#define MAX_ECHOES 16
uniform vec4 u_echoes[MAX_ECHOES]; // xy = pos (px), z = radius (px), w = alpha
uniform int u_echoCount;

/* ---- helpers ---------------------------------------------------- */

vec2 coverUV(vec2 uv, vec2 imgSize, vec2 canvas) {
    float ia = imgSize.x / imgSize.y;
    float ca = canvas.x  / canvas.y;
    vec2 r = vec2(
        min(ca / ia, 1.0),
        min(ia / ca, 1.0)
    );
    return uv * r + (1.0 - r) * 0.5;
}

/* Smooth glass circle mask. */
float glassMask(vec2 uv, vec2 center, float r, float aspect) {
    vec2 ac = vec2(1.0, 1.0 / aspect);
    float d = distance(uv * ac, center * ac);
    return smoothstep(r, r * 0.5, d);
}

/* Sample blob with refraction + chromatic aberration. */
vec3 sampleGlass(vec2 uv, vec2 center, float r, float strength) {
    vec2 delta = uv - center;
    float d    = length(delta);
    float nd   = clamp(d / r, 0.0, 1.0);

    /* barrel distortion (lens magnification) */
    float power      = (1.0 - nd * nd) * 0.22 * strength;
    vec2  displaced   = uv - delta * power;
    vec2  bUV         = coverUV(displaced, u_blobSize, u_resolution);

    /* chromatic aberration (stronger toward glass edge) */
    float ca    = nd * 0.008 * strength;
    vec2  caDir = d > 0.001 ? normalize(delta) : vec2(1.0, 0.0);

    float rv = texture(u_blob, coverUV(displaced + caDir * ca, u_blobSize, u_resolution)).r;
    float gv = texture(u_blob, bUV).g;
    float bv = texture(u_blob, coverUV(displaced - caDir * ca, u_blobSize, u_resolution)).b;

    return vec3(rv, gv, bv);
}

/* Full glass effect on a single circle. */
vec3 applyGlass(vec3 bg, vec2 uv, vec2 center, float r, float strength, float aspect) {
    float mask = glassMask(uv, center, r, aspect) * strength;
    if (mask < 0.001) return bg;

    vec2 ac = vec2(1.0, 1.0 / aspect);
    float d = distance(uv * ac, center * ac);
    float nd = clamp(d / r, 0.0, 1.0);
    vec2 delta = uv - center;

    /* refracted blob colour */
    vec3 glass = sampleGlass(uv, center, r, strength);

    /* ---- fresnel ring ------------------------------------------- */
    float ring = smoothstep(r * 0.98, r * 0.72, d)
               * smoothstep(r * 0.42, r * 0.62, d);
    float fresnel = ring * 0.45 * strength;

    /* ---- specular highlight (light from upper-left) ------------- */
    vec2  norm = d > 0.001 ? normalize(delta) : vec2(0.0);
    float spec = pow(max(0.0, dot(norm, normalize(vec2(-0.45, 0.55)))), 18.0)
               * mask * 0.35;

    /* ---- inner shadow for depth --------------------------------- */
    float innerShadow = smoothstep(r * 0.45, r, d) * 0.12 * mask;

    /* ---- subtle caustic shimmer --------------------------------- */
    float shimmer = sin(u_time * 1.8 + d * 50.0) * 0.015 * mask;

    /* ---- compose ------------------------------------------------ */
    vec3 result = mix(bg, glass, mask);
    result += vec3(fresnel + spec + shimmer);
    result -= vec3(innerShadow);

    /* subtle cool glass tint */
    result += vec3(0.018, 0.028, 0.065) * mask;

    return result;
}

/* ================================================================= */

void main() {
    vec2 uv     = v_uv;
    float aspect = u_resolution.x / u_resolution.y;

    /* base: mesh + white overlay */
    vec2 mUV   = coverUV(uv, u_meshSize, u_resolution);
    vec3 mesh  = texture(u_mesh, mUV).rgb;
    vec3 base  = mix(mesh, vec3(1.0), 0.84);

    /* cursor → GL UV space (flip Y) */
    vec2 cur  = u_cursor / u_resolution;
    cur.y     = 1.0 - cur.y;
    float rN  = u_radius / u_resolution.y;

    vec3 color = base;

    /* main glass */
    color = applyGlass(color, uv, cur, rN, 1.0, aspect);

    /* echo glasses */
    for (int i = 0; i < MAX_ECHOES; i++) {
        if (i >= u_echoCount) break;
        vec4  e    = u_echoes[i];
        vec2  eP   = e.xy / u_resolution;
        eP.y       = 1.0 - eP.y;
        float eR   = e.z  / u_resolution.y;
        float eA   = e.w;
        color = applyGlass(color, uv, eP, eR, eA, aspect);
    }

    outColor = vec4(color, 1.0);
}
`;

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */
const SPOTLIGHT_RADIUS = 150;
const LERP = 0.07;
const ECHO_SPEED = 10;
const ECHO_LIFE = 700;
const MAX_ECHOES = 16;
const PARALLAX = 14;

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

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string
): WebGLShader {
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

function link(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader
): WebGLProgram {
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

function uploadTexture(
  gl: WebGL2RenderingContext,
  img: HTMLImageElement
): WebGLTexture {
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

/** Check if a circle overlaps a rectangle. */
function circleRectOverlap(
  cx: number,
  cy: number,
  r: number,
  rect: DOMRect
): boolean {
  const nearX = Math.max(rect.left, Math.min(cx, rect.right));
  const nearY = Math.max(rect.top, Math.min(cy, rect.bottom));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy <= r * r;
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function Hero() {
  /* refs ----------------------------------------------------------- */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLAnchorElement>(null);
  const socialRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const mouse = useRef({ x: -9999, y: -9999 });
  const smooth = useRef({ x: -9999, y: -9999 });
  const prev = useRef({ x: -9999, y: -9999 });
  const echoes = useRef<Echo[]>([]);
  const raf = useRef(0);

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

    /* WebGL2 context */
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      console.error("WebGL2 not supported");
      return;
    }
    glRef.current = gl;

    /* Compile & link */
    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = link(gl, vs, fs);
    progRef.current = prog;
    gl.useProgram(prog);

    /* Full-screen quad */
    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    /* Cache uniform locations */
    const names = [
      "u_mesh",
      "u_blob",
      "u_resolution",
      "u_meshSize",
      "u_blobSize",
      "u_cursor",
      "u_radius",
      "u_time",
      "u_echoCount",
    ];
    const locs: Record<string, WebGLUniformLocation | null> = {};
    for (const n of names) locs[n] = gl.getUniformLocation(prog, n);
    /* echo array locations */
    for (let i = 0; i < MAX_ECHOES; i++) {
      locs[`u_echoes_${i}`] = gl.getUniformLocation(prog, `u_echoes[${i}]`);
    }
    uniRef.current = locs;

    /* Texture unit bindings */
    gl.uniform1i(locs.u_mesh, 0);
    gl.uniform1i(locs.u_blob, 1);

    /* Load textures */
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

    /* Resize handler */
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
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

    /* Input handlers */
    const onMouse = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouse.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    };
    const onTouchEnd = () => {
      mouse.current = { x: -9999, y: -9999 };
      smooth.current = { x: -9999, y: -9999 };
    };

    window.addEventListener("mousemove", onMouse);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchend", onTouchEnd);
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
    const dpr = window.devicePixelRatio || 1;

    /* Smooth lerp */
    smooth.current.x += (mouse.current.x - smooth.current.x) * LERP;
    smooth.current.y += (mouse.current.y - smooth.current.y) * LERP;
    const sx = smooth.current.x;
    const sy = smooth.current.y;

    /* Echoes */
    const dx = sx - prev.current.x;
    const dy = sy - prev.current.y;
    const spd = Math.sqrt(dx * dx + dy * dy);

    if (spd > ECHO_SPEED && sx > -1000) {
      echoes.current.push({
        x: sx,
        y: sy,
        r: SPOTLIGHT_RADIUS * 0.6,
        alpha: Math.min(spd / 35, 0.8),
        birth: performance.now(),
      });
      if (echoes.current.length > MAX_ECHOES) echoes.current.shift();
    }
    prev.current = { x: sx, y: sy };

    const now = performance.now();
    echoes.current = echoes.current.filter((e) => now - e.birth < ECHO_LIFE);

    /* Set uniforms */
    gl.viewport(0, 0, w * dpr, h * dpr);
    gl.uniform2f(u.u_resolution, w, h);
    gl.uniform2f(u.u_meshSize, meshSize.current.w, meshSize.current.h);
    gl.uniform2f(u.u_blobSize, blobSize.current.w, blobSize.current.h);
    gl.uniform2f(u.u_cursor, sx, sy);
    gl.uniform1f(u.u_radius, SPOTLIGHT_RADIUS);
    gl.uniform1f(u.u_time, (now - startTime.current) / 1000);

    /* Echo uniforms */
    const echoArr = echoes.current;
    gl.uniform1i(u.u_echoCount, echoArr.length);
    for (let i = 0; i < MAX_ECHOES; i++) {
      const loc = u[`u_echoes_${i}`];
      if (!loc) continue;
      if (i < echoArr.length) {
        const e = echoArr[i];
        const age = (now - e.birth) / ECHO_LIFE;
        const alpha = e.alpha * (1 - age * age);
        const r = e.r * (1 + age * 0.5);
        gl.uniform4f(loc, e.x, e.y, r, alpha);
      } else {
        gl.uniform4f(loc, 0, 0, 0, 0);
      }
    }

    /* Draw */
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    /* ---- DOM updates (parallax, text inversion) ----------------- */
    const cx = w / 2;
    const cy = h / 2;
    const px = sx > -1000 ? (mouse.current.x - cx) / cx : 0;
    const py = sx > -1000 ? (mouse.current.y - cy) / cy : 0;

    const parallax = (el: HTMLElement | null, s: number) => {
      if (el)
        el.style.transform = `translate(${-px * s}px, ${-py * s}px)`;
    };
    parallax(nameRef.current, PARALLAX);
    parallax(navRef.current, PARALLAX * 0.7);
    parallax(socialRef.current, PARALLAX * 0.5);

    if (gridRef.current) {
      gridRef.current.style.transform = `perspective(800px) rotateX(${py * 2}deg) rotateY(${-px * 2}deg) translate(${-px * 6}px, ${-py * 6}px)`;
    }

    /* Text inversion */
    const checkInvert = (el: HTMLElement | null) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let hit = false;

      if (sx > -1000 && circleRectOverlap(sx, sy, SPOTLIGHT_RADIUS, rect)) {
        hit = true;
      }
      if (!hit) {
        for (const echo of echoArr) {
          const age = (now - echo.birth) / ECHO_LIFE;
          const alpha = echo.alpha * (1 - age * age);
          const r = echo.r * (1 + age * 0.5);
          if (alpha > 0.25 && circleRectOverlap(echo.x, echo.y, r, rect)) {
            hit = true;
            break;
          }
        }
      }

      if (hit) el.classList.add("inverted");
      else el.classList.remove("inverted");
    };

    checkInvert(nameRef.current);
    checkInvert(navRef.current);
    checkInvert(socialRef.current);

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
    <div className="relative w-screen h-screen overflow-hidden cursor-none select-none bg-white">
      {/* WebGL canvas — renders mesh + white overlay + liquid glass reveal */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Animated grid */}
      <div
        ref={gridRef}
        className="grid-pattern absolute inset-[-30px] pointer-events-none transition-transform duration-75"
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-between w-full h-full p-7 sm:p-10 md:p-14 pointer-events-none">
        {/* Top row */}
        <div className="flex justify-between items-start">
          <div ref={nameRef} className="text-el transition-colors duration-300">
            <h1 className="font-display text-[2.5rem] sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.88] tracking-tight">
              WAVE$
            </h1>
            <h1 className="font-display text-[2.5rem] sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.88] tracking-tight mt-1">
              AND OBEY
            </h1>
          </div>

          <a
            ref={navRef}
            href="#"
            className="text-el pointer-events-auto text-[0.65rem] sm:text-xs md:text-sm tracking-[0.25em] uppercase font-light transition-colors duration-300 hover:opacity-70 pt-2"
          >
            WAVES AND OBEY
          </a>
        </div>

        {/* Bottom row */}
        <div className="flex justify-end items-end">
          <div
            ref={socialRef}
            className="text-el flex gap-5 pointer-events-auto transition-colors duration-300"
          >
            <a
              href="https://instagram.com/wavesandobey"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-70 transition-opacity duration-200"
              aria-label="Instagram"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </a>

            <a
              href="https://x.com/wavesandobey"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-70 transition-opacity duration-200"
              aria-label="X (Twitter)"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
