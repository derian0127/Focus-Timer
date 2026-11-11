import "@fontsource-variable/hanken-grotesk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SoundPlayer } from "./audio/player";
import { createMemoryBackend, DEFAULT_SETTINGS } from "./ipc/memory";
import { tauriBackend } from "./ipc/tauri";
import { StoreProvider } from "./state/context";
import { createAppStore } from "./state/store";
import "./styles/tokens.css";
import "./styles/app.css";

// Fuera de Tauri (p. ej. `npm run dev` en un navegador) se usa un backend simulado.
const inTauri = "__TAURI_INTERNALS__" in window;
const backend = inTauri ? tauriBackend : createMemoryBackend({}, true);
const player = new SoundPlayer(undefined, () => backend.readCustomSound());
const store = createAppStore(backend, player, {
  settings: DEFAULT_SETTINGS,
  timer: { phase: "idle", kind: "focus", durationMs: DEFAULT_SETTINGS.defaultDurationMs, remainingMs: DEFAULT_SETTINGS.defaultDurationMs },
});
void store.init();

// El menú contextual del navegador no tiene sentido en una app de escritorio.
window.addEventListener("contextmenu", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider value={store}>
      <App />
    </StoreProvider>
  </StrictMode>,
);
