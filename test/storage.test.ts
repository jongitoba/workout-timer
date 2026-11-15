import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, emptyStored, MAX_PRESETS, parseStored, serializeStored } from '../src/lib/storage.ts';

test('missing or corrupt storage gives defaults', () => {
  assert.deepEqual(parseStored(null), emptyStored());
  assert.deepEqual(parseStored('not json{'), emptyStored());
  assert.deepEqual(parseStored('"a string"'), emptyStored());
  assert.deepEqual(parseStored('[]').settings, DEFAULT_SETTINGS);
});

test('round trip', () => {
  const s = emptyStored();
  s.settings = { prep: 5, sound: false, volume: 0.3, halfway: true, flash: false, wakeLock: true };
  s.presets.push({ id: 'a', name: 'Mandag', config: { mode: 'emom', every: 90, rounds: 12 } });
  s.last.amrap = { mode: 'amrap', duration: 900 };
  assert.deepEqual(parseStored(serializeStored(s)), s);
});

test('invalid settings are clamped or replaced', () => {
  const s = parseStored(JSON.stringify({ settings: { prep: 999, volume: -1, sound: 'yes', flash: false } }));
  assert.deepEqual(s.settings, { ...DEFAULT_SETTINGS, prep: 60, volume: 0, flash: false });
});

test('bad presets are dropped, names trimmed and capped', () => {
  const presets = [
    { id: 'ok', name: '  Fredag  ', config: { mode: 'tabata' } },
    { id: 'no-config', name: 'x' },
    { id: 'bad-mode', name: 'x', config: { mode: 'zumba' } },
    { id: 5, name: 'x', config: { mode: 'amrap' } },
    { id: 'blank', name: '   ', config: { mode: 'amrap' } },
    { id: 'long', name: 'x'.repeat(100), config: { mode: 'amrap' } },
    null,
  ];
  const s = parseStored(JSON.stringify({ presets }));
  assert.deepEqual(s.presets.map((p) => p.id), ['ok', 'long']);
  assert.equal(s.presets[0]!.name, 'Fredag');
  assert.equal(s.presets[1]!.name.length, 40);
  const many = Array.from({ length: 80 }, (_, i) => ({ id: String(i), name: 'p', config: { mode: 'amrap' } }));
  assert.equal(parseStored(JSON.stringify({ presets: many })).presets.length, MAX_PRESETS);
});

test('last config is only kept under its own mode', () => {
  const s = parseStored(JSON.stringify({ last: { amrap: { mode: 'emom' }, emom: { mode: 'emom', every: 30 } } }));
  assert.equal(s.last.amrap, undefined);
  assert.deepEqual(s.last.emom, { mode: 'emom', every: 30, rounds: 10 });
});
