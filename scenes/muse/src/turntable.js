export const LOOKS = [
  { id: 'casual', city: '出发之前', english: 'EVERYDAY', detail: '鼠尾草绿 · 轻松日常', color: '#9faa91' },
  { id: 'shanghai', city: '上海', english: 'SHANGHAI', detail: '玉色长裙 · 漫步外滩', color: '#8dada1' },
  { id: 'london', city: '伦敦', english: 'LONDON', detail: '酒红风衣 · 午后泰晤士', color: '#8b5258' },
  { id: 'tokyo', city: '东京', english: 'TOKYO', detail: '淡紫裙摆 · 春日旅行', color: '#b2a0cd' },
];

export function savedLook(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Number.isInteger(value?.look) && value.look >= 0 && value.look < LOOKS.length ? value.look : 1;
  } catch { return 1; }
}

export function sampleTurn(angle, turning = true) {
  const normalized = ((angle % 8) + 8) % 8;
  const frameA = Math.floor(normalized);
  const x = Math.max(0, Math.min(1, (angle - 3.45) / 1.1));
  return { frameA, frameB: (frameA + 1) % 8,
    poseMix: normalized - frameA,
    outfitMix: turning ? x * x * (3 - 2 * x) : 0 };
}

// Outfit switches while her back faces the camera, halfway through one full turn.
// Requests during a turn are ignored, so clicks cannot create an animation backlog.
export function createTurntable(initial = 1) {
  let current = savedLook({ look: initial }), next = current, progress = 0, turning = false;
  const duration = 1.05;
  return {
    request(target = (current + 1) % LOOKS.length, reduced = false) {
      if (turning || !Number.isInteger(target) || target < 0 || target >= LOOKS.length || target === current) return false;
      next = target;
      if (reduced) { current = next; progress = 0; }
      else { turning = true; progress = 0; }
      return true;
    },
    tick(dt) {
      if (!turning || !Number.isFinite(dt) || dt <= 0) return false;
      progress = Math.min(1, progress + Math.min(dt, 0.1) / duration);
      if (progress === 1) { current = next; turning = false; progress = 0; return true; }
      return false;
    },
    get state() {
      const p = turning ? progress : 0;
      const eased = p * p * (3 - 2 * p);
      return { current, next, turning, progress: p, angle: eased * 8,
        ...sampleTurn(eased * 8, turning),
        visible: turning && eased >= 0.5 ? next : current,
        backgroundMix: turning ? Math.max(0, Math.min(1, (p - 0.28) / 0.44)) : 0 };
    },
  };
}

export function figureBounds(width, height) {
  const h = Math.min(height * (width < 600 ? 0.72 : 0.86), width * 1.8);
  const w = h / 2;
  return { x: width * (width < 600 ? 0.55 : 0.68) - w / 2,
    y: height * (width < 600 ? 0.05 : 0.045), w, h };
}
export function figureHit(x, y, bounds) {
  return x >= bounds.x + bounds.w * 0.15 && x <= bounds.x + bounds.w * 0.87
    && y >= bounds.y + bounds.h * 0.02 && y <= bounds.y + bounds.h * 0.98;
}
