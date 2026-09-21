import assert from 'node:assert/strict';
import { LOOKS, createTurntable, savedLook, figureBounds, figureHit, sampleTurn } from '../src/turntable.js';

assert.equal(savedLook('{broken'), 1);
assert.equal(savedLook('{"look":99}'), 1);
assert.equal(savedLook('{"look":0}'), 0);
const model = createTurntable(0);
for (let turn = 0; turn < LOOKS.length; turn++) {
  const from = model.state.current, to = (from + 1) % LOOKS.length;
  assert(model.request());
  assert.equal(model.request(), false, 'rapid clicks must not queue extra turns');
  let previousAngle = 0, seenBack = false, completed = false;
  for (let frame = 0; frame < 90; frame++) {
    completed = model.tick(1 / 60);
    const s = model.state;
    if (s.turning) {
      assert(s.angle >= previousAngle, 'rotation must move consistently around the body');
      assert.equal(s.visible, s.angle >= 4 ? to : from, 'outfit only changes while back-facing');
      if (s.angle >= 4 && s.angle < 5) seenBack = true;
      previousAngle = s.angle;
    }
    if (completed) break;
  }
  assert(completed && seenBack);
  assert.equal(model.state.current, to);
  assert.equal(model.state.angle, 0, 'finish with a front-facing portrait');
}
assert.equal(model.state.current, 0, 'four clicks cycle all outfits');
model.request(3, true);
assert.equal(model.state.current, 3);
assert.equal(model.state.turning, false, 'reduced motion changes directly');
assert.equal(model.request(3), false);
assert.equal(model.request(-1), false);
model.request(1);
const frozen = model.state;
model.tick(0); model.tick(NaN);
assert.deepEqual(model.state, frozen, 'zero elapsed time cannot advance a paused transition');
for (const [width, height] of [[1440, 900], [390, 844], [1920, 1080]]) {
  const b = figureBounds(width, height);
  assert(b.x >= 0 && b.x + b.w <= width && b.y + b.h < height);
  assert(figureHit(b.x + b.w / 2, b.y + b.h / 2, b));
  assert(!figureHit(0, 0, b), 'background clicks cannot change the outfit');
}
// Sample the whole turn at display cadence, including both sides of all pose seams.
// There must be no early interval of a key pose where the portrait stops changing.
let previousPosition = -1;
for (let step = 0; step < 480; step++) {
  const angle = step / 60;
  const sample = sampleTurn(angle);
  const reconstructed = sample.frameA + sample.poseMix;
  assert(reconstructed > previousPosition, 'every moving frame must advance the interpolation');
  assert(sample.poseMix >= 0 && sample.poseMix < 1);
  assert(sample.outfitMix >= 0 && sample.outfitMix <= 1);
  previousPosition = reconstructed;
}
for (let seam = 1; seam <= 8; seam++) {
  const before = sampleTurn(seam - 1e-6), after = sampleTurn(seam + 1e-6);
  assert.equal(before.frameB, after.frameA, 'neighboring pose blends share their boundary photograph');
  assert(before.poseMix > 0.999 && after.poseMix < 0.001);
}
assert(sampleTurn(0.25).poseMix > 0, 'the first 70% of a pose must no longer be held still');
assert.equal(sampleTurn(3).outfitMix, 0);
assert(Math.abs(sampleTurn(4).outfitMix - 0.5) < 1e-12);
assert.equal(sampleTurn(5).outfitMix, 1);
console.log('Muse: four-look cycle, back-facing switch, rapid clicks, reduced motion, pause and hit areas passed.');
