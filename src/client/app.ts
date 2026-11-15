// The app: hash routing between views, the setup form, presets, settings and the
// running timer. Timing and cue logic live in src/lib/timer.ts (pure, tested).
import { formatClock, formatElapsed, formatRemaining, parseDuration, stepDuration } from '../lib/format.ts';
import {
  emptyStored, MAX_NAME, MAX_PRESETS, parseStored, PREP_MAX, serializeStored, STORAGE_KEY,
  type Preset, type Stored,
} from '../lib/storage.ts';
import { cuesBetween, skipTarget, stateAt, type Cue, type TimerState } from '../lib/timer.ts';
import {
  buildPlan, describeConfig, getField, MODE_INFO, modeBySlug, phaseLabel, segmentCaption, setField,
  workoutSeconds, type FieldDef, type Mode, type Plan, type WorkoutConfig,
} from '../lib/workouts.ts';
import { playCue, unlockAudio } from './audio.ts';
import { $, h } from './dom.ts';
import { keepScreenOn } from './wake-lock.ts';

// ---------------------------------------------------------------- storage

function load(): Stored {
  try {
    return parseStored(localStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyStored(); // Storage blocked (private mode etc.): work without it.
  }
}
const stored = load();
function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeStored(stored));
  } catch {
    // Not fatal: settings just won't survive a reload.
  }
}

// ---------------------------------------------------------------- elements

const views = {
  home: $('#view-home'),
  setup: $('#view-setup'),
  settings: $('#view-settings'),
};
const runView = $('#view-run');
const el = {
  presets: $<HTMLUListElement>('#presets'),
  presetsEmpty: $('#presets-empty'),
  installHint: $('#install-hint'),
  setupTitle: $('#setup-title'),
  setupSummary: $('#setup-summary'),
  setupFields: $('#setup-fields'),
  setupTotal: $('#setup-total'),
  setupForm: $<HTMLFormElement>('#setup-form'),
  savePreset: $<HTMLButtonElement>('#save-preset'),
  settingsForm: $<HTMLFormElement>('#settings-form'),
  settingsPrep: $('#settings-prep'),
  testSound: $<HTMLButtonElement>('#test-sound'),
  runFlash: $('.run-flash', runView),
  runMode: $('#run-mode'),
  runTotal: $('#run-total'),
  runPhase: $('#run-phase'),
  runClock: $('#run-clock'),
  runCaption: $('#run-caption'),
  runProgress: $('#run-progress'),
  runBar: $('#run-bar'),
  runCounter: $('#run-counter'),
  roundMinus: $<HTMLButtonElement>('#round-minus'),
  roundPlus: $<HTMLButtonElement>('#round-plus'),
  roundCount: $('#round-count'),
  runControls: $('#run-controls'),
  runStop: $<HTMLButtonElement>('#run-stop'),
  runToggle: $<HTMLButtonElement>('#run-toggle'),
  runSkip: $<HTMLButtonElement>('#run-skip'),
  runDone: $('#run-done'),
  runResult: $('#run-result'),
  runAgain: $<HTMLButtonElement>('#run-again'),
  runClose: $<HTMLButtonElement>('#run-close'),
  stopDialog: $<HTMLDialogElement>('#stop-dialog'),
  saveDialog: $<HTMLDialogElement>('#save-dialog'),
  saveName: $<HTMLInputElement>('#save-name'),
};

/** Sets text only when it changes (avoids re-announcing aria-live regions every frame). */
function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

// ---------------------------------------------------------------- stepper input

/** Calls fn on press, then repeats faster while held. Keyboard activation steps once. */
function holdRepeat(btn: HTMLButtonElement, fn: () => void): void {
  let timer: number | undefined;
  const stop = () => {
    window.clearTimeout(timer);
    timer = undefined;
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    fn();
    let delay = 400;
    const loop = () => {
      timer = window.setTimeout(() => {
        fn();
        delay = Math.max(50, delay * 0.8);
        loop();
      }, delay);
    };
    loop();
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) btn.addEventListener(ev, stop);
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) fn(); // Enter/Space; pointer clicks were handled on pointerdown.
  });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

let uid = 0;
function stepper(def: FieldDef, initial: number, onChange: (v: number) => void): HTMLElement {
  const id = `field-${def.key}-${++uid}`;
  let value = initial;
  const isDuration = def.kind === 'duration';
  const input = h('input', {
    id,
    class: 'stepper-value',
    inputmode: isDuration ? 'decimal' : 'numeric',
    autocomplete: 'off',
    enterkeyhint: 'done',
    'aria-describedby': def.hint ? `${id}-hint` : undefined,
  });
  const show = () => {
    input.value = isDuration ? formatClock(value) : String(value);
  };
  const commit = (v: number) => {
    value = Math.min(def.max, Math.max(def.min, Math.round(v)));
    show();
    onChange(value);
  };
  const step = (dir: 1 | -1) =>
    commit(isDuration ? stepDuration(value, dir, def.min, def.max) : value + dir);

  const minus = h('button', { type: 'button', class: 'step', 'aria-label': `Mindre ${def.label.toLowerCase()}` }, '−');
  const plus = h('button', { type: 'button', class: 'step', 'aria-label': `Mer ${def.label.toLowerCase()}` }, '+');
  holdRepeat(minus, () => step(-1));
  holdRepeat(plus, () => step(1));
  input.addEventListener('focus', () => input.select());
  input.addEventListener('change', () => {
    const parsed = isDuration ? parseDuration(input.value, def.plainUnit ?? 1) : parseDuration(input.value, 1);
    if (parsed === null) show();
    else commit(parsed);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
  });
  show();

  return h(
    'div',
    { class: 'field', 'data-key': def.key },
    h('label', { for: id }, def.label),
    h('div', { class: 'stepper' }, minus, input, plus),
    def.hint ? h('p', { class: 'hint', id: `${id}-hint` }, def.hint) : null,
  );
}

// ---------------------------------------------------------------- views and routing

let setupMode: Mode = 'tabata';
let setupConfig: WorkoutConfig = MODE_INFO.tabata.defaults;
/** Config to load on the next setup view (set when a preset is tapped). */
let pendingConfig: WorkoutConfig | null = null;

function show(view: keyof typeof views): void {
  for (const [name, node] of Object.entries(views)) node.hidden = name !== view;
  window.scrollTo(0, 0);
}

function route(): void {
  const slug = location.hash.replace(/^#\/?/, '');
  if (run) {
    if (slug === 'kjor') return;
    if (run.finished === null) {
      // Back button during a workout: stay, and ask first.
      history.pushState(null, '', '#/kjor');
      askStop();
      return;
    }
    endRun();
  }
  if (slug === 'kjor') {
    location.replace('#/'); // Reloaded mid-workout: nothing to resume.
    return;
  }
  if (slug === 'innstillinger') {
    show('settings');
    return;
  }
  const mode = modeBySlug(slug);
  if (mode) {
    showSetup(mode);
    return;
  }
  renderPresets();
  show('home');
}

// ---------------------------------------------------------------- setup

function showSetup(mode: Mode): void {
  const info = MODE_INFO[mode];
  setupMode = mode;
  setupConfig = pendingConfig?.mode === mode ? pendingConfig : (stored.last[mode] ?? info.defaults);
  pendingConfig = null;
  setText(el.setupTitle, info.title);
  setText(el.setupSummary, info.summary);
  el.setupFields.replaceChildren(
    ...info.fields.map((def) =>
      stepper(def, getField(setupConfig, def.key), (v) => {
        setupConfig = setField(setupConfig, def.key, v);
        stored.last[mode] = setupConfig;
        save();
        updateSetup();
      }),
    ),
  );
  updateSetup();
  show('setup');
}

function updateSetup(): void {
  const secs = workoutSeconds(setupConfig);
  setText(el.setupTotal, Number.isFinite(secs) ? formatClock(secs) : 'åpen');
  // "Pause mellom sett" only matters with more than one set.
  const setRest = el.setupFields.querySelector<HTMLElement>('[data-key="setRest"]');
  if (setRest) setRest.hidden = getField(setupConfig, 'sets') <= 1;
}

el.setupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  // Commit a value still being typed (change fires on blur, which may not have happened).
  (document.activeElement as HTMLElement | null)?.blur();
  startRun(buildPlan(setupConfig, stored.settings.prep));
});

// ---------------------------------------------------------------- presets

function renderPresets(): void {
  el.presets.replaceChildren(
    ...stored.presets.map((p) => {
      const info = MODE_INFO[p.config.mode];
      const link = h(
        'a',
        { href: `#/${info.slug}`, class: 'preset-link' },
        h('span', { class: 'preset-name' }, p.name),
        h('span', { class: 'preset-meta' }, `${info.title} · ${describeConfig(p.config)}`),
      );
      link.addEventListener('click', () => {
        pendingConfig = p.config;
      });
      const del = h('button', { type: 'button', class: 'ghost small', 'aria-label': `Slett ${p.name}` }, 'Slett');
      del.addEventListener('click', () => {
        if (!window.confirm(`Slette «${p.name}»?`)) return;
        stored.presets = stored.presets.filter((x) => x.id !== p.id);
        save();
        renderPresets();
      });
      return h('li', { class: 'preset' }, link, del);
    }),
  );
  el.presetsEmpty.hidden = stored.presets.length > 0;
}

const newId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

el.savePreset.addEventListener('click', () => {
  if (stored.presets.length >= MAX_PRESETS) {
    window.alert(`Du kan lagre opptil ${MAX_PRESETS} økter. Slett en først.`);
    return;
  }
  el.saveName.value = `${MODE_INFO[setupMode].title} ${describeConfig(setupConfig)}`.slice(0, MAX_NAME);
  el.saveDialog.returnValue = '';
  el.saveDialog.showModal();
  el.saveName.select();
});

el.saveDialog.addEventListener('close', () => {
  const name = el.saveName.value.trim().slice(0, MAX_NAME);
  if (el.saveDialog.returnValue !== 'save' || !name) return;
  const preset: Preset = { id: newId(), name, config: setupConfig };
  stored.presets.unshift(preset);
  save();
  renderPresets();
});

// ---------------------------------------------------------------- settings

function applySettings(): void {
  document.body.classList.toggle('flash-on', stored.settings.flash);
}

function initSettings(): void {
  const form = el.settingsForm;
  const s = stored.settings;
  const check = (name: 'sound' | 'halfway' | 'flash' | 'wakeLock') => {
    const input = form.elements.namedItem(name) as HTMLInputElement;
    input.checked = s[name];
    input.addEventListener('change', () => {
      s[name] = input.checked;
      save();
      applySettings();
    });
  };
  check('sound');
  check('halfway');
  check('flash');
  check('wakeLock');
  const volume = form.elements.namedItem('volume') as HTMLInputElement;
  volume.value = String(s.volume);
  volume.addEventListener('change', () => {
    s.volume = Number(volume.value);
    save();
  });
  el.settingsPrep.replaceChildren(
    stepper(
      { key: 'prep', label: 'Nedtelling før start', kind: 'duration', min: 0, max: PREP_MAX },
      s.prep,
      (v) => {
        s.prep = v;
        save();
      },
    ),
  );
  el.testSound.addEventListener('click', () => {
    unlockAudio();
    playCue({ kind: 'start', at: 0, phase: 'work', index: 0 }, s.volume);
  });
  applySettings();
}

// ---------------------------------------------------------------- running

type Run = {
  plan: Plan;
  /** Elapsed ms banked before the current running stretch. */
  offset: number;
  /** Date.now() when the current running stretch began; null while paused. */
  startedAt: number | null;
  /** Elapsed ms at the previous tick, for cue detection. */
  lastElapsed: number;
  /** Elapsed ms when the workout ended; null while it runs. */
  finished: number | null;
  rounds: number;
  raf: number;
  interval: number;
};
let run: Run | null = null;

// Date.now() rather than performance.now(): it keeps counting while the phone sleeps.
const elapsedOf = (r: Run) =>
  r.finished ?? (r.startedAt === null ? r.offset : r.offset + Date.now() - r.startedAt);

/** Cues older than this are skipped, e.g. after the phone was locked for a while. */
const STALE_CUE_MS = 1000;

function startRun(plan: Plan): void {
  if (run) stopLoops(run);
  unlockAudio();
  run = {
    plan, offset: 0, startedAt: Date.now(), lastElapsed: -1, finished: null, rounds: 0, raf: 0, interval: 0,
  };
  const info = MODE_INFO[plan.config.mode];
  setText(el.runMode, `${info.title} · ${describeConfig(plan.config)}`);
  el.runCounter.hidden = !info.countsRounds;
  el.runControls.hidden = false;
  el.runDone.hidden = true;
  el.runToggle.textContent = 'Pause';
  runView.classList.remove('paused');
  runView.hidden = false;
  document.body.classList.add('running');
  renderRounds();
  keepScreenOn(stored.settings.wakeLock);
  if (location.hash !== '#/kjor') location.hash = '#/kjor';
  startLoops(run);
  tick();
}

function startLoops(r: Run): void {
  const frame = () => {
    tick();
    r.raf = requestAnimationFrame(frame);
  };
  r.raf = requestAnimationFrame(frame);
  // rAF stops in background tabs; this keeps cues roughly on time there.
  r.interval = window.setInterval(tick, 250);
}

function stopLoops(r: Run): void {
  cancelAnimationFrame(r.raf);
  window.clearInterval(r.interval);
}

function endRun(): void {
  if (!run) return;
  stopLoops(run);
  run = null;
  runView.hidden = true;
  document.body.classList.remove('running');
  keepScreenOn(false);
}

function flash(): void {
  if (!stored.settings.flash) return;
  el.runFlash.classList.remove('pulse');
  void el.runFlash.offsetWidth; // Restart the CSS animation.
  el.runFlash.classList.add('pulse');
}

function handleCue(cue: Cue): void {
  if (stored.settings.sound) playCue(cue, stored.settings.volume);
  if (cue.kind === 'finish' || (cue.kind === 'start' && cue.index > 0)) flash();
}

function tick(): void {
  const r = run;
  if (!r || r.finished !== null) return;
  const e = elapsedOf(r);
  for (const cue of cuesBetween(r.plan, r.lastElapsed, e, { halfway: stored.settings.halfway })) {
    if (e - cue.at < STALE_CUE_MS) handleCue(cue);
  }
  r.lastElapsed = e;
  const st = stateAt(r.plan, e);
  if (st.done) finish(r, r.plan.total);
  else render(r, st);
}

function render(r: Run, st: TimerState): void {
  const seg = st.segment;
  if (!seg) return;
  const mode = r.plan.config.mode;
  runView.dataset.phase = seg.phase;
  setText(el.runPhase, phaseLabel(seg, mode));
  setText(el.runClock, seg.countUp ? formatElapsed(st.segElapsed) : formatRemaining(st.segRemaining));
  setText(el.runCaption, segmentCaption(seg));
  const multi = r.plan.segments.filter((s) => s.phase !== 'prep').length > 1;
  setText(el.runTotal, multi && Number.isFinite(st.remaining) ? `${formatRemaining(st.remaining)} igjen` : '');
  const timed = Number.isFinite(seg.duration);
  el.runProgress.style.visibility = timed ? '' : 'hidden';
  if (timed) el.runBar.style.transform = `scaleX(${Math.min(1, st.segElapsed / seg.duration)})`;
  const isLast = st.index === r.plan.segments.length - 1;
  setText(el.runSkip, isLast ? 'Ferdig' : 'Hopp over');
}

function renderRounds(): void {
  setText(el.roundCount, String(run?.rounds ?? 0));
  el.roundMinus.disabled = !run || run.rounds === 0;
}

/** Ends the workout at elapsed time `at` and shows the result. */
function finish(r: Run, at: number): void {
  r.finished = at;
  stopLoops(r);
  keepScreenOn(false);
  const prep = r.plan.segments[0]?.phase === 'prep' ? r.plan.segments[0].duration : 0;
  const workMs = Math.max(0, at - prep);
  runView.dataset.phase = 'done';
  runView.classList.remove('paused');
  setText(el.runPhase, 'Ferdig!');
  setText(el.runClock, formatElapsed(workMs));
  setText(el.runCaption, '');
  setText(el.runTotal, '');
  el.runProgress.style.visibility = '';
  el.runBar.style.transform = 'scaleX(1)';
  const parts = [`Tid ${formatElapsed(workMs)}`];
  if (MODE_INFO[r.plan.config.mode].countsRounds) parts.push(`${r.rounds} ${r.rounds === 1 ? 'runde' : 'runder'}`);
  setText(el.runResult, parts.join(' · '));
  el.runControls.hidden = true;
  el.runDone.hidden = false;
}

function togglePause(): void {
  const r = run;
  if (!r || r.finished !== null) return;
  if (r.startedAt === null) {
    r.startedAt = Date.now();
    el.runToggle.textContent = 'Pause';
    runView.classList.remove('paused');
    keepScreenOn(stored.settings.wakeLock);
  } else {
    r.offset = elapsedOf(r);
    r.startedAt = null;
    el.runToggle.textContent = 'Fortsett';
    runView.classList.add('paused');
  }
  tick();
}

function skip(): void {
  const r = run;
  if (!r || r.finished !== null) return;
  const e = elapsedOf(r);
  const target = skipTarget(r.plan, e);
  if (target >= r.plan.total) {
    // Skipping the last segment ends the workout now (e.g. "Ferdig" in For Time).
    if (stored.settings.sound) playCue({ kind: 'finish', at: e }, stored.settings.volume);
    flash();
    finish(r, e);
    return;
  }
  r.offset = target;
  if (r.startedAt !== null) r.startedAt = Date.now();
  r.lastElapsed = target - 1; // So the next segment's start cue fires.
  tick();
}

let resumeAfterDialog = false;
function askStop(): void {
  if (!run || el.stopDialog.open) return;
  resumeAfterDialog = run.startedAt !== null;
  if (resumeAfterDialog) togglePause();
  el.stopDialog.returnValue = '';
  el.stopDialog.showModal();
}

el.stopDialog.addEventListener('close', () => {
  if (el.stopDialog.returnValue === 'stop') {
    endRun();
    history.back();
  } else if (resumeAfterDialog) {
    togglePause();
  }
});

el.runToggle.addEventListener('click', togglePause);
el.runSkip.addEventListener('click', skip);
el.runStop.addEventListener('click', askStop);
function changeRounds(delta: 1 | -1): void {
  if (!run || run.rounds + delta < 0) return;
  run.rounds += delta;
  renderRounds();
  if (run.finished !== null) finish(run, run.finished); // Refresh the result line.
}
el.roundPlus.addEventListener('click', () => changeRounds(1));
el.roundMinus.addEventListener('click', () => changeRounds(-1));
el.runAgain.addEventListener('click', () => {
  if (run) startRun(run.plan);
});
el.runClose.addEventListener('click', () => {
  endRun();
  history.back();
});

document.addEventListener('keydown', (e) => {
  if (!run || run.finished !== null || el.stopDialog.open) return;
  if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    togglePause();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick();
});

// ---------------------------------------------------------------- install

function initInstall(): void {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    el.installHint.textContent =
      'Tips: Trykk Del-knappen i Safari og velg «Legg til på Hjem-skjerm» for å bruke timeren som en app.';
    el.installHint.hidden = false;
    return;
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const prompt = e as Event & { prompt: () => Promise<void> };
    const btn = h('button', { type: 'button', class: 'ghost' }, 'Installer som app');
    btn.addEventListener('click', () => {
      void prompt.prompt();
      el.installHint.hidden = true;
    });
    el.installHint.replaceChildren('Bruk timeren som en app på telefonen. ', btn);
    el.installHint.hidden = false;
  });
}

// ---------------------------------------------------------------- start

initSettings();
initInstall();
window.addEventListener('hashchange', route);
route();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js');
}
