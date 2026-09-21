// Ported from GordenSun/little-critters (https://github.com/GordenSun/little-critters).
// 小动物：状态、注视逻辑、随机小动作
import { clamp } from './draw.js';

const ease = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-dt * rate));
// 0→1→0 的包络：前 a 段升，后 b 段降
const env = (p, a = 0.15, b = 0.15) => (p < a ? p / a : p > 1 - b ? (1 - p) / b : 1);

// 让 a 看向 o（另一只小动物或任意点）
export function gazeToward(a, tx, ty, cell) {
  const dx = tx - a.cx, dy = ty - a.cy;
  const D = cell * 1.15;
  return { yaw: clamp(dx / D, -1, 1), pitch: clamp(dy / D, -1, 1) };
}

// ---------- 随机小动作 ----------
// apply(a, p, now, world)：p 为进度 0..1。只设置 a.t（目标值），动作结束后自动回到中性。
export const ACTIONS = [
  {
    id: 'yawn', w: 1.0, dur: 2.6, trait: 'sleepy',
    caption: (a) => `${a.name} 打了个大大的哈欠。`,
    apply(a, p) {
      const k = p < 0.3 ? p / 0.3 : p < 0.7 ? 1 : (1 - p) / 0.3;
      const t = a.t;
      t.mouthOpen = k;
      t.lidL = Math.max(t.lidL, k * 0.95); t.lidR = Math.max(t.lidR, k * 0.95);
      if (!a.attentive) t.pitch = -0.35 * k;
      t.sy = 1 + 0.03 * k; t.rate = 6;
    },
  },
  {
    id: 'tongue', w: 0.8, dur: 1.8, trait: 'playful',
    caption: (a) => `${a.name} 吐了吐舌头。`,
    apply(a, p) { const k = env(p, 0.2, 0.2); a.t.tongue = k; a.t.smile = 0.7; a.t.lowLid = 0.3 * k; },
  },
  {
    id: 'wink', w: 0.7, dur: 1.3, trait: 'playful',
    caption: (a) => `${a.name} 偷偷眨了眨眼。`,
    apply(a, p) {
      const on = p > 0.2 && p < 0.75;
      if (on) { if (a.action.side < 0) a.t.lidL = 1; else a.t.lidR = 1; a.t.lowLid = 0.15; }
      a.t.smile = 0.8;
    },
  },
  {
    id: 'happy', w: 0.9, dur: 2.2, trait: 'playful',
    caption: (a) => `${a.name} 开心得冒出了小心心。`,
    apply(a, p, now, world) {
      a.t.lidL = a.t.lidR = 0.45; a.t.lowLid = 0.55; a.t.smile = 1;
      a.t.bob = -Math.abs(Math.sin(p * Math.PI * 3)) * 0.08;
      if (!a.action.e1 && p > 0.25) { a.action.e1 = true; world.emit('heart', a.cx + world.R * 0.75, a.cy - world.R * 0.6); }
      if (!a.action.e2 && p > 0.55) { a.action.e2 = true; world.emit('heart', a.cx - world.R * 0.65, a.cy - world.R * 0.85, { size: 0.7 }); }
    },
  },
  {
    id: 'sleepy', w: 0.8, dur: 4.6, trait: 'sleepy',
    caption: (a) => `${a.name} 有点犯困了……`,
    apply(a, p, now, world) {
      const k = env(p, 0.15, 0.15);
      a.t.lidL = Math.max(a.t.lidL, 0.78 * k); a.t.lidR = Math.max(a.t.lidR, 0.78 * k);
      if (!a.attentive) { a.t.pitch = 0.35 * k; a.t.roll = 0.18 * k * a.action.side; }
      a.t.mouthOpen = 0.08 * k; a.t.rate = 3;
      if (k > 0.9 && now > (a.action.nextZ || 0)) {
        a.action.nextZ = now + 0.9;
        world.emit('zzz', a.cx + world.R * 0.8 * -a.action.side, a.cy - world.R * 0.7, { vx: -a.action.side * world.R * 0.15 });
      }
    },
  },
  {
    id: 'surprised', w: 0.55, dur: 1.4,
    caption: (a) => `${a.name} 吓了一跳！`,
    apply(a, p, now, world) {
      const k = p < 0.1 ? p / 0.1 : p > 0.7 ? (1 - p) / 0.3 : 1;
      a.t.wide = k; a.t.brow = k; a.t.mouthOpen = 0.35 * k;
      a.t.pupilX = 0; a.t.pupilY = 0;
      a.t.bob = p < 0.3 ? -Math.sin((p / 0.3) * Math.PI) * 0.12 : 0;
      if (!a.action.e1) { a.action.e1 = true; world.emit('bang', a.cx + world.R * 0.95, a.cy - world.R * 1.05, { vy: -world.R * 0.2 }); }
    },
  },
  {
    id: 'sneeze', w: 0.55, dur: 2.0,
    caption: (a) => `${a.name}：阿——嚏！`,
    apply(a, p, now, world) {
      if (p < 0.45) {
        const k = p / 0.45;
        a.t.lidL = Math.max(a.t.lidL, 0.7 * k); a.t.lidR = Math.max(a.t.lidR, 0.7 * k);
        a.t.mouthOpen = 0.3 * k; a.t.brow = 0.5 * k;
        if (!a.attentive) a.t.pitch = -0.5 * k;
        a.t.rate = 5;
      } else if (p < 0.62) {
        a.t.lidL = a.t.lidR = 1; a.t.mouthOpen = 0.9; a.t.sy = 0.94;
        if (!a.attentive) a.t.pitch = 0.75;
        a.t.rate = 22;
        if (!a.action.e1) {
          a.action.e1 = true;
          for (let i = 0; i < 4; i++) world.emit('sparkle', a.cx + (i - 1.5) * world.R * 0.3, a.cy + world.R * 0.55, { vx: (i - 1.5) * world.R * 0.35, vy: world.R * 0.25, size: 0.6 + Math.random() * 0.4, life: 0.9 });
        }
      } else a.t.rate = 8;
    },
  },
  {
    id: 'ears', w: 0.7, dur: 1.0, needsEars: true,
    caption: (a) => `${a.name} 抖了抖耳朵。`,
    apply(a, p) { a.t.earWiggle = Math.sin(p * Math.PI * 6) * 0.22 * (1 - p); a.t.earRate = 40; },
  },
  {
    id: 'tilt', w: 0.9, dur: 2.4,
    caption: (a) => `${a.name} 歪着头，一脸疑惑。`,
    apply(a, p) {
      const k = env(p, 0.25, 0.25);
      a.t.roll = 0.24 * k * a.action.side; a.t.brow = 0.5 * k; a.t.browTilt = a.action.side; a.t.mouthOpen = 0.08 * k;
    },
  },
  {
    id: 'hum', w: 0.7, dur: 3.2, trait: 'playful',
    caption: (a) => `${a.name} 哼起了小曲儿。`,
    apply(a, p, now, world) {
      const k = env(p, 0.15, 0.15);
      a.t.lidL = a.t.lidR = 0.45 * k; a.t.lowLid = 0.5 * k; a.t.mouthOpen = 0.22 * k;
      a.t.roll = Math.sin(p * Math.PI * 4) * 0.1 * k;
      if (k > 0.5 && now > (a.action.nextN || 0)) {
        a.action.nextN = now + 0.7;
        world.emit('note', a.cx + world.R * 0.85 * a.action.side, a.cy - world.R * 0.7, { glyph: Math.random() < 0.5 ? '♪' : '♫', vx: a.action.side * world.R * 0.12 });
      }
    },
  },
  {
    id: 'look', w: 1.0, dur: 2.2,
    caption: (a) => `${a.name} 东张西望。`,
    apply(a, p) {
      if (a.attentive) return;
      const y = p < 0.4 ? -0.7 : p < 0.8 ? 0.7 : 0;
      a.t.yaw = y * a.action.side; a.t.pupilX = y * a.action.side; a.t.rate = 7;
    },
  },
  {
    id: 'nibble', w: 0.8, dur: 2.6, trait: 'playful',
    caption: (a) => `${a.name} 在偷吃零食。`,
    apply(a, p, now, world) {
      const k = env(p, 0.15, 0.15);
      a.t.mouthOpen = 0.22 * Math.abs(Math.sin(p * Math.PI * 7)) * k;
      a.t.lowLid = 0.35 * k; a.t.smile = 0.6;
      if (!a.attentive) a.t.pitch = 0.2 * k;
      if (k > 0.5 && now > (a.action.nextC || 0)) {
        a.action.nextC = now + 0.45;
        world.emit('crumb', a.cx + (Math.random() - 0.5) * world.R * 0.4, a.cy + world.R * 0.6, { vy: world.R * 0.9, vx: (Math.random() - 0.5) * world.R * 0.3, life: 0.6 });
      }
    },
  },
  {
    id: 'shy', w: 0.6, dur: 2.6, trait: 'shy',
    caption: (a) => `${a.name} 害羞地低下了头。`,
    apply(a, p) {
      const k = env(p, 0.2, 0.2);
      a.t.blush = k;
      if (!a.attentive) { a.t.pitch = 0.3 * k; a.t.yaw = 0.25 * k * a.action.side; }
      a.t.lidL = Math.max(a.t.lidL, 0.35 * k); a.t.lidR = Math.max(a.t.lidR, 0.35 * k);
      a.t.smile = 0.5; a.t.pupilX = -0.5 * k * a.action.side; a.t.pupilY = 0.5 * k;
    },
  },
  {
    id: 'gossip', w: 0.9, dur: 3.2, needsNeighbor: true,
    caption: (a) => `${a.name} 正跟 ${a.action.other.name} 说小话。`,
    apply(a, p, now, world) {
      const o = a.action.other;
      const k = env(p, 0.15, 0.15);
      if (!a.attentive) {
        const g = gazeToward(a, o.cx, o.cy, world.cell);
        a.t.yaw = g.yaw * k; a.t.pitch = g.pitch * k; a.t.pupilX = g.yaw; a.t.pupilY = g.pitch;
      }
      a.t.mouthOpen = p > 0.2 && p < 0.8 ? 0.18 * Math.abs(Math.sin(p * Math.PI * 11)) : 0;
      a.t.brow = 0.3 * k;
      if (!o.attentive && !o.action) o.forceGaze = { x: a.cx, y: a.cy, until: now + 0.3, who: a };
    },
  },
  {
    id: 'shake', w: 0.5, dur: 1.1,
    caption: (a) => `${a.name} 摇了摇头。`,
    apply(a, p) { if (a.attentive) return; a.t.yaw = Math.sin(p * Math.PI * 4) * 0.45 * (1 - p * 0.5); a.t.rate = 16; },
  },
  {
    id: 'nod', w: 0.5, dur: 1.1,
    caption: (a) => `${a.name} 点了点头。`,
    apply(a, p) { if (a.attentive) return; a.t.pitch = Math.abs(Math.sin(p * Math.PI * 3)) * 0.35; a.t.rate = 14; a.t.smile = 0.5; },
  },
];

// 被戳一下
export const BOOP = {
  id: 'boop', dur: 1.7, showName: true,
  caption: (a) => `你戳了戳 ${a.name}，它开心地眯起了眼。`,
  apply(a, p, now, world) {
    if (p < 0.22) {
      const k = p / 0.22;
      a.t.wide = k; a.t.brow = k; a.t.mouthOpen = 0.3 * k;
      a.t.sx = 1 + 0.07 * k; a.t.sy = 1 - 0.09 * k; a.t.rate = 22;
    } else {
      a.t.lidL = a.t.lidR = 0.45; a.t.lowLid = 0.55; a.t.smile = 1; a.t.blush = 0.8;
      a.t.bob = -Math.abs(Math.sin(((p - 0.22) / 0.78) * Math.PI * 2)) * 0.07;
      if (!a.action.e1) { a.action.e1 = true; world.emit('heart', a.cx + world.R * 0.8, a.cy - world.R * 0.75); }
    }
  },
};

const NEUTRAL = {
  lowLid: 0, wide: 0, mouthOpen: 0, tongue: 0, brow: 0, browTilt: 0, earWiggle: 0, bob: 0, sx: 1, sy: 1, roll: 0,
};

export class Animal {
  constructor({ spec, v, name }, col, row, rng, now, delay = 0) {
    this.spec = spec; this.v = v; this.name = name;
    this.col = col; this.row = row;
    this.rng = rng;
    this.cx = 0; this.cy = 0;
    this.born = now + delay;
    this.leaveAt = null;
    this.attentive = false; this.hovered = false; this.petted = false;
    this.action = null;
    this.forceGaze = null;
    this.nameShow = 0;
    this.nextBlink = now + rng.range(1, 4);
    this.blinkEnd = 0;
    this.nextAction = now + delay + rng.range(1.5, 7);
    this.nextHeart = 0;
    this.gazeAt = now + rng.range(0.5, 3);
    this.idleYaw = 0; this.idlePitch = 0;
    this.s = {
      yaw: 0, pitch: 0, roll: 0, pupilX: 0, pupilY: 0,
      lidL: v.baseLid, lidR: v.baseLid, lowLid: 0, wide: 0,
      mouthOpen: 0, smile: v.baseSmile, tongue: 0, brow: 0, browTilt: 0,
      earWiggle: 0, bob: 0, sx: 1, sy: 1, blush: v.baseBlush, appear: 0,
    };
    this.t = { ...this.s };
  }

  get bodyBottom() { return this.cy + this.v.headH * 1.55; }

  pickIdleGaze(now, world) {
    const r = this.rng.next();
    const neighbors = world.neighborsOf(this);
    if (r < 0.28) { this.idleYaw = 0; this.idlePitch = 0; }
    else if (r < 0.6 && neighbors.length) {
      const o = this.rng.pick(neighbors);
      const g = gazeToward(this, o.cx, o.cy, world.cell);
      this.idleYaw = g.yaw * 0.85; this.idlePitch = g.pitch * 0.85;
    } else { this.idleYaw = this.rng.range(-0.55, 0.55); this.idlePitch = this.rng.range(-0.3, 0.35); }
    this.gazeAt = now + this.rng.range(1.5, 5);
  }

  startAction(now, world, def = null) {
    const P = this.v.personality;
    if (!def) {
      const neighbors = world.neighborsOf(this).filter((o) => !o.attentive && !o.action);
      const items = [];
      for (const d of ACTIONS) {
        if (d.needsNeighbor && !neighbors.length) continue;
        if (d.needsEars && !this.v.ear) continue;
        let w = d.w;
        if (d.trait) w *= 0.5 + P[d.trait] * 1.2;
        if (d.id === this.lastActionId) w *= 0.25;
        items.push({ w, v: d });
      }
      def = this.rng.weighted(items);
      this.action = { def, start: now, dur: def.dur * this.rng.range(0.85, 1.15), side: this.rng.sign() };
      if (def.needsNeighbor) { this.action.other = this.rng.pick(neighbors); this.action.other.nameShowUntil = now + this.action.dur; }
    } else {
      this.action = { def, start: now, dur: def.dur, side: this.rng.sign() };
    }
    this.lastActionId = def.id;
    // 只有旁白真正提到它时才亮出名字，免得满屏都是名字
    const said = world.say(def.caption(this), def === BOOP ? 2 : 0);
    if (said || def.showName) this.nameShowUntil = now + this.action.dur;
  }

  boop(now, world) {
    if (this.action && this.action.def === BOOP) return;
    this.startAction(now, world, BOOP);
  }

  update(dt, now, world) {
    const s = this.s, t = this.t, v = this.v, P = v.personality;

    // 出场 / 退场
    if (this.leaveAt !== null) {
      const k = clamp((now - this.leaveAt) / 0.32, 0, 1);
      s.appear = Math.max(0, (1 - k * k) * (1 + 0.15 * Math.sin(k * Math.PI)));
      return;
    }
    const age = now - this.born;
    if (age <= 0) { s.appear = 0; return; }
    if (age < 0.7) {
      const k = age / 0.7;
      const c1 = 1.55;
      s.appear = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    } else s.appear = 1;

    // 中性目标
    Object.assign(t, NEUTRAL);
    t.smile = v.baseSmile; t.blush = v.baseBlush; t.rate = 4; t.earRate = 14;
    t.lidL = t.lidR = v.baseLid;

    // 注视
    if (this.attentive) {
      const g = gazeToward(this, world.pointer.x, world.pointer.y, world.cell);
      t.yaw = g.yaw * P.curiosity; t.pitch = g.pitch * P.curiosity;
      t.pupilX = clamp(g.yaw * 1.6, -1, 1); t.pupilY = clamp(g.pitch * 1.6, -1, 1);
      t.brow = 0.35; t.wide = 0.12; t.rate = 9;
      const d = Math.hypot(world.pointer.x - this.cx, world.pointer.y - this.cy);
      const wasPetted = this.petted;
      this.petted = d < world.R * 1.25;
      if (this.petted) {
        t.lowLid = 0.55; t.lidL = t.lidR = Math.max(t.lidL, 0.4); t.smile = 0.95; t.blush = 0.85; t.brow = 0; t.wide = 0;
        t.pitch += 0.12;
        if (!wasPetted) world.say(`${this.name} 被摸得眯起了眼，很舒服。`, 1);
        if (now > this.nextHeart) { this.nextHeart = now + 1.1; world.emit('heart', this.cx + world.R * 0.8 * (Math.random() < 0.5 ? -1 : 1), this.cy - world.R * 0.7, { size: 0.8 }); }
      }
    } else {
      this.petted = false;
      if (this.forceGaze && now < this.forceGaze.until) {
        const g = gazeToward(this, this.forceGaze.x, this.forceGaze.y, world.cell);
        t.yaw = g.yaw * 0.9; t.pitch = g.pitch * 0.9; t.pupilX = g.yaw; t.pupilY = g.pitch;
        t.brow = 0.2;
      } else {
        if (now > this.gazeAt) this.pickIdleGaze(now, world);
        t.yaw = this.idleYaw; t.pitch = this.idlePitch;
        t.pupilX = this.idleYaw * 0.6; t.pupilY = this.idlePitch * 0.6;
      }
    }

    // 眨眼
    if (now > this.nextBlink) {
      this.blinkEnd = now + 0.13;
      this.nextBlink = now + (this.rng.chance(0.2) ? 0.32 : this.rng.range(2.2, 6.5) / P.blinkiness);
    }
    if (now < this.blinkEnd) t.lidL = t.lidR = 1;

    // 小动作
    if (!this.action && now > this.nextAction && !this.petted) this.startAction(now, world);
    if (this.action) {
      const p = (now - this.action.start) / this.action.dur;
      if (p >= 1) {
        this.action = null;
        this.nextAction = now + this.rng.range(3, 12) / P.liveliness;
      } else this.action.def.apply(this, p, now, world);
    }

    // 缓动到目标
    const r = t.rate;
    s.yaw = ease(s.yaw, t.yaw, r, dt);
    s.pitch = ease(s.pitch, t.pitch, r, dt);
    s.roll = ease(s.roll, t.roll, 6, dt);
    s.pupilX = ease(s.pupilX, t.pupilX, 14, dt);
    s.pupilY = ease(s.pupilY, t.pupilY, 14, dt);
    s.lidL = ease(s.lidL, t.lidL, 30, dt);
    s.lidR = ease(s.lidR, t.lidR, 30, dt);
    s.lowLid = ease(s.lowLid, t.lowLid, 12, dt);
    s.wide = ease(s.wide, t.wide, 12, dt);
    s.mouthOpen = ease(s.mouthOpen, t.mouthOpen, 16, dt);
    s.smile = ease(s.smile, t.smile, 8, dt);
    s.tongue = ease(s.tongue, t.tongue, 12, dt);
    s.brow = ease(s.brow, t.brow, 10, dt);
    s.browTilt = ease(s.browTilt, t.browTilt, 10, dt);
    s.earWiggle = ease(s.earWiggle, t.earWiggle, t.earRate, dt);
    s.bob = ease(s.bob, t.bob, 18, dt);
    s.sx = ease(s.sx, t.sx, 18, dt);
    s.sy = ease(s.sy, t.sy, 18, dt);
    s.blush = ease(s.blush, t.blush, 4, dt);

    // 名字显示
    const want = this.hovered || (this.nameShowUntil && now < this.nameShowUntil) ? 1 : 0;
    this.nameShow = ease(this.nameShow, want, 8, dt);
  }
}
