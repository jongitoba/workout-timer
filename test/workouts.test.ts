import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPlan, describeConfig, MODE_INFO, MODES, modeBySlug, normalizeConfig, segmentCaption, setField,
  workoutSeconds, type WorkoutConfig,
} from '../src/lib/workouts.ts';

const phases = (cfg: WorkoutConfig, prep = 0) =>
  buildPlan(cfg, prep).segments.map((s) => `${s.phase}:${s.duration / 1000}`);

test('default Tabata is 8 × 20/10, ending on work (3:50)', () => {
  const plan = buildPlan(MODE_INFO.tabata.defaults, 10);
  assert.equal(plan.segments[0]!.phase, 'prep');
  assert.equal(plan.segments.filter((s) => s.phase === 'work').length, 8);
  assert.equal(plan.segments.filter((s) => s.phase === 'rest').length, 7);
  assert.equal(plan.segments.at(-1)!.phase, 'work');
  assert.equal(workoutSeconds(MODE_INFO.tabata.defaults), 230);
  assert.equal(plan.total, 240_000);
});

test('segments are contiguous', () => {
  for (const mode of MODES) {
    const plan = buildPlan(MODE_INFO[mode].defaults, 10);
    let t = 0;
    for (const s of plan.segments) {
      assert.equal(s.start, t, mode);
      t += s.duration;
    }
    assert.equal(plan.total, t, mode);
  }
});

test('sets: the last rest of a set becomes the set rest', () => {
  const cfg: WorkoutConfig = { mode: 'tabata', work: 30, rest: 15, rounds: 2, sets: 2, setRest: 60 };
  assert.deepEqual(phases(cfg), ['work:30', 'rest:15', 'work:30', 'rest:60', 'work:30', 'rest:15', 'work:30']);
  const setRest = buildPlan(cfg, 0).segments[3]!;
  assert.equal(setRest.betweenSets, true);
  assert.equal(segmentCaption(setRest), 'Neste: sett 2 av 2');
});

test('zero rest and zero prep produce no empty segments', () => {
  const cfg: WorkoutConfig = { mode: 'tabata', work: 30, rest: 0, rounds: 3, sets: 1, setRest: 0 };
  assert.deepEqual(phases(cfg, 0), ['work:30', 'work:30', 'work:30']);
});

test('EMOM: one work segment per round', () => {
  const cfg: WorkoutConfig = { mode: 'emom', every: 120, rounds: 5 };
  assert.deepEqual(phases(cfg), Array(5).fill('work:120'));
  assert.equal(segmentCaption(buildPlan(cfg, 0).segments[2]!), 'Runde 3 av 5');
});

test('AMRAP: one countdown segment', () => {
  const plan = buildPlan({ mode: 'amrap', duration: 600 }, 5);
  assert.deepEqual(plan.segments.map((s) => [s.phase, s.countUp]), [['prep', false], ['work', false]]);
  assert.equal(plan.total, 605_000);
});

test('For Time counts up, open-ended without a cap', () => {
  const capped = buildPlan({ mode: 'fortime', cap: 900 }, 0);
  assert.equal(capped.segments[0]!.countUp, true);
  assert.equal(capped.total, 900_000);
  const open = buildPlan({ mode: 'fortime', cap: 0 }, 10);
  assert.equal(open.total, Infinity);
  assert.equal(workoutSeconds({ mode: 'fortime', cap: 0 }), Infinity);
});

test('normalizeConfig clamps, fills defaults and rejects junk', () => {
  assert.equal(normalizeConfig(null), null);
  assert.equal(normalizeConfig({ mode: 'yoga' }), null);
  assert.deepEqual(normalizeConfig({ mode: 'tabata', work: 0, rounds: 1000, rest: 'x' }), {
    mode: 'tabata', work: 1, rest: 10, rounds: 99, sets: 1, setRest: 60,
  });
  assert.deepEqual(normalizeConfig({ mode: 'amrap', duration: 61.6, extra: 1 }), { mode: 'amrap', duration: 62 });
});

test('saved Intervall workouts and links become Tabata', () => {
  assert.deepEqual(normalizeConfig({ mode: 'interval', work: 40, rest: 20, rounds: 10, sets: 2, setRest: 90 }), {
    mode: 'tabata', work: 40, rest: 20, rounds: 10, sets: 2, setRest: 90,
  });
  assert.equal(modeBySlug('intervall'), 'tabata');
});

test('setField clamps to the field limits', () => {
  const cfg = setField(MODE_INFO.emom.defaults, 'rounds', 500);
  assert.equal((cfg as { rounds: number }).rounds, 99);
  assert.equal(setField(cfg, 'nope', 5), cfg);
});

test('every mode has a unique slug and valid defaults', () => {
  const slugs = MODES.map((m) => MODE_INFO[m].slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const m of MODES) {
    assert.equal(modeBySlug(MODE_INFO[m].slug), m);
    assert.deepEqual(normalizeConfig(MODE_INFO[m].defaults), MODE_INFO[m].defaults);
  }
});

test('describeConfig', () => {
  assert.equal(describeConfig(MODE_INFO.tabata.defaults), '20 s / 10 s × 8');
  assert.equal(describeConfig({ mode: 'tabata', work: 40, rest: 20, rounds: 5, sets: 3, setRest: 60 }), '40 s / 20 s × 5 × 3 sett');
  assert.equal(describeConfig({ mode: 'amrap', duration: 720 }), '12 min');
  assert.equal(describeConfig({ mode: 'emom', every: 60, rounds: 10 }), 'Hvert 1 min × 10');
  assert.equal(describeConfig({ mode: 'fortime', cap: 0 }), 'Uten tidsgrense');
});
