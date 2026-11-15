import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatClock, formatElapsed, formatRemaining, formatShort, parseDuration, stepDuration,
} from '../src/lib/format.ts';

test('formatClock', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(75), '1:15');
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatClock(-5), '0:00');
});

test('formatShort', () => {
  assert.equal(formatShort(20), '20 s');
  assert.equal(formatShort(720), '12 min');
  assert.equal(formatShort(90), '1:30');
});

test('countdown rounds up, count-up rounds down', () => {
  assert.equal(formatRemaining(20_000), '0:20');
  assert.equal(formatRemaining(19_200), '0:20');
  assert.equal(formatRemaining(400), '0:01');
  assert.equal(formatRemaining(0), '0:00');
  assert.equal(formatElapsed(59_999), '0:59');
  assert.equal(formatElapsed(60_000), '1:00');
});

test('parseDuration accepts m:ss with :, . or ,', () => {
  assert.equal(parseDuration('1:30'), 90);
  assert.equal(parseDuration('1.30'), 90);
  assert.equal(parseDuration('1,30'), 90);
  assert.equal(parseDuration(' 0:05 '), 5);
  assert.equal(parseDuration('1:02:05'), 3725);
});

test('parseDuration: plain numbers use the field unit', () => {
  assert.equal(parseDuration('45'), 45);
  assert.equal(parseDuration('12', 60), 720);
  assert.equal(parseDuration('12.5', 60), 750);
  assert.equal(parseDuration('12,5', 60), 750);
});

test('parseDuration rejects garbage', () => {
  for (const bad of ['', 'abc', '1:75', '1:5', '-3', '1:2:3', '1:00:75']) {
    assert.equal(parseDuration(bad), null, bad);
  }
});

test('stepDuration snaps to a grid that widens with the value', () => {
  assert.equal(stepDuration(20, 1, 0, 3600), 25);
  assert.equal(stepDuration(23, 1, 0, 3600), 25);
  assert.equal(stepDuration(23, -1, 0, 3600), 20);
  assert.equal(stepDuration(60, -1, 0, 3600), 55);
  assert.equal(stepDuration(60, 1, 0, 3600), 75);
  assert.equal(stepDuration(300, 1, 0, 3600), 330);
  assert.equal(stepDuration(1200, 1, 0, 3600), 1260);
  assert.equal(stepDuration(0, -1, 0, 3600), 0);
  assert.equal(stepDuration(3600, 1, 0, 3600), 3600);
  assert.equal(stepDuration(5, -1, 1, 3600), 1);
});
