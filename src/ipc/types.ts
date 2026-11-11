// Tipos compartidos con el backend (ver crates/focus-core). Los nombres y
// valores coinciden con la serialización de Rust.

export type Phase = "idle" | "running" | "paused" | "finished";

export type SessionKind = "focus" | "break";

export interface Snapshot {
  phase: Phase;
  kind: SessionKind;
  durationMs: number;
  remainingMs: number;
}

export type CounterStyle = "digital" | "ring" | "minimal" | "compact";
export type FullStyle = Exclude<CounterStyle, "compact">;
export type TimeVisibility = "show" | "progress";
export type Theme = "system" | "light" | "dark";
export type BuiltinSound = "bell" | "bowl" | "wood" | "chime";
export type Sound = BuiltinSound | "custom";
export type CloseBehavior = "tray" | "exit";

export interface Settings {
  version: number;
  defaultDurationMs: number;
  breakDurationMs: number;
  counterStyle: CounterStyle;
  lastFullStyle: FullStyle;
  timeVisibility: TimeVisibility;
  theme: Theme;
  sound: Sound;
  volume: number;
  muted: boolean;
  customSoundPath: string | null;
  autostart: boolean;
  closeBehavior: CloseBehavior;
  alwaysOnTop: boolean;
  windowPos: [number, number] | null;
  widgetPos: [number, number] | null;
  /** Opacidad del fondo del widget, en % (20–100). */
  widgetOpacity: number;
}

/** Campos que la interfaz puede cambiar. La ruta del sonido la fija el backend. */
export type SettingsPatch = Partial<
  Pick<
    Settings,
    | "defaultDurationMs"
    | "breakDurationMs"
    | "counterStyle"
    | "timeVisibility"
    | "theme"
    | "sound"
    | "volume"
    | "muted"
    | "autostart"
    | "closeBehavior"
    | "alwaysOnTop"
    | "widgetOpacity"
  >
>;

export interface AppState {
  timer: Snapshot;
  settings: Settings;
  /** La ventana está en modo widget (lo que sustituye a minimizar). */
  widget: boolean;
}

export type Unlisten = () => void;

/** Todo lo que la interfaz necesita del proceso nativo. */
export interface Backend {
  getState(): Promise<AppState>;
  start(durationMs?: number): Promise<Snapshot>;
  startBreak(durationMs: number): Promise<Snapshot>;
  pause(): Promise<Snapshot>;
  resume(): Promise<Snapshot>;
  reset(): Promise<Snapshot>;
  cancel(): Promise<Snapshot>;
  setDuration(durationMs: number): Promise<Snapshot>;
  updateSettings(patch: SettingsPatch): Promise<Settings>;
  pickCustomSound(): Promise<Settings | null>;
  readCustomSound(): Promise<ArrayBuffer>;
  onState(cb: (s: Snapshot) => void): Promise<Unlisten>;
  onFinished(cb: (s: Snapshot) => void): Promise<Unlisten>;
  /** Convierte la ventana en widget o la devuelve a su tamaño normal. */
  setWidget(on: boolean): Promise<void>;
  /** Cambios de modo que no nacen en la interfaz (barra de tareas, bandeja). */
  onWidget(cb: (on: boolean) => void): Promise<Unlisten>;
  closeWindow(): Promise<void>;
}

export const MIN_WIDGET_OPACITY = 20;
export const MIN_DURATION_MS = 1_000;
export const MAX_DURATION_MS = 180 * 60 * 1_000;
export const MIN_BREAK_MS = 60_000;
export const MAX_BREAK_MS = 60 * 60_000;
/** Solo se sugiere descanso tras una sesión de enfoque de al menos 5 minutos. */
export const BREAK_SUGGESTION_THRESHOLD_MS = 5 * 60_000;
