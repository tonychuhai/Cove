// Ported from GordenSun/little-critters (https://github.com/GordenSun/little-critters).
// 绘制引擎：所有小动物都由这里的线条画出来
import { shadeHex } from './species.js';

export const INK = '#3a2d27';
const PINK = '#dfa5a0';
const SCLERA = '#f8f3ea';
const PUPIL = '#2a2220';
// 头部最大偏转角（弧度）：yaw 左右，pitch 上下
export const MAX_YAW = 0.6;
export const MAX_PITCH = 0.42;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- 基础形状 ----------

function smoothClosed(ctx, pts) {
  const n = pts.length;
  ctx.moveTo((pts[0].x + pts[n - 1].x) / 2, (pts[0].y + pts[n - 1].y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.closePath();
}

// 带手绘抖动的椭圆（blob）。cheek>0 时下半部分变宽（脸颊）
export function blobPath(ctx, cx, cy, rx, ry, o = {}) {
  const { seed = 0, amp = 0.02, cheek = 0, n = 36, rot = 0 } = o;
  const p1 = seed * 1.7, p2 = seed * 2.3, p3 = seed * 3.1;
  const pts = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const w = 1 + amp * (Math.sin(3 * t + p1) * 0.5 + Math.sin(5 * t + p2) * 0.3 + Math.sin(7 * t + p3) * 0.2);
    const sn = Math.sin(t);
    const ch = 1 + cheek * Math.max(0, sn) * Math.max(0, sn) * 0.16;
    let x = Math.cos(t) * rx * w * ch, y = sn * ry * w;
    if (rot) { const xx = x * c - y * s; y = x * s + y * c; x = xx; }
    pts.push({ x: cx + x, y: cy + y });
  }
  ctx.beginPath();
  smoothClosed(ctx, pts);
}

function ellipsePath(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
}

function fillStroke(ctx, fill, lw, stroke = INK) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function strokeLine(ctx, pts, lw, color = INK) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.stroke();
}

// ---------- 身体 ----------

function drawBody(ctx, rx, ry, v, lw, spec) {
  const bw = rx * 0.62 * v.bodyW;
  const bodyColor = spec.bodyColor || shadeHex(v.color, -0.12);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-rx * 0.42, ry * 0.55);
    ctx.bezierCurveTo(-rx * 0.5, ry * 1.05, -bw * 1.3, ry * 1.1, -bw * 1.45, ry * 1.4);
    ctx.quadraticCurveTo(0, ry * 1.52, bw * 1.45, ry * 1.4);
    ctx.bezierCurveTo(bw * 1.3, ry * 1.1, rx * 0.5, ry * 1.05, rx * 0.42, ry * 0.55);
    ctx.closePath();
  };
  path();
  fillStroke(ctx, bodyColor, lw);
  // 脖子阴影
  ctx.save();
  path(); ctx.clip();
  ellipsePath(ctx, 0, ry * 0.12, rx * 1.02, ry * 1.04);
  ctx.fillStyle = 'rgba(40,25,15,0.14)'; ctx.fill();
  ctx.restore();

  // 配饰：围巾 / 项圈
  if (v.accessory === 'scarf') {
    ctx.beginPath();
    ctx.moveTo(-rx * 0.5, ry * 0.8);
    ctx.quadraticCurveTo(0, ry * 1.12, rx * 0.5, ry * 0.8);
    ctx.lineTo(rx * 0.58, ry * 1.02);
    ctx.quadraticCurveTo(0, ry * 1.34, -rx * 0.58, ry * 1.02);
    ctx.closePath();
    fillStroke(ctx, v.accColor, lw * 0.85);
    // 打结的两条尾巴
    const sx = v.accSide * rx * 0.36, sy = ry * 1.1;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + k * rx * 0.16 * v.accSide, sy + ry * 0.2, sx + k * rx * 0.04 + v.accSide * rx * 0.08, sy + ry * 0.4);
      ctx.quadraticCurveTo(sx + v.accSide * rx * 0.02, sy + ry * 0.25, sx, sy);
      ctx.closePath();
      fillStroke(ctx, v.accColor, lw * 0.8);
    }
    ellipsePath(ctx, sx, sy, rx * 0.09, ry * 0.07);
    fillStroke(ctx, shadeHex(v.accColor, -0.2), lw * 0.7);
  } else if (v.accessory === 'collar') {
    ctx.beginPath();
    ctx.moveTo(-rx * 0.5, ry * 0.86);
    ctx.quadraticCurveTo(0, ry * 1.14, rx * 0.5, ry * 0.86);
    ctx.lineTo(rx * 0.52, ry * 0.96);
    ctx.quadraticCurveTo(0, ry * 1.24, -rx * 0.52, ry * 0.96);
    ctx.closePath();
    fillStroke(ctx, v.accColor, lw * 0.8);
    ellipsePath(ctx, 0, ry * 1.2, rx * 0.07, ry * 0.075);
    fillStroke(ctx, '#d9b64f', lw * 0.7);
  }
}

// ---------- 耳朵 ----------

// 尖耳：底部带一段"耳根"向下延伸（藏在头后面），保证转头时耳朵和脑袋之间不露缝
function pointyPath(ctx, er, side, k = 1, yoff = 0) {
  ctx.beginPath();
  ctx.moveTo(-er * 0.9 * k, yoff + er * 0.15);
  ctx.quadraticCurveTo(-er * 0.78 * k, yoff - er * 0.9 * k, side * er * 0.15 * k, yoff - er * 1.75 * k);
  ctx.quadraticCurveTo(er * 0.78 * k, yoff - er * 0.9 * k, er * 0.9 * k, yoff + er * 0.15);
  ctx.quadraticCurveTo(er * 0.95 * k, yoff + er * 0.7 * k, er * 0.6 * k, yoff + er * 1.05 * k);
  ctx.lineTo(-er * 0.6 * k, yoff + er * 1.05 * k);
  ctx.quadraticCurveTo(-er * 0.95 * k, yoff + er * 0.7 * k, -er * 0.9 * k, yoff + er * 0.15);
  ctx.closePath();
}

// 通用耳根：一小团同色圆，压在耳朵下面、头的后面，只在有缝的地方露出来
function earRoot(ctx, er, col, lw, seed, dx = 0, dy = 0.2) {
  blobPath(ctx, dx * er, dy * er, er * 0.62, er * 0.6, { seed: seed + 5, amp: 0.03 });
  fillStroke(ctx, col, lw);
}

function drawEar(ctx, x, y, type, side, er, ang, col, inner, lw, seed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  if (type !== 'pointy') earRoot(ctx, er, col, lw, seed, type === 'sheep' ? side * 0.25 : type === 'floppy' ? side * 0.1 : 0, type === 'long' ? 0.35 : 0.2);
  switch (type) {
    case 'round':
      blobPath(ctx, 0, -er * 0.4, er, er * 0.95, { seed, amp: 0.03 });
      fillStroke(ctx, col, lw);
      if (inner) { blobPath(ctx, 0, -er * 0.34, er * 0.55, er * 0.5, { seed: seed + 1, amp: 0.04 }); fillStroke(ctx, inner, 0); }
      break;
    case 'pointy':
      pointyPath(ctx, er, side);
      fillStroke(ctx, col, lw);
      if (inner) { pointyPath(ctx, er, side, 0.58, er * 0.02); fillStroke(ctx, inner, 0); }
      break;
    case 'floppy':
      blobPath(ctx, side * er * 0.35, er * 0.9, er * 0.62, er * 1.3, { seed, amp: 0.03, rot: side * 0.25 });
      fillStroke(ctx, col, lw);
      break;
    case 'long':
      blobPath(ctx, side * er * 0.15, -er * 1.3, er * 0.48, er * 1.4, { seed, amp: 0.03, rot: side * 0.1 });
      fillStroke(ctx, col, lw);
      if (inner) { blobPath(ctx, side * er * 0.15, -er * 1.25, er * 0.26, er * 1.05, { seed: seed + 1, amp: 0.03, rot: side * 0.1 }); fillStroke(ctx, inner, 0); }
      break;
    case 'tiny':
      blobPath(ctx, side * er * 0.25, -er * 0.1, er * 0.55, er * 0.5, { seed, amp: 0.04 });
      fillStroke(ctx, col, lw);
      if (inner) { blobPath(ctx, side * er * 0.25, -er * 0.08, er * 0.3, er * 0.26, { seed: seed + 1 }); fillStroke(ctx, inner, 0); }
      break;
    case 'fluffy':
      blobPath(ctx, side * er * 0.25, -er * 0.35, er * 1.15, er * 1.1, { seed, amp: 0.09, n: 56 });
      fillStroke(ctx, col, lw);
      if (inner) { blobPath(ctx, side * er * 0.2, -er * 0.3, er * 0.7, er * 0.65, { seed: seed + 1, amp: 0.1, n: 40 }); fillStroke(ctx, inner, 0); }
      break;
    case 'sheep':
      blobPath(ctx, side * er * 0.6, 0, er * 0.8, er * 0.42, { seed, amp: 0.04, rot: side * 0.15 });
      fillStroke(ctx, col, lw);
      if (inner) { blobPath(ctx, side * er * 0.62, 0, er * 0.45, er * 0.2, { seed: seed + 1, rot: side * 0.15 }); fillStroke(ctx, inner, 0); }
      break;
  }
  ctx.restore();
}

function drawEars(ctx, a, rim, R, lw) {
  const { v, s } = a;
  const e = v.ear;
  const inner = e.inner === 'pink' ? PINK : e.inner === 'light' ? v.light : e.inner === 'dark' ? v.dark : null;
  const col = e.color || (e.shade ? shadeHex(v.color, e.shade) : v.color);
  // 先画远侧耳朵，再画近侧
  const order = s.yaw >= 0 ? [-1, 1] : [1, -1];
  for (const side of order) {
    // 耳根略微埋进轮廓里（r<1），配合耳根延伸，转到任何角度都贴着脑袋
    const m = rim(side * e.x, e.y, { slide: 0.2, r: 0.93 });
    // 近侧耳朵略大、远侧略小；沿轮廓滑动时顺着轮廓法线转一点
    const er = R * 0.3 * e.size * (1 + 0.12 * side * s.yaw);
    let ang = side * (e.tilt + s.earWiggle) + m.dphi * 0.7;
    if (v.extras.flop === side) ang += side * 0.95;
    drawEar(ctx, m.x, m.y, e.type, side, er, ang, col, inner, lw, v.seed + side * 3);
  }
}

// ---------- 附加结构：羊毛 / 鹿角 / 蛙眼泡 ----------

// 羊毛帽：一圈卷卷贴着头顶轮廓。低头时帽子往额头压一点，转头基本不动（帽子套在头顶，绕竖轴转是不变的）
function drawWool(ctx, v, rim, R, lw) {
  const wr = R * 0.2 * (v.extras.woolSize || 1);
  const woolColor = v.extras.wool || '#f4eee2';
  const top = [-0.88, -0.6, -0.32, 0, 0.32, 0.6, 0.88];
  top.forEach((nx, i) => {
    const ny = -Math.sqrt(Math.max(0, 1 - nx * nx));
    const m = rim(nx, ny, { slide: 0.05, r: 0.97, pitchShift: 0.12 });
    const r = wr * (0.85 + 0.3 * Math.abs(Math.sin(v.seed + i * 1.3)));
    blobPath(ctx, m.x, m.y - wr * 0.15, r * 1.05, r, { seed: v.seed + i * 7, amp: 0.06 });
    fillStroke(ctx, woolColor, lw * 0.85);
  });
  [-0.45, 0.15, 0.6].forEach((nx, i) => {
    const ny = -Math.sqrt(Math.max(0, 1 - nx * nx));
    const m = rim(nx, ny, { slide: 0.05, r: 0.78, pitchShift: 0.12 });
    blobPath(ctx, m.x, m.y, wr * 0.7, wr * 0.65, { seed: v.seed + 40 + i * 5, amp: 0.07 });
    fillStroke(ctx, woolColor, lw * 0.8);
  });
}

function drawAntlers(ctx, rim, R, lw) {
  const col = '#7a5a3c';
  for (const side of [-1, 1]) {
    const b = rim(side * 0.34, -0.9, { slide: 0.15, r: 0.95 });
    const pts = [
      [[b.x, b.y], [b.x + side * R * 0.12, b.y - R * 0.35], [b.x + side * R * 0.3, b.y - R * 0.7]],
      [[b.x + side * R * 0.1, b.y - R * 0.3], [b.x + side * R * 0.36, b.y - R * 0.42]],
      [[b.x + side * R * 0.2, b.y - R * 0.5], [b.x + side * R * 0.06, b.y - R * 0.78]],
    ];
    for (const p of pts) strokeLine(ctx, p, lw * 3.2, INK);
    for (const p of pts) strokeLine(ctx, p, lw * 1.9, col);
  }
}

// ---------- 斑纹（在头部裁剪区内绘制） ----------

function drawMarkings(ctx, a, map, R, lw) {
  const { spec, v } = a;
  const rx = R * v.headW, ry = R * v.headH;
  const eyeR = R * 0.13 * v.eye.size;

  if (spec.muzzle) {
    const mz = spec.muzzle;
    const m = map(0, mz.y);
    blobPath(ctx, m.x, m.y, rx * mz.w * m.sx, ry * mz.h, { seed: v.seed + 3, amp: 0.03 });
    ctx.fillStyle = mz.subtle ? withAlpha(v.light, 0.55) : v.light;
    ctx.fill();
  }

  for (const mk of spec.marks) {
    switch (mk) {
      case 'raccoonMask': {
        for (const side of [-1, 1]) {
          const m = map(side * v.eye.spread, v.eye.y);
          blobPath(ctx, m.x, m.y + eyeR * 0.1, eyeR * 2.0 * m.sx, eyeR * 1.35, { rot: side * 0.3, seed: v.seed + side });
          fillStroke(ctx, v.dark, 0);
        }
        const c = map(0, v.eye.y + 0.02);
        ellipsePath(ctx, c.x, c.y, eyeR * 1.3 * c.sx, eyeR * 0.75);
        fillStroke(ctx, v.dark, 0);
        for (const side of [-1, 1]) {
          const b = map(side * v.eye.spread, v.eye.y - 0.24);
          ellipsePath(ctx, b.x, b.y, eyeR * 1.05 * b.sx, eyeR * 0.42, side * 0.2);
          fillStroke(ctx, v.light, 0);
        }
        break;
      }
      case 'pandaPatches':
        for (const side of [-1, 1]) {
          const m = map(side * v.eye.spread, v.eye.y + 0.03);
          blobPath(ctx, m.x, m.y, eyeR * 1.55 * m.sx, eyeR * 2.0, { rot: side * 0.5, seed: v.seed + side });
          fillStroke(ctx, v.dark, 0);
        }
        break;
      case 'dogPatch':
        if (v.extras.patchSide) {
          const side = v.extras.patchSide;
          const m = map(side * v.eye.spread, v.eye.y);
          blobPath(ctx, m.x, m.y, eyeR * 2.0 * m.sx, eyeR * 2.0, { seed: v.seed + 9, amp: 0.05 });
          fillStroke(ctx, shadeHex(v.color, -0.25), 0);
        }
        break;
      case 'catStripes': {
        if (!v.extras.stripes) break;
        const col = shadeHex(v.color, -0.32);
        for (const nx of [-0.14, 0, 0.14]) {
          const t = map(nx, -0.8), b = map(nx * 1.3, -0.5);
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.quadraticCurveTo((t.x + b.x) / 2 + nx * R * 0.15, (t.y + b.y) / 2, b.x, b.y);
          ctx.lineWidth = lw * 0.95; ctx.strokeStyle = col; ctx.stroke();
        }
        for (const side of [-1, 1]) {
          for (const ny of [0.06, 0.24]) {
            const o = map(side * 0.93, ny), i2 = map(side * 0.64, ny + 0.03);
            strokeLine(ctx, [[o.x, o.y], [i2.x, i2.y]], lw * 0.85, col);
          }
        }
        break;
      }
      case 'deerSpots':
        if (!v.extras.spots) break;
        for (const [nx, ny] of [[-0.3, -0.55], [-0.12, -0.7], [0.1, -0.68], [0.3, -0.52], [0, -0.45]]) {
          const m = map(nx, ny);
          ellipsePath(ctx, m.x, m.y, R * 0.05 * m.sx, R * 0.045);
          fillStroke(ctx, v.light, 0);
        }
        break;
      case 'hamsterBlaze': {
        if (v.extras.blaze) {
          const m = map(0, -0.62);
          blobPath(ctx, m.x, m.y, rx * 0.16 * m.sx, ry * 0.3, { seed: v.seed + 5 });
          fillStroke(ctx, v.light, 0);
        }
        for (const side of [-1, 1]) {
          const m = map(side * 0.66, 0.3);
          blobPath(ctx, m.x, m.y, rx * 0.28 * m.sx, ry * 0.22, { seed: v.seed + side * 2 });
          fillStroke(ctx, v.light, 0);
        }
        break;
      }
      case 'frogBelly': {
        const m = map(0, 0.74);
        blobPath(ctx, m.x, m.y, rx * 0.72 * m.sx, ry * 0.3, { seed: v.seed + 4 });
        fillStroke(ctx, v.light, 0);
        break;
      }
    }
  }

  // 纸面小点（手绘质感）
  ctx.fillStyle = 'rgba(58,45,39,0.13)';
  for (const p of v.speckles) {
    const m = map(p.nx, p.ny);
    ctx.beginPath(); ctx.arc(m.x, m.y, lw * 0.38, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- 眼睛 ----------

function drawEye(ctx, ex, ey, erx, ery, lidTop, lidBot, s, v, lidColor, lw) {
  lidTop = clamp(lidTop, 0, 1);
  lidBot = clamp(lidBot, 0, 1);
  const wide = 1 + s.wide * 0.3;
  erx *= wide; ery *= wide;

  if (lidTop + lidBot >= 0.92) {
    // 闭眼：开心 = ^，放松/困 = ︶
    const happy = lidBot > 0.35;
    ctx.beginPath();
    if (happy) {
      ctx.moveTo(ex - erx, ey + ery * 0.25);
      ctx.quadraticCurveTo(ex, ey - ery * 1.0, ex + erx, ey + ery * 0.25);
    } else {
      ctx.moveTo(ex - erx, ey - ery * 0.15);
      ctx.quadraticCurveTo(ex, ey + ery * 0.6, ex + erx, ey - ery * 0.15);
    }
    ctx.lineWidth = lw * 0.95; ctx.strokeStyle = INK; ctx.stroke();
    return;
  }

  // 眼白 + 轮廓
  ellipsePath(ctx, ex, ey, erx, ery);
  fillStroke(ctx, SCLERA, lw * 0.85);

  // 瞳孔（裁剪在眼白内）
  ctx.save();
  ellipsePath(ctx, ex, ey, erx, ery); ctx.clip();
  const px = ex + s.pupilX * erx * 0.42, py = ey + s.pupilY * ery * 0.35;
  const pr = Math.min(erx, ery) * 0.74;
  if (v.iris) {
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fillStyle = v.iris; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, pr * 0.62, 0, Math.PI * 2); ctx.fillStyle = PUPIL; ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fillStyle = PUPIL; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(px - pr * 0.36, py - pr * 0.4, pr * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
  ctx.restore();

  // 眼皮
  if (lidTop > 0.02 || lidBot > 0.02) {
    const pad = lw * 0.7;
    ctx.save();
    ellipsePath(ctx, ex, ey, erx + pad, ery + pad); ctx.clip();
    ctx.fillStyle = lidColor;
    const top = ey - ery - pad, bot = ey + ery + pad, h = bot - top;
    let yTop = null, yBot = null;
    if (lidTop > 0.02) { yTop = top + h * lidTop; ctx.fillRect(ex - erx - pad, top, 2 * (erx + pad), yTop - top); }
    if (lidBot > 0.02) { yBot = bot - h * lidBot; ctx.fillRect(ex - erx - pad, yBot, 2 * (erx + pad), bot - yBot); }
    ctx.restore();
    ctx.save();
    ellipsePath(ctx, ex, ey, erx + lw * 0.3, ery + lw * 0.3); ctx.clip();
    ctx.lineWidth = lw * 0.9; ctx.strokeStyle = INK;
    if (yTop !== null) {
      ctx.beginPath();
      ctx.moveTo(ex - erx - pad, yTop - ery * 0.18);
      ctx.quadraticCurveTo(ex, yTop + ery * 0.28, ex + erx + pad, yTop - ery * 0.18);
      ctx.stroke();
    }
    if (yBot !== null) {
      ctx.beginPath();
      ctx.moveTo(ex - erx - pad, yBot + ery * 0.18);
      ctx.quadraticCurveTo(ex, yBot - ery * 0.28, ex + erx + pad, yBot + ery * 0.18);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---------- 脸部：眼、眉、鼻、嘴、胡须、腮红 ----------

function drawFace(ctx, a, map, R, lw) {
  const { spec, v, s } = a;
  const rx = R * v.headW, ry = R * v.headH;
  const eyeR = R * 0.13 * v.eye.size;

  const lidColorFor = (side) => {
    if (spec.marks.includes('pandaPatches') || spec.marks.includes('raccoonMask')) return v.dark;
    if (spec.marks.includes('dogPatch') && v.extras.patchSide === side) return shadeHex(v.color, -0.25);
    return v.color;
  };

  // 青蛙：眼泡
  if (spec.extra === 'eyeBumps') {
    for (const side of [-1, 1]) {
      const m = map(side * v.eye.spread, v.eye.y);
      ellipsePath(ctx, m.x, m.y - eyeR * 0.1, eyeR * 1.6 * Math.max(0.6, m.sx), eyeR * 1.55);
      fillStroke(ctx, v.color, lw);
    }
  }

  // 眼睛
  const eyes = [];
  for (const side of [-1, 1]) {
    const m = map(side * v.eye.spread, v.eye.y);
    const erx = eyeR * m.sx, ery = eyeR * 1.12;
    const lidTop = side < 0 ? s.lidL : s.lidR;
    drawEye(ctx, m.x, m.y, erx, ery, lidTop, s.lowLid, s, v, lidColorFor(side), lw);
    eyes.push({ side, x: m.x, y: m.y, erx, ery });
  }
  // 眉毛
  if (Math.abs(s.brow) > 0.06) {
    ctx.lineWidth = lw * 0.9; ctx.strokeStyle = withAlpha(INK, clamp(Math.abs(s.brow) * 1.4, 0, 0.85));
    for (const e of eyes) {
      const lift = s.brow * eyeR * 0.55;
      const tilt = s.browTilt * e.side * eyeR * 0.35;
      const y0 = e.y - e.ery * 1.55 - lift;
      ctx.beginPath();
      ctx.moveTo(e.x - e.erx * 0.75, y0 + e.side * tilt * -1 + eyeR * 0.05);
      ctx.quadraticCurveTo(e.x, y0 - eyeR * 0.28, e.x + e.erx * 0.75, y0 + e.side * tilt + eyeR * 0.05);
      ctx.stroke();
    }
  }

  // 鼻子
  const nz = spec.nose;
  const nm = map(0, nz.y);
  const nr = R * 0.1 * nz.size * v.noseSize;
  const noseColor = nz.color || INK;
  let noseBottom = nm.y + nr * 0.8;
  switch (nz.type) {
    case 'bulb':
      blobPath(ctx, nm.x, nm.y, nr * 1.25 * nm.sx, nr * 0.95, { seed: v.seed + 11, amp: 0.04 });
      fillStroke(ctx, noseColor, lw * 0.7);
      ctx.beginPath(); ctx.arc(nm.x - nr * 0.4 * nm.sx, nm.y - nr * 0.3, nr * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
      noseBottom = nm.y + nr * 0.9;
      break;
    case 'tall':
      blobPath(ctx, nm.x, nm.y, nr * 1.05 * nm.sx, nr * 1.85, { seed: v.seed + 11, amp: 0.04 });
      fillStroke(ctx, noseColor, lw * 0.7);
      ctx.beginPath(); ctx.arc(nm.x - nr * 0.35 * nm.sx, nm.y - nr * 0.9, nr * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
      noseBottom = nm.y + nr * 1.8;
      break;
    case 'dot':
      ctx.beginPath();
      ctx.moveTo(nm.x - nr * 0.95 * nm.sx, nm.y - nr * 0.45);
      ctx.quadraticCurveTo(nm.x, nm.y - nr * 0.85, nm.x + nr * 0.95 * nm.sx, nm.y - nr * 0.45);
      ctx.quadraticCurveTo(nm.x + nr * 0.6 * nm.sx, nm.y + nr * 0.4, nm.x, nm.y + nr * 0.7);
      ctx.quadraticCurveTo(nm.x - nr * 0.6 * nm.sx, nm.y + nr * 0.4, nm.x - nr * 0.95 * nm.sx, nm.y - nr * 0.45);
      ctx.closePath();
      fillStroke(ctx, noseColor, lw * 0.7);
      noseBottom = nm.y + nr * 0.7;
      break;
    case 'snout': {
      blobPath(ctx, nm.x, nm.y, nr * 2.1 * nm.sx, nr * 1.45, { seed: v.seed + 11, amp: 0.03 });
      fillStroke(ctx, shadeHex(v.color, -0.14), lw * 0.85);
      ctx.fillStyle = withAlpha(INK, 0.55);
      for (const side of [-1, 1]) {
        ellipsePath(ctx, nm.x + side * nr * 0.75 * nm.sx, nm.y + nr * 0.05, nr * 0.3 * nm.sx, nr * 0.42);
        ctx.fill();
      }
      noseBottom = nm.y + nr * 1.45;
      break;
    }
    case 'dots':
      ctx.fillStyle = INK;
      for (const side of [-1, 1]) {
        const d = map(side * 0.14, nz.y);
        ctx.beginPath(); ctx.arc(d.x, d.y, nr * 0.32, 0, Math.PI * 2); ctx.fill();
      }
      noseBottom = nm.y + nr * 0.4;
      break;
  }

  // 嘴
  const mm = map(0, spec.mouth.y);
  const mw = R * 0.17 * mm.sx;
  const mo = clamp(s.mouthOpen, 0, 1);
  ctx.lineWidth = lw * 0.9; ctx.strokeStyle = INK;
  if (spec.mouth.philtrum && mo < 0.5) {
    ctx.beginPath(); ctx.moveTo(nm.x, noseBottom); ctx.lineTo(mm.x, mm.y - mw * 0.15); ctx.stroke();
  }
  if (mo > 0.05) {
    // 张嘴
    const orx = mw * (0.75 + 0.55 * mo), ory = R * 0.17 * mo;
    const oy = mm.y + ory * 0.6;
    ellipsePath(ctx, mm.x, oy, orx, ory);
    fillStroke(ctx, '#4a2a2c', lw * 0.85);
    if (mo > 0.3) {
      ctx.save();
      ellipsePath(ctx, mm.x, oy, orx, ory); ctx.clip();
      ellipsePath(ctx, mm.x, oy + ory * 0.75, orx * 0.6, ory * 0.6);
      fillStroke(ctx, '#d98a8a', 0);
      ctx.restore();
    }
  } else {
    // 舌头（先画，再画嘴线压住）
    if (s.tongue > 0.05) {
      const tl = s.tongue;
      blobPath(ctx, mm.x, mm.y + mw * 0.45 * tl + mw * 0.1, mw * 0.36, mw * 0.5 * tl + 0.01, { seed: v.seed + 20, amp: 0.02 });
      fillStroke(ctx, '#d98a8a', lw * 0.65);
      ctx.beginPath(); ctx.moveTo(mm.x, mm.y + mw * 0.2); ctx.lineTo(mm.x, mm.y + mw * 0.75 * tl);
      ctx.lineWidth = lw * 0.5; ctx.strokeStyle = withAlpha(INK, 0.4); ctx.stroke();
      ctx.lineWidth = lw * 0.9; ctx.strokeStyle = INK;
    }
    const lift = s.smile * mw * 0.5;
    ctx.beginPath();
    if (spec.mouth.type === 'wide') {
      const w = R * 0.42 * mm.sx;
      ctx.moveTo(mm.x - w, mm.y - lift * 0.6);
      ctx.quadraticCurveTo(mm.x, mm.y + w * 0.35 + lift * 0.6, mm.x + w, mm.y - lift * 0.6);
    } else {
      ctx.moveTo(mm.x, mm.y);
      ctx.quadraticCurveTo(mm.x - mw * 0.5, mm.y + mw * 0.55, mm.x - mw, mm.y - lift);
      ctx.moveTo(mm.x, mm.y);
      ctx.quadraticCurveTo(mm.x + mw * 0.5, mm.y + mw * 0.55, mm.x + mw, mm.y - lift);
    }
    ctx.stroke();
    // 门牙
    if (v.extras.teeth && s.tongue < 0.05) {
      const tw = mw * 0.22, th = mw * 0.3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.rect(mm.x + (side < 0 ? -tw : 0), mm.y + mw * 0.12, tw, th);
        fillStroke(ctx, '#fbf8f1', lw * 0.55);
      }
    }
  }

  // 胡须
  if (spec.whiskers) {
    ctx.lineWidth = lw * 0.55; ctx.strokeStyle = withAlpha(INK, 0.75);
    for (const side of [-1, 1]) {
      const b = map(side * 0.36, nz.y + 0.12);
      const len = R * 0.42 * clamp(b.sx, 0.35, 1.1);
      for (const k of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.moveTo(b.x + side * R * 0.05, b.y + k * R * 0.045);
        ctx.quadraticCurveTo(b.x + side * len * 0.55, b.y + k * R * 0.07, b.x + side * len, b.y + k * R * 0.11 - R * 0.02);
        ctx.stroke();
      }
    }
  }

  // 腮红
  const blush = clamp(s.blush, 0, 1);
  if (blush > 0.02) {
    ctx.fillStyle = `rgba(214,110,110,${blush * 0.42})`;
    for (const side of [-1, 1]) {
      const m = map(side * 0.55, 0.3);
      ellipsePath(ctx, m.x, m.y, R * 0.17 * m.sx, R * 0.09);
      ctx.fill();
    }
  }
  // 雀斑
  if (v.freckles.length) {
    ctx.fillStyle = withAlpha(INK, 0.42);
    for (const f of v.freckles) {
      const m = map(f.nx, f.ny);
      ctx.beginPath(); ctx.arc(m.x, m.y, lw * 0.42, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 头饰
  if (v.accessory === 'bow' || v.accessory === 'flower') {
    const side = v.accSide;
    const ap = spec.accPos || { x: 0.58, y: -0.72 };
    const m = map(side * ap.x, ap.y);
    const bs = R * 0.14;
    if (v.accessory === 'bow') {
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.quadraticCurveTo(m.x + k * bs * 1.1, m.y - bs * 1.0, m.x + k * bs * 1.25, m.y - bs * 0.2);
        ctx.quadraticCurveTo(m.x + k * bs * 1.1, m.y + bs * 0.6, m.x, m.y);
        ctx.closePath();
        fillStroke(ctx, v.accColor, lw * 0.75);
      }
      ellipsePath(ctx, m.x, m.y, bs * 0.32, bs * 0.32);
      fillStroke(ctx, shadeHex(v.accColor, -0.2), lw * 0.7);
    } else {
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + v.seed;
        ellipsePath(ctx, m.x + Math.cos(ang) * bs * 0.62, m.y + Math.sin(ang) * bs * 0.62, bs * 0.46, bs * 0.46);
        fillStroke(ctx, v.accColor, lw * 0.65);
      }
      ellipsePath(ctx, m.x, m.y, bs * 0.34, bs * 0.34);
      fillStroke(ctx, '#e6c65a', lw * 0.6);
    }
  }
}

// ---------- 整只小动物 ----------

export function drawAnimal(ctx, a, R) {
  const { spec, v, s } = a;
  if (s.appear <= 0.002) return;
  const lw = R * 0.048;
  const rx = R * v.headW, ry = R * v.headH;
  const yawA = s.yaw * MAX_YAW, pitchA = s.pitch * MAX_PITCH;
  const cY = Math.cos(yawA), sY = Math.sin(yawA), cP = Math.cos(pitchA), sP = Math.sin(pitchA);

  // 球面映射：把名义坐标 (nx, ny) 当作单位球正面上的一点，先绕竖轴转 yaw、再绕横轴转 pitch，
  // 然后正交投影。旋转后的单位向量投影永远落在圆盘内，所以耳朵等边缘部件不会飞出脑袋。
  // sink<1 时把点往球心收一点（用于耳根，让它埋进头里）。
  const map = (nx, ny, sink = 1) => {
    nx *= sink; ny *= sink;
    let r2 = nx * nx + ny * ny;
    if (r2 > 1) { const k = 1 / Math.sqrt(r2); nx *= k; ny *= k; r2 = 1; }
    const nz = Math.sqrt(1 - r2);
    const x1 = nx * cY + nz * sY, z1 = -nx * sY + nz * cY;      // yaw：绕 Y 轴
    const y2 = ny * cP + z1 * sP, z2 = -ny * sP + z1 * cP;      // pitch：绕 X 轴，正值=低头
    const depth = clamp(z2 / Math.max(nz, 0.25), 0.25, 1.4);   // 朝向观众的程度 → 透视压缩
    return { x: rx * x1, y: ry * y2, z: z2, sx: depth, sy: depth };
  };

  // 轮廓映射：耳朵、鹿角、羊毛这类"长在头顶轮廓上"的部件。若按球面旋转，近侧的会滚到脑后看不见，
  // 所以改用经典 2D 转头视差：沿轮廓向面部相反方向轻微滑动，并始终贴在轮廓上（半径 r）。
  const rim = (nx, ny, o = {}) => {
    const { slide = 0.2, r = 0.94, pitchShift = 0.06 } = o;
    const phi0 = Math.atan2(nx, -ny);           // 从头顶量起的角度，右侧为正
    const phi = phi0 - s.yaw * slide;
    let x = r * Math.sin(phi), y = -r * Math.cos(phi) + s.pitch * pitchShift;
    const d = Math.hypot(x, y);
    if (d > 0.97) { x *= 0.97 / d; y *= 0.97 / d; }
    return { x: rx * x, y: ry * y, dphi: phi - phi0 };
  };

  ctx.save();
  ctx.translate(a.cx, a.cy + s.bob * R);
  ctx.scale(s.appear * s.sx, s.appear * s.sy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  drawBody(ctx, rx, ry, v, lw, spec);

  // 头部（绕颈部转动）
  ctx.save();
  ctx.translate(0, ry * 0.9); ctx.rotate(s.roll); ctx.translate(0, -ry * 0.9);
  ctx.translate(s.yaw * rx * 0.07, s.pitch * ry * 0.06);

  if (v.ear) drawEars(ctx, a, rim, R, lw);
  if (spec.extra === 'antlers' && v.extras.antlers) drawAntlers(ctx, rim, R, lw);

  const headPath = () => blobPath(ctx, 0, 0, rx, ry, { seed: v.seed, amp: 0.02, cheek: v.cheek, n: 44 });
  headPath();
  fillStroke(ctx, v.color, lw);

  ctx.save();
  headPath(); ctx.clip();
  // 右下方的一弯阴影
  ctx.fillStyle = 'rgba(60,40,30,0.075)';
  ctx.fillRect(-rx * 1.2, -ry * 1.2, rx * 2.4, ry * 2.4);
  ellipsePath(ctx, -rx * 0.09 + s.yaw * rx * 0.1, -ry * 0.11, rx * 0.99, ry * 0.99);
  ctx.fillStyle = v.color; ctx.fill();
  drawMarkings(ctx, a, map, R, lw);
  ctx.restore();

  if (spec.extra === 'wool') drawWool(ctx, v, rim, R, lw);
  drawFace(ctx, a, map, R, lw);

  ctx.restore();
  ctx.restore();
}

// ---------- 名字 ----------

export function drawName(ctx, a, R, alpha) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `italic 500 ${Math.max(11, R * 0.24)}px Lora, Georgia, 'Songti SC', serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = INK;
  ctx.fillText(a.name, a.cx, a.cy + R * a.v.headH * 1.5);
  ctx.restore();
}

// ---------- 粒子 ----------

export function drawParticle(ctx, p, now, R) {
  const age = now - p.born;
  const t = age / p.life;
  if (t >= 1) return;
  const fade = t < 0.15 ? t / 0.15 : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
  const x = p.x + p.vx * age + Math.sin(age * 3 + p.phase) * R * 0.06;
  const y = p.y + p.vy * age;
  const sz = R * 0.17 * p.size * (0.7 + 0.3 * smooth(t * 3));
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (p.type) {
    case 'heart': {
      ctx.rotate(Math.sin(age * 2 + p.phase) * 0.2);
      const s = sz * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.55);
      ctx.bezierCurveTo(-s * 1.1, -s * 0.2, -s * 0.55, -s * 1.05, 0, -s * 0.4);
      ctx.bezierCurveTo(s * 0.55, -s * 1.05, s * 1.1, -s * 0.2, 0, s * 0.55);
      ctx.closePath();
      fillStroke(ctx, '#d97b7b', R * 0.035);
      break;
    }
    case 'note':
      ctx.font = `${sz * 2.1}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.rotate(Math.sin(age * 2.5 + p.phase) * 0.15);
      ctx.fillText(p.glyph || '♪', 0, 0);
      break;
    case 'zzz':
      ctx.font = `italic 600 ${sz * 1.9}px Lora, Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.fillText('z', 0, 0);
      break;
    case 'bang':
      ctx.font = `700 ${sz * 2.4}px Lora, Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.fillText('!', 0, 0);
      break;
    case 'sparkle': {
      ctx.rotate(age * 3);
      const s = sz * 0.55;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? s : s * 0.38;
        const ang = (i / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath();
      fillStroke(ctx, '#e0bd5a', R * 0.025);
      break;
    }
    case 'crumb':
      ctx.beginPath(); ctx.arc(0, 0, sz * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = '#8a6a48'; ctx.fill();
      break;
    case 'puff': {
      const r = sz * (0.4 + t * 1.6);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.lineWidth = R * 0.03; ctx.strokeStyle = withAlpha(INK, 0.5); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
