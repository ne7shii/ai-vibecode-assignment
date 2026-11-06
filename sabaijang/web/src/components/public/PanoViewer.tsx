'use client';
import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import type { Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import s from './public.module.css';

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform sampler2D tex; uniform vec2 res; uniform float yaw; uniform float pitch; uniform float fov;
void main(){
  vec2 q = (gl_FragCoord.xy / res) * 2.0 - 1.0; q.x *= res.x / res.y;
  vec3 d = normalize(vec3(q.x, q.y, 1.0 / tan(fov * 0.5)));
  float cp = cos(pitch), sp = sin(pitch);
  d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
  float cy = cos(yaw), sy = sin(yaw);
  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
  float lon = atan(d.x, d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  gl_FragColor = texture2D(tex, vec2(0.5 + lon / 6.28318530718, 0.5 - lat / 3.14159265359));
}`;

/**
 * 360° room tour (US-49): equirectangular image rendered as a real perspective view with a tiny WebGL
 * shader (no external scripts). Drag / swipe / arrow keys rotate, wheel zooms. Falls back to a
 * horizontally looping panorama strip when WebGL is unavailable.
 */
export default function PanoViewer({ src, lang }: { src: string; lang: Lang }) {
  const t = tp(lang);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ yaw: 0, pitch: 0, fov: 1.6, auto: true });
  const [mode, setMode] = useState<'gl' | 'css'>('gl');
  const [yawDeg, setYawDeg] = useState(0);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const el = wrap.current, cv = canvas.current;
    if (!el || !cv) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) view.current.auto = false;
    let raf = 0;
    let draw: () => void = () => undefined;

    const gl = cv.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
    if (gl) {
      const sh = (type: number, src: string) => { const o = gl.createShader(type)!; gl.shaderSource(o, src); gl.compileShader(o); return o; };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setMode('css'); return; }
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const u = (n: string) => gl.getUniformLocation(prog, n);
      const tex = gl.createTexture();
      let ready = false;
      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        ready = true;
      };
      img.onerror = () => setMode('css');
      img.src = src;
      draw = () => {
        if (!ready) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u('res'), w, h);
        gl.uniform1f(u('yaw'), view.current.yaw);
        gl.uniform1f(u('pitch'), view.current.pitch);
        gl.uniform1f(u('fov'), view.current.fov);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
    } else {
      setMode('css');
    }

    let last = 0;
    const tick = (ts: number) => {
      if (view.current.auto && last) view.current.yaw += (ts - last) * 0.00006;
      last = ts;
      draw();
      if (wrap.current) {
        const deg = Math.round(((view.current.yaw * 180) / Math.PI) % 360 + 360) % 360;
        wrap.current.dataset.yaw = String(deg);
        // CSS fallback: one image width == 360°
        if (!gl) wrap.current.style.backgroundPosition = `${-(view.current.yaw / (2 * Math.PI)) * wrap.current.clientHeight * 2}px center`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const id = window.setInterval(() => setYawDeg(Number(wrap.current?.dataset.yaw ?? 0)), 250);
    return () => { cancelAnimationFrame(raf); window.clearInterval(id); };
  }, [src]);

  // drag / swipe
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  function onDown(e: RPointerEvent) {
    view.current.auto = false; setHint(false);
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: RPointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !wrap.current) return;
    const h = wrap.current.clientHeight || 400;
    const k = view.current.fov / h; // radians per pixel
    view.current.yaw -= (e.clientX - d.x) * k;
    view.current.pitch = Math.max(-1.2, Math.min(1.2, view.current.pitch + (e.clientY - d.y) * k));
    d.x = e.clientX; d.y = e.clientY;
  }
  function onUp() { drag.current = null; }
  function onKey(e: RKeyboardEvent) {
    const step = 0.15;
    if (e.key === 'ArrowLeft') view.current.yaw -= step;
    else if (e.key === 'ArrowRight') view.current.yaw += step;
    else if (e.key === 'ArrowUp') view.current.pitch = Math.min(1.2, view.current.pitch + step);
    else if (e.key === 'ArrowDown') view.current.pitch = Math.max(-1.2, view.current.pitch - step);
    else if (e.key === '+' || e.key === '=') view.current.fov = Math.max(0.7, view.current.fov - 0.1);
    else if (e.key === '-') view.current.fov = Math.min(2.0, view.current.fov + 0.1);
    else return;
    e.preventDefault(); view.current.auto = false; setHint(false);
  }

  return (
    <div
      ref={wrap} className={s.pano} tabIndex={0} role="img" aria-label={`${t.pano360Title}. ${t.panoHint}`}
      data-testid="pano-viewer" data-mode={mode} data-yaw="0"
      style={mode === 'css' ? { backgroundImage: `url(${src})`, backgroundSize: 'auto 100%' } : undefined}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onWheel={(e) => { view.current.fov = Math.max(0.7, Math.min(2.0, view.current.fov + e.deltaY * 0.001)); view.current.auto = false; }}
      onKeyDown={onKey}
    >
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: mode === 'gl' ? 'block' : 'none' }} />
      <div className={s.compass} aria-hidden><i style={{ transform: `rotate(${yawDeg}deg)` }} /></div>
      {hint && <div className={s.panoHint}>⟲ {t.panoHint}</div>}
    </div>
  );
}
