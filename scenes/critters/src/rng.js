// Ported from GordenSun/little-critters (https://github.com/GordenSun/little-critters).
// 可复现的随机数（mulberry32）
export class Rng {
  constructor(seed = Math.floor(Math.random() * 2 ** 31)) {
    this.a = (seed >>> 0) || 1;
  }
  next() {
    let t = (this.a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // items: [{ w, v }]
  weighted(items) {
    let sum = 0;
    for (const it of items) sum += it.w;
    let r = this.next() * sum;
    for (const it of items) {
      r -= it.w;
      if (r <= 0) return it.v;
    }
    return items[items.length - 1].v;
  }
}
