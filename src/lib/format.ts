// Time formatting, parsing and stepping. Durations are whole seconds unless noted.

const pad = (n: number) => String(n).padStart(2, '0');

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(rest)}` : `${m}:${pad(rest)}`;
}

/** Short, readable form for summaries: 20 -> "20 s", 720 -> "12 min", 90 -> "1:30". */
export function formatShort(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return formatClock(seconds);
}

/**
 * Countdown display: rounds up, so a timer at 19.2 s shows 0:20 and reaches
 * 0:00 only when the time is actually up.
 */
export function formatRemaining(ms: number): string {
  return formatClock(Math.ceil(Math.max(0, ms) / 1000 - 1e-9));
}

/** Count-up display: rounds down. */
export function formatElapsed(ms: number): string {
  return formatClock(Math.floor(Math.max(0, ms) / 1000));
}

/**
 * Parses what a person types into a duration field.
 * - "1:30", "1.30" or "1,30" -> 90 (minutes and seconds; phone keypads often lack ":")
 * - "1:02:05" -> 3725
 * - A plain number is in `plainUnit` seconds, so "12" means 12 minutes in a minutes
 *   field and 12 seconds in a seconds field. "12.5" (one decimal) is 12.5 units.
 * Returns null for anything that is not a valid duration.
 */
export function parseDuration(text: string, plainUnit = 1): number | null {
  const t = text.trim();
  if (/^\d+$/.test(t)) return Number(t) * plainUnit;
  const dec = /^(\d+)[.,](\d)$/.exec(t);
  if (dec) return Math.round(Number(`${dec[1]}.${dec[2]}`) * plainUnit);
  const ms = /^(\d+)[:.,](\d{2})$/.exec(t);
  if (ms) return Number(ms[2]) < 60 ? Number(ms[1]) * 60 + Number(ms[2]) : null;
  const hms = /^(\d+):(\d{2}):(\d{2})$/.exec(t);
  if (hms && Number(hms[2]) < 60 && Number(hms[3]) < 60) {
    return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  }
  return null;
}

/** Step size for a duration stepper: finer for short durations. */
function stepAt(seconds: number): number {
  if (seconds < 60) return 5;
  if (seconds < 300) return 15;
  if (seconds < 1200) return 30;
  return 60;
}

/**
 * Next value when pressing + (dir 1) or − (dir -1) on a duration field.
 * Snaps to the step grid, so 23 -> 25 and 23 -> 20.
 */
export function stepDuration(seconds: number, dir: 1 | -1, min: number, max: number): number {
  let next: number;
  if (dir === 1) {
    const step = stepAt(seconds);
    next = (Math.floor(seconds / step) + 1) * step;
  } else {
    const step = stepAt(Math.max(0, seconds - 1));
    next = (Math.ceil(seconds / step) - 1) * step;
  }
  return Math.min(max, Math.max(min, next));
}
