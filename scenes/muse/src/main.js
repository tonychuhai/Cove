import { createFrameLoop } from '../../riverscape/src/frame-loop.js';
import { LOOKS, createTurntable, savedLook, figureBounds, figureHit } from './turntable.js';
import { createPortraitRenderer } from './portrait-renderer.js';

const canvas = document.querySelector('#scene');
const $ = (id) => document.getElementById(id);
const hosted = document.documentElement.dataset.motion === 'host';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let stored = window.habitatSavedState;
if (!hosted) { try { stored = localStorage.getItem('cove.muse'); } catch {} }
const turntable = createTurntable(savedLook(stored));
let width = innerWidth, height = innerHeight, dpr = 1, hostRate = hosted ? 0 : 60;
let paused = false, ready = false, battery = false, lastVisible = -1, assets = [];
let pointerStart = null, renderer = null, uiKey = '', backgroundKey = '';
const lookButtons = [...document.querySelectorAll('[data-look]')];
const backgroundLayers = [$('backdrop-a'), $('backdrop-b')];
const shadow = $('figure-shadow');
const telemetry = { count: 0, lastTime: null, intervals: [], costs: [] };

function persist() {
  const state = JSON.stringify({ version: 1, look: turntable.state.current });
  if (window.webkit?.messageHandlers?.state) window.webkit.messageHandlers.state.postMessage(state);
  else { try { localStorage.setItem('cove.muse', state); } catch {} }
}
function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`无法加载 ${path}`));
    img.src = path;
  });
}
function resize() {
  width = innerWidth; height = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, battery ? 1.25 : 1.75);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const b = figureBounds(width, height);
  Object.assign(shadow.style, { left: `${b.x + b.w * 0.12}px`, top: `${b.y + b.h * 0.946}px`, width: `${b.w * 0.76}px`, height: `${b.h * 0.055}px` });
  loop.invalidate();
}
function updateBackground(state) {
  const key = `${state.current}:${state.next}`;
  if (key !== backgroundKey) {
    backgroundKey = key;
    [state.current, state.next].forEach((index, layer) => {
      const id = LOOKS[index].id;
      backgroundLayers[layer].style.backgroundImage = id === 'casual' ? 'linear-gradient(125deg,#f1f0e9,#d8e2d8)' : `url("assets/${id}-city.png")`;
    });
  }
  backgroundLayers[1].style.opacity = state.turning ? state.backgroundMix : 0;
}
function syncUI() {
  const s = turntable.state, look = LOOKS[s.visible];
  const key = `${s.visible}:${s.turning}:${ready}:${paused}:${hostRate > 0}`;
  if (key === uiKey) return;
  uiKey = key;
  document.documentElement.dataset.turning = String(s.turning);
  document.documentElement.dataset.look = look.id;
  canvas.dataset.look = look.id; canvas.dataset.turning = String(s.turning);
  for (const button of lookButtons) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.look) === s.visible));
    button.disabled = !ready || s.turning || paused || hostRate === 0;
  }
  $('change').disabled = !ready || s.turning || paused || hostRate === 0;
  if (lastVisible !== s.visible) {
    lastVisible = s.visible;
    $('city').textContent = look.city; $('english').textContent = look.english;
    $('detail').textContent = look.detail; $('number').textContent = String(s.visible + 1).padStart(2, '0');
    canvas.setAttribute('aria-label', `${look.city}，${look.detail}。点击或按回车转身换装。`);
  }
}
function draw(dt, now) {
  if (!ready || !renderer) return;
  const started = performance.now(), wasTurning = turntable.state.turning;
  const completed = turntable.tick(dt), s = turntable.state;
  updateBackground(s);
  renderer.draw(s, figureBounds(width, height), width, height);
  syncUI();
  if (wasTurning) {
    telemetry.count++;
    if (dt > 0 && telemetry.lastTime !== null) telemetry.intervals.push(now - telemetry.lastTime);
    telemetry.lastTime = now;
    telemetry.costs.push(performance.now() - started);
  }
  if (completed) {
    const sorted = [...telemetry.intervals].sort((a, b) => a - b);
    canvas.dataset.turnFrames = String(telemetry.count);
    canvas.dataset.turnFrameMs = String(Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0));
    canvas.dataset.renderMs = (telemetry.costs.reduce((a, b) => a + b, 0) / Math.max(1, telemetry.costs.length)).toFixed(2);
    persist(); updateLoop();
  }
}
const loop = createFrameLoop(draw, { fps: 0, hidden: document.hidden });
function updateLoop() {
  loop.setPaused(paused || hostRate === 0);
  loop.setRate(ready && turntable.state.turning ? Math.min(hostRate, battery ? 30 : 60) : 0);
  syncUI(); loop.invalidate();
}
function change(target) {
  if (!ready || paused || hostRate === 0 || document.hidden) return;
  if (turntable.request(target, reduced.matches)) {
    telemetry.count = 0; telemetry.lastTime = null; telemetry.intervals = []; telemetry.costs = [];
    if (!turntable.state.turning) persist();
    updateLoop();
  }
}
function personClick(x, y) { if (figureHit(x, y, figureBounds(width, height))) change(); }
canvas.addEventListener('pointerdown', (e) => { pointerStart = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointercancel', () => { pointerStart = null; });
canvas.addEventListener('click', (e) => {
  if (pointerStart && Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) <= 8) personClick(e.clientX, e.clientY);
  pointerStart = null;
});
canvas.addEventListener('pointermove', (e) => { canvas.style.cursor = figureHit(e.clientX, e.clientY, figureBounds(width, height)) ? 'pointer' : 'default'; });
canvas.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); change(); }
});
$('change').addEventListener('click', () => change());
for (const button of lookButtons) button.addEventListener('click', () => change(Number(button.dataset.look)));
$('pause').addEventListener('click', () => {
  paused = !paused; $('pause').textContent = paused ? '继续' : '暂停';
  $('pause').setAttribute('aria-pressed', String(paused)); $('pause').setAttribute('aria-label', paused ? '继续动画' : '暂停动画');
  updateLoop();
});
// The native window stays click-through. Its desktop-only tap sample arrives here.
window.habitatClick = (x, y) => {
  const target = document.elementFromPoint(x, y)?.closest('button');
  if (target) target.click(); else personClick(x, y);
};
window.habitatFeed = () => change();
window.habitatRate = (value) => { hostRate = Number.isFinite(value) ? Math.max(0, Math.min(60, value)) : 0; updateLoop(); };
window.habitatPower = (value) => { battery = Boolean(value); resize(); updateLoop(); };
addEventListener('resize', resize);
addEventListener('pagehide', () => { loop.dispose(); renderer?.dispose(); });
canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); ready = false; updateLoop(); });
canvas.addEventListener('webglcontextrestored', () => {
  renderer = createPortraitRenderer(canvas, assets.map(asset => asset.person));
  ready = true; updateLoop();
});
document.addEventListener('visibilitychange', () => loop.setHidden(document.hidden));
reduced.addEventListener('change', () => { /* The next requested turn honors the new preference. */ });
resize(); syncUI();
try {
  assets = await Promise.all(LOOKS.map(async (look) => ({
    person: await loadImage(`assets/${look.id}-face-v2.png`),
    city: look.id === 'casual' ? null : await loadImage(`assets/${look.id}-city.png`),
  })));
  renderer = createPortraitRenderer(canvas, assets.map(asset => asset.person));
  canvas.dataset.renderer = 'webgl2-silhouette-interpolation';
  canvas.dataset.model = 'face-v2';
  canvas.dataset.sequence = 'front-right-back-front';
  ready = true; $('loading').hidden = true; updateLoop();
} catch (error) {
  console.error(error);
  $('loading').textContent = '衣橱素材未能加载，请重新打开场景。';
}
