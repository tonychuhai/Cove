import * as THREE from "three";
import { createFrameLoop } from "../../riverscape/src/frame-loop.js";
import { createScenery } from "./scene.js";
import { createRabbit } from "./rabbit.js";
import { createBroom, BROOM_Z } from "./broom.js";
import { createEffects } from "./effects.js";
import { createPetState } from "./pet-state.js";
import { createUI } from "./ui.js";

// The rabbit's room. Same host contract as Riverscape: the wallpaper drives the frame
// rate and power state through habitatRate/habitatPower, feeds through habitatFeed, and
// hands the cursor in as pointer events on #scene.

const canvas = document.querySelector("#scene");
const habitat = document.querySelector("#habitat");
const loading = document.querySelector("#loading");
const wallpaper = document.documentElement.dataset.motion === "host";
const query = new URLSearchParams(location.search);
let paused = !wallpaper && matchMedia("(prefers-reduced-motion: reduce)").matches;
if (query.get("still") === "1") paused = true;
let requestedRate = wallpaper ? 0 : 60;
let onBattery = false;
let loop = null;
let feedFromHost = null;

window.habitatRate = (fps) => {
  requestedRate = Number.isFinite(fps) && fps > 0 ? Math.min(120, fps) : 0;
  loop?.setRate(requestedRate);
};
window.habitatPower = (battery) => {
  onBattery = Boolean(battery);
};
window.habitatFeed = () => {
  if (feedFromHost && !paused && requestedRate > 0 && !document.hidden) feedFromHost();
};

function fail(error) {
  console.error(error);
  loading.textContent = error.message;
  loading.setAttribute("role", "alert");
  loading.removeAttribute("aria-hidden");
  loading.style.cssText = "display:grid;place-items:center;padding:2rem;color:#604331;font:16px sans-serif";
}

async function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xc9d8ee, 1);

  const scene = new THREE.Scene();
  const bounds0 = canvas.getBoundingClientRect();
  const aspect = bounds0.width > 0 && bounds0.height > 0 ? bounds0.width / bounds0.height : 16 / 9;
  const camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 60);
  camera.position.set(0, 1.55, 7.1);
  camera.lookAt(0, 0.95, 0);
  camera.updateMatrixWorld();

  const effects = createEffects(scene);
  const scenery = createScenery(scene, { camera, aspect });
  // Broad window reflections are especially important on the rabbit's dark eyes.
  const environment = new THREE.Scene();
  environment.background = new THREE.Color(0xa7b5c9);
  for (const [position, scale, color] of [
    [[3, 4, 2], [3, 4, 1], [2.6, 2.2, 1.75]],
    [[-3, 2, 3], [4, 3, 1], [0.45, 0.55, 0.72]],
  ]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(...scale.slice(0, 2)), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), side: THREE.DoubleSide }));
    panel.position.fromArray(position);
    panel.lookAt(0, 0.7, 0);
    environment.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflection = pmrem.fromScene(environment, 0.04, 0.1, 30);
  scene.environment = reflection.texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
  environment.traverse((item) => { item.geometry?.dispose(); item.material?.dispose(); });
  const broom = createBroom(scene, { camera, effects });
  const rabbit = await createRabbit(scene, { effects });
  const contactCanvas = document.createElement("canvas");
  contactCanvas.width = contactCanvas.height = 128;
  const contactContext = contactCanvas.getContext("2d");
  const contactGradient = contactContext.createRadialGradient(64, 64, 5, 64, 64, 64);
  contactGradient.addColorStop(0, "rgba(51,39,28,.48)");
  contactGradient.addColorStop(0.45, "rgba(51,39,28,.23)");
  contactGradient.addColorStop(1, "rgba(51,39,28,0)");
  contactContext.fillStyle = contactGradient;
  contactContext.fillRect(0, 0, 128, 128);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contactCanvas), transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  scene.add(contact);
  const pet = createPetState();
  const ui = createUI({ pet, wallpaper });

  // What the rabbit says and what it earns.
  let lastSaidAt = -Infinity;
  const say = (text, priority = false) => {
    const now = performance.now();
    if (!priority && now - lastSaidAt < 2500) return;
    lastSaidAt = now;
    ui.say(text);
  };
  pet.onChange((event, detail) => {
    if (detail?.text) say(detail.text, event !== "pet");
    ui.refresh();
  });
  rabbit.on("bite", () => pet.bite());
  rabbit.on("lunge", () => Math.random() < 0.4 && say(pet.line("lunge")));
  rabbit.on("miss", () => Math.random() < 0.5 && say(pet.line("miss")));
  rabbit.on("caught", () => say(pet.line("caught"), true));
  rabbit.on("pet", () => pet.pet());
  rabbit.on("sleep", () => pet.rest());
  rabbit.on("wake", () => pet.wake());
  const act = (action) => {
    if (paused) return;
    if (action === "feed") rabbit.feed(pet.feed());
    else if (action === "pet") {
      pet.pet();
      rabbit.cuddle();
    } else if (action === "play") {
      pet.play();
      rabbit.play();
    } else if (action === "rest") rabbit.rest();
  };
  ui.onAction(act);
  feedFromHost = () => act("feed");
  pet.arrive();
  ui.refresh();
  ui.tick();
  say(pet.line("greet"), true);
  let nextIdleLine = 40 + Math.random() * 40;
  let nextTick = 0;

  // Sizing.
  let contextLost = false, zeroSize = false;
  const visibility = () => loop?.setHidden(document.hidden || contextLost || zeroSize);
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    zeroSize = !(bounds.width > 0 && bounds.height > 0);
    visibility();
    if (zeroSize) return;
    const ratio = Math.min(devicePixelRatio || 1, wallpaper ? 1.5 : 2) * (onBattery ? 0.85 : 1);
    renderer.setPixelRatio(ratio);
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
    loop?.invalidate();
  }
  new ResizeObserver(resize).observe(habitat);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    visibility();
  });
  canvas.addEventListener("webglcontextrestored", () => location.reload());
  resize();

  // The pointer is the broom. Its ray is met with the broom's plane for the position,
  // and with the rabbit for touch. Speed is kept for petting versus waving.
  let pointer = null, lastPointerTime = 0;
  const raycaster = new THREE.Raycaster();
  const broomPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -BROOM_Z);
  const hit = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const touch = new THREE.Sphere();
  canvas.addEventListener("pointermove", (event) => {
    const bounds = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, (-(event.clientY - bounds.top) / bounds.height) * 2 + 1),
      camera,
    );
    if (!raycaster.ray.intersectPlane(broomPlane, hit)) return;
    const now = performance.now();
    if (pointer) {
      const seconds = Math.max(0.004, (now - lastPointerTime) / 1000);
      sample.subVectors(hit, pointer.position).divideScalar(seconds);
      pointer.velocity.lerp(sample, 0.5);
      pointer.position.copy(hit);
    } else pointer = { position: hit.clone(), velocity: new THREE.Vector3(), onRabbit: false, speed: 0 };
    touch.set(rabbit.touchSphere.center, rabbit.touchSphere.radius);
    pointer.onRabbit = raycaster.ray.intersectsSphere(touch);
    lastPointerTime = now;
  });
  canvas.addEventListener("pointerleave", () => {
    pointer = null;
  });
  // In a browser the broom stands in for the cursor while the scene runs.
  const showCursor = () => {
    canvas.style.cursor = paused || requestedRate === 0 ? "" : "none";
  };
  showCursor();
  document.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.code === "Space") {
      event.preventDefault();
      paused = !paused;
      loop?.setPaused(paused);
      showCursor();
    }
    if (event.key.toLowerCase() === "f") {
      if (document.fullscreenElement) document.exitFullscreen();
      else habitat.requestFullscreen().catch((error) => console.warn(error.message));
    }
  });

  const headPoint = new THREE.Vector3();
  let time = 0, ready = false, renderedFrames = 0;
  function renderFrame(dt, now) {
    const total = Math.min(0.1, dt);
    const steps = Math.max(1, Math.round(total * 60));
    const step = total / steps;
    if (pointer) {
      pointer.speed = pointer.velocity.length();
      if (now - lastPointerTime > 60) pointer.velocity.multiplyScalar(Math.exp(-dt * 12));
    }
    for (let i = 0; total > 0 && i < steps; i++) {
      time += step;
      broom.update(step, pointer);
      rabbit.update(step, { broom, pointer });
      effects.update(step);
      scenery.update(step);
    }
    if (time >= nextTick) {
      nextTick = time + 1;
      ui.tick();
    }
    if (time >= nextIdleLine) {
      nextIdleLine = time + 45 + Math.random() * 45;
      if (rabbit.mode === "idle" || rabbit.mode === "groom") say(pet.line("idle"));
    }
    // The bubble follows the rabbit's head.
    headPoint.copy(rabbit.root.position).add(sample.set(0, 1.45, 0.25)).project(camera);
    const bounds = canvas.getBoundingClientRect();
    ui.placeBubble(bounds.left + ((headPoint.x + 1) / 2) * bounds.width, bounds.top + ((1 - headPoint.y) / 2) * bounds.height - 8);

    contact.position.set(rabbit.root.position.x, -0.008, rabbit.root.position.z - 0.06);
    contact.rotation.z = -rabbit.root.rotation.y;
    contact.material.opacity = Math.max(0.06, 0.85 - rabbit.root.position.y * 0.65);
    renderer.render(scene, camera);
    renderedFrames++;
    if (!ready) {
      ready = true;
      loading.style.opacity = 0;
      setTimeout(() => {
        loading.hidden = true;
      }, 900);
    }
  }
  loop = createFrameLoop(renderFrame, { fps: requestedRate, paused, hidden: document.hidden || zeroSize || contextLost });
  setInterval(() => pet.tick(), 60000);
  window.addEventListener("pagehide", () => {
    pet.flush();
    loop.setHidden(true);
  });
  window.addEventListener("pageshow", visibility);
  window.habitatStats = () => ({
    renderedFrames,
    simulationTime: time,
    rabbit: { mode: rabbit.mode, interest: rabbit.interest, at: rabbit.root.position.toArray() },
    broom: { held: broom.held, waving: broom.waving, at: broom.position.toArray() },
    pet: { ...pet.state },
    drawCalls: renderer.info.render.calls,
    loop: loop.state,
  });
}

start().catch(fail);
