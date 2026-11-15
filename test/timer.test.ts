import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cuesBetween, skipTarget, stateAt } from '../src/lib/timer.ts';
import { buildPlan, type WorkoutConfig } from '../src/lib/workouts.ts';

// 5 s prep, then 20 s work, 10 s rest, 20 s work = 55 s.
const cfg: WorkoutConfig = { mode: 'tabata', work: 20, rest: 10, rounds: 2, sets: 1, setRest: 0 };
const plan = buildPlan(cfg, 5);

test('stateAt walks through the segments', () => {
  assert.equal(stateAt(plan, 0).segment!.phase, 'prep');
  assert.equal(stateAt(plan, 4_999).segment!.phase, 'prep');
  const work = stateAt(plan, 5_000);
  assert.equal(work.segment!.phase, 'work');
  assert.equal(work.segRemaining, 20_000);
  assert.equal(stateAt(plan, 25_000).segment!.phase, 'rest');
  assert.equal(stateAt(plan, 35_000).index, 3);
  const done = stateAt(plan, 55_000);
  assert.equal(done.done, true);
  assert.equal(done.remaining, 0);
  assert.equal(stateAt(plan, -100).elapsed, 0);
});

test('cues for a whole run: start of each segment, 3-2-1 before each end, finish', () => {
  const cues = cuesBetween(plan, -1, 55_000).map((c) => `${c.kind}@${c.at / 1000}`);
  assert.deepEqual(cues, [
    'start@0',
    'tick@2', 'tick@3', 'tick@4',
    'start@5',
    'tick@22', 'tick@23', 'tick@24',
    'start@25',
    'tick@32', 'tick@33', 'tick@34',
    'start@35',
    'tick@52', 'tick@53', 'tick@54',
    'finish@55',
  ]);
});

test('cues are split cleanly across ticks (no doubles, no gaps)', () => {
  const all = cuesBetween(plan, -1, 55_000);
  const stepped = [];
  let prev = -1;
  for (let t = 0; t <= 55_000; t += 16) {
    stepped.push(...cuesBetween(plan, prev, t));
    prev = t;
  }
  stepped.push(...cuesBetween(plan, prev, 55_000));
  assert.deepEqual(stepped, all);
});

test('short segments get only the ticks that fit', () => {
  const short = buildPlan({ mode: 'tabata', work: 2, rest: 0, rounds: 1, sets: 1, setRest: 0 }, 0);
  assert.deepEqual(cuesBetween(short, -1, 2_000).map((c) => `${c.kind}@${c.at}`), ['start@0', 'tick@1000', 'finish@2000']);
});

test('open-ended For Time never finishes or ticks on its own', () => {
  const open = buildPlan({ mode: 'fortime', cap: 0 }, 0);
  assert.deepEqual(cuesBetween(open, -1, 3_600_000).map((c) => c.kind), ['start']);
  assert.equal(stateAt(open, 3_600_000).done, false);
  assert.equal(skipTarget(open, 1_000), Infinity);
});

test('skipTarget jumps to the end of the current segment', () => {
  assert.equal(skipTarget(plan, 1_000), 5_000);
  assert.equal(skipTarget(plan, 10_000), 25_000);
  assert.equal(skipTarget(plan, 40_000), 55_000);
  assert.equal(skipTarget(plan, 60_000), 55_000);
});
