import * as THREE from "three";

// Small sprite bursts: hearts when the rabbit is stroked, z's when it sleeps, crumbs when
// it eats, sparkles when it plays. One pool of sprites, each with a kind and a life.

function paint(size, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d"), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const TEXTURES = {
  heart: () =>
    paint(64, (ctx, s) => {
      ctx.fillStyle = "#ff6f9a";
      ctx.beginPath();
      const x = s / 2, y = s * 0.36, r = s * 0.2;
      ctx.arc(x - r, y, r, 0, Math.PI * 2);
      ctx.arc(x + r, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - r * 2, y + r * 0.35);
      ctx.lineTo(x, s * 0.9);
      ctx.lineTo(x + r * 2, y + r * 0.35);
      ctx.closePath();
      ctx.fill();
    }),
  zzz: () =>
    paint(64, (ctx, s) => {
      ctx.fillStyle = "#dfe6ff";
      ctx.font = `bold ${s * 0.7}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("z", s / 2, s / 2 + 2);
    }),
  crumb: () =>
    paint(32, (ctx, s) => {
      ctx.fillStyle = "#d9a15a";
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }),
  glow: () =>
    paint(64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255,244,214,1)");
      g.addColorStop(0.35, "rgba(255,226,170,0.8)");
      g.addColorStop(1, "rgba(255,210,140,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }),
  straw: () =>
    paint(32, (ctx, s) => {
      ctx.strokeStyle = "#d9b062";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s * 0.2, s * 0.8);
      ctx.lineTo(s * 0.8, s * 0.2);
      ctx.stroke();
    }),
  sparkle: () =>
    paint(64, (ctx, s) => {
      ctx.fillStyle = "#ffe89a";
      ctx.beginPath();
      const c = s / 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? s * 0.12 : s * 0.46;
        ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }),
};

export function createEffects(scene, capacity = 96) {
  const textures = Object.fromEntries(Object.entries(TEXTURES).map(([k, make]) => [k, make()]));
  const pool = [];
  for (let i = 0; i < capacity; i++) {
    const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    scene.add(sprite);
    pool.push({ sprite, life: 0, age: 0, velocity: new THREE.Vector3(), size: 0.2, kind: "" });
  }
  let cursor = 0;

  function burst(kind, at, count = 1, spread = 0.2) {
    for (let i = 0; i < count; i++) {
      const slot = pool[cursor];
      cursor = (cursor + 1) % capacity;
      slot.kind = kind;
      slot.age = 0;
      slot.life = kind === "zzz" ? 2.4 : kind === "crumb" || kind === "straw" ? 0.9 : kind === "glow" ? 1.1 : 1.4;
      slot.size = kind === "crumb" ? 0.06 : kind === "straw" ? 0.1 : kind === "glow" ? 0.11 : kind === "zzz" ? 0.22 : 0.2;
      slot.sprite.material.map = textures[kind];
      slot.sprite.material.blending = kind === "glow" ? THREE.AdditiveBlending : THREE.NormalBlending;
      slot.sprite.material.needsUpdate = true;
      slot.sprite.position.set(
        at.x + (Math.random() - 0.5) * spread,
        at.y + (Math.random() - 0.5) * spread * 0.5,
        at.z + (Math.random() - 0.5) * spread,
      );
      const tossed = kind === "crumb" || kind === "straw";
      slot.velocity.set(
        (Math.random() - 0.5) * (tossed ? 1.4 : kind === "glow" ? 0 : 0.35),
        tossed ? 0.8 + Math.random() * 0.8 : kind === "glow" ? 0.05 : 0.5 + Math.random() * 0.3,
        (Math.random() - 0.5) * (tossed ? 1.0 : kind === "glow" ? 0 : 0.2),
      );
      slot.sprite.material.rotation = kind === "straw" ? Math.random() * Math.PI : 0;
      slot.sprite.visible = true;
    }
  }

  function update(dt) {
    for (const slot of pool) {
      if (!slot.sprite.visible) continue;
      slot.age += dt;
      if (slot.age >= slot.life) {
        slot.sprite.visible = false;
        continue;
      }
      const k = slot.age / slot.life;
      if (slot.kind === "crumb" || slot.kind === "straw") slot.velocity.y -= 4 * dt;
      else if (slot.kind !== "glow") slot.velocity.x += Math.sin(slot.age * 5) * 0.4 * dt;
      slot.sprite.position.addScaledVector(slot.velocity, dt);
      const grow = slot.kind === "zzz" ? 1 + k * 0.8 : slot.kind === "heart" ? 1 + k * 0.4 : slot.kind === "glow" ? 1 - k * 0.6 : 1;
      slot.sprite.scale.setScalar(slot.size * grow);
      slot.sprite.material.opacity = slot.kind === "glow" ? 0.9 * (1 - k) : k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    }
  }

  return {
    burst,
    update,
    dispose() {
      for (const slot of pool) {
        scene.remove(slot.sprite);
        slot.sprite.material.dispose();
      }
      for (const texture of Object.values(textures)) texture.dispose();
    },
  };
}
