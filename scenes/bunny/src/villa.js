import * as THREE from "three";

// Both the model and the rabbit use these landing positions. The ramp is a real
// inclined floor, so upstairs travel never jumps between unrelated elevations.
export const VILLA = {
  position: [-2.65, 0, -2.1],
  floor: 1.28,
  route: [
    [-0.55, 0, 1.7],
    [-1.75, 0, 1.7],
    [-1.75, 0.04, 1.2],
    [-1.75, 1.28, -0.9],
    [-2.65, 1.28, -1.95],
  ],
};

export function createVilla({ group, mesh, material, mergeGeometry }) {
  const villa = new THREE.Group();
  villa.name = "兔兔的双层小别墅";
  villa.position.fromArray(VILLA.position);
  group.add(villa);
  const palette = {
    wood: material({ color: 0xcba878, roughness: 0.78 }),
    edge: material({ color: 0xe4c79e, roughness: 0.72 }),
    cream: material({ color: 0xf5ebd7, roughness: 0.84 }),
    sage: material({ color: 0x829888, roughness: 0.85 }),
    roof: material({ color: 0x698275, roughness: 0.82 }),
    seam: material({ color: 0xa58b6b, roughness: 0.88 }),
    cloth: material({ color: 0xdfc6ab, roughness: 1 }),
    cushion: material({ color: 0xe8ccb9, roughness: 1 }),
    brass: material({ color: 0xb49859, metalness: 0.55, roughness: 0.34 }),
  };
  // Merge repeated boards and rails by material: detail without hundreds of draws.
  const batches = new Map();
  const add = (geometry, key, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(1, 1, 1),
    ));
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(geometry);
  };
  const board = (size, key, position, rotation) => add(new THREE.BoxGeometry(...size), key, position, rotation);
  const rod = (from, to, radius, key) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const geometry = new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    add(geometry, key, a.add(b).multiplyScalar(0.5).toArray());
  };
  board([2.62, 0.10, 2.60], "wood", [0, 0.04, 0]);
  board([2.55, 0.12, 2.60], "edge", [0, 1.22, 0]);
  board([2.38, 2.44, 0.09], "cream", [0, 1.3, -1.18]);
  // Ground floor is a sheltered den with a broad arched entrance.
  for (const x of [-1.18, 1.18]) board([0.09, 1.16, 2.38], "cream", [x, 0.65, 0]);
  const front = new THREE.Shape();
  front.moveTo(-1.22, 0.09); front.lineTo(-0.75, 0.09); front.lineTo(-0.75, 0.54);
  front.bezierCurveTo(-0.75, 1.27, 0.75, 1.27, 0.75, 0.54);
  front.lineTo(0.75, 0.09); front.lineTo(1.22, 0.09); front.lineTo(1.22, 1.18);
  front.lineTo(-1.22, 1.18); front.closePath();
  add(new THREE.ExtrudeGeometry(front, { depth: 0.09, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.018, bevelThickness: 0.012, curveSegments: 24 }), "cream", [0, 0, 1.1]);
  const arch = new THREE.CurvePath();
  arch.add(new THREE.LineCurve3(new THREE.Vector3(-0.76, 0.1, 1.21), new THREE.Vector3(-0.76, 0.54, 1.21)));
  arch.add(new THREE.CubicBezierCurve3(new THREE.Vector3(-0.76, 0.54, 1.21), new THREE.Vector3(-0.76, 1.29, 1.21), new THREE.Vector3(0.76, 1.29, 1.21), new THREE.Vector3(0.76, 0.54, 1.21)));
  arch.add(new THREE.LineCurve3(new THREE.Vector3(0.76, 0.54, 1.21), new THREE.Vector3(0.76, 0.1, 1.21)));
  add(new THREE.TubeGeometry(arch, 40, 0.055, 8, false), "wood");
  // Tongue-and-groove panel joints and solid corner posts.
  for (let x = -1.05; x <= 1.06; x += 0.21) board([0.009, 2.25, 0.012], "edge", [x, 1.3, -1.124]);
  for (const x of [-1.22, 1.22]) {
    for (const z of [-1.18, 1.15]) board([0.115, 2.5, 0.115], "wood", [x, 1.29, z]);
    board([0.075, 0.39, 2.3], "sage", [x, 1.49, 0]);
    board([0.12, 0.07, 2.48], "edge", [x, 1.73, 0]);
  }
  // An upstairs open balcony, with a gap on the right for the ramp.
  board([1.50, 0.075, 0.10], "edge", [-0.43, 1.76, 1.19]);
  for (let x = -1.1; x <= 0.23; x += 0.19) board([0.047, 0.43, 0.047], "cream", [x, 1.5, 1.19]);
  for (let x = -1.08; x <= 1.1; x += 0.23) board([0.008, 0.009, 2.40], "seam", [x, 1.285, 0]);
  // Pitched sage roof with a warm timber fascia and individually laid roof strips.
  const pitch = Math.atan2(0.46, 1.43);
  for (const side of [-1, 1]) {
    board([1.54, 0.10, 2.88], "roof", [side * 0.72, 2.74, 0], [0, 0, -side * pitch]);
    for (let z = -1.35; z <= 1.36; z += 0.19) {
      board([1.58, 0.055, 0.16], "sage", [side * 0.73, 2.81, z], [0, 0, -side * pitch]);
    }
    for (const z of [-1.43, 1.43]) rod([0, 3.05, z], [side * 1.47, 2.57, z], 0.065, "edge");
  }
  rod([0, 3.07, -1.47], [0, 3.07, 1.47], 0.065, "wood");
  // A small brass house emblem under the roof.
  add(new THREE.TorusGeometry(0.145, 0.023, 8, 32), "brass", [0, 2.66, 1.225]);
  for (const x of [-0.065, 0.065]) {
    const ear = new THREE.SphereGeometry(1, 12, 8); ear.scale(0.028, 0.078, 0.015);
    add(ear, "brass", [x, 2.7, 1.23]);
  }
  // Cushions in both rooms; the upper surface remains level for the animated rabbit.
  for (const y of [0.14, 1.29]) {
    const cushion = new THREE.SphereGeometry(1, 32, 16); cushion.scale(0.89, 0.075, 0.98);
    add(cushion, y < 1 ? "cloth" : "cushion", [-0.10, y, -0.08]);
  }
  // Ramp centerline is exactly VILLA.route[2..3], converted to house space.
  const low = new THREE.Vector3(...VILLA.route[2]).sub(villa.position);
  const high = new THREE.Vector3(...VILLA.route[3]).sub(villa.position);
  const rampAngle = Math.atan2(high.y - low.y, low.z - high.z);
  const length = low.distanceTo(high);
  const mid = low.clone().add(high).multiplyScalar(0.5);
  board([1.04, 0.075, length + 0.08], "wood", mid.clone().add(new THREE.Vector3(0, -0.05, 0)).toArray(), [rampAngle, 0, 0]);
  for (let i = 0; i <= 12; i++) {
    const p = low.clone().lerp(high, i / 12); p.y += 0.012;
    board([0.98, 0.033, 0.055], "edge", p.toArray(), [rampAngle, 0, 0]);
  }
  for (const side of [-1, 1]) {
    const shift = new THREE.Vector3(side * 0.53, 0.11, 0);
    rod(low.clone().add(shift).toArray(), high.clone().add(shift).toArray(), 0.035, "cream");
  }
  for (const [key, geometry] of batches) mesh(mergeGeometry(geometry), palette[key], [0, 0, 0], villa);
  return VILLA;
}
