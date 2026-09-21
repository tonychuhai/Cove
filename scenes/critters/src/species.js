// Ported from GordenSun/little-critters (https://github.com/GordenSun/little-critters).
// 物种定义 + 随机造型生成
// 所有几何量都是相对头部半径 R 的比例；nx/ny 是"头部球面"上的名义坐标 [-1, 1]

const PINK = '#dfa5a0';

export const SPECIES = [
  {
    id: 'pig', cn: '小猪',
    colors: ['#e3a4a1', '#dc9a95', '#e8afab', '#d8918d'],
    light: '#f1cbc7', dark: '#b8706c',
    headW: 1.02, headH: 0.98, cheek: 0.6,
    ear: { type: 'pointy', x: 0.66, y: -0.7, size: 0.95, tilt: 0.62, inner: 'pink' },
    eye: { y: -0.12, spread: 0.36, size: 0.8 },
    nose: { type: 'snout', y: 0.32, size: 1.0 },
    mouth: { y: 0.68, philtrum: false },
    muzzle: null, whiskers: false, marks: [],
  },
  {
    id: 'raccoon', cn: '浣熊',
    colors: ['#9b9b93', '#8e8f87', '#a8a79d'],
    light: '#e9e3d6', dark: '#4b433e',
    headW: 1.04, headH: 0.96, cheek: 0.4,
    ear: { type: 'pointy', x: 0.7, y: -0.7, size: 0.85, tilt: 0.15, inner: 'pink' },
    eye: { y: -0.08, spread: 0.36, size: 0.9 },
    nose: { type: 'bulb', y: 0.3, size: 0.9 },
    mouth: { y: 0.56, philtrum: true },
    muzzle: { y: 0.44, w: 0.5, h: 0.3 }, whiskers: true, marks: ['raccoonMask'],
  },
  {
    id: 'dog', cn: '小狗',
    colors: ['#b47c4c', '#a46c3e', '#c58d5c', '#8f6446', '#d0a37a'],
    light: '#e8d7bd',
    headW: 1.0, headH: 1.0, cheek: 0.45,
    ear: { type: 'floppy', x: 0.86, y: -0.5, size: 1.0, tilt: 0, inner: null, shade: -0.22 },
    eye: { y: -0.1, spread: 0.34, size: 0.9 },
    nose: { type: 'bulb', y: 0.32, size: 1.1 },
    mouth: { y: 0.58, philtrum: true },
    muzzle: { y: 0.46, w: 0.5, h: 0.32 }, whiskers: false, marks: ['dogPatch'],
    extras: (rng) => ({ patchSide: rng.chance(0.6) ? rng.sign() : 0 }),
  },
  {
    id: 'sheep', cn: '绵羊',
    colors: ['#efe5d4', '#ebdfcc', '#eee2cf', '#5b524d'],
    light: '#f7f1e6', dark: '#5a4a45',
    headW: 0.96, headH: 1.02, cheek: 0.3,
    ear: { type: 'sheep', x: 0.9, y: -0.35, size: 0.85, tilt: 0, inner: 'pink' },
    eye: { y: -0.04, spread: 0.36, size: 0.85 },
    nose: { type: 'dot', y: 0.32, size: 0.9, color: '#5a4a45' },
    mouth: { y: 0.56, philtrum: true },
    muzzle: null, whiskers: false, marks: [], extra: 'wool',
    extras: (rng) => ({ woolSize: rng.range(0.9, 1.15), wool: rng.chance(0.85) ? '#f4eee2' : '#e4d7c3' }),
  },
  {
    id: 'fox', cn: '狐狸',
    colors: ['#d47a40', '#c96f36', '#dd8b4e', '#b5602f'],
    light: '#f3eadb', dark: '#4a3a30',
    headW: 1.02, headH: 0.98, cheek: 0.55,
    ear: { type: 'pointy', x: 0.66, y: -0.72, size: 1.15, tilt: 0.1, inner: 'dark' },
    eye: { y: -0.1, spread: 0.35, size: 0.85 },
    nose: { type: 'bulb', y: 0.34, size: 0.85 },
    mouth: { y: 0.6, philtrum: true },
    muzzle: { y: 0.56, w: 0.8, h: 0.46 }, whiskers: true, marks: [],
  },
  {
    id: 'panda', cn: '熊猫',
    colors: ['#f1ece3', '#ece6db'],
    light: '#f8f4ec', dark: '#3a3532',
    headW: 1.06, headH: 0.98, cheek: 0.4,
    ear: { type: 'round', x: 0.72, y: -0.68, size: 1.0, tilt: 0, inner: null, color: '#3a3532' },
    eye: { y: -0.06, spread: 0.36, size: 0.85 },
    nose: { type: 'bulb', y: 0.3, size: 0.85, color: '#3a3532' },
    mouth: { y: 0.55, philtrum: true },
    muzzle: null, whiskers: false, marks: ['pandaPatches'], bodyColor: '#3a3532',
  },
  {
    id: 'rabbit', cn: '兔子',
    colors: ['#e9e1d5', '#dbd1c5', '#c7bcb1', '#b3a79d', '#e8d9c8'],
    light: '#f5efe6',
    headW: 0.92, headH: 1.05, cheek: 0.5,
    ear: { type: 'long', x: 0.42, y: -0.9, size: 1.0, tilt: 0.1, inner: 'pink' },
    eye: { y: -0.08, spread: 0.36, size: 0.85 },
    nose: { type: 'dot', y: 0.3, size: 0.85, color: '#c78b88' },
    mouth: { y: 0.55, philtrum: true },
    muzzle: { y: 0.42, w: 0.42, h: 0.26, subtle: true }, whiskers: true, marks: [],
    extras: (rng) => ({ flop: rng.chance(0.35) ? rng.sign() : 0, teeth: rng.chance(0.5) }),
  },
  {
    id: 'bear', cn: '小熊',
    colors: ['#8d6b50', '#7e5d44', '#a37c5d', '#6f5340', '#b08b6a'],
    light: '#cdab88',
    headW: 1.04, headH: 0.98, cheek: 0.35,
    ear: { type: 'round', x: 0.74, y: -0.66, size: 0.9, tilt: 0, inner: 'light' },
    eye: { y: -0.1, spread: 0.35, size: 0.8 },
    nose: { type: 'bulb', y: 0.3, size: 1.0 },
    mouth: { y: 0.56, philtrum: true },
    muzzle: { y: 0.43, w: 0.45, h: 0.3 }, whiskers: false, marks: [],
  },
  {
    id: 'cat', cn: '猫咪',
    colors: ['#cb9b6a', '#d6b088', '#9c8b7c', '#e3cba8', '#7d7068'],
    light: '#efe3d0',
    headW: 1.06, headH: 0.96, cheek: 0.7,
    ear: { type: 'pointy', x: 0.7, y: -0.72, size: 1.0, tilt: 0.1, inner: 'pink' },
    eye: { y: -0.08, spread: 0.37, size: 0.9 },
    nose: { type: 'dot', y: 0.3, size: 0.85, color: '#c48b88' },
    mouth: { y: 0.52, philtrum: true },
    muzzle: { y: 0.42, w: 0.46, h: 0.26, subtle: true }, whiskers: true, marks: ['catStripes'],
    irisChance: 0.7,
    extras: (rng) => ({ stripes: rng.chance(0.7) }),
  },
  {
    id: 'koala', cn: '考拉',
    colors: ['#9b9e98', '#8e928d', '#a9aca5'],
    light: '#d8d5ce', dark: '#3a3532',
    headW: 1.1, headH: 0.98, cheek: 0.4,
    ear: { type: 'fluffy', x: 0.8, y: -0.55, size: 1.1, tilt: 0, inner: 'light' },
    eye: { y: -0.08, spread: 0.36, size: 0.75 },
    nose: { type: 'tall', y: 0.28, size: 1.15, color: '#3a3532' },
    mouth: { y: 0.64, philtrum: false },
    muzzle: null, whiskers: false, marks: [],
  },
  {
    id: 'otter', cn: '水獭',
    colors: ['#7e5b45', '#6f4e3a', '#906c53'],
    light: '#dcc6a8',
    headW: 1.14, headH: 0.92, cheek: 0.3,
    ear: { type: 'tiny', x: 0.92, y: -0.4, size: 0.8, tilt: 0, inner: 'light' },
    eye: { y: -0.15, spread: 0.42, size: 0.75 },
    nose: { type: 'bulb', y: 0.22, size: 0.9 },
    mouth: { y: 0.48, philtrum: true },
    muzzle: { y: 0.38, w: 0.62, h: 0.38 }, whiskers: true, marks: [],
  },
  {
    id: 'deer', cn: '小鹿',
    colors: ['#ba8b5d', '#aa7c4f', '#c8996a'],
    light: '#e8d6b9',
    headW: 0.96, headH: 1.02, cheek: 0.35,
    ear: { type: 'pointy', x: 0.7, y: -0.62, size: 1.05, tilt: 0.55, inner: 'light' },
    eye: { y: -0.1, spread: 0.36, size: 0.85 },
    nose: { type: 'bulb', y: 0.36, size: 0.9 },
    mouth: { y: 0.62, philtrum: true },
    muzzle: { y: 0.5, w: 0.48, h: 0.34 }, whiskers: false, marks: ['deerSpots'], extra: 'antlers',
    extras: (rng) => ({ spots: rng.chance(0.8), antlers: rng.chance(0.75) }),
  },
  {
    id: 'mouse', cn: '小老鼠',
    colors: ['#a9a39b', '#b9ad9e', '#8f8981', '#cfc4b4'],
    light: '#e6ddd0',
    headW: 0.98, headH: 1.0, cheek: 0.55,
    ear: { type: 'round', x: 0.8, y: -0.55, size: 1.25, tilt: 0, inner: 'pink' },
    eye: { y: -0.08, spread: 0.34, size: 0.8 },
    nose: { type: 'dot', y: 0.34, size: 0.9, color: '#c78b88' },
    mouth: { y: 0.58, philtrum: true },
    muzzle: null, whiskers: true, marks: [],
    extras: (rng) => ({ teeth: rng.chance(0.5) }),
  },
  {
    id: 'frog', cn: '青蛙',
    colors: ['#8fab6c', '#7c9b5d', '#a3b979'],
    light: '#d9dcb9',
    headW: 1.18, headH: 0.86, cheek: 0.5,
    ear: null,
    eye: { y: -0.74, spread: 0.5, size: 1.05 },
    nose: { type: 'dots', y: 0.02, size: 0.7 },
    mouth: { y: 0.4, type: 'wide', philtrum: false },
    muzzle: null, whiskers: false, marks: ['frogBelly'], extra: 'eyeBumps',
    irisChance: 0.6, accPos: { x: 0.9, y: -0.25 },
  },
  {
    id: 'hamster', cn: '仓鼠',
    colors: ['#d9b98c', '#e4caa2', '#c5a178', '#b98f68'],
    light: '#f3ebdc',
    headW: 1.12, headH: 0.96, cheek: 0.9,
    ear: { type: 'round', x: 0.7, y: -0.7, size: 0.7, tilt: 0, inner: 'pink' },
    eye: { y: -0.1, spread: 0.36, size: 0.8 },
    nose: { type: 'dot', y: 0.3, size: 0.8, color: '#c78b88' },
    mouth: { y: 0.52, philtrum: true },
    muzzle: { y: 0.45, w: 0.5, h: 0.3 }, whiskers: true, marks: ['hamsterBlaze'],
    extras: (rng) => ({ blaze: rng.chance(0.6), teeth: rng.chance(0.6) }),
  },
];

export const NAMES = [
  '团团', '豆豆', '糯米', '花卷', '布丁', '麻薯', '芋圆', '汤圆', '奶糖', '果冻',
  '泡芙', '可可', '曲奇', '抹茶', '桃子', '栗子', '核桃', '小满', '阿福', '铃铛',
  '毛球', '咕咕', '呦呦', '皮皮', '乐乐', '多多', '米粒', '芝麻', '小七', '阿宝',
  '花生', '年糕', '蛋挞', '松饼', '丸子', '奶昔', '豆沙', '椰果', '蜜豆', '小暑',
  '阿呆', '二毛', '球球', '咩咩', '嘟嘟', '噜噜', '元宝', '福气', '立夏', '白露',
  '板栗', '山楂', '柚子', '橘子', '柠檬', '青梅', '樱桃', '香菇', '土豆', '地瓜',
  '玉米', '毛豆', '芒果', '小满', '云朵', '棉花', '月饼', '桂花', '小鱼', '阿蛮',
];

const IRIS = ['#5a3e2b', '#3f4a3a', '#4a4a5a', '#6b4a2f', '#556b3f'];
const ACC_COLORS = ['#c9645c', '#7d97a8', '#c9a24a', '#8a9e7a', '#b07aa0', '#5e7d9a', '#d98e5f'];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}
// 轻微扰动颜色，让同物种之间也有细微差别
function jitter(hex, rng, amt) {
  const c = hexToRgb(hex);
  const k = rng.range(-amt, amt) * 255;
  const warm = rng.range(-amt, amt) * 120;
  return rgbToHex([c[0] + k + warm, c[1] + k, c[2] + k - warm * 0.6]);
}
export function shadeHex(hex, amt) {
  const c = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  return rgbToHex(c.map((v) => v + (t - v) * k));
}

export function makeVariant(spec, rng) {
  const color = jitter(rng.pick(spec.colors), rng, 0.035);
  const isDark = hexToRgb(color).reduce((a, b) => a + b, 0) < 330;
  const v = {
    color,
    dark: spec.dark || shadeHex(color, -0.35),
    light: spec.light || shadeHex(color, 0.45),
    headW: spec.headW * rng.range(0.94, 1.07),
    headH: spec.headH * rng.range(0.94, 1.07),
    cheek: spec.cheek * rng.range(0.6, 1.4),
    bodyW: rng.range(0.9, 1.1),
    ear: spec.ear
      ? {
          ...spec.ear,
          size: spec.ear.size * rng.range(0.85, 1.18),
          x: spec.ear.x * rng.range(0.93, 1.07),
          tilt: spec.ear.tilt + rng.range(-0.12, 0.12),
        }
      : null,
    eye: {
      y: spec.eye.y + rng.range(-0.04, 0.04),
      spread: spec.eye.spread * rng.range(0.9, 1.1),
      size: spec.eye.size * rng.range(0.85, 1.2),
    },
    iris: rng.chance(spec.irisChance ?? 0.35) ? rng.pick(IRIS) : null,
    noseSize: rng.range(0.85, 1.2),
    freckles: [],
    speckles: [],
    baseBlush: rng.chance(0.45) ? rng.range(0.25, 0.55) : 0,
    baseLid: rng.chance(0.22) ? rng.range(0.12, 0.3) : 0,
    baseSmile: rng.range(-0.05, 0.65),
    accessory: rng.weighted([
      { w: 5, v: null }, { w: 2, v: 'scarf' }, { w: 1.3, v: 'bow' }, { w: 1, v: 'flower' }, { w: 1, v: 'collar' },
    ]),
    accColor: rng.pick(ACC_COLORS),
    accSide: rng.sign(),
    personality: {
      blinkiness: rng.range(0.7, 1.5),
      liveliness: rng.range(0.6, 1.6),
      curiosity: rng.range(0.78, 1.0),
      sleepy: rng.range(0, 1),
      playful: rng.range(0, 1),
      shy: rng.range(0, 1),
    },
    seed: rng.range(0, 1000),
    extras: spec.extras ? spec.extras(rng) : {},
    isDark,
  };
  if (rng.chance(0.55)) {
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      v.freckles.push({ nx: side * rng.range(0.3, 0.62), ny: rng.range(0.15, 0.45) });
    }
  }
  for (let i = 0; i < 9; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const rad = Math.sqrt(rng.next()) * 0.85;
    v.speckles.push({ nx: Math.cos(ang) * rad, ny: Math.sin(ang) * rad });
  }
  // 黑绵羊：脸色深，羊毛浅
  if (spec.id === 'sheep' && isDark) v.extras.wool = '#f2ecdf';
  return v;
}

// 生成一批：物种尽量分散、名字不重复
export function generateBatch(count, rng) {
  let order = [];
  while (order.length < count) order = order.concat(rng.shuffle(SPECIES));
  const names = rng.shuffle([...new Set(NAMES)]);
  const out = [];
  for (let i = 0; i < count; i++) {
    const spec = order[i];
    out.push({ spec, v: makeVariant(spec, rng), name: names[i % names.length] });
  }
  return out;
}
