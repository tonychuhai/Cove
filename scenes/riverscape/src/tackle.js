import * as THREE from "three";
import { waterLitShader } from "./water.js";

// The pointer is a fishing line. A monofilament runs down from above the frame to a
// small baited hook that hangs wherever the cursor is, a little behind the front glass in
// the open water the fish use. The fish treat the bait as food (fish.js does the
// striking); a fish that takes it is hooked and fights on the line until it throws the
// hook, or is lifted to the top of the frame and landed. Everything here is the tackle's
// own motion and the state of the bait; the fish's side of the fight lives in fish.js.
//
// The hook hangs in the plane z = HOOK_Z, where the pointer's own plane (the front glass,
// z = 2.6) is re-projected through the camera so the hook stays exactly under the cursor.
const HOOK_Z = 1.9;
// The visible film, as food.js has it. Above it the hook is out of the water.
const FILM = 8.15;
// Parked out of the top of the frame when the cursor has left the scene.
const ABOVE = 11.5;
const LINE_TOP = 14;
// Hold a hooked fish this high, near the top of the frame, to land it.
const LAND_Y = 7.55;
const TANK = { minX: -8.1, maxX: 8.1, minY: 0.5 };

// A weighted line on a rod tip. Slightly underdamped, so a quick move swings the hook and
// it settles under the cursor in a couple of oscillations.
const SPRING = { stiffness: 90, damping: 14 };
// Lifting a landed fish out of the frame is slower and heavier.
const LIFT = { stiffness: 28, damping: 11 };
const FIGHT = {
  // Seconds of fight before the fish is spent; a fish is lost off the hook not long after.
  tire: 9,
  lost: 16,
  // Seconds the hook has to be held near the top of the frame to land the fish.
  land: 1.1,
  // Cursor speed, in tank units a second, that rips the hook out of a fish's mouth.
  yank: 9,
  // How long the landed fish is out of the frame before it is dropped back in.
  landed: 1.9,
};
const BAIT = {
  // A bare hook is rebaited by lifting it out of the water for a moment. Left in the
  // water it is rebaited on its own eventually, slowly enough that a cursor parked in the
  // tank is not a fish on the line every half minute.
  lift: 0.5,
  idle: 45,
  // After a hooking the shoal is wary of the bait for a while; recovered per second.
  wary: 0.1,
  recovery: 1 / 90,
};

export function createTackle(scene, { camera }) {
  // Steel: a small J hook with a turned eye and a barb, built in the x-y plane so it
  // faces the glass, the eye at the origin.
  const metal = new THREE.MeshStandardMaterial({
    color: 0xb9bec4,
    metalness: 0.92,
    roughness: 0.28,
  });
  metal.onBeforeCompile = (shader) => waterLitShader(shader);
  metal.customProgramCacheKey = () => "tackle-steel-v1";
  const shank = new THREE.CatmullRomCurve3(
    [
      [0, 0, 0],
      [0, -0.06, 0],
      [0, -0.12, 0],
      [0.006, -0.165, 0],
      [0.03, -0.196, 0],
      [0.062, -0.196, 0],
      [0.085, -0.17, 0],
      [0.089, -0.135, 0],
      [0.082, -0.108, 0],
    ].map((p) => new THREE.Vector3(...p)),
  );
  const hookMesh = new THREE.Group();
  hookMesh.name = "Fishing hook";
  const shankMesh = new THREE.Mesh(new THREE.TubeGeometry(shank, 48, 0.0055, 7, false), metal);
  const eyeMesh = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0042, 6, 18), metal);
  eyeMesh.position.y = 0.01;
  // The point: a short spike continuing the bend, tapering to nothing.
  const barbMesh = new THREE.Mesh(new THREE.ConeGeometry(0.0055, 0.03, 7), metal);
  barbMesh.position.set(0.079, -0.096, 0);
  barbMesh.rotation.z = 0.28;
  hookMesh.add(shankMesh, eyeMesh, barbMesh);

  // A bloodworm on the bend: a short red tube with a kink in it, wagging slowly.
  const flesh = new THREE.MeshStandardMaterial({ color: 0x8f2a1f, roughness: 0.55 });
  flesh.onBeforeCompile = (shader) => waterLitShader(shader);
  flesh.customProgramCacheKey = () => "tackle-bait-v1";
  const worm = new THREE.CatmullRomCurve3(
    [
      [-0.012, 0.012, 0],
      [0.008, -0.01, 0.006],
      [0.02, -0.05, -0.005],
      [0.006, -0.095, 0.006],
      [0.016, -0.14, 0],
    ].map((p) => new THREE.Vector3(...p)),
  );
  const baitMesh = new THREE.Mesh(new THREE.TubeGeometry(worm, 24, 0.011, 7, false), flesh);
  baitMesh.name = "Bait on the hook";
  const BAIT_ATTACH = new THREE.Vector3(0.044, -0.196, 0);
  baitMesh.position.copy(BAIT_ATTACH);
  hookMesh.add(baitMesh);

  // The line, from above the frame to the eye of the hook. A GL line is a pixel wide
  // whatever the resolution, which is what monofilament looks like from across a room.
  const LINE_POINTS = 18;
  const lineGeometry = new THREE.BufferGeometry();
  const linePositions = new Float32Array(LINE_POINTS * 3);
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xdfe9e2,
    transparent: true,
    opacity: 0.62,
  });
  const lineMesh = new THREE.Line(lineGeometry, lineMaterial);
  lineMesh.name = "Fishing line";
  for (const object of [hookMesh, shankMesh, eyeMesh, barbMesh, baitMesh, lineMesh]) {
    object.frustumCulled = false;
    object.castShadow = false;
    object.receiveShadow = false;
  }
  scene.add(hookMesh, lineMesh);

  const hook = {
    position: new THREE.Vector3(0, ABOVE, HOOK_Z),
    velocity: new THREE.Vector3(),
    target: new THREE.Vector3(0, ABOVE, HOOK_Z),
  };
  // What a hooked fish is doing to the line this frame, written by fish.js.
  const pull = new THREE.Vector3();
  // The bait as fish.js sees food: a pellet that never sinks, dissolves or settles, and
  // whose serial changes whenever it is replaced so a fish that was after the old one
  // gives it up and finds the new one on its own.
  const bait = {
    hook: true,
    serial: 1_000_000,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    gone: true,
    eatenAt: 0,
    wetAt: -Infinity,
    settledAt: 0,
    shoved: 0,
    kick: new THREE.Vector3(),
    radius: 0.03,
  };
  const stats = { hooked: 0, landed: 0, lost: 0 };

  let state = "idle"; // idle | hooked | landing
  let baited = true;
  let bareFor = 0;
  let outFor = 0;
  let lure = 1;
  let hookedFish = null;
  let hookedAt = 0;
  let landHold = 0;
  let landedAt = 0;
  let lineTopX = 0;
  let elapsed = 0;
  let wasUnderwater = false;
  const tackle = {
    hook,
    bait,
    pull,
    stats,
    // The fish on the line, and how the last one came off it, for fish.js to read.
    hooked: null,
    released: null,
    // Set when the bait or a returned fish breaks the film, cleared by fish.js once the
    // shoal has felt it.
    splashed: false,
    struggle: 0,
    get lure() {
      return lure;
    },
    get state() {
      return state;
    },
    get baited() {
      return baited;
    },
  };

  const cameraPosition = new THREE.Vector3();
  const scratch = new THREE.Vector3();

  function rebait() {
    if (baited) return;
    baited = true;
    bait.serial++;
    bareFor = 0;
    outFor = 0;
  }

  // Called by fish.js when a fish has closed its jaws on the bait.
  function caught(fish) {
    if (state !== "idle" || !baited) return false;
    state = "hooked";
    hookedFish = fish;
    tackle.hooked = fish;
    tackle.released = null;
    hookedAt = elapsed;
    landHold = 0;
    baited = false;
    bait.gone = true;
    bait.serial++;
    lure = BAIT.wary;
    stats.hooked++;
    return true;
  }

  function letGo(how) {
    const fish = hookedFish;
    hookedFish = null;
    tackle.hooked = null;
    tackle.released = { fish, how, at: elapsed };
    tackle.struggle = 0;
    pull.set(0, 0, 0);
    state = "idle";
    if (how === "landed") {
      stats.landed++;
      // Rebaited while the hook was out of the frame.
      baited = true;
      bait.serial++;
    } else stats.lost++;
    bareFor = 0;
    outFor = 0;
  }

  function update(dt, pointer) {
    dt = Math.min(Math.max(dt, 0), 0.05);
    elapsed += dt;
    lure = Math.min(1, lure + dt * BAIT.recovery);

    // Where the line wants the hook: under the cursor, re-projected onto the hook's plane;
    // parked above the frame when there is no cursor; lifted clear while landing a fish.
    let stiffness = SPRING.stiffness;
    let damping = SPRING.damping;
    const parked = !pointer || state === "landing";
    if (parked) {
      hook.target.set(hook.position.x, ABOVE + (state === "landing" ? 1 : 0), HOOK_Z);
      if (state === "landing") {
        stiffness = LIFT.stiffness;
        damping = LIFT.damping;
      }
    } else {
      camera.getWorldPosition(cameraPosition);
      scratch.subVectors(pointer.position, cameraPosition);
      const t = (HOOK_Z - cameraPosition.z) / (scratch.z || -1e-6);
      hook.target.copy(cameraPosition).addScaledVector(scratch, t);
      hook.target.x = THREE.MathUtils.clamp(hook.target.x, TANK.minX, TANK.maxX);
      hook.target.y = Math.max(hook.target.y, TANK.minY);
      hook.target.z = HOOK_Z;
    }
    scratch.subVectors(hook.target, hook.position).multiplyScalar(stiffness);
    scratch.addScaledVector(hook.velocity, -damping);
    if (state === "hooked") scratch.add(pull);
    hook.velocity.addScaledVector(scratch, dt);
    hook.position.addScaledVector(hook.velocity, dt);
    hook.position.z = HOOK_Z;
    pull.multiplyScalar(Math.exp(-dt * 10));

    const underwater = hook.position.y < FILM;
    if (underwater && !wasUnderwater && !parked) tackle.splashed = true;
    wasUnderwater = underwater;

    if (state === "hooked") {
      const age = elapsed - hookedAt;
      tackle.struggle = Math.exp(-age / FIGHT.tire);
      const cursorSpeed = pointer ? pointer.velocity.length() : 0;
      if (age > 0.35 && cursorSpeed > FIGHT.yank) letGo("torn");
      else if (age > FIGHT.lost) letGo("thrown");
      else {
        if (hook.position.y > LAND_Y) landHold += dt;
        else landHold = Math.max(0, landHold - dt * 2);
        if (landHold > FIGHT.land) {
          state = "landing";
          landedAt = elapsed;
        }
      }
    } else if (state === "landing") {
      tackle.struggle = Math.max(0, tackle.struggle - dt * 0.4);
      if (elapsed - landedAt > FIGHT.landed && hook.position.y > FILM + 1.2) {
        letGo("landed");
        tackle.splashed = true;
      }
    }

    // Rebaiting a bare hook: lifted out for a moment, or eventually on its own.
    if (!baited && state === "idle") {
      if (!underwater) {
        outFor += dt;
        if (outFor > BAIT.lift) rebait();
      } else {
        bareFor += dt;
        if (bareFor > BAIT.idle) rebait();
      }
    }

    // The bait as food: on the bend, in the water, on an idle line.
    bait.gone = !(baited && underwater && state === "idle");
    bait.position.copy(hook.position).add(BAIT_ATTACH);
    bait.position.y -= 0.07;
    bait.velocity.copy(hook.velocity);
    bait.kick.multiplyScalar(Math.exp(-dt * 5));
    bait.shoved *= Math.exp(-dt / 8);

    // Draw: the hook swings a little on the line, the worm wags, the line runs from the
    // rod tip, which trails the hook, down to the eye with a slight bow when dragged.
    hookMesh.position.copy(hook.position);
    hookMesh.rotation.z = THREE.MathUtils.clamp(-hook.velocity.x * 0.06, -0.6, 0.6);
    hookMesh.rotation.y = Math.sin(elapsed * 0.7) * 0.25;
    hookMesh.updateMatrix();
    baitMesh.visible = baited;
    baitMesh.rotation.z = Math.sin(elapsed * 4.3 + 1.0) * 0.22;
    baitMesh.rotation.x = Math.sin(elapsed * 3.1) * 0.18;
    baitMesh.updateMatrix();
    lineTopX += (hook.position.x - lineTopX) * (1 - Math.exp(-dt * 2.5));
    const bow = (hook.position.x - lineTopX) * 0.3;
    for (let i = 0; i < LINE_POINTS; i++) {
      const k = i / (LINE_POINTS - 1);
      const s = 1 - k;
      // Quadratic Bezier from the rod tip to the eye of the hook.
      const cx = (lineTopX + hook.position.x) * 0.5 + bow;
      const cy = (LINE_TOP + hook.position.y) * 0.5;
      linePositions[i * 3] = s * s * lineTopX + 2 * s * k * cx + k * k * hook.position.x;
      linePositions[i * 3 + 1] = s * s * LINE_TOP + 2 * s * k * cy + k * k * (hook.position.y + 0.02);
      linePositions[i * 3 + 2] = HOOK_Z;
    }
    lineGeometry.attributes.position.needsUpdate = true;
    lineMesh.visible = hook.position.y < ABOVE - 0.3;
    hookMesh.visible = lineMesh.visible;
  }

  // Parked above the frame until the first pointer event.
  update(0, null);

  return Object.assign(tackle, {
    update,
    caught,
    rebait,
    hookZ: HOOK_Z,
    film: FILM,
    dispose() {
      scene.remove(hookMesh, lineMesh);
      shankMesh.geometry.dispose();
      eyeMesh.geometry.dispose();
      barbMesh.geometry.dispose();
      baitMesh.geometry.dispose();
      lineGeometry.dispose();
      metal.dispose();
      flesh.dispose();
      lineMaterial.dispose();
    },
  });
}
