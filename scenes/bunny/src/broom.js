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

export function createBroom(scene, { camera, effects }) {
  const wood = new THREE.MeshStandardMaterial({ color: 0xc89a5f, roughness: 0.6 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xe6bd6c, roughness: 0.9 });
  const band = new THREE.MeshStandardMaterial({ color: 0xb37f3c, roughness: 0.8 });
  const ribbon = new THREE.MeshStandardMaterial({ color: 0xf07a8a, roughness: 0.55 });
  const disposables = [wood, straw, band, ribbon];
  const geo = (g) => (disposables.push(g), g);

  const group = new THREE.Group();
  group.name = "Broom";
  // The origin is the middle of the straw head, the point the rabbit goes for.
  const head = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.06, 0.2, 0.44, 14, 1)), straw);
  head.position.y = 0.02;
  const bristles = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.19, 0.22, 0.08, 14, 1)), band);
  bristles.position.y = -0.2;
  bristles.material = straw;
  const binding = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.075, 0.085, 0.09, 12)), band);
  binding.position.y = 0.25;
  const handle = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.02, 0.026, 1.05, 10)), wood);
  handle.position.y = 0.8;
  const knob = new THREE.Mesh(geo(new THREE.SphereGeometry(0.035, 10, 8)), wood);
  knob.position.y = 1.33;
  // The bow: two loops and a knot, tied at the binding.
  const loopGeometry = geo(new THREE.SphereGeometry(0.07, 12, 10));
  const loopL = new THREE.Mesh(loopGeometry, ribbon);
  loopL.scale.set(1.2, 0.7, 0.5);
  loopL.position.set(-0.1, 0.3, 0.07);
  const loopR = new THREE.Mesh(loopGeometry, ribbon);
  loopR.scale.set(1.2, 0.7, 0.5);
  loopR.position.set(0.1, 0.3, 0.07);
  const knot = new THREE.Mesh(geo(new THREE.SphereGeometry(0.035, 10, 8)), ribbon);
  knot.position.set(0, 0.3, 0.09);
  for (const mesh of [head, bristles, binding, handle, knob, loopL, loopR, knot]) mesh.castShadow = true;
  group.add(head, bristles, binding, handle, knob, loopL, loopR, knot);
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
