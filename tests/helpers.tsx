import { act, render } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "../src/App";
import { createMemoryBackend, DEFAULT_SETTINGS } from "../src/ipc/memory";
import type { Settings } from "../src/ipc/types";
import { StoreProvider } from "../src/state/context";
import { createAppStore } from "../src/state/store";

export async function setup(initial: Partial<Settings> = {}) {
  const backend = createMemoryBackend(initial);
  const player = { play: vi.fn(async () => true), stop: vi.fn(), invalidateCustom: vi.fn() };
  const store = createAppStore(backend, player, {
    settings: DEFAULT_SETTINGS,
    timer: { phase: "idle", kind: "focus", durationMs: 1, remainingMs: 1 },
  });
  await store.init();
  return { backend, player, store };
}

export async function renderApp(initial: Partial<Settings> = {}) {
  const ctx = await setup(initial);
  const view = render(
    <StoreProvider value={ctx.store}>
      <App />
    </StoreProvider>,
  );
  return { ...ctx, ...view };
}

/** Deja que se resuelvan las promesas pendientes dentro de `act`. */
export const flush = () => act(async () => {});
