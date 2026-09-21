import { register } from "node:module";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

register("../../riverscape/tests/three-loader.mjs", import.meta.url);
const THREE = await import("three");
const { createRabbit } = await import("../src/rabbit.js");
const { buildBlenderRabbit, loadBlenderRabbit } = await import("../src/blender-rabbit.js");

// A tiny binary export exercises the same decoder as the full Blender asset.
const binary = new ArrayBuffer(120);
new Float32Array(binary, 0, 9).set([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0]);
new Float32Array(binary, 36, 9).set([0, 0, 1, 0, 0, 1, 0, 0, 1]);
new Float32Array(binary, 72, 9).fill(1);
new Uint32Array(binary, 108, 3).set([0, 1, 2]);
const manifest = {
  version: 1,
  buffers: "rabbit.bin",
  materials: { fur: { roughness: 0.9, vertexColors: true } },
  meshes: ["body", "head", "earL", "earR", "eyeL", "eyeR", "nose", "arms"].map((parent) => ({
    name: `test-${parent}`, parent, material: "fur", position: [0, 0, 0],
    positions: { offset: 0, count: 9 }, normals: { offset: 36, count: 9 },
    colors: { offset: 72, count: 9 }, indices: { offset: 108, count: 3 },
  })),
};
const fixture = (options) => buildBlenderRabbit(manifest, binary, options);
const model = fixture({ shadows: true });
assert.equal(model.ears[0].parent, model.head);
assert.equal(model.arms.parent, model.body);
assert.deepEqual(model.neck.position.toArray(), [0, 0.78, 0.3]);
assert.equal(model.body.children.find((child) => child.isMesh).material.isMeshStandardMaterial, true);
let geometryDisposals = 0;
model.root.traverse((node) => node.geometry?.addEventListener("dispose", () => geometryDisposals++));
model.dispose();
assert.equal(geometryDisposals, manifest.meshes.length, "Unloading releases every exported mesh");
const mixedMaterials = structuredClone(manifest);
mixedMaterials.materials.strands = { color: [0.1, 0.2, 0.3], vertexColors: true, roughness: 0.86 };
mixedMaterials.materials.eye = { color: [0.015, 0.008, 0.005], roughness: 0.095 };
mixedMaterials.meshes[0].material = "strands";
mixedMaterials.meshes[4].material = "eye";
delete mixedMaterials.meshes[4].colors;
const mixedModel = buildBlenderRabbit(mixedMaterials, binary);
const strands = mixedModel.root.getObjectByName("test-body");
assert.deepEqual(strands.material.color.toArray(), [0.1, 0.2, 0.3], "Exported material RGB remains in linear color space");
assert.equal(strands.material.side, THREE.DoubleSide);
assert.equal(strands.castShadow, false, "Fine fur uses the base mesh shadow");
const eye = mixedModel.root.getObjectByName("test-eyeL");
assert.equal(eye.material.isMeshPhysicalMaterial, true);
assert.equal(eye.geometry.getAttribute("color"), undefined, "Single-color materials do not require vertex colors");
assert.equal(eye.castShadow, true);
assert.equal(eye.material.roughness, 0.095);
mixedModel.dispose();
const missingColors = structuredClone(manifest);
delete missingColors.meshes[0].colors;
assert.throws(() => buildBlenderRabbit(missingColors, binary), /invalid.*colors buffer range/, "Vertex-colored fur requires color data");
const damaged = structuredClone(manifest);
damaged.meshes[0].positions.offset = 119;
assert.throws(() => buildBlenderRabbit(damaged, binary), /invalid.*positions buffer range/);
const invalidIndices = binary.slice(0);
new Uint32Array(invalidIndices, 108, 3)[2] = 99;
assert.throws(() => buildBlenderRabbit(manifest, invalidIndices), /inconsistent geometry/);
await assert.rejects(loadBlenderRabbit({ fetcher: async () => ({ ok: false, status: 404 }) }), /兔子 Blender 模型加载失败.*404/);
const visited = [];
const fetched = await loadBlenderRabbit({
  modelUrl: "https://example.test/models/rabbit.json",
  fetcher: async (url) => {
    visited.push(url.href);
    return { ok: true, json: async () => manifest, arrayBuffer: async () => binary };
  },
});
assert.deepEqual(visited, ["https://example.test/models/rabbit.json", "https://example.test/models/rabbit.bin"]);
fetched.dispose();

const STEP = 1 / 60;
const events = [];
const effects = { burst() {} };
const scene = new THREE.Scene();
const rabbit = await createRabbit(scene, { effects, modelLoader: fixture, random: () => 0.5 });
for (const event of ["bite", "lunge", "caught", "sleep", "wake", "pet", "ate"]) rabbit.on(event, () => events.push(event));
let tugs = 0;
const broom = {
  held: true, waving: 1,
  position: new THREE.Vector3(2.5, 0.95, 0.6), velocity: new THREE.Vector3(),
  bite(point) { assert.ok(point.toArray().every(Number.isFinite)); tugs++; },
};
const modes = new Set();
let maxJump = 0;
const startX = rabbit.root.position.x;
for (let frame = 0; frame < 600; frame++) {
  rabbit.update(STEP, { broom, pointer: null });
  scene.updateMatrixWorld(true);
  modes.add(rabbit.mode);
  maxJump = Math.max(maxJump, rabbit.root.position.y);
  rabbit.root.traverse((node) => assert.ok([...node.position.toArray(), ...node.scale.toArray(), ...node.quaternion.toArray()].every(Number.isFinite)));
}
assert.ok(rabbit.root.position.x > startX + 1.5, "A waved broom makes the rabbit cross the floor toward it");
assert.ok(modes.has("chase"), "The moving broom must trigger chase");
assert.ok(maxJump > 0.3, "Chasing must include visible hops");
assert.ok(events.includes("bite") && tugs > 0, "The rabbit catches and tugs the broom");
assert.ok(events.includes("caught"), "Three bites should complete the satisfied interaction");
broom.held = false;
broom.waving = 0;
const biteCount = events.filter((event) => event === "bite").length;
for (let frame = 0; frame < 300; frame++) rabbit.update(STEP, { broom, pointer: null });
assert.equal(events.filter((event) => event === "bite").length, biteCount, "No new bites after the broom leaves");
assert.ok(rabbit.root.position.y < 0.01, "The rabbit comes back to the floor");
assert.equal(rabbit.interest, 0, "Interest fades without the broom");

rabbit.rest();
for (let frame = 0; frame < 120; frame++) rabbit.update(STEP, { broom: null, pointer: null });
assert.equal(rabbit.mode, "sleep");
assert.ok(rabbit.eyes.every((eye) => eye.scale.y < 0.1), "The loaded model's eyes close during sleep");
rabbit.cuddle();
for (let frame = 0; frame < 90; frame++) rabbit.update(STEP, { broom: null, pointer: null });
assert.equal(rabbit.mode, "pet");
assert.ok(events.includes("wake") && events.includes("pet"), "Petting wakes it and still earns affection");
rabbit.feed(true);
for (let frame = 0; frame < 540; frame++) rabbit.update(STEP, { broom: null, pointer: null });
assert.ok(events.includes("ate"), "The rabbit reaches and finishes the carrot");
assert.notEqual(rabbit.mode, "eat");
rabbit.dispose();
assert.equal(scene.children.length, 0, "Both model and carrot leave the scene on disposal");

// Production-asset mode also catches export/schema errors before shipping.
if (process.argv.includes("--model")) {
  const url = new URL("../assets/rabbit.json", import.meta.url);
  const asset = JSON.parse(await readFile(url, "utf8"));
  const bytes = await readFile(new URL(asset.buffers, url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const actual = buildBlenderRabbit(asset, buffer);
  const box = new THREE.Box3().setFromObject(actual.root);
  assert.ok(!box.isEmpty() && box.min.toArray().concat(box.max.toArray()).every(Number.isFinite));
  for (const parent of ["body", "head", "earL", "earR", "eyeL", "eyeR", "nose"]) {
    assert.ok(actual[parent].children.some((child) => child.isMesh), `Production export includes ${parent}`);
  }
  actual.dispose();
  console.log(`Blender asset: ${asset.meshes.length} meshes, ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MiB; bounds ${box.min.toArray()} to ${box.max.toArray()}`);
}
console.log("Rabbit model loading, chase/bite/release, sleep/pet/feed and disposal checks passed.");
