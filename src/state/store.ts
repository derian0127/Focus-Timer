import type { PlayOptions } from "../audio/player";
import type { Backend, Settings, SettingsPatch, Snapshot, Unlisten } from "../ipc/types";
import { suggestsBreak } from "../lib/time";

export type View = "timer" | "settings";

export interface Model {
  ready: boolean;
  timer: Snapshot;
  settings: Settings;
  view: View;
  /** La ventana está reducida a widget. */
  widget: boolean;
  /** El editor de duración está abierto. */
  editing: boolean;
}

export interface Player {
  play(opts: PlayOptions, customKey?: string | null): Promise<boolean>;
  stop(): void;
  invalidateCustom(): void;
}

export interface AppStore {
  getState(): Model;
  subscribe(listener: () => void): Unlisten;
  /** Carga el estado inicial y se suscribe a los eventos del backend. */
  init(): Promise<Unlisten>;
  start(durationMs?: number): Promise<void>;
  /** Inicia un descanso con la duración guardada en la configuración. */
  startBreak(): Promise<void>;
  /** Acción principal según la fase: iniciar, pausar, reanudar, descansar o repetir. */
  toggle(): Promise<void>;
  reset(): Promise<void>;
  cancel(): Promise<void>;
  setDuration(ms: number): Promise<void>;
  patchSettings(patch: SettingsPatch): Promise<void>;
  pickCustomSound(): Promise<void>;
  previewSound(): Promise<void>;
  expandFromCompact(): Promise<void>;
  setView(view: View): void;
  setEditing(editing: boolean): void;
  /** Minimizar deja la ventana como widget flotante. */
  minimize(): void;
  /** Vuelve del widget a la ventana normal. */
  exitWidget(): void;
  close(): void;
}

/**
 * Estado de la interfaz. No contiene lógica de temporizador: refleja las
 * instantáneas que publica el backend y traduce gestos en comandos.
 */
export function createAppStore(backend: Backend, player: Player, initial: Pick<Model, "timer" | "settings">): AppStore {
  let state: Model = { ready: false, view: "timer", widget: false, editing: false, ...initial };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<Model>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  // Un comando puede llegar tarde (p. ej. pausar justo cuando la sesión
  // termina). El backend lo rechaza y el estado correcto llega por evento.
  const run = async (cmd: () => Promise<Snapshot>) => {
    try {
      set({ timer: await cmd() });
    } catch {
      /* el siguiente evento de estado corrige la vista */
    }
  };
  const playOptions = (): PlayOptions => ({
    sound: state.settings.sound,
    volume: state.settings.volume,
    muted: state.settings.muted,
  });

  const store: AppStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async init() {
      const offState = await backend.onState((timer) => {
        const leftIdle = timer.phase !== "idle";
        set({ timer, editing: leftIdle ? false : state.editing });
      });
      const offFinished = await backend.onFinished(() => {
        void player.play(playOptions(), state.settings.customSoundPath);
      });
      const offWidget = await backend.onWidget((widget) => {
        set(widget ? { widget, view: "timer", editing: false } : { widget });
      });
      const { timer, settings, widget } = await backend.getState();
      set({ ready: true, timer, settings, widget });
      return () => {
        offState();
        offFinished();
        offWidget();
      };
    },
    async start(durationMs) {
      player.stop();
      set({ editing: false });
      await run(() => backend.start(durationMs));
    },
    async startBreak() {
      player.stop();
      await run(() => backend.startBreak(state.settings.breakDurationMs));
    },
    async toggle() {
      switch (state.timer.phase) {
        case "finished":
          return suggestsBreak(state.timer) ? store.startBreak() : store.start();
        case "idle":
          return store.start();
        case "running":
          return run(() => backend.pause());
        case "paused":
          return run(() => backend.resume());
      }
    },
    reset: () => run(() => backend.reset()),
    async cancel() {
      player.stop();
      set({ editing: false });
      await run(() => backend.cancel());
    },
    setDuration: (ms) => run(() => backend.setDuration(ms)),
    async patchSettings(patch) {
      // Respuesta inmediata en pantalla; el backend devuelve el valor validado.
      const previous = state.settings;
      set({ settings: { ...previous, ...patch } });
      try {
        set({ settings: await backend.updateSettings(patch) });
      } catch {
        set({ settings: previous });
      }
    },
    async pickCustomSound() {
      try {
        const settings = await backend.pickCustomSound();
        if (settings) {
          player.invalidateCustom();
          set({ settings });
        }
      } catch {
        /* archivo no válido: se conserva el sonido anterior */
      }
    },
    async previewSound() {
      await player.play({ ...playOptions(), muted: false }, state.settings.customSoundPath);
    },
    expandFromCompact: () => store.patchSettings({ counterStyle: state.settings.lastFullStyle }),
    setView: (view) => set({ view, editing: false }),
    setEditing: (editing) => set({ editing: editing && state.timer.phase === "idle" }),
    minimize() {
      set({ widget: true, view: "timer", editing: false });
      void backend.setWidget(true);
    },
    exitWidget() {
      set({ widget: false });
      void backend.setWidget(false);
    },
    close: () => void backend.closeWindow(),
  };
  return store;
}
