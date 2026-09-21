import { createFrameLoop } from "../../riverscape/src/frame-loop.js";
import { Rng } from "./rng.js";
import { SPECIES, generateBatch } from "./species.js";
import { Animal } from "./animal.js";
import { drawAnimal, drawName, drawParticle } from "./draw.js";
import { gridFor, savedBatch } from "./layout.js";

const canvas = document.querySelector("#scene");
const ctx = canvas.getContext("2d");
const hosted = document.documentElement.dataset.motion === "host";
const $ = (id) => document.getElementById(id);
let stored = window.habitatSavedState;
if (!hosted) { try { stored = localStorage.getItem("cove.critters"); } catch {} }

const start = savedBatch(stored, Math.floor(Math.random() * 2 ** 31) || 1);
let rng = new Rng(start.seed);
let batchSeed = start.seed;
let batchNo = start.batch;
let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, cellW = 0, cellH = 0, R = 60;
let animals = [];
let leaving = [];
let particles = [];
let lastSay = -10;
let lastHoverId = null;
let now = performance.now() / 1000;
let paused = false;
let hostRate = hosted ? 0 : 60;
let battery = false;
const pointer = { x: -9999, y: -9999, active: false };

function persist() {
  const state = JSON.stringify({ version: 1, seed: batchSeed, batch: batchNo });
  if (window.webkit?.messageHandlers?.state) window.webkit.messageHandlers.state.postMessage(state);
  else { try { localStorage.setItem("cove.critters", state); } catch {} }
}

function say(text, prio = 0) {
  const gap = prio >= 2 ? 0 : prio === 1 ? 0.9 : 2.6;
  if (now - lastSay < gap) return false;
  const caption = $("caption");
  if (!caption || caption.textContent === text) return Boolean(caption);
  lastSay = now;
  caption.textContent = text;
  caption.classList.remove("flash");
  void caption.offsetWidth;
  caption.classList.add("flash");
  return true;
}

const world = {
  pointer,
  get R() { return R; },
  get cell() { return Math.min(cellW, cellH); },
  say,
  emit(type, x, y, o = {}) {
    particles.push({
      type, x, y, born: now,
      vx: o.vx ?? (Math.random() - 0.5) * R * 0.2,
      vy: o.vy ?? -R * (0.55 + Math.random() * 0.3),
      life: o.life ?? 1.5,
      size: o.size ?? 1,
      glyph: o.glyph,
      phase: Math.random() * 6.28,
    });
  },
  neighborsOf(a) {
    return animals.filter((o) => o !== a && Math.abs(o.col - a.col) <= 1 && Math.abs(o.row - a.row) <= 1);
  },
};

function place(a) {
  a.cx = (a.col + 0.5) * cellW;
  a.cy = (a.row + 0.5) * cellH + R * 0.12;
}

function fillGrid(seed, number, silent) {
  rng = new Rng(seed);
  batchSeed = seed;
  batchNo = number;
  const count = cols * rows;
  const batch = generateBatch(count, rng);
  // A stopped wallpaper draws one frame and no more, so a quiet fill has everyone already
  // in place; with the clock running they file in one after another as before.
  const instant = silent && hostRate === 0;
  animals = batch.map((b, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const a = new Animal(b, col, row, rng, now, silent ? 0 : 0.28 + col * 0.05 + row * 0.08 + rng.range(0, 0.06));
    if (instant) a.born = now - 1;
    place(a);
    return a;
  });
  $("batchNo").textContent = String(batchNo).padStart(3, "0");
  $("countLabel").textContent = String(count);
  $("speciesLabel").textContent = String(new Set(animals.map((a) => a.spec.id)).size);
  persist();
}

function newFriends(silent = false) {
  if (!silent) {
    for (const a of animals) {
      if (a.leaveAt === null) {
        a.leaveAt = now + (a.col * 0.03 + a.row * 0.05);
        leaving.push(a);
      }
    }
  }
  fillGrid((rng.a + 0x9e3779b9) >>> 0 || 1, batchNo + (silent ? 0 : 1), silent);
  if (!silent) {
    say("新朋友们来啦！它们还有点认生。", 2);
    $("change")?.classList.add("spin");
    setTimeout(() => $("change")?.classList.remove("spin"), 600);
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  W = Math.max(1, rect.width);
  H = Math.max(1, rect.height);
  dpr = Math.min(battery ? 1.25 : 2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const grid = gridFor(W, H);
  const changed = grid.cols !== cols || grid.rows !== rows;
  cols = grid.cols;
  rows = grid.rows;
  cellW = grid.cellW;
  cellH = grid.cellH;
  R = Math.min(cellW, cellH) * 0.25;
  if (changed || animals.length !== grid.count) fillGrid(batchSeed, batchNo, true);
  else animals.forEach(place);
  loop.invalidate();
}

function setPointer(x, y, active = true) {
  pointer.x = x;
  pointer.y = y;
  pointer.active = active;
}

function boopAt(x, y) {
  if (paused || hostRate === 0) return;
  setPointer(x, y, true);
  let best = null, bestD = Infinity;
  for (const a of animals) {
    const d = Math.hypot(x - a.cx, y - a.cy);
    if (d < R * 1.35 && d < bestD) { best = a; bestD = d; }
  }
  if (best) best.boop(now, world);
}

function draw(dt) {
  now += dt;
  let pc = -99, pr = -99;
  if (pointer.active) {
    pc = Math.floor(pointer.x / cellW);
    pr = Math.floor(pointer.y / cellH);
  }
  let hovered = null;
  for (const a of animals) {
    a.attentive = pointer.active && Math.abs(a.col - pc) <= 1 && Math.abs(a.row - pr) <= 1;
    a.hovered = a.attentive && a.col === pc && a.row === pr && Math.hypot(pointer.x - a.cx, pointer.y - a.cy) < R * 1.7;
    if (a.hovered) hovered = a;
  }
  if (hovered && hovered !== lastHoverId && hovered.s.appear > 0.9 && !hovered.petted) {
    say(`${hovered.name}（${hovered.spec.cn}）正盯着你看。`, 1);
  }
  lastHoverId = hovered;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  for (const a of leaving) { a.update(dt, now, world); drawAnimal(ctx, a, R); }
  leaving = leaving.filter((a) => a.s.appear > 0.002);
  for (const a of animals) { a.update(dt, now, world); drawAnimal(ctx, a, R); }
  for (const a of animals) drawName(ctx, a, R, a.nameShow);
  particles = particles.filter((p) => now - p.born < p.life);
  for (const p of particles) drawParticle(ctx, p, now, R);
}

const loop = createFrameLoop(draw, { fps: hosted ? 0 : 60, hidden: document.hidden });
function updateLoop() {
  loop.setPaused(paused || hostRate === 0);
  loop.setRate(hostRate);
  loop.invalidate();
}

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  setPointer(e.clientX - rect.left, e.clientY - rect.top, true);
});
canvas.addEventListener("pointerleave", () => { pointer.active = false; });
canvas.addEventListener("pointerdown", (e) => {
  if (hosted || e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  boopAt(e.clientX - rect.left, e.clientY - rect.top);
});
$("change")?.addEventListener("click", () => newFriends());
$("pause")?.addEventListener("click", () => {
  paused = !paused;
  $("pause").textContent = paused ? "继续" : "暂停";
  $("pause").setAttribute("aria-pressed", String(paused));
  updateLoop();
});
addEventListener("keydown", (e) => {
  if (hosted) return;
  if (e.code === "Space" || e.key === "r" || e.key === "R") {
    e.preventDefault();
    newFriends();
  }
});
addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => loop.setHidden(document.hidden));
addEventListener("pagehide", () => { persist(); loop.dispose(); });

window.habitatRate = (value) => {
  hostRate = Number.isFinite(value) ? Math.max(0, Math.min(60, value)) : 0;
  updateLoop();
};
window.habitatPower = (value) => { battery = Boolean(value); resize(); };
window.habitatFeed = () => { if (!paused && hostRate > 0) newFriends(); };
window.habitatClick = (x, y) => {
  const target = document.elementFromPoint(x, y)?.closest("button");
  if (target) target.click();
  else boopAt(x, y);
};
window.habitatStats = () => ({
  batch: batchNo,
  count: animals.length,
  species: new Set(animals.map((a) => a.spec.id)).size,
  catalog: SPECIES.length,
  pointer: pointer.active,
  loop: loop.state,
});

$("speciesTotal").textContent = String(SPECIES.length);
now = performance.now() / 1000;
resize();
if (!hosted) updateLoop();
