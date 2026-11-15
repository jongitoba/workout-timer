// What the app keeps in the browser's localStorage, and validation of it.
// Everything read back is treated as untrusted: invalid parts fall back to defaults.
import { MODES, normalizeConfig, type Mode, type WorkoutConfig } from './workouts.ts';

export const STORAGE_KEY = 'workout-timer:v1';

export type Settings = {
  /** Get-ready countdown before the workout, seconds. */
  prep: number;
  sound: boolean;
  /** 0..1 */
  volume: number;
  /** Beep halfway through each work interval. */
  halfway: boolean;
  /** Colour the whole screen by phase and flash on changes. */
  flash: boolean;
  /** Keep the screen on while a workout runs. */
  wakeLock: boolean;
};

export type Preset = { id: string; name: string; config: WorkoutConfig };

export type Stored = {
  settings: Settings;
  presets: Preset[];
  /** Last used config per mode, so the setup screen remembers your values. */
  last: Partial<Record<Mode, WorkoutConfig>>;
};

export const DEFAULT_SETTINGS: Settings = {
  prep: 10, sound: true, volume: 0.8, halfway: true, flash: true, wakeLock: true,
};
export const MAX_PRESETS = 50;
export const MAX_NAME = 40;
export const PREP_MAX = 60;

export const emptyStored = (): Stored => ({ settings: { ...DEFAULT_SETTINGS }, presets: [], last: {} });

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

export function parseStored(raw: string | null): Stored {
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const out = emptyStored();
  if (!data || typeof data !== 'object') return out;
  const d = data as Record<string, unknown>;

  const s = (d.settings && typeof d.settings === 'object' ? d.settings : {}) as Record<string, unknown>;
  out.settings = {
    prep: Math.round(num(s.prep, DEFAULT_SETTINGS.prep, 0, PREP_MAX)),
    sound: bool(s.sound, DEFAULT_SETTINGS.sound),
    volume: num(s.volume, DEFAULT_SETTINGS.volume, 0, 1),
    halfway: bool(s.halfway, DEFAULT_SETTINGS.halfway),
    flash: bool(s.flash, DEFAULT_SETTINGS.flash),
    wakeLock: bool(s.wakeLock, DEFAULT_SETTINGS.wakeLock),
  };

  if (Array.isArray(d.presets)) {
    for (const p of d.presets.slice(0, MAX_PRESETS)) {
      if (!p || typeof p !== 'object') continue;
      const { id, name, config } = p as Record<string, unknown>;
      const cfg = normalizeConfig(config);
      if (typeof id !== 'string' || typeof name !== 'string' || !cfg) continue;
      const trimmed = name.trim().slice(0, MAX_NAME);
      if (trimmed) out.presets.push({ id, name: trimmed, config: cfg });
    }
  }

  if (d.last && typeof d.last === 'object') {
    const last = d.last as Record<string, unknown>;
    for (const mode of MODES) {
      const cfg = normalizeConfig(last[mode]);
      if (cfg && cfg.mode === mode) out.last[mode] = cfg;
    }
  }
  return out;
}

export const serializeStored = (s: Stored): string => JSON.stringify(s);
