import * as THREE from "three";

// The pointer is a little broom. It sweeps about in a plane just in front of the rabbit,
// handle trailing the way it moves, and leaves a thread of light behind it when waved,
// which is what the rabbit cannot resist. The pointer's ray is intersected with the
// broom's plane, so the head of the broom sits exactly under the cursor.

export const BROOM_Z = 0.6;
const BOUNDS = { minX: -6.5, maxX: 6.5, minY: 0.16, maxY: 5.2 };
// A brisk spring so the broom feels held rather than dragged, with a little overshoot.
const SPRING = { stiffness: 160, damping: 18 };
// How the rabbit's bite shows on the broom: a tug toward it, then the spring recovers.
const TUG = 3.2;

const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function mergeGeometry(parts) {
  const expanded = parts.map((part) => part.index ? part.toNonIndexed() : part);
  const result = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"].filter((key) => expanded.every((part) => part.attributes[key]))) {
    const arrays = expanded.map((part) => part.attributes[name].array);
    const combined = new Float32Array(arrays.reduce((length, array) => length + array.length, 0));
    let offset = 0;
    for (const array of arrays) { combined.set(array, offset); offset += array.length; }
    result.setAttribute(name, new THREE.BufferAttribute(combined, expanded[0].attributes[name].itemSize));
  }
  for (const part of new Set([...parts, ...expanded])) part.dispose();
  result.computeBoundingSphere();
  return result;
}

function woodTexture(random) {
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#c09a66"; ctx.fillRect(0, 0, 128, 1024);
  for (let i = 0; i < 160; i++) {
    const x = random() * 128, y = random() * 1024;
    ctx.strokeStyle = `rgba(83,51,22,${0.025 + random() * 0.085})`;
    ctx.lineWidth = 0.3 + random() * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 2, y + 80, x - 2, y + 180, x + 0.8, y + 300);
    ctx.stroke();
  }
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 4;
  return result;
}

// Every visible bristle is a bent tapered tube. Their radial distribution fills the
// bundle evenly, while seeded length and colour differences keep the edge irregular.
function strawBundle(random) {
  const positions = [], normals = [], colors = [], indices = [];
  const count = 180, segments = 9, sides = 5;
  const tangent = new THREE.Vector3(), side = new THREE.Vector3(), cross = new THREE.Vector3();
  const palette = [0xc49b55, 0xd7ad64, 0xe0bd7d, 0xcaa76b, 0xb68a48, 0xd0ac71];
  for (let strand = 0; strand < count; strand++) {
    const angle = strand * 2.3999632297;
    const spread = Math.sqrt((strand + 0.5) / count);
    const end = new THREE.Vector3(Math.cos(angle) * spread * 0.215, -0.243 + random() * 0.052, Math.sin(angle) * spread * 0.13);
    const start = new THREE.Vector3(end.x * 0.22, 0.272 + random() * 0.023, end.z * 0.31);
    const bend = new THREE.Vector3(end.x * (0.41 + random() * 0.1), 0.055, end.z * 0.52);
    const curve = new THREE.QuadraticBezierCurve3(start, bend, end);
    const radius = 0.005 + random() * 0.0026;
    const color = new THREE.Color(palette[Math.floor(random() * palette.length)]);
    const offset = positions.length / 3;
    for (let ring = 0; ring <= segments; ring++) {
      const t = ring / segments;
      const center = curve.getPoint(t);
      center.x += Math.sin(t * 8 + angle) * 0.0015 * t;
      tangent.copy(curve.getTangent(t));
      side.set(tangent.y, -tangent.x, 0).normalize();
      cross.crossVectors(tangent, side).normalize();
      const r = radius * (1 - t * t * 0.23);
      for (let face = 0; face < sides; face++) {
        const a = face / sides * Math.PI * 2;
        const normal = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(cross, Math.sin(a));
        positions.push(center.x + normal.x * r, center.y + normal.y * r, center.z + normal.z * r);
        normals.push(normal.x, normal.y, normal.z);
        const shade = 0.91 + t * 0.1;
        colors.push(color.r * shade, color.g * shade, color.b * shade);
        if (ring < segments) {
          const current = offset + ring * sides + face;
          const next = offset + ring * sides + (face + 1) % sides;
          indices.push(current, next, current + sides, next, next + sides, current + sides);
        }
      }
    }
    // The tiny cut ends catch a little light instead of revealing hollow tubes.
    for (const ring of [0, segments]) {
      const center = curve.getPoint(ring / segments);
      const index = positions.length / 3;
      const normal = curve.getTangent(ring / segments).multiplyScalar(ring ? 1 : -1);
      positions.push(center.x, center.y, center.z);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(color.r, color.g, color.b);
      for (let face = 0; face < sides; face++) {
        const p = offset + ring * sides + face;
        const q = offset + ring * sides + (face + 1) % sides;
        if (ring) indices.push(index, q, p); else indices.push(index, p, q);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function fabricStrip(points, width, tail = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const positions = [], uvs = [], indices = [];
  const rows = 28, columns = 4;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const center = curve.getPoint(t), tangent = curve.getTangent(t);
    const cross = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    for (let column = 0; column <= columns; column++) {
      const u = column / columns * 2 - 1;
      const point = center.clone().addScaledVector(cross, u * width * 0.5 * (0.85 + Math.sin(Math.PI * t) * 0.15));
      point.z += (1 - u * u) * 0.006;
      if (tail) point.addScaledVector(tangent, -0.016 * (1 - Math.abs(u)) * Math.pow(t, 16));
      positions.push(point.x, point.y, point.z);
      uvs.push(column / columns, t);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  result.setIndex(indices); result.computeVertexNormals();
  return result;
}

export function createBroom(scene, { camera, effects }) {
  const random = seeded(4319);
  const woodMap = woodTexture(random);
  const wood = new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.46, bumpMap: woodMap, bumpScale: 0.0005 });
  const straw = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
  const band = new THREE.MeshStandardMaterial({ color: 0x977747, roughness: 0.93 });
  const ribbon = new THREE.MeshPhysicalMaterial({ color: 0xc98f89, roughness: 0.49, sheen: 0.45, sheenColor: 0xe5b4aa, sheenRoughness: 0.55, side: THREE.DoubleSide });
  const disposables = [woodMap, wood, straw, band, ribbon];
  const geo = (g) => (disposables.push(g), g);

  const group = new THREE.Group();
  group.name = "Broom";
  // Keep the original bite origin and silhouette dimensions, with a 180-strand head.
  const head = new THREE.Mesh(geo(strawBundle(random)), straw);
  head.name = "Individually curved straw bristles";
  const handle = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.02, 0.026, 1.05, 16)), wood);
  handle.position.y = 0.8;
  const knob = new THREE.Mesh(geo(new THREE.SphereGeometry(0.026, 12, 10)), wood);
  knob.position.y = 1.33;
  const bindingPoints = [];
  for (let i = 0; i <= 220; i++) {
    const t = i / 220, a = t * Math.PI * 2 * 6;
    const r = 0.064 - t * 0.011;
    bindingPoints.push(new THREE.Vector3(Math.cos(a) * r, 0.211 + t * 0.075, Math.sin(a) * r * 0.78));
  }
  const bindingCurve = new THREE.CatmullRomCurve3(bindingPoints);
  const binding = new THREE.Mesh(geo(new THREE.TubeGeometry(bindingCurve, 220, 0.0055, 5, false)), band);
  binding.name = "Six turns of jute binding";
  const bowParts = [];
  for (const sign of [-1, 1]) {
    bowParts.push(fabricStrip([[0,0.302,0.078],[sign*0.063,0.344,0.091],[sign*0.133,0.354,0.098],[sign*0.144,0.303,0.11],[sign*0.08,0.279,0.101],[0,0.302,0.094]],0.035));
    bowParts.push(fabricStrip([[sign*0.018,0.298,0.09],[sign*0.046,0.257,0.11],[sign*0.062,0.211,0.1],[sign*0.092,0.171,0.115]],0.042,true));
  }
  const bow = new THREE.Mesh(geo(mergeGeometry(bowParts)), ribbon);
  bow.name = "Folded dusty pink satin ribbon";
  const knot = new THREE.Mesh(geo(new THREE.SphereGeometry(0.031, 12, 10)), ribbon);
  knot.position.set(0, 0.302, 0.105); knot.scale.set(1, 0.82, 0.62);
  for (const mesh of [head, binding, handle, knob, bow, knot]) mesh.castShadow = true;
  group.add(head, binding, handle, knob, bow, knot);
  group.visible = false;
  scene.add(group);

  const position = new THREE.Vector3(0, 2, BROOM_Z);
  const velocity = new THREE.Vector3();
  const target = new THREE.Vector3(0, 2, BROOM_Z);
  const tug = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  let held = false;
  let waving = 0;
  let trailAt = 0;
  let elapsed = 0;

  const broom = {
    position,
    velocity,
    group,
    get held() {
      return held;
    },
    // A smoothed measure of how hard the broom is being waved, 0 at rest.
    get waving() {
      return waving;
    },
    get speed() {
      return velocity.length();
    },
    // The rabbit has it: pull the head toward the rabbit and shake it.
    bite(from) {
      tug.subVectors(from, position).setZ(0).normalize().multiplyScalar(TUG);
      tug.y -= 1.5;
      effects.burst("straw", scratch.copy(position).setY(position.y - 0.15), 5, 0.3);
    },
    update(dt, pointer) {
      dt = Math.min(Math.max(dt, 0), 0.05);
      elapsed += dt;
      held = Boolean(pointer);
      if (pointer) {
        // Re-project the pointer's ray onto the broom's plane.
        camera.getWorldPosition(cameraPosition);
        scratch.subVectors(pointer.position, cameraPosition);
        const t = (BROOM_Z - cameraPosition.z) / (scratch.z || -1e-6);
        target.copy(cameraPosition).addScaledVector(scratch, t);
        target.x = THREE.MathUtils.clamp(target.x, BOUNDS.minX, BOUNDS.maxX);
        target.y = THREE.MathUtils.clamp(target.y, BOUNDS.minY, BOUNDS.maxY);
        target.z = BROOM_Z;
      }
      scratch.subVectors(target, position).multiplyScalar(SPRING.stiffness);
      scratch.addScaledVector(velocity, -SPRING.damping);
      scratch.add(tug);
      velocity.addScaledVector(scratch, dt);
      position.addScaledVector(velocity, dt);
      position.y = Math.max(BOUNDS.minY, position.y);
      position.z = BROOM_Z;
      tug.multiplyScalar(Math.exp(-dt * 6));

      // Waving: the speed of the cursor itself, smoothed, so a still hand reads as still
      // even while the spring is settling.
      const cursorSpeed = pointer ? pointer.velocity.length() : 0;
      waving = THREE.MathUtils.lerp(waving, Math.min(cursorSpeed / 6, 1.5), 1 - Math.exp(-dt * 4));

      group.visible = held;
      group.position.copy(position);
      // The handle trails the motion and the head leads it.
      group.rotation.z = THREE.MathUtils.clamp(velocity.x * 0.09, -1.1, 1.1);
      group.rotation.x = THREE.MathUtils.clamp(-velocity.y * 0.03, -0.35, 0.35);
      group.rotation.y = Math.sin(elapsed * 0.9) * 0.2;

      // The thread of light behind a waved broom.
      if (held && velocity.length() > 1.2 && elapsed >= trailAt) {
        trailAt = elapsed + 0.035;
        effects.burst("glow", scratch.copy(position).setY(position.y - 0.1), 1, 0.08);
      }
    },
    dispose() {
      scene.remove(group);
      for (const item of disposables) item.dispose?.();
    },
  };
  return broom;
}
