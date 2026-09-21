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
  const position = turning && Number.isFinite(angle) ? Math.max(0, Math.min(5, angle)) : 0;
  const frameA = Math.min(4, Math.floor(position));
  const frameB = Math.min(4, frameA + 1);
  const reveal = position >= 4;
  const x = Math.max(0, position - 4);
  return { frameA, frameB,
    nextFrameA: reveal ? 0 : frameA,
    nextFrameB: reveal ? 0 : frameB,
    poseMix: reveal ? 0 : position - frameA,
    outfitMix: x * x * (3 - 2 * x),
    phase: !turning ? 'idle' : reveal ? 'reveal' : 'right-turn' };
}

// Turn right from front to back, then reveal the next outfit directly from the front.
// Atlas poses 5–7 (the left half of a full turn) are intentionally never sampled.
// Requests during a turn are ignored, so clicks cannot create an animation backlog.
export function createTurntable(initial = 1) {
  let current = savedLook({ look: initial }), next = current, progress = 0, turning = false;
  const duration = 0.82;
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
      const pose = sampleTurn(eased * 5, turning);
      const background = Math.max(0, Math.min(1, (p - 0.4) / 0.6));
      return { current, next, turning, progress: p, angle: eased * 5, ...pose,
        visible: turning && pose.outfitMix >= 0.5 ? next : current,
        backgroundMix: turning ? background * background * (3 - 2 * background) : 0 };
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
