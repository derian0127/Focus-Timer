import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Backend, Snapshot } from "./types";

/** Backend real: comandos y eventos de Tauri. */
export const tauriBackend: Backend = {
  getState: () => invoke("get_state"),
  start: (durationMs) => invoke("timer_start", { durationMs: durationMs ?? null }),
  startBreak: (durationMs) => invoke("timer_start_break", { durationMs }),
  pause: () => invoke("timer_pause"),
  resume: () => invoke("timer_resume"),
  reset: () => invoke("timer_reset"),
  cancel: () => invoke("timer_cancel"),
  setDuration: (durationMs) => invoke("timer_set_duration", { durationMs }),
  updateSettings: (patch) => invoke("settings_update", { patch }),
  pickCustomSound: () => invoke("sound_pick_custom"),
  readCustomSound: () => invoke<ArrayBuffer>("sound_read_custom"),
  onState: (cb) => listen<Snapshot>("timer://state", (e) => cb(e.payload)),
  onFinished: (cb) => listen<Snapshot>("timer://finished", (e) => cb(e.payload)),
  setWidget: (on) => invoke("window_set_widget", { on }),
  onWidget: (cb) => listen<boolean>("window://widget", (e) => cb(e.payload)),
  closeWindow: () => getCurrentWindow().close(),
};
