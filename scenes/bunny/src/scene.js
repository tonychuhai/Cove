import * as THREE from "three";

// A bright room in the morning: a pale wall with the window's light falling across it,
// a glossy floor the rabbit lives on, a rug with a crochet carrot, a pot plant at the
// edge of the frame and a mug and a few books against the wall. Dust turns in the sun.
//
// The wall and the plant are painted onto canvases once and shown as planes; everything
// the light has to touch, the floor, the rug and the rabbit, is real geometry so the sun
// can throw shadows across it.

export const WALL_Z = -6;
export const FLOOR_NEAR_Z = 5.5;
const WALL_SIZE = [30, 12];
const WALL_CENTER_Y = 4.6;

const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

function canvasTexture(width, height, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Wall canvas pixel for a world (x, y) on the wall plane.
function wallPx(width, height) {
  const [w, h] = WALL_SIZE;
  return (x, y) => [((x + w / 2) / w) * width, (1 - (y - (WALL_CENTER_Y - h / 2)) / h) * height];
}

// A patch of sunlight: a soft-edged parallelogram, brightest in the middle.
function sunPatch(ctx, points, alpha) {
  ctx.save();
  ctx.filter = "blur(18px)";
  ctx.fillStyle = `rgba(255, 238, 205, ${alpha})`;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintWall(ctx, width, height) {
  const random = seeded(2024);
  const px = wallPx(width, height);
  const [, floorRow] = px(0, 0);
  // Pale blue, lighter and warmer toward the floor where the light bounces up. The
  // camera sees about seven units either side of centre on this wall.
  const wall = ctx.createLinearGradient(0, 0, 0, floorRow);
  wall.addColorStop(0, "#9fb9e4");
  wall.addColorStop(0.5, "#c3d4ee");
  wall.addColorStop(1, "#e4ebf5");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, width, height);

  // Light from a tall window off to the right, thrown across the wall in panes.
  for (const [x0, x1, skew, alpha] of [[1.6, 3.6, 1.6, 0.7], [4.3, 6.3, 1.6, 0.65], [7.0, 9.0, 1.4, 0.5]]) {
    const [ax, ay] = px(x0 + skew, 9.2);
    const [bx, by] = px(x1 + skew, 9.2);
    const [cx, cy] = px(x1, 0.3);
    const [dx, dy] = px(x0, 0.3);
    sunPatch(ctx, [[ax, ay], [bx, by], [cx, cy], [dx, dy]], alpha);
  }
  // Leaf shadows dancing in the light: a few dark blots, very soft.
  ctx.save();
  ctx.filter = "blur(10px)";
  for (let i = 0; i < 12; i++) {
    const [x, y] = px(2 + random() * 7, 1 + random() * 7);
    ctx.fillStyle = `rgba(90, 110, 140, ${0.06 + random() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 40 + random() * 60, 22 + random() * 30, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Skirting board.
  const [, skirtTop] = px(0, 0.28);
  ctx.fillStyle = "#f3f1ec";
  ctx.fillRect(0, skirtTop, width, floorRow - skirtTop);
  ctx.fillStyle = "rgba(140, 150, 170, 0.35)";
  ctx.fillRect(0, skirtTop, width, 3);

  // A stack of books against the wall on the left, and a mug on its side beside them,
  // the way they were in the picture that started this.
  const scale = width / WALL_SIZE[0];
  const books = [
    ["Happier Me", "#f6f1e6", "#e0b23c"],
    ["More Carrots", "#efe9dd", "#e4713a"],
    ["A Cuter Life", "#f7f3ea", "#c96a7e"],
  ];
  let [bx, by] = px(-6.2, 0.28);
  const bookW = 2.4 * scale, bookH = 0.36 * scale;
  books.forEach(([title, paper, tab], i) => {
    const jitter = (random() - 0.5) * 0.2 * scale;
    const x = bx + jitter, y = by - bookH * (i + 1);
    ctx.fillStyle = paper;
    ctx.fillRect(x, y, bookW, bookH);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(x, y + bookH - 4, bookW, 4);
    ctx.fillStyle = tab;
    ctx.fillRect(x + bookW - 0.28 * scale, y + bookH * 0.3, 0.14 * scale, bookH * 0.4);
    ctx.fillStyle = "#4a4238";
    ctx.font = `500 ${bookH * 0.42}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(title, x + 0.22 * scale, y + bookH * 0.52);
  });
  // The mug, lying down, mouth toward us, a rabbit face on its side.
  const [mx, my] = px(-6.5, 0.28);
  const mugW = 1.7 * scale, mugH = 1.25 * scale;
  ctx.fillStyle = "#f8f6f1";
  ctx.beginPath();
  ctx.roundRect(mx - mugW, my - mugH, mugW, mugH, 0.12 * scale);
  ctx.fill();
  ctx.fillStyle = "#e9e5dc";
  ctx.beginPath();
  ctx.ellipse(mx, my - mugH / 2, 0.22 * scale, mugH / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5a5148";
  ctx.lineWidth = 3;
  const fx = mx - mugW * 0.55, fy = my - mugH * 0.5;
  ctx.beginPath();
  ctx.ellipse(fx, fy, 0.22 * scale, 0.2 * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(fx + s * 0.1 * scale, fy - 0.3 * scale, 0.07 * scale, 0.17 * scale, s * 0.15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#5a5148";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(fx + s * 0.08 * scale, fy - 0.03 * scale, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // A soft contact shadow along the base of the wall.
  const shade = ctx.createLinearGradient(0, floorRow - 26, 0, floorRow);
  shade.addColorStop(0, "rgba(90, 100, 130, 0)");
  shade.addColorStop(1, "rgba(90, 100, 130, 0.18)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, floorRow - 26, width, 26);
}

// The pot plant at the right edge of the frame, on a transparent plane in front of the
// scene: a terracotta pot and a spray of heart-shaped leaves on arching stems.
function paintPlant(ctx, width, height, halfW, halfH) {
  const random = seeded(99);
  const toPx = (x, y) => [((x + halfW) / (2 * halfW)) * width, (1 - (y + halfH) / (2 * halfH)) * height];
  const scale = width / (2 * halfW);
  // Pot, its left third inside the frame.
  const potX = halfW + 0.45, potY = -halfH + 0.55;
  const [px, py] = toPx(potX, potY);
  ctx.fillStyle = "#c97a55";
  ctx.beginPath();
  ctx.moveTo(px - 1.15 * scale, py - 1.35 * scale);
  ctx.lineTo(px + 1.15 * scale, py - 1.35 * scale);
  ctx.lineTo(px + 0.95 * scale, py);
  ctx.lineTo(px - 0.95 * scale, py);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d98a62";
  ctx.fillRect(px - 1.2 * scale, py - 1.55 * scale, 2.4 * scale, 0.26 * scale);
  ctx.fillStyle = "rgba(60,30,20,0.25)";
  ctx.fillRect(px - 1.15 * scale, py - 1.35 * scale, 0.35 * scale, 1.35 * scale);
  // Stems and leaves.
  const leaf = (x, y, size, angle, tone) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.55);
    ctx.bezierCurveTo(-size * 0.75, size * 0.1, -size * 0.7, -size * 0.7, 0, -size * 0.45);
    ctx.bezierCurveTo(size * 0.7, -size * 0.7, size * 0.75, size * 0.1, 0, size * 0.55);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.5);
    ctx.lineTo(0, -size * 0.35);
    ctx.stroke();
    ctx.restore();
  };
  ctx.strokeStyle = "#5f8a4e";
  ctx.lineCap = "round";
  for (let s = 0; s < 7; s++) {
    const [sx, sy] = toPx(potX - 0.3 + random() * 0.6, potY - 1.3);
    const reach = 1.6 + random() * 2.2;
    const angle = -Math.PI / 2 - 0.25 - random() * 0.9;
    const ex = sx + Math.cos(angle) * reach * scale;
    const ey = sy + Math.sin(angle) * reach * scale;
    const cx = sx + Math.cos(angle - 0.5) * reach * scale * 0.6;
    const cy = sy + Math.sin(angle - 0.5) * reach * scale * 0.6;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
    const leaves = 3 + Math.floor(random() * 3);
    for (let i = 0; i < leaves; i++) {
      const t = 0.3 + (i / leaves) * 0.75;
      const lx = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * ex;
      const ly = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ey;
      const tone = `hsl(${115 + random() * 25}, ${40 + random() * 20}%, ${30 + random() * 22}%)`;
      leaf(lx, ly, (0.5 + random() * 0.45) * scale, random() * Math.PI * 2, tone);
    }
  }
}

function softDisc(size, rgb, power = 1.5) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    g.addColorStop(t, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.pow(1 - t, power).toFixed(3)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createScenery(scene, { camera, aspect, shadows = true }) {
  const random = seeded(31337);
  const disposables = [];

  // Wall.
  const wallTexture = canvasTexture(3000, 1200, paintWall);
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(...WALL_SIZE),
    // Painted colours are shown as painted, not through the tone curve.
    new THREE.MeshBasicMaterial({ map: wallTexture, toneMapped: false }),
  );
  wall.position.set(0, WALL_CENTER_Y, WALL_Z);
  wall.name = "Painted wall";
  scene.add(wall);
  disposables.push(wall.geometry, wall.material, wallTexture);

  // Floor: pale boards with a satin finish, and the window's light lying across it.
  const floorTexture = canvasTexture(2048, 1024, (ctx, w, h) => {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, "#efe4d3");
    base.addColorStop(1, "#fbf6ee");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // Board joints.
    ctx.strokeStyle = "rgba(150, 130, 110, 0.18)";
    ctx.lineWidth = 3;
    for (let x = 0; x <= w; x += w / 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // Sun across the boards, continuing the wall's panes down onto the floor. The
    // texture runs x from -15 to 15 across u, the far edge of the floor at v = 1.
    const u = (x) => ((x + 15) / 30) * w;
    for (const [x0, x1, alpha] of [[1.6, 3.6, 0.65], [4.3, 6.3, 0.6], [7.0, 9.0, 0.45]]) {
      sunPatch(ctx, [[u(x0 + 2.2), 0], [u(x1 + 2.2), 0], [u(x1 - 1.4), h], [u(x0 - 1.4), h]], alpha);
    }
  });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL_SIZE[0], FLOOR_NEAR_Z - WALL_Z),
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.42, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (FLOOR_NEAR_Z + WALL_Z) / 2);
  floor.receiveShadow = shadows;
  floor.name = "Floor";
  scene.add(floor);
  disposables.push(floor.geometry, floor.material, floorTexture);

  // Rug, and a crochet carrot lying on it.
  const rug = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.35, 0.04, 40),
    new THREE.MeshStandardMaterial({ color: 0xf2e9dc, roughness: 0.95 }),
  );
  rug.scale.z = 0.62;
  rug.position.set(2.9, 0.02, 1.3);
  rug.receiveShadow = shadows;
  rug.name = "Rug";
  scene.add(rug);
  disposables.push(rug.geometry, rug.material);
  const carrot = new THREE.Group();
  const carrotBody = new THREE.Mesh(
    new THREE.ConeGeometry(0.19, 0.7, 14),
    new THREE.MeshStandardMaterial({ color: 0xf0813a, roughness: 0.9 }),
  );
  carrotBody.rotation.z = Math.PI / 2 + 0.2;
  carrotBody.castShadow = shadows;
  carrot.add(carrotBody);
  const leafGeometry = new THREE.SphereGeometry(0.09, 10, 8);
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x5fa35a, roughness: 0.9 });
  for (const [x, y, z] of [[0.38, 0.05, 0], [0.42, 0.13, 0.1], [0.44, 0.02, -0.1]]) {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.scale.set(1.6, 0.6, 0.8);
    leaf.position.set(x, y, z);
    carrot.add(leaf);
  }
  carrot.position.set(3.35, 0.2, 1.35);
  carrot.rotation.y = -0.4;
  carrot.name = "Crochet carrot";
  scene.add(carrot);
  disposables.push(carrotBody.geometry, carrotBody.material, leafGeometry, leafMaterial);

  // The plant, painted on a plane just in front of the play area.
  const PLANT_Z = 1.8;
  const distance = camera.position.z - PLANT_Z;
  const halfH = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const halfW = halfH * aspect;
  const plantTexture = canvasTexture(2048, Math.round(2048 / aspect), (ctx, w, h) => paintPlant(ctx, w, h, halfW, halfH));
  const plant = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfH * 2),
    new THREE.MeshBasicMaterial({ map: plantTexture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  const lookDir = new THREE.Vector3();
  camera.getWorldDirection(lookDir);
  plant.position.copy(camera.position).addScaledVector(lookDir, distance / Math.abs(lookDir.z));
  plant.position.z = PLANT_Z;
  plant.quaternion.copy(camera.quaternion);
  plant.renderOrder = 5;
  plant.name = "Pot plant";
  scene.add(plant);
  disposables.push(plant.geometry, plant.material, plantTexture);

  // Dust in the sunlight.
  const MOTES = 90;
  const motePositions = new Float32Array(MOTES * 3);
  const moteState = [];
  for (let i = 0; i < MOTES; i++) {
    const p = { x: 1.5 + random() * 6, y: 0.2 + random() * 4.5, z: -5 + random() * 8, phase: random() * Math.PI * 2, rate: 0.2 + random() * 0.4 };
    moteState.push(p);
    motePositions.set([p.x, p.y, p.z], i * 3);
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
  const moteTexture = softDisc(32, [255, 245, 220], 2);
  const moteMaterial = new THREE.PointsMaterial({
    map: moteTexture, size: 0.05, transparent: true, opacity: 0.7, depthWrite: false, sizeAttenuation: true,
  });
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  motes.frustumCulled = false;
  scene.add(motes);
  disposables.push(moteGeometry, moteMaterial, moteTexture);

  // Light: the sky through the window, warm sun from the upper right that throws the
  // shadows, and a soft bounce from the floor.
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0xf1e6d6, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(6, 7, 2);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -4, near: 1, far: 24 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight(0xcfd9ee, 0.5);
  bounce.position.set(-3, 3, 6);
  scene.add(bounce);

  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    for (let i = 0; i < MOTES; i++) {
      const p = moteState[i];
      p.y += Math.sin(elapsed * p.rate + p.phase) * 0.04 * dt + 0.015 * dt;
      p.x += Math.cos(elapsed * p.rate * 0.7 + p.phase) * 0.05 * dt;
      if (p.y > 4.8) p.y = 0.2;
      motePositions[i * 3] = p.x;
      motePositions[i * 3 + 1] = p.y;
    }
    moteGeometry.attributes.position.needsUpdate = true;
  }

  return {
    update,
    sun,
    dispose() {
      for (const item of disposables) item.dispose?.();
    },
  };
}
