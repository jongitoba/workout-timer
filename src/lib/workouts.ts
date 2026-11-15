// Workout modes, their settings, and how a configuration becomes a timeline (a Plan).
// Strings shown to visitors are Norwegian; everything else is English.
import { formatShort } from './format.ts';

export const MODES = ['tabata', 'amrap', 'emom', 'fortime'] as const;
export type Mode = (typeof MODES)[number];

export type TabataConfig = {
  mode: 'tabata';
  /** Seconds of work per round. */
  work: number;
  /** Seconds of rest between rounds. */
  rest: number;
  rounds: number;
  sets: number;
  /** Seconds of pause between sets, after the set's last rest. */
  setRest: number;
};
export type AmrapConfig = { mode: 'amrap'; duration: number };
export type EmomConfig = { mode: 'emom'; every: number; rounds: number };
/** `cap` 0 means no time cap. */
export type ForTimeConfig = { mode: 'fortime'; cap: number };
export type WorkoutConfig = TabataConfig | AmrapConfig | EmomConfig | ForTimeConfig;

export type FieldDef = {
  key: string;
  label: string;
  kind: 'duration' | 'count';
  min: number;
  max: number;
  /** For duration fields: how many seconds a plain typed number means (1 or 60). */
  plainUnit?: number;
  hint?: string;
};

export type ModeInfo = {
  mode: Mode;
  /** URL hash slug, seen by visitors. */
  slug: string;
  title: string;
  summary: string;
  fields: FieldDef[];
  defaults: WorkoutConfig;
  /** Show the "+1 runde" counter while running. */
  countsRounds: boolean;
};

const HOUR = 3600;

const tabataFields: FieldDef[] = [
  { key: 'work', label: 'Arbeid', kind: 'duration', min: 1, max: HOUR },
  { key: 'rest', label: 'Hvile', kind: 'duration', min: 0, max: HOUR },
  { key: 'rounds', label: 'Runder', kind: 'count', min: 1, max: 99 },
  { key: 'sets', label: 'Sett', kind: 'count', min: 1, max: 20 },
  { key: 'setRest', label: 'Pause mellom sett', kind: 'duration', min: 0, max: HOUR },
];

export const MODE_INFO: Record<Mode, ModeInfo> = {
  tabata: {
    mode: 'tabata',
    slug: 'tabata',
    title: 'Tabata',
    summary: 'Jobbe og hvile, i flere runder.',
    fields: tabataFields,
    defaults: { mode: 'tabata', work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60 },
    countsRounds: false,
  },
  amrap: {
    mode: 'amrap',
    slug: 'amrap',
    title: 'AMRAP',
    summary: 'As Many Reps As Possible, før tia går ut.',
    fields: [
      {
        key: 'duration', label: 'Varighet', kind: 'duration', min: 10, max: 4 * HOUR, plainUnit: 60,
        hint: 'Skriv 12 for 12 minutter, eller 12:30.',
      },
    ],
    defaults: { mode: 'amrap', duration: 12 * 60 },
    countsRounds: true,
  },
  emom: {
    mode: 'emom',
    slug: 'emom',
    title: 'EMOM',
    summary: 'Every Minute On the Minute (=starttid).',
    fields: [
      { key: 'every', label: 'Ny runde hvert', kind: 'duration', min: 5, max: HOUR, hint: 'Sett 2:00 for E2MOM.' },
      { key: 'rounds', label: 'Runder', kind: 'count', min: 1, max: 99 },
    ],
    defaults: { mode: 'emom', every: 60, rounds: 10 },
    countsRounds: false,
  },
  fortime: {
    mode: 'fortime',
    slug: 'for-time',
    title: 'For Time',
    summary: 'Fullfør økten så fort du kan. Valgfri tidsgrense.',
    fields: [
      {
        key: 'cap', label: 'Tidsgrense', kind: 'duration', min: 0, max: 4 * HOUR, plainUnit: 60,
        hint: '0 betyr ingen tidsgrense.',
      },
    ],
    defaults: { mode: 'fortime', cap: 20 * 60 },
    countsRounds: true,
  },
};

/** Old links to the removed Intervall mode open Tabata, which has the same fields. */
const SLUG_ALIASES: Record<string, Mode> = { intervall: 'tabata' };

export const modeBySlug = (slug: string): Mode | undefined =>
  MODES.find((m) => MODE_INFO[m].slug === slug) ?? SLUG_ALIASES[slug];

/** Reads a numeric field from a config by its FieldDef key. */
export function getField(config: WorkoutConfig, key: string): number {
  return (config as unknown as Record<string, number>)[key] ?? 0;
}

/** Returns a copy of `config` with one field changed, clamped to the field's limits. */
export function setField(config: WorkoutConfig, key: string, value: number): WorkoutConfig {
  const def = MODE_INFO[config.mode].fields.find((f) => f.key === key);
  if (!def) return config;
  return { ...config, [key]: clamp(value, def) } as WorkoutConfig;
}

const clamp = (v: number, def: FieldDef) => Math.min(def.max, Math.max(def.min, Math.round(v)));

/**
 * Turns untrusted data (from localStorage) into a valid config, or null.
 * Missing or invalid fields fall back to the mode's defaults.
 */
export function normalizeConfig(input: unknown): WorkoutConfig | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  // The removed Intervall mode had the same fields as Tabata, so saved ones become Tabata.
  const rawMode = raw.mode === 'interval' ? 'tabata' : raw.mode;
  const mode = MODES.find((m) => m === rawMode);
  if (!mode) return null;
  const info = MODE_INFO[mode];
  const out: Record<string, unknown> = { mode };
  for (const f of info.fields) {
    const v = raw[f.key];
    out[f.key] = typeof v === 'number' && Number.isFinite(v) ? clamp(v, f) : getField(info.defaults, f.key);
  }
  return out as WorkoutConfig;
}

export type Phase = 'prep' | 'work' | 'rest';

export type Segment = {
  phase: Phase;
  /** Milliseconds from the start of the plan. */
  start: number;
  /** Milliseconds. Infinity for an open-ended segment (For Time without a cap). */
  duration: number;
  /** Display counts up instead of down. */
  countUp: boolean;
  round?: number;
  rounds?: number;
  set?: number;
  sets?: number;
  /** A rest segment between two sets. */
  betweenSets?: boolean;
  /** A set's last rest, followed by the pause between sets. */
  beforeSetRest?: boolean;
};

export type Plan = {
  config: WorkoutConfig;
  segments: Segment[];
  /** Milliseconds. Infinity when the last segment is open-ended. */
  total: number;
};

/** Builds the timeline for a workout, with `prepSeconds` of get-ready time first. */
export function buildPlan(config: WorkoutConfig, prepSeconds: number): Plan {
  const segments: Segment[] = [];
  let t = 0;
  const push = (s: Omit<Segment, 'start'>) => {
    if (!(s.duration > 0)) return;
    segments.push({ ...s, start: t });
    t += s.duration;
  };
  const sec = (s: number) => s * 1000;

  push({ phase: 'prep', duration: sec(prepSeconds), countUp: false });

  switch (config.mode) {
    case 'tabata': {
      const { work, rest, rounds, sets, setRest } = config;
      for (let set = 1; set <= sets; set++) {
        for (let round = 1; round <= rounds; round++) {
          push({ phase: 'work', duration: sec(work), countUp: false, round, rounds, set, sets });
          if (round < rounds) {
            push({ phase: 'rest', duration: sec(rest), countUp: false, round: round + 1, rounds, set, sets });
          } else if (set < sets) {
            // The set's last rest is kept, then the pause between sets follows.
            // Only the very last set ends on work.
            push({
              phase: 'rest', duration: sec(rest), countUp: false,
              round: 1, rounds, set: set + 1, sets, beforeSetRest: setRest > 0,
            });
            push({
              phase: 'rest', duration: sec(setRest), countUp: false,
              round: 1, rounds, set: set + 1, sets, betweenSets: true,
            });
          }
        }
      }
      break;
    }
    case 'amrap':
      push({ phase: 'work', duration: sec(config.duration), countUp: false });
      break;
    case 'emom':
      for (let round = 1; round <= config.rounds; round++) {
        push({ phase: 'work', duration: sec(config.every), countUp: false, round, rounds: config.rounds });
      }
      break;
    case 'fortime':
      push({ phase: 'work', duration: config.cap > 0 ? sec(config.cap) : Infinity, countUp: true });
      break;
  }
  return { config, segments, total: t };
}

/** Workout length in seconds, without get-ready time. Infinity for an open For Time. */
export function workoutSeconds(config: WorkoutConfig): number {
  return buildPlan(config, 0).total / 1000;
}

/** One-line summary of a config, e.g. "20 s / 10 s × 8". */
export function describeConfig(config: WorkoutConfig): string {
  switch (config.mode) {
    case 'tabata': {
      const base = `${formatShort(config.work)} / ${formatShort(config.rest)} × ${config.rounds}`;
      return config.sets > 1 ? `${base} × ${config.sets} sett` : base;
    }
    case 'amrap':
      return formatShort(config.duration);
    case 'emom':
      return `Hvert ${formatShort(config.every)} × ${config.rounds}`;
    case 'fortime':
      return config.cap > 0 ? `Tidsgrense ${formatShort(config.cap)}` : 'Uten tidsgrense';
  }
}

/** Big label for the current phase. */
export function phaseLabel(seg: Segment, mode: Mode): string {
  if (seg.phase === 'prep') return 'Gjør deg klar';
  if (seg.phase === 'rest') return seg.betweenSets ? 'Pause' : 'Hvile';
  return mode === 'tabata' ? 'Arbeid' : 'Kjør!';
}

/** Smaller line under the clock: which round, or what comes next. */
export function segmentCaption(seg: Segment): string {
  const setPart = seg.sets && seg.sets > 1 ? ` · Sett ${seg.set} av ${seg.sets}` : '';
  if (seg.phase === 'prep') return 'Starter snart';
  if (seg.phase === 'rest') {
    if (seg.betweenSets) return `Neste: sett ${seg.set} av ${seg.sets}`;
    if (seg.beforeSetRest) return 'Neste: pause mellom sett';
    return `Neste: runde ${seg.round} av ${seg.rounds}${setPart}`;
  }
  if (seg.round && seg.rounds) return `Runde ${seg.round} av ${seg.rounds}${setPart}`;
  return '';
}
