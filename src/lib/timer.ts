// Pure timer logic: where in a Plan we are at a given elapsed time, and which
// sound/flash cues happen between two moments. The page only tracks elapsed time.
import type { Phase, Plan, Segment } from './workouts.ts';

export type TimerState = {
  done: boolean;
  /** Index of the current segment; segments.length when done. */
  index: number;
  segment: Segment | null;
  /** Milliseconds into the current segment. */
  segElapsed: number;
  /** Milliseconds left of the current segment (Infinity if open-ended). */
  segRemaining: number;
  elapsed: number;
  /** Milliseconds left of the whole plan (Infinity if open-ended). */
  remaining: number;
};

export function stateAt(plan: Plan, elapsed: number): TimerState {
  const e = Math.max(0, elapsed);
  if (e >= plan.total) {
    return {
      done: true, index: plan.segments.length, segment: null,
      segElapsed: 0, segRemaining: 0, elapsed: plan.total, remaining: 0,
    };
  }
  let index = 0;
  while (index < plan.segments.length - 1 && e >= plan.segments[index]!.start + plan.segments[index]!.duration) {
    index++;
  }
  const segment = plan.segments[index]!;
  const segElapsed = e - segment.start;
  return {
    done: false, index, segment, segElapsed,
    segRemaining: segment.duration - segElapsed,
    elapsed: e, remaining: plan.total - e,
  };
}

/**
 * - tick: one of the last three seconds of a timed segment
 * - start: a segment begins (phase tells which)
 * - half: halfway through a work segment (only when asked for)
 * - finish: the whole plan is over
 */
export type Cue =
  | { kind: 'tick'; at: number }
  | { kind: 'start'; at: number; phase: Phase; index: number }
  | { kind: 'half'; at: number }
  | { kind: 'finish'; at: number };

export const COUNTDOWN_TICKS = 3;

export type CueOptions = {
  /** Beep halfway through each timed work segment. */
  halfway?: boolean;
};

/**
 * All cues with `from < at <= to`, in time order. Pass from = -1 to include t = 0.
 * The halfway cue is left out when it would fall inside the 3-2-1 countdown.
 */
export function cuesBetween(plan: Plan, from: number, to: number, options: CueOptions = {}): Cue[] {
  const cues: Cue[] = [];
  const within = (at: number) => from < at && at <= to;
  plan.segments.forEach((seg, index) => {
    if (within(seg.start)) cues.push({ kind: 'start', at: seg.start, phase: seg.phase, index });
    const end = seg.start + seg.duration;
    if (!Number.isFinite(end)) return;
    if (options.halfway && seg.phase === 'work' && seg.duration / 2 > COUNTDOWN_TICKS * 1000) {
      const at = seg.start + seg.duration / 2;
      if (within(at)) cues.push({ kind: 'half', at });
    }
    for (let k = 1; k <= COUNTDOWN_TICKS; k++) {
      const at = end - k * 1000;
      if (at > seg.start && within(at)) cues.push({ kind: 'tick', at });
    }
  });
  if (Number.isFinite(plan.total) && plan.segments.length > 0 && within(plan.total)) {
    cues.push({ kind: 'finish', at: plan.total });
  }
  return cues.sort((a, b) => a.at - b.at);
}

/** Where "skip" jumps to: the end of the current segment, capped to the plan's end. */
export function skipTarget(plan: Plan, elapsed: number): number {
  const s = stateAt(plan, elapsed);
  if (s.done || !s.segment) return plan.total;
  return s.segment.start + s.segment.duration;
}
