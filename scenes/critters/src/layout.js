// How many paper friends fit on a screen. Same breakpoints as little-critters.
export function gridFor(width, height) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const cols = w >= 1180 ? 6 : w >= 920 ? 5 : w >= 680 ? 4 : w >= 440 ? 3 : 2;
  const rows = Math.max(2, Math.min(4, Math.round(h / ((w / cols) * 1.05))));
  return { cols, rows, count: cols * rows, cellW: w / cols, cellH: h / rows };
}

export function savedBatch(raw, fallback = 1) {
  try {
    const data = JSON.parse(raw);
    const seed = Number(data?.seed);
    const batch = Number(data?.batch);
    return {
      seed: Number.isFinite(seed) && seed > 0 ? seed >>> 0 : fallback,
      batch: Number.isFinite(batch) && batch > 0 ? Math.floor(batch) : 1,
    };
  } catch {
    return { seed: fallback, batch: 1 };
  }
}
