import assert from "node:assert/strict";
import { Rng } from "../src/rng.js";
import { SPECIES, generateBatch, NAMES } from "../src/species.js";
import { Animal, gazeToward, BOOP } from "../src/animal.js";
import { gridFor, savedBatch } from "../src/layout.js";

assert.equal(SPECIES.length, 15);
assert(NAMES.length >= 40);

const same = generateBatch(8, new Rng(42));
const again = generateBatch(8, new Rng(42));
assert.deepEqual(same.map((a) => [a.spec.id, a.name]), again.map((a) => [a.spec.id, a.name]));
assert.equal(same.length, 8);
assert.equal(new Set(same.map((a) => a.name)).size, 8);

const wide = gridFor(1440, 900);
assert.equal(wide.cols, 6);
assert(wide.rows >= 2 && wide.count === wide.cols * wide.rows);
assert.equal(gridFor(390, 844).cols, 2);
assert.deepEqual(savedBatch('{"seed":99,"batch":4}'), { seed: 99, batch: 4 });
assert.equal(savedBatch("{broken}").batch, 1);

const g = gazeToward({ cx: 100, cy: 100 }, 400, 100, 200);
assert(g.yaw > 0.9);
assert.equal(g.pitch, 0);

const rng = new Rng(7);
const one = generateBatch(1, rng)[0];
const animal = new Animal(one, 1, 1, rng, 0, 0);
animal.cx = 100;
animal.cy = 100;
const world = {
  pointer: { x: 220, y: 100, active: true },
  R: 40,
  cell: 200,
  say: () => false,
  emit() {},
  neighborsOf: () => [],
};
animal.attentive = true;
for (let i = 0; i < 30; i++) animal.update(1 / 60, 1 + i / 60, world);
assert(animal.s.yaw > 0.15, "an attentive animal must turn toward the pointer");
animal.boop(2, world);
assert.equal(animal.action.def, BOOP);
console.log("Critters: catalog, seeded batches, layout, gaze and boop passed.");
