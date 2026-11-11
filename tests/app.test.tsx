import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { flush, renderApp } from "./helpers";

afterEach(cleanup);

const click = async (el: Element) => {
  fireEvent.click(el);
  await flush();
};
const key = async (k: string, init: KeyboardEventInit = {}) => {
  fireEvent.keyDown(document.body, { key: k, ...init });
  await flush();
};
const button = (name: RegExp) => screen.getByRole("button", { name });
const status = () => document.querySelector(".status")!.textContent;

describe("pantalla principal", () => {
  it("muestra la duración predeterminada, los preajustes y el estado", async () => {
    await renderApp();
    expect(screen.getByRole("timer")).toHaveProperty("textContent", "25:00");
    expect(status()).toBe("Listo");
    expect(button(/^25 min$/).getAttribute("aria-pressed")).toBe("true");
    expect(button(/^15 min$/).getAttribute("aria-pressed")).toBe("false");
  });

  it("inicia una sesión con una sola interacción", async () => {
    const { backend } = await renderApp();
    await click(button(/^Iniciar$/));
    expect(backend.calls).toEqual(["start"]);
    expect(status()).toBe("En foco");
    expect(screen.getByText(/Termina a las/)).toBeTruthy();
  });

  it("preajuste + iniciar son dos interacciones", async () => {
    const { backend } = await renderApp();
    await click(button(/^45 min$/));
    await click(button(/^Iniciar$/));
    expect(backend.calls).toEqual(["setDuration", "start"]);
    expect(screen.getByRole("timer").textContent).toBe("45:00");
  });

  it("pausa, reanuda, reinicia y cancela", async () => {
    const { backend } = await renderApp({ defaultDurationMs: 10 * 60_000 });
    await click(button(/^Iniciar$/));
    act(() => backend.advance(60_000));
    expect(screen.getByRole("timer").textContent).toBe("09:00");
    await click(button(/^Pausar$/));
    expect(status()).toBe("En pausa");
    expect(screen.getByText("Sesión en pausa")).toBeTruthy();
    act(() => backend.advance(60_000));
    expect(screen.getByRole("timer").textContent).toBe("09:00");
    await click(button(/^Reanudar$/));
    expect(status()).toBe("En foco");
    await click(button(/Reiniciar/));
    expect(screen.getByRole("timer").textContent).toBe("10:00");
    expect(status()).toBe("En foco");
    await click(button(/Cancelar sesión/));
    expect(status()).toBe("Listo");
    expect(button(/^Iniciar$/)).toBeTruthy();
  });

  it("al terminar muestra la indicación visual y permite repetir o cerrar", async () => {
    const { backend, player, container } = await renderApp({ defaultDurationMs: 60_000 });
    await click(button(/^Iniciar$/));
    act(() => backend.advance(60_000));
    expect(container.querySelector(".app")!.getAttribute("data-phase")).toBe("finished");
    expect(screen.getByText("Sesión completada")).toBeTruthy();
    expect(screen.getByText("1 minuto de enfoque")).toBeTruthy();
    expect(player.play).toHaveBeenCalledOnce();
    await click(button(/^Repetir$/));
    expect(status()).toBe("En foco");
    act(() => backend.advance(60_000));
    await click(button(/^Cerrar$/));
    expect(status()).toBe("Listo");
  });

  it("anuncia el cambio de estado a lectores de pantalla", async () => {
    const { container } = await renderApp();
    const live = container.querySelector("[aria-live=polite]")!;
    expect(live.textContent).toBe("Listo");
    await click(button(/^Iniciar$/));
    expect(live.textContent).toBe("En foco");
  });
});

describe("descanso sugerido", () => {
  const finish = async (ms: number) => {
    const ctx = await renderApp({ defaultDurationMs: ms });
    await click(button(/^Iniciar$/));
    act(() => ctx.backend.advance(ms));
    return ctx;
  };

  it("no se ofrece tras menos de 5 minutos de enfoque", async () => {
    await finish(5 * 60_000 - 1_000);
    expect(screen.queryByRole("group", { name: "Descanso sugerido" })).toBeNull();
    expect(button(/^Repetir$/)).toBeTruthy();
  });

  it("se ofrece tras 5 minutos, con la duración editable ahí mismo", async () => {
    const { backend, store } = await finish(5 * 60_000);
    expect(screen.getByRole("group", { name: "Descanso sugerido" })).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "Minutos de descanso" }) as HTMLInputElement;
    expect(input.value).toBe("5");
    await click(button(/Un minuto más/));
    await click(button(/Un minuto más/));
    expect(input.value).toBe("7");
    fireEvent.change(input, { target: { value: "12" } });
    await flush();
    expect(store.getState().settings.breakDurationMs).toBe(12 * 60_000);
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.change(input, { target: { value: "0" } });
    await flush();
    expect(store.getState().settings.breakDurationMs).toBe(12 * 60_000);
    await click(button(/^Descansar$/));
    expect(backend.calls.at(-1)).toBe("startBreak");
    expect(store.getState().timer).toEqual({ phase: "running", kind: "break", durationMs: 12 * 60_000, remainingMs: 12 * 60_000 });
    expect(status()).toBe("Descanso");
  });

  it("los límites del descanso son 1 y 60 minutos", async () => {
    await finish(5 * 60_000);
    const input = screen.getByRole("textbox", { name: "Minutos de descanso" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    await flush();
    expect((button(/Un minuto menos/) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "60" } });
    await flush();
    expect((button(/Un minuto más/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("al terminar el descanso suena el aviso y se vuelve al enfoque predeterminado", async () => {
    const { backend, player, store } = await finish(10 * 60_000);
    await click(button(/^Descansar$/));
    await click(button(/^Pausar$/));
    expect(status()).toBe("Descanso en pausa");
    await click(button(/^Reanudar$/));
    act(() => backend.advance(5 * 60_000));
    expect(status()).toBe("Descanso terminado");
    expect(screen.getByText("5 minutos de descanso")).toBeTruthy();
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("group", { name: "Descanso sugerido" })).toBeNull();
    await click(button(/^Nueva sesión$/));
    expect(store.getState().timer).toEqual({ phase: "running", kind: "focus", durationMs: 10 * 60_000, remainingMs: 10 * 60_000 });
  });

  it("Espacio inicia el descanso sugerido; Repetir y Cerrar siguen disponibles", async () => {
    const { backend } = await finish(5 * 60_000);
    expect(button(/^Repetir$/)).toBeTruthy();
    expect(button(/^Cerrar$/)).toBeTruthy();
    await key(" ");
    expect(backend.calls.at(-1)).toBe("startBreak");
    await key("Escape");
    expect(status()).toBe("Listo");
    expect(screen.getByRole("timer").textContent).toBe("05:00");
  });
});

describe("editor de duración", () => {
  const open = async () => click(button(/Cambiar duración/));
  const inputs = () => screen.getAllByRole("textbox") as HTMLInputElement[];

  it("permite escribir minutos y segundos y confirmar con Enter", async () => {
    const { backend } = await renderApp();
    await open();
    const [min, sec] = inputs();
    fireEvent.change(min!, { target: { value: "7" } });
    fireEvent.change(sec!, { target: { value: "30" } });
    fireEvent.keyDown(sec!, { key: "Enter" });
    await flush();
    expect(backend.calls).toEqual(["setDuration"]);
    expect(screen.getByRole("timer").textContent).toBe("07:30");
  });

  it("Iniciar aplica lo escrito y arranca", async () => {
    const { backend } = await renderApp();
    await open();
    fireEvent.change(inputs()[0]!, { target: { value: "50" } });
    await click(button(/^Iniciar$/));
    expect(backend.calls).toEqual(["start"]);
    expect(screen.getByRole("timer").textContent).toBe("50:00");
  });

  it("rechaza duraciones inválidas y bloquea Iniciar", async () => {
    const { backend } = await renderApp();
    await open();
    const [min, sec] = inputs();
    fireEvent.change(min!, { target: { value: "181" } });
    expect(screen.getByRole("alert").textContent).toMatch(/entre 00:01 y 180:00/);
    expect((button(/^Iniciar$/) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(min!, { key: "Enter" });
    fireEvent.change(min!, { target: { value: "0" } });
    fireEvent.change(sec!, { target: { value: "0" } });
    expect(min!.getAttribute("aria-invalid")).toBe("true");
    await flush();
    expect(backend.calls).toEqual([]);
  });

  it("descarta letras y símbolos al teclear", async () => {
    await renderApp();
    await open();
    const [min, sec] = inputs();
    fireEvent.change(min!, { target: { value: "1a-2.5e9" } });
    fireEvent.change(sec!, { target: { value: "599" } });
    expect(min!.value).toBe("125");
    expect(sec!.value).toBe("59");
  });

  it("Esc descarta sin cambiar la duración", async () => {
    const { backend } = await renderApp();
    await open();
    fireEvent.change(inputs()[0]!, { target: { value: "99" } });
    fireEvent.keyDown(inputs()[0]!, { key: "Escape" });
    await flush();
    expect(screen.getByRole("timer").textContent).toBe("25:00");
    expect(backend.calls).toEqual([]);
  });
});

describe("atajos de teclado", () => {
  it("Espacio inicia, pausa y reanuda; R reinicia; Esc cancela", async () => {
    const { backend } = await renderApp();
    await key(" ");
    expect(status()).toBe("En foco");
    await key(" ");
    expect(status()).toBe("En pausa");
    await key(" ");
    await key("r");
    await key("Escape");
    expect(backend.calls).toEqual(["start", "pause", "resume", "reset", "cancel"]);
    expect(status()).toBe("Listo");
  });

  it("1–4 eligen preajuste solo en reposo", async () => {
    const { backend } = await renderApp();
    await key("4");
    expect(screen.getByRole("timer").textContent).toBe("60:00");
    await key(" ");
    await key("1");
    expect(backend.calls).toEqual(["setDuration", "start"]);
  });

  it("Espacio sobre un botón enfocado no dispara dos acciones", async () => {
    const { backend } = await renderApp();
    const start = button(/^Iniciar$/);
    start.focus();
    fireEvent.keyDown(start, { key: " " });
    await flush();
    expect(backend.calls).toEqual([]);
  });

  it("Ctrl+, abre y cierra los ajustes; Esc vuelve", async () => {
    await renderApp();
    await key(",", { ctrlKey: true });
    expect(screen.getByRole("heading", { name: "Ajustes" })).toBeTruthy();
    await key("Escape");
    expect(screen.queryByRole("heading", { name: "Ajustes" })).toBeNull();
  });
});

describe("estilos de contador y visibilidad", () => {
  it("anillo, digital y minimal muestran el tiempo", async () => {
    for (const counterStyle of ["ring", "digital", "minimal"] as const) {
      const { container, unmount } = await renderApp({ counterStyle });
      await click(button(/^Iniciar$/));
      expect(screen.getByRole("timer").textContent).toBe("25:00");
      expect(container.querySelector(".ring") !== null).toBe(counterStyle === "ring");
      unmount();
    }
  });

  it("«solo progreso» oculta las cifras durante la sesión pero no en reposo", async () => {
    for (const counterStyle of ["ring", "digital", "minimal"] as const) {
      const { backend, unmount } = await renderApp({ counterStyle, timeVisibility: "progress", defaultDurationMs: 100_000 });
      expect(screen.getByRole("timer")).toBeTruthy();
      await click(button(/^Iniciar$/));
      expect(screen.queryByRole("timer")).toBeNull();
      act(() => backend.advance(25_000));
      expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("75");
      unmount();
    }
  });

  it("cambiar de estilo no altera la sesión en curso", async () => {
    const { backend, store } = await renderApp({ defaultDurationMs: 100_000 });
    await click(button(/^Iniciar$/));
    act(() => backend.advance(40_000));
    await act(() => store.patchSettings({ counterStyle: "digital" }));
    await act(() => store.patchSettings({ timeVisibility: "progress" }));
    await act(() => store.patchSettings({ counterStyle: "compact" }));
    expect(store.getState().timer).toEqual({ phase: "running", kind: "focus", durationMs: 100_000, remainingMs: 60_000 });
    expect(backend.calls.filter((c) => !c.startsWith("updateSettings"))).toEqual(["start"]);
  });

  it("ventana compacta: una acción y volver al tamaño completo", async () => {
    const { backend, container } = await renderApp({ counterStyle: "compact", lastFullStyle: "digital" });
    expect(container.querySelector(".compact")).toBeTruthy();
    await click(button(/Iniciar/));
    expect(backend.calls).toEqual(["start"]);
    await click(button(/Pausar/));
    await click(button(/Reanudar/));
    await click(button(/Ampliar ventana/));
    expect(container.querySelector(".compact")).toBeNull();
    expect(container.querySelector(".counter-digital")).toBeTruthy();
  });
});

describe("barra de título", () => {
  it("fija la ventana, la deja como widget y cierra", async () => {
    const { backend } = await renderApp();
    await click(button(/^Mantener siempre visible$/));
    expect(backend.calls).toContain('updateSettings:{"alwaysOnTop":true}');
    expect(button(/Dejar de mantener/).getAttribute("aria-pressed")).toBe("true");
    await click(button(/^Minimizar a widget$/));
    await click(button(/^Ampliar ventana/));
    await click(button(/^Cerrar ventana$/));
    expect(backend.calls.slice(-3)).toEqual(["widget:on", "widget:off", "close"]);
  });
});

describe("widget al minimizar", () => {
  it("deja solo el contador con el estilo elegido y dos acciones", async () => {
    for (const [style, selector] of [["ring", ".ring"], ["digital", ".bar"], ["minimal", ".time"]] as const) {
      const { container, unmount } = await renderApp({ counterStyle: style });
      await click(button(/^Minimizar a widget$/));
      expect(container.querySelector(`.widget[data-style=${style}] ${selector}`), style).toBeTruthy();
      expect(container.querySelector(".titlebar")).toBeNull();
      expect(screen.getByRole("timer").textContent).toBe("25:00");
      expect(screen.getAllByRole("button")).toHaveLength(2);
      unmount();
    }
  });

  it("controla la sesión sin ampliar y sigue el reloj", async () => {
    const { backend } = await renderApp({ defaultDurationMs: 10 * 60_000 });
    await click(button(/^Minimizar a widget$/));
    await click(button(/^Iniciar/));
    act(() => backend.advance(60_000));
    expect(screen.getByRole("timer").textContent).toBe("09:00");
    await key(" ");
    expect(button(/^Reanudar/)).toBeTruthy();
    expect(backend.calls).toEqual(["widget:on", "start", "pause"]);
  });

  it("Esc amplía sin cancelar la sesión", async () => {
    const { backend, container, store } = await renderApp();
    await click(button(/^Iniciar$/));
    await click(button(/^Minimizar a widget$/));
    await key("Escape");
    expect(container.querySelector(".widget")).toBeNull();
    expect(store.getState().timer.phase).toBe("running");
    expect(backend.calls).toEqual(["start", "widget:on", "widget:off"]);
  });

  it("«solo progreso» oculta las cifras y el estilo compacto usa el último estilo completo", async () => {
    const { container, store } = await renderApp({ counterStyle: "compact", lastFullStyle: "digital", timeVisibility: "progress" });
    await click(button(/Iniciar/));
    act(() => store.minimize());
    expect(container.querySelector(".widget[data-style=digital] .segments")).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
    await click(button(/^Ampliar ventana/));
    expect(container.querySelector(".compact")).toBeTruthy();
  });

  it("la transparencia se elige en Ajustes y solo afecta al widget", async () => {
    const { backend, container } = await renderApp();
    const app = () => container.querySelector<HTMLElement>(".app")!;
    await click(button(/^Ajustes/));
    const slider = screen.getByLabelText("Transparencia del widget");
    fireEvent.change(slider, { target: { value: "40" } });
    await flush();
    expect(backend.calls).toContain('updateSettings:{"widgetOpacity":60}');
    expect(app().style.getPropertyValue("--widget-opacity")).toBe("");
    await click(button(/^Volver/));
    await click(button(/^Minimizar a widget$/));
    expect(app().style.getPropertyValue("--widget-opacity")).toBe("60%");
  });

  it("sigue al sistema cuando minimiza o restaura la ventana", async () => {
    const { backend, container } = await renderApp();
    await click(button(/^Ajustes/));
    await act(() => backend.setWidget(true));
    expect(container.querySelector(".widget")).toBeTruthy();
    await act(() => backend.setWidget(false));
    expect(container.querySelector(".widget")).toBeNull();
    expect(button(/^Iniciar$/)).toBeTruthy();
  });
});

describe("ajustes", () => {
  const openSettings = () => click(button(/^Ajustes/));

  it("cada control guarda su valor", async () => {
    const { backend, store } = await renderApp();
    await openSettings();
    await click(screen.getByRole("radio", { name: "Digital" }));
    await click(screen.getByRole("radio", { name: "Solo progreso" }));
    await click(screen.getByRole("radio", { name: "Oscuro" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Sonido al terminar" }), { target: { value: "bowl" } });
    fireEvent.change(screen.getByRole("slider", { name: "Volumen" }), { target: { value: "20" } });
    await click(button(/^Silenciar$/));
    await click(screen.getByRole("switch", { name: "Iniciar con Windows" }));
    await click(screen.getByRole("radio", { name: "Salir" }));
    const duration = screen.getByRole("textbox", { name: /Duración predeterminada/ });
    fireEvent.change(duration, { target: { value: "50:00" } });
    fireEvent.blur(duration);
    await flush();
    expect(store.getState().settings).toMatchObject({
      counterStyle: "digital",
      timeVisibility: "progress",
      theme: "dark",
      sound: "bowl",
      volume: 20,
      muted: true,
      autostart: true,
      closeBehavior: "exit",
      defaultDurationMs: 50 * 60_000,
    });
    expect((await backend.getState()).settings).toEqual(store.getState().settings);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("la duración predeterminada inválida no se guarda", async () => {
    const { backend } = await renderApp();
    await openSettings();
    const duration = screen.getByRole("textbox", { name: /Duración predeterminada/ });
    fireEvent.change(duration, { target: { value: "500" } });
    fireEvent.blur(duration);
    await flush();
    expect(screen.getByRole("alert").textContent).toMatch(/00:01 y 180:00/);
    expect(backend.calls).toEqual([]);
  });

  it("la vista previa suena aunque esté silenciado y el selector abre el diálogo de archivo", async () => {
    const { backend, player } = await renderApp({ muted: true });
    await openSettings();
    await click(button(/Escuchar vista previa/));
    expect(player.play).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ muted: false }), null);
    fireEvent.change(screen.getByRole("combobox", { name: "Sonido al terminar" }), { target: { value: "__pick__" } });
    await flush();
    expect(backend.calls).toEqual(["pickCustomSound"]);
  });

  it("ofrece el archivo personalizado guardado", async () => {
    await renderApp({ sound: "custom", customSoundPath: "C:\\Users\\a\\Music\\ding.mp3" });
    await openSettings();
    const select = screen.getByRole("combobox", { name: "Sonido al terminar" }) as HTMLSelectElement;
    expect(select.value).toBe("custom");
    expect(within(select).getByText("Archivo: ding.mp3")).toBeTruthy();
  });

  it("Volver regresa al temporizador", async () => {
    await renderApp();
    await openSettings();
    await click(button(/^Volver/));
    expect(button(/^Iniciar$/)).toBeTruthy();
  });
});

describe("auditoría de la interfaz", () => {
  it("todo control tiene nombre accesible y ninguno carece de función", async () => {
    const views: [string, () => Promise<unknown>][] = [
      ["reposo", async () => {}],
      ["edición", async () => click(button(/Cambiar duración/))],
      ["en foco", async () => click(button(/^Iniciar$/))],
      ["ajustes", async () => click(button(/^Ajustes/))],
    ];
    for (const [name, go] of views) {
      const { unmount } = await renderApp();
      await go();
      const controls = [...document.querySelectorAll("button, input, select")];
      expect(controls.length, name).toBeGreaterThan(3);
      for (const c of controls) {
        const label = c.getAttribute("aria-label") ?? c.textContent ?? "";
        const labelled = label.trim() !== "" || c.closest("label") !== null;
        expect(labelled, `${name}: control sin nombre → ${c.outerHTML.slice(0, 80)}`).toBe(true);
      }
      unmount();
    }
  });

  it("cada botón de la sesión provoca un comando o un cambio de vista", async () => {
    const { backend, store } = await renderApp();
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      const before = JSON.stringify([backend.calls.length, store.getState()]);
      const next = screen.getAllByRole("button").find((b) => !seen.includes(b.getAttribute("aria-label") ?? b.textContent!));
      if (!next) break;
      seen.push(next.getAttribute("aria-label") ?? next.textContent!);
      await click(next);
      expect(JSON.stringify([backend.calls.length, store.getState()]), seen.at(-1)).not.toBe(before);
    }
    expect(seen.length).toBeGreaterThanOrEqual(8);
  });
});
