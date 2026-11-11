import { describe, expect, it } from "vitest";
import { setup } from "./helpers";

describe("store de la interfaz", () => {
  it("carga el estado inicial del backend", async () => {
    const { store } = await setup({ defaultDurationMs: 45 * 60_000, theme: "dark" });
    const s = store.getState();
    expect(s.ready).toBe(true);
    expect(s.timer).toEqual({ phase: "idle", kind: "focus", durationMs: 45 * 60_000, remainingMs: 45 * 60_000 });
    expect(s.settings.theme).toBe("dark");
  });

  it("toggle recorre iniciar → pausar → reanudar", async () => {
    const { store } = await setup();
    await store.toggle();
    expect(store.getState().timer.phase).toBe("running");
    await store.toggle();
    expect(store.getState().timer.phase).toBe("paused");
    await store.toggle();
    expect(store.getState().timer.phase).toBe("running");
  });

  it("refleja los eventos del backend aunque nadie pulse nada", async () => {
    const { store, backend } = await setup({ defaultDurationMs: 60_000 });
    await store.start();
    backend.advance(20_000);
    expect(store.getState().timer.remainingMs).toBe(40_000);
  });

  it("reiniciar conserva la fase y cancelar vuelve a la duración predeterminada", async () => {
    const { store, backend } = await setup({ defaultDurationMs: 60_000 });
    await store.setDuration(120_000);
    await store.start();
    backend.advance(30_000);
    await store.reset();
    expect(store.getState().timer).toEqual({ phase: "running", kind: "focus", durationMs: 120_000, remainingMs: 120_000 });
    await store.cancel();
    expect(store.getState().timer).toEqual({ phase: "idle", kind: "focus", durationMs: 60_000, remainingMs: 60_000 });
  });

  it("al terminar suena el aviso con la configuración vigente", async () => {
    const { store, backend, player } = await setup({ defaultDurationMs: 5_000, sound: "wood", volume: 40 });
    await store.start();
    backend.advance(5_000);
    expect(store.getState().timer.phase).toBe("finished");
    expect(player.play).toHaveBeenCalledExactlyOnceWith({ sound: "wood", volume: 40, muted: false }, null);
  });

  it("silenciado se respeta al terminar, pero la vista previa suena", async () => {
    const { store, backend, player } = await setup({ defaultDurationMs: 5_000, muted: true });
    await store.start();
    backend.advance(5_000);
    expect(player.play).toHaveBeenLastCalledWith(expect.objectContaining({ muted: true }), null);
    await store.previewSound();
    expect(player.play).toHaveBeenLastCalledWith(expect.objectContaining({ muted: false }), null);
  });

  it("repetir o cancelar detiene el sonido", async () => {
    const { store, backend, player } = await setup({ defaultDurationMs: 5_000 });
    await store.start();
    backend.advance(5_000);
    player.stop.mockClear();
    await store.start();
    expect(player.stop).toHaveBeenCalled();
    expect(store.getState().timer.phase).toBe("running");
  });

  it("un comando rechazado no rompe la vista", async () => {
    const { store } = await setup();
    await store.reset();
    await store.setDuration(0);
    expect(store.getState().timer.phase).toBe("idle");
    expect(store.getState().timer.durationMs).toBe(25 * 60_000);
  });

  it("guarda cada ajuste en el backend y adopta el valor validado", async () => {
    const { store, backend } = await setup();
    await store.patchSettings({ volume: 35 });
    await store.patchSettings({ counterStyle: "digital" });
    await store.patchSettings({ counterStyle: "compact" });
    expect(backend.calls).toContain('updateSettings:{"volume":35}');
    expect((await backend.getState()).settings.volume).toBe(35);
    expect(store.getState().settings.lastFullStyle).toBe("digital");
    await store.expandFromCompact();
    expect(store.getState().settings.counterStyle).toBe("digital");
  });

  it("sonido personalizado sin archivo vuelve a la campana", async () => {
    const { store } = await setup();
    await store.patchSettings({ sound: "custom" });
    expect(store.getState().settings.sound).toBe("bell");
  });

  it("cambiar la duración predeterminada actualiza el contador en reposo, no una sesión en curso", async () => {
    const { store } = await setup();
    await store.patchSettings({ defaultDurationMs: 10 * 60_000 });
    expect(store.getState().timer.durationMs).toBe(10 * 60_000);
    await store.start();
    await store.patchSettings({ defaultDurationMs: 50 * 60_000 });
    expect(store.getState().timer.durationMs).toBe(10 * 60_000);
  });

  it("el editor solo se abre en reposo y se cierra al empezar", async () => {
    const { store } = await setup();
    store.setEditing(true);
    expect(store.getState().editing).toBe(true);
    await store.start();
    expect(store.getState().editing).toBe(false);
    store.setEditing(true);
    expect(store.getState().editing).toBe(false);
  });
});
