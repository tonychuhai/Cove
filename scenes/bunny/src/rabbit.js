import * as THREE from "three";

// A caramel lop rabbit, toon-shaded, built from primitives, and what it does: it watches
// the broom, and the moment the broom is waved it gives chase, leaps for the head and
// bites, hangs on and shakes it, then lets go and comes back for more. A still broom is
// sniffed at. A slow stroke with it is petting. Left alone it grooms, wanders and, in the
// end, flops down and sleeps.
//
// The rabbit faces +z at zero yaw, toward the camera. The floor is y = 0.

const BOUNDS = { minX: -5.6, maxX: 4.6, minZ: -3.4, maxZ: 3.2 };
const HOME = new THREE.Vector3(-0.6, 0, 0.9);
const HOP = { duration: 0.42, height: 0.34, step: 0.8, pause: 0.12 };
const CHASE_HOP = { duration: 0.3, height: 0.42, step: 1.15, pause: 0.03 };
const LUNGE = { duration: 0.36, reach: 1.05, bite: 0.62, snap: 0.55, lead: 0.22, maxHeight: 1.75, pause: 0.12 };
const INTEREST = { rise: 1.6, fall: 0.22, chase: 0.35, near: 7 };
const APPROACH = { near: 1.0, far: 5.5, stop: 0.85, cooldown: 4 };
const PET = { start: 0.45, slow: 0.12, fast: 2.6, reward: 4.5 };
const BITE = { hold: 0.65, satisfied: 3 };
const EAT = { chew: 4.5 };
const SLEEP = { after: 240, wakeDistance: 1.3, auto: 100 };
const WANDER = { min: 9, max: 16 };
const GROOM = { min: 18, max: 40, duration: 2.6 };

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

function toonGradient() {
  const data = new Uint8Array([120, 120, 120, 255, 185, 185, 185, 255, 240, 240, 240, 255, 255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createRabbit(scene, { effects, shadows = true }) {
  const gradient = toonGradient();
  const fur = new THREE.MeshToonMaterial({ color: 0xd5a26b, gradientMap: gradient });
  const cream = new THREE.MeshToonMaterial({ color: 0xf6e8d2, gradientMap: gradient });
  const innerEar = new THREE.MeshToonMaterial({ color: 0xe9bfae, gradientMap: gradient });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241a16, roughness: 0.25, metalness: 0.1 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const noseMaterial = new THREE.MeshToonMaterial({ color: 0xc98a86, gradientMap: gradient });
  const disposables = [gradient, fur, cream, innerEar, dark, white, noseMaterial];
  const geo = (g) => (disposables.push(g), g);
  const meshes = [];
  const mesh = (geometry, material) => {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = shadows;
    meshes.push(m);
    return m;
  };

  const root = new THREE.Group();
  root.name = "Lop rabbit";
  root.position.copy(HOME);

  // Body: a long soft loaf, a cream chest, big hind feet, small front paws, a puff tail.
  const body = new THREE.Group();
  const torso = mesh(geo(new THREE.SphereGeometry(0.44, 32, 24)), fur);
  torso.scale.set(1, 0.8, 1.2);
  torso.position.set(0, 0.44, -0.05);
  const rump = mesh(geo(new THREE.SphereGeometry(0.4, 24, 18)), fur);
  rump.scale.set(1, 0.9, 1);
  rump.position.set(0, 0.42, -0.3);
  const chest = mesh(geo(new THREE.SphereGeometry(0.3, 24, 18)), cream);
  chest.scale.set(0.9, 0.7, 0.6);
  chest.position.set(0, 0.32, 0.36);
  const tail = mesh(geo(new THREE.SphereGeometry(0.12, 16, 12)), cream);
  tail.position.set(0, 0.55, -0.66);
  const pawGeometry = geo(new THREE.SphereGeometry(0.095, 16, 12));
  const pawL = mesh(pawGeometry, cream);
  pawL.position.set(-0.18, 0.1, 0.45);
  const pawR = mesh(pawGeometry, cream);
  pawR.position.set(0.18, 0.1, 0.45);
  const footGeometry = geo(new THREE.SphereGeometry(0.15, 16, 12));
  const footL = mesh(footGeometry, cream);
  footL.scale.set(1, 0.5, 1.6);
  footL.position.set(-0.3, 0.07, 0.02);
  const footR = mesh(footGeometry, cream);
  footR.scale.set(1, 0.5, 1.6);
  footR.position.set(0.3, 0.07, 0.02);
  const arms = new THREE.Group();
  arms.add(pawL, pawR);
  body.add(torso, rump, chest, tail, arms, footL, footR);

  // Head on a neck pivot, ears hanging from the top of the skull.
  const neck = new THREE.Group();
  neck.position.set(0, 0.78, 0.3);
  const head = new THREE.Group();
  const skull = mesh(geo(new THREE.SphereGeometry(0.34, 32, 24)), fur);
  skull.position.set(0, 0.08, 0.1);
  skull.scale.set(1.02, 0.95, 1);
  const muzzle = mesh(geo(new THREE.SphereGeometry(0.2, 24, 18)), cream);
  muzzle.scale.set(1.1, 0.75, 0.8);
  muzzle.position.set(0, -0.04, 0.33);
  const brow = mesh(geo(new THREE.SphereGeometry(0.19, 20, 14)), fur);
  brow.position.set(0, 0.25, 0.12);
  brow.scale.set(1.4, 0.7, 1);
  head.add(skull, muzzle, brow);
  const ears = [];
  const earGeometry = geo(new THREE.CapsuleGeometry(0.09, 0.5, 6, 12));
  const innerGeometry = geo(new THREE.CapsuleGeometry(0.05, 0.36, 4, 10));
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.22, 0.34, 0.02);
    const ear = mesh(earGeometry, fur);
    ear.position.y = -0.32;
    const inner = new THREE.Mesh(innerGeometry, innerEar);
    inner.position.set(side * 0.03, -0.32, 0.055);
    inner.scale.set(1, 1, 0.45);
    pivot.add(ear, inner);
    pivot.userData.side = side;
    head.add(pivot);
    ears.push(pivot);
  }
  const eyes = [];
  const eyeGeometry = geo(new THREE.SphereGeometry(0.062, 20, 14));
  const glintGeometry = geo(new THREE.SphereGeometry(0.02, 10, 8));
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.19, 0.1, 0.36);
    const ball = new THREE.Mesh(eyeGeometry, dark);
    const glint = new THREE.Mesh(glintGeometry, white);
    glint.position.set(side * 0.02 + 0.012, 0.026, 0.05);
    eye.add(ball, glint);
    head.add(eye);
    eyes.push(eye);
  }
  const nose = new THREE.Mesh(geo(new THREE.SphereGeometry(0.035, 12, 10)), noseMaterial);
  nose.position.set(0, 0.03, 0.5);
  nose.scale.set(1.2, 0.8, 0.7);
  head.add(nose);
  neck.add(head);
  root.add(body, neck);
  scene.add(root);

  // A carrot, shown while there is one to eat.
  const carrot = new THREE.Group();
  const carrotBody = mesh(geo(new THREE.ConeGeometry(0.16, 0.6, 12)), new THREE.MeshStandardMaterial({ color: 0xf0813a, roughness: 0.9 }));
  carrotBody.rotation.z = Math.PI / 2 + 0.25;
  carrotBody.position.y = 0.14;
  const leafGeometry = geo(new THREE.SphereGeometry(0.08, 10, 8));
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x5fa35a, roughness: 0.9 });
  for (const [x, y, z] of [[0.33, 0.18, 0], [0.36, 0.25, 0.08], [0.38, 0.14, -0.08]]) {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.scale.set(1.5, 0.6, 0.8);
    leaf.position.set(x, y, z);
    carrot.add(leaf);
  }
  carrot.add(carrotBody);
  carrot.visible = false;
  carrot.scale.setScalar(0.001);
  scene.add(carrot);
  disposables.push(carrotBody.material, leafMaterial);

  // Behaviour.
  const listeners = {};
  const emit = (event, detail) => listeners[event]?.forEach((fn) => fn(detail));
  let elapsed = 0;
  let mode = "idle"; // idle | hop | chase | lunge | bite | rear | pet | eat | groom | sleep
  let hop = null;
  let interest = 0;
  let approachCooldownUntil = 0;
  let stroke = 0;
  let cuddleUntil = 0;
  let petRewardAt = 0;
  let heartsAt = 0;
  let biteUntil = 0;
  let snapCooldownUntil = 0;
  let bitesInRow = 0;
  let satisfiedUntil = 0;
  let rearUntil = 0;
  let eatPhase = "";
  let eatUntil = 0;
  let carrotShown = 0;
  let groomUntil = 0;
  let nextGroom = GROOM.min + Math.random() * (GROOM.max - GROOM.min);
  let sleepAt = 0;
  let zzzAt = 0;
  let lastPointerAt = 0;
  let nextWander = WANDER.min + Math.random() * (WANDER.max - WANDER.min);
  let blinkAt = 2 + Math.random() * 3;
  let blink = 0;
  let noseTwitch = 0;
  const facing = { yaw: 0 };
  const look = { yaw: 0, pitch: 0 };
  const pose = { eye: 1, earLift: 0, earSwing: 0, earTrail: 0, squash: 1, nod: 0, tilt: 0, sink: 0, rear: 0, arms: 0, shake: 0 };
  const scratch = new THREE.Vector3();
  const scratch2 = new THREE.Vector3();
  const floorTarget = new THREE.Vector3();
  const mouth = new THREE.Vector3();
  const hopFrom = new THREE.Vector3();
  const hopTo = new THREE.Vector3();
  const lastPosition = new THREE.Vector3().copy(root.position);
  const velocity = new THREE.Vector3();

  const inBounds = (p) => {
    p.x = clamp(p.x, BOUNDS.minX, BOUNDS.maxX);
    p.z = clamp(p.z, BOUNDS.minZ, BOUNDS.maxZ);
    p.y = 0;
    return p;
  };

  function startHop(to, profile = HOP, height = profile.height) {
    hopFrom.copy(root.position);
    hopFrom.y = 0;
    hopTo.copy(inBounds(to.clone()));
    hop = { t: 0, profile, height };
    const dx = hopTo.x - hopFrom.x, dz = hopTo.z - hopFrom.z;
    if (dx * dx + dz * dz > 0.01) hop.yaw = Math.atan2(dx, dz);
  }

  // Hop toward a point on the floor, stopping short of it.
  function travel(goal, stop, profile) {
    scratch2.copy(root.position).setY(0);
    scratch.copy(goal).setY(0).sub(scratch2);
    const d = scratch.length();
    if (d <= stop) return false;
    const step = Math.min(profile.step, d - stop);
    scratch.setLength(step).add(scratch2);
    startHop(scratch, profile);
    return true;
  }

  // Where the mouth is, in world space.
  function mouthPoint(out) {
    out.set(0, 0.03, 0.52);
    head.localToWorld(out);
    return out;
  }

  function startBite() {
    mode = "bite";
    biteUntil = elapsed + BITE.hold;
    heartsAt = 0;
    hop = null;
    root.position.y = Math.max(0, root.position.y);
    emit("bite");
  }

  const api = {
    root,
    on(event, fn) {
      (listeners[event] ??= new Set()).add(fn);
    },
    get mode() {
      return mode;
    },
    get interest() {
      return interest;
    },
    // What counts as touching the rabbit: a sphere about the body and head.
    touchSphere: { center: new THREE.Vector3(), radius: 0.82 },
    feed(accepted) {
      if (mode === "sleep") api.wake();
      if (!accepted) {
        pose.tilt = 0.35;
        return;
      }
      // Put down a little in front and to the side, so it eats facing the room.
      inBounds(scratch.set(root.position.x + 0.9, 0, root.position.z + 1.1));
      carrot.position.copy(scratch);
      carrot.rotation.y = Math.random() * TAU;
      carrot.visible = true;
      carrotShown = 1;
      carrotBody.visible = true;
      mode = "eat";
      eatPhase = "go";
      hop = null;
      stroke = 0;
      interest = 0;
    },
    // A stroke asked for from the panel rather than given with the broom.
    cuddle(seconds = 3) {
      if (mode === "sleep") api.wake();
      if (mode === "eat") return;
      cuddleUntil = elapsed + seconds;
      if (mode !== "pet") {
        mode = "pet";
        petRewardAt = 0;
        heartsAt = 0;
      }
      hop = null;
    },
    // Wind it up without a broom: a burst of interest, as if the broom had been waved.
    play() {
      if (mode === "sleep") api.wake();
      if (mode === "eat") return;
      interest = 1;
      satisfiedUntil = 0;
      effects.burst("sparkle", scratch.copy(root.position).setY(1.1), 6, 0.9);
    },
    rest() {
      if (mode === "sleep") return;
      mode = "sleep";
      sleepAt = elapsed;
      hop = null;
      stroke = 0;
      interest = 0;
      carrotShown = 0;
      emit("sleep");
    },
    wake() {
      if (mode !== "sleep") return;
      mode = "idle";
      approachCooldownUntil = elapsed + 1.5;
      emit("wake");
    },
    update(dt, { broom, pointer }) {
      elapsed += dt;
      const held = broom?.held ?? false;
      if (held) lastPointerAt = elapsed;
      const broomPos = broom?.position ?? null;
      if (held) floorTarget.set(broomPos.x, 0, broomPos.z + 0.15);
      const flat = held ? Math.hypot(broomPos.x - root.position.x, broomPos.z - root.position.z) : Infinity;
      const touching = Boolean(pointer?.onRabbit);
      const cursorSpeed = pointer?.speed ?? 0;
      const waving = broom?.waving ?? 0;

      // Blink, nose.
      if (elapsed >= blinkAt) {
        blink = 0.2;
        blinkAt = elapsed + 2.5 + Math.random() * 4;
      }
      blink = Math.max(0, blink - dt);
      noseTwitch = (noseTwitch + dt * (mode === "sleep" ? 2 : 9)) % TAU;

      // Interest in the broom: waved, it is irresistible; still, it is forgotten.
      if (held && flat < INTEREST.near && mode !== "eat" && mode !== "sleep" && elapsed > satisfiedUntil) {
        interest = clamp(interest + dt * INTEREST.rise * waving, 0, 1);
      }
      interest = Math.max(0, interest - dt * INTEREST.fall * (held ? 1 : 2));

      // A slow stroke across the rabbit is petting; a sweep past it is an invitation.
      if (touching && cursorSpeed > PET.slow && cursorSpeed < PET.fast && mode !== "eat" && mode !== "bite") stroke += dt;
      else stroke = Math.max(0, stroke - dt * 1.5);

      // Mode logic.
      const chasing = interest > INTEREST.chase && held && mode !== "eat" && mode !== "sleep" && mode !== "pet";
      if (mode === "sleep") {
        if (touching || (held && flat < SLEEP.wakeDistance) || elapsed - sleepAt > SLEEP.auto) api.wake();
        else if (elapsed >= zzzAt) {
          zzzAt = elapsed + 2.2;
          effects.burst("zzz", scratch.copy(root.position).add(new THREE.Vector3(0.35, 1.0, 0.2)), 1);
        }
      } else if (mode === "eat") {
        if (eatPhase === "go") {
          if (!hop && !travel(carrot.position, 0.55, HOP)) {
            eatPhase = "chew";
            eatUntil = elapsed + EAT.chew;
            facing.yaw = Math.atan2(carrot.position.x - root.position.x, carrot.position.z - root.position.z);
          }
        } else if (elapsed >= heartsAt) {
          heartsAt = elapsed + 0.4;
          effects.burst("crumb", scratch.copy(carrot.position).setY(0.25), 3, 0.25);
          carrot.scale.setScalar(Math.max(0.35, (eatUntil - elapsed) / EAT.chew));
          if (elapsed >= eatUntil) {
            carrotShown = 0;
            eatPhase = "";
            mode = "idle";
            emit("ate");
          }
        }
      } else if (mode === "bite") {
        // Hanging on: the jaws stay on the head of the broom wherever it goes, the head
        // shakes and the broom is tugged, then it lets go. Lifted too high, it drops off.
        if (held && broom) {
          mouthPoint(mouth);
          scratch2.subVectors(mouth, root.position);
          scratch.copy(broomPos).sub(scratch2);
          scratch.z -= 0.05;
          root.position.lerp(scratch, 1 - Math.exp(-dt * 18));
          root.position.y = Math.max(0, root.position.y);
          if (elapsed >= heartsAt) {
            heartsAt = elapsed + 0.18;
            broom.bite(mouth);
          }
        }
        if (elapsed >= biteUntil || !held || broomPos.y > 2.0) {
          mode = "idle";
          bitesInRow++;
          snapCooldownUntil = elapsed + 0.45;
          // Three good bites and it is pleased with itself for a while.
          if (bitesInRow >= 3) {
            bitesInRow = 0;
            interest = 0.15;
            satisfiedUntil = elapsed + BITE.satisfied;
            emit("caught");
            travel(scratch.copy(root.position).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, 0.6)), 0.1, CHASE_HOP);
          }
        }
      } else if (mode === "lunge") {
        if (hop) {
          // Through the leap, is the head of the broom within reach of the jaws?
          if (hop.t > 0.15 && held && broom) {
            mouthPoint(mouth);
            if (mouth.distanceTo(broomPos) < LUNGE.bite) startBite();
          }
        } else {
          mode = "idle";
          pose.tilt = 0.3;
          emit("miss");
        }
      } else if (mode === "rear") {
        // Up on the hind legs reaching for a broom held high; drops back after a moment.
        if (elapsed >= rearUntil || !held || broomPos.y < 1.5 || flat > 1.3) mode = "idle";
      } else if (mode === "pet") {
        const cuddling = elapsed < cuddleUntil;
        if (!cuddling && (stroke <= 0.05 || !touching)) {
          mode = "idle";
          approachCooldownUntil = elapsed + 1;
        } else {
          if (elapsed >= heartsAt) {
            heartsAt = elapsed + 0.55;
            effects.burst("heart", scratch.copy(root.position).add(new THREE.Vector3(0, 1.2, 0.3)), 1, 0.5);
          }
          if (elapsed >= petRewardAt) {
            petRewardAt = elapsed + PET.reward;
            emit("pet");
          }
        }
      } else if (mode === "groom") {
        if (elapsed >= groomUntil) mode = "idle";
      } else {
        // idle / hop / chase
        if (stroke >= PET.start && !hop) {
          mode = "pet";
          petRewardAt = 0;
          heartsAt = 0;
        } else if (chasing) {
          mode = "chase";
          // A broom swept past the nose is snapped at without any leap.
          mouthPoint(mouth);
          if (elapsed >= snapCooldownUntil && mouth.distanceTo(broomPos) < LUNGE.snap) startBite();
          else if (!hop) {
            const high = broomPos.y > 1.5;
            if (flat < LUNGE.reach && broomPos.y < LUNGE.maxHeight) {
              // Leap for where the head of the broom is going to be.
              mode = "lunge";
              scratch.copy(broomPos).addScaledVector(broom.velocity, LUNGE.lead);
              scratch.set(scratch.x, 0, broomPos.z + 0.1);
              startHop(scratch, { ...CHASE_HOP, duration: LUNGE.duration, pause: LUNGE.pause }, clamp(broomPos.y + broom.velocity.y * LUNGE.lead - 0.35, 0.35, 1.45));
              emit("lunge");
            } else if (flat < 1.3 && high) {
              mode = "rear";
              rearUntil = elapsed + 1.4;
              facing.yaw = Math.atan2(broomPos.x - root.position.x, broomPos.z - root.position.z);
            } else travel(floorTarget, LUNGE.reach * 0.8, CHASE_HOP);
          }
        } else if (!hop) {
          mode = "idle";
          let moved = false;
          // A still broom nearby is worth a sniff, once.
          if (held && elapsed >= approachCooldownUntil && !touching && flat > APPROACH.near && flat < APPROACH.far) {
            moved = travel(floorTarget, APPROACH.stop, HOP);
            if (!moved) approachCooldownUntil = elapsed + APPROACH.cooldown;
          } else if (held && flat <= APPROACH.stop + 0.1 && elapsed >= approachCooldownUntil) {
            approachCooldownUntil = elapsed + APPROACH.cooldown;
          }
          if (!moved) {
            if (elapsed >= nextGroom && (!held || flat > 2)) {
              nextGroom = elapsed + GROOM.min + Math.random() * (GROOM.max - GROOM.min);
              mode = "groom";
              groomUntil = elapsed + GROOM.duration;
            } else if (elapsed >= nextWander && (!held || flat > 2.5)) {
              nextWander = elapsed + WANDER.min + Math.random() * (WANDER.max - WANDER.min);
              scratch.copy(HOME).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 1.6));
              travel(scratch, 0.2, HOP);
            } else if (!held && elapsed - lastPointerAt > SLEEP.after) api.rest();
          } else mode = "hop";
        }
      }

      // Hop integration.
      if (hop) {
        const { profile } = hop;
        hop.t += dt / profile.duration;
        const k = clamp(hop.t, 0, 1);
        const ease = k * k * (3 - 2 * k);
        root.position.lerpVectors(hopFrom, hopTo, ease);
        root.position.y = hop.height * 4 * k * (1 - k);
        if (hop.yaw !== undefined) facing.yaw = damp(facing.yaw, hop.yaw, 14, dt);
        pose.squash = k < 0.2 ? 1 - 0.2 * (1 - k / 0.2) : k > 0.85 ? 1 - 0.14 * ((k - 0.85) / 0.15) : 1 + 0.1 * Math.sin(k * Math.PI);
        if (hop.t >= 1 + profile.pause / profile.duration) {
          root.position.y = 0;
          hop = null;
        }
      } else {
        pose.squash = damp(pose.squash, 1, 8, dt);
        if (mode !== "bite") root.position.y = damp(root.position.y, 0, 12, dt);
      }
      root.rotation.y = facing.yaw;
      velocity.subVectors(root.position, lastPosition).multiplyScalar(1 / Math.max(dt, 1e-3));
      lastPosition.copy(root.position);

      // Where to look: the broom when there is one, otherwise the viewer.
      let lookYaw = 0, lookPitch = 0;
      const eyeTarget = mode === "eat" && eatPhase === "chew" ? carrot.position : held ? broomPos : null;
      if (eyeTarget) {
        scratch.copy(eyeTarget);
        root.worldToLocal(scratch);
        scratch.y -= 0.85;
        const dist = Math.hypot(scratch.x, scratch.z);
        const yaw = Math.atan2(scratch.x, scratch.z);
        lookYaw = clamp(yaw, -1.0, 1.0);
        lookPitch = clamp(Math.atan2(scratch.y, dist), -0.55, 0.6);
        // Turn the whole body when the broom is well off to one side, quickly when keen.
        if (!hop && mode !== "eat" && Math.abs(yaw) > 0.9) {
          facing.yaw = damp(facing.yaw, facing.yaw + yaw * 0.6, 1.2 + 3 * interest, dt);
        }
      } else if (!hop && mode !== "eat") facing.yaw = damp(facing.yaw, 0, 0.5, dt);
      look.yaw = damp(look.yaw, lookYaw, 7, dt);
      look.pitch = damp(look.pitch, lookPitch, 7, dt);

      // Expression.
      const target = { eye: 1, earLift: 0, nod: 0, tilt: 0, sink: 0, rear: 0, arms: 0, shake: 0 };
      target.earLift = interest * 0.35;
      if (mode === "pet") {
        target.eye = 0.22;
        target.tilt = Math.sin(elapsed * 3) * 0.12;
        target.earLift = -0.1;
      } else if (mode === "sleep") {
        target.eye = 0.06;
        target.nod = -0.3;
        target.sink = 1;
      } else if (mode === "bite") {
        target.shake = 1;
        target.eye = 0.7;
        target.earLift = 0.2;
      } else if (mode === "lunge") {
        target.eye = 1.15;
        target.nod = 0.25;
        target.arms = 1;
      } else if (mode === "rear") {
        target.rear = 1;
        target.arms = 0.8;
        target.nod = 0.35;
      } else if (mode === "eat" && eatPhase === "chew") {
        target.nod = -0.7 + Math.sin(elapsed * 9) * 0.06;
        target.eye = 0.8;
      } else if (mode === "groom") {
        target.rear = 0.5;
        target.arms = 1;
        target.nod = -0.5 + Math.sin(elapsed * 7) * 0.08;
        target.eye = 0.35;
      } else if (mode === "chase") {
        target.eye = 1.1;
        target.earLift = 0.45;
      }
      if (blink > 0) target.eye = Math.min(target.eye, 0.08);
      pose.eye = damp(pose.eye, target.eye, 14, dt);
      pose.earLift = damp(pose.earLift, target.earLift, 5, dt);
      pose.nod = damp(pose.nod, target.nod, 6, dt);
      pose.tilt = damp(pose.tilt, target.tilt, 5, dt);
      pose.sink = damp(pose.sink, target.sink, 3, dt);
      pose.rear = damp(pose.rear, target.rear, 6, dt);
      pose.arms = damp(pose.arms, target.arms, 8, dt);
      pose.shake = damp(pose.shake, target.shake, 10, dt);
      // Ears: they swing with the vertical motion and trail behind at speed.
      const flatSpeed = Math.hypot(velocity.x, velocity.z);
      pose.earSwing = damp(pose.earSwing, clamp(-velocity.y * 0.22, -0.55, 0.55), 6, dt);
      pose.earTrail = damp(pose.earTrail, clamp(flatSpeed * 0.12, 0, 0.7), 5, dt);

      // Apply.
      const breath = 1 + (mode === "sleep" ? 0.035 : 0.016) * Math.sin(elapsed * (mode === "sleep" ? 1.6 : 2.6));
      body.scale.set(1 + (1 - pose.squash) * 0.5, pose.squash * breath * (1 - 0.25 * pose.sink), 1 + (1 - pose.squash) * 0.4);
      body.rotation.x = -0.75 * pose.rear;
      body.position.y = 0.12 * pose.rear;
      neck.position.set(0, 0.78 - 0.18 * pose.sink + 0.42 * pose.rear, 0.3 + 0.12 * pose.sink - 0.1 * pose.rear);
      const shake = pose.shake * Math.sin(elapsed * 34) * 0.32;
      head.rotation.set(-look.pitch + pose.nod, look.yaw + shake, pose.tilt + shake * 0.4);
      arms.position.y = 0.32 * pose.arms + 0.1 * pose.rear;
      arms.position.z = -0.05 * pose.arms;
      arms.rotation.x = -1.2 * pose.arms;
      for (const ear of ears) {
        const side = ear.userData.side;
        // Hanging straight down at rest, swung by hops, lifted a little when keen.
        ear.rotation.z = side * (0.28 + 0.15 * pose.earLift) + side * pose.earSwing * 0.3;
        ear.rotation.x = 0.35 - pose.earLift * 0.9 - pose.earSwing + pose.earTrail + (mode === "sleep" ? 0.15 : 0) + shake * 0.5;
      }
      for (const eye of eyes) eye.scale.set(1, pose.eye, 1);
      nose.scale.set(1.2 + 0.08 * Math.sin(noseTwitch), 0.8 + 0.06 * Math.sin(noseTwitch), 0.7);

      // The carrot grows in when put down and shrinks as it is eaten, then fades away.
      if (eatPhase !== "chew") carrot.scale.setScalar(Math.max(0.001, damp(carrot.scale.x, carrotShown, 8, dt)));
      carrot.visible = carrot.scale.x > 0.01;

      api.touchSphere.center.copy(root.position).y += 0.6;
    },
    dispose() {
      scene.remove(root, carrot);
      for (const item of disposables) item.dispose?.();
    },
  };
  return api;
}
