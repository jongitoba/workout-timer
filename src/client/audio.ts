// Beeps made with Web Audio, so there are no sound files to download.
// Browsers only allow audio after a user gesture: call unlockAudio() from the Start tap.
import type { Cue } from '../lib/timer.ts';

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    // iOS only unlocks output after something is actually played.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start();
  } catch {
    ctx = null; // No Web Audio: the timer still works, just silently.
  }
}

function tone(freq: number, seconds: number, volume: number, delay = 0): void {
  if (!ctx || volume <= 0) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  // Short attack and release, otherwise the beep clicks.
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume * 0.25, t + 0.01);
  gain.gain.setValueAtTime(volume * 0.25, t + seconds - 0.03);
  gain.gain.linearRampToValueAtTime(0, t + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + seconds + 0.02);
}

/**
 * tick: short mid beep for 3-2-1. start of work: long high beep.
 * start of rest: long low beep. halfway: two quick beeps. finish: three high beeps.
 * The start of the get-ready phase is silent; the Start tap is feedback enough.
 */
export function playCue(cue: Cue, volume: number): void {
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  switch (cue.kind) {
    case 'tick':
      tone(880, 0.12, volume);
      break;
    case 'start':
      if (cue.phase === 'work') tone(1320, 0.45, volume);
      else if (cue.phase === 'rest') tone(587, 0.45, volume);
      break;
    case 'half':
      tone(1100, 0.08, volume);
      tone(1100, 0.08, volume, 0.14);
      break;
    case 'finish':
      for (let i = 0; i < 3; i++) tone(1320, 0.18, volume, i * 0.25);
      break;
  }
}
