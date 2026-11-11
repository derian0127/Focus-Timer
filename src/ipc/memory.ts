import {
  MAX_BREAK_MS,
  MIN_BREAK_MS,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  type AppState,
  type Backend,
  type Settings,
  type Snapshot,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  defaultDurationMs: 25 * 60_000,
  breakDurationMs: 5 * 60_000,
  counterStyle: "ring",
  lastFullStyle: "ring",
  timeVisibility: "show",
  theme: "system",
  sound: "bell",
  volume: 70,
  muted: false,
  customSoundPath: null,
  autostart: false,
  closeBehavior: "tray",
  alwaysOnTop: false,
  windowPos: null,
  widgetPos: null,
  widgetOpacity: 100,
};

export interface MemoryBackend extends Backend {
  /** Avanza el reloj simulado y publica el estado, como hace el hilo de Rust. */
  advance(ms: number): void;
  readonly calls: string[];
}

/**
 * Backend en memoria con las mismas reglas que `focus-core`. Lo usan las
 * pruebas de la interfaz y `npm run dev` cuando se abre en un navegador sin
 * Tauri. No forma parte del flujo de la aplicación instalada.
 */
export function createMemoryBackend(initial: Partial<Settings> = {}, autoTick = false): MemoryBackend {
  let settings: Settings = { ...DEFAULT_SETTINGS, ...initial };
  let timer: Snapshot = { phase: "idle", kind: "focus", durationMs: settings.defaultDurationMs, remainingMs: settings.defaultDurationMs };
  const stateSubs = new Set<(s: Snapshot) => void>();
  const finishedSubs = new Set<(s: Snapshot) => void>();
  const widgetSubs = new Set<(on: boolean) => void>();
  let widget = false;
  const calls: string[] = [];
  const publish = () => stateSubs.forEach((cb) => cb({ ...timer }));
  const fail = (code: string) => Promise.reject(code);
  const valid = (ms: number) => Number.isInteger(ms) && ms >= MIN_DURATION_MS && ms <= MAX_DURATION_MS;
  const done = (name: string) => {
    calls.push(name);
    publish();
    return Promise.resolve({ ...timer });
  };

  const backend: MemoryBackend = {
    calls,
    advance(ms) {
      if (timer.phase !== "running") return;
      timer = { ...timer, remainingMs: Math.max(0, timer.remainingMs - ms) };
      if (timer.remainingMs === 0) {
        timer = { ...timer, phase: "finished" };
        publish();
        finishedSubs.forEach((cb) => cb({ ...timer }));
      } else publish();
    },
    getState: () => Promise.resolve<AppState>({ timer: { ...timer }, settings: { ...settings }, widget }),
    start(durationMs) {
      if (timer.phase !== "idle" && timer.phase !== "finished") return fail("invalid_transition");
      if (durationMs !== undefined && !valid(durationMs)) return fail("invalid_duration");
      const d = durationMs ?? (timer.kind === "break" ? settings.defaultDurationMs : timer.durationMs);
      timer = { phase: "running", kind: "focus", durationMs: d, remainingMs: d };
      return done("start");
    },
    startBreak(ms) {
      if (!Number.isInteger(ms) || ms < MIN_BREAK_MS || ms > MAX_BREAK_MS) return fail("invalid_duration");
      if (timer.phase !== "idle" && timer.phase !== "finished") return fail("invalid_transition");
      timer = { phase: "running", kind: "break", durationMs: ms, remainingMs: ms };
      settings = { ...settings, breakDurationMs: ms };
      return done("startBreak");
    },
    pause() {
      if (timer.phase !== "running") return fail("invalid_transition");
      timer = { ...timer, phase: "paused" };
      return done("pause");
    },
    resume() {
      if (timer.phase !== "paused") return fail("invalid_transition");
      timer = { ...timer, phase: "running" };
      return done("resume");
    },
    reset() {
      if (timer.phase !== "running" && timer.phase !== "paused") return fail("invalid_transition");
      timer = { ...timer, remainingMs: timer.durationMs };
      return done("reset");
    },
    cancel() {
      timer = { phase: "idle", kind: "focus", durationMs: settings.defaultDurationMs, remainingMs: settings.defaultDurationMs };
      return done("cancel");
    },
    setDuration(ms) {
      if (!valid(ms)) return fail("invalid_duration");
      if (timer.phase !== "idle" && timer.phase !== "finished") return fail("invalid_transition");
      timer = { phase: "idle", kind: "focus", durationMs: ms, remainingMs: ms };
      return done("setDuration");
    },
    updateSettings(patch) {
      calls.push("updateSettings:" + JSON.stringify(patch));
      const next = { ...settings, ...patch };
      if (next.counterStyle !== "compact") next.lastFullStyle = next.counterStyle;
      if (next.sound === "custom" && !next.customSoundPath) next.sound = "bell";
      if (patch.defaultDurationMs !== undefined && timer.phase === "idle") {
        timer = { phase: "idle", kind: "focus", durationMs: next.defaultDurationMs, remainingMs: next.defaultDurationMs };
        publish();
      }
      settings = next;
      return Promise.resolve({ ...settings });
    },
    pickCustomSound() {
      calls.push("pickCustomSound");
      return Promise.resolve(null);
    },
    readCustomSound: () => fail("sound_not_found"),
    onState(cb) {
      stateSubs.add(cb);
      return Promise.resolve(() => stateSubs.delete(cb));
    },
    onFinished(cb) {
      finishedSubs.add(cb);
      return Promise.resolve(() => finishedSubs.delete(cb));
    },
    setWidget(on) {
      calls.push(on ? "widget:on" : "widget:off");
      widget = on;
      widgetSubs.forEach((cb) => cb(on));
      return Promise.resolve();
    },
    onWidget(cb) {
      widgetSubs.add(cb);
      return Promise.resolve(() => widgetSubs.delete(cb));
    },
    closeWindow: () => (calls.push("close"), Promise.resolve()),
  };
  if (autoTick) setInterval(() => backend.advance(1_000), 1_000);
  return backend;
}
