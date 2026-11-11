import { useEffect } from "react";
import { useModel, useStore } from "./state/context";
import { PRESETS_MIN, statusLabel } from "./strings";
import { CompactView } from "./ui/CompactView";
import { SettingsView } from "./ui/SettingsView";
import { TimerView } from "./ui/TimerView";
import { WidgetView } from "./ui/WidgetView";

const prefersDark = () => window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

/** Un atajo de una sola tecla no debe dispararse mientras se escribe o con un control enfocado. */
function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("input, select, textarea, button, [role=radio], [role=switch]") !== null;
}

export function App() {
  const store = useStore();
  const { ready, timer, settings, view, widget } = useModel();
  const compact = settings.counterStyle === "compact";

  // Tema: «Sistema» sigue la preferencia de Windows en vivo.
  useEffect(() => {
    const mq = prefersDark();
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && mq?.matches === true);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    if (settings.theme !== "system" || !mq) return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { timer, view, editing, widget } = store.getState();
      if (widget) {
        // En el widget solo valen Espacio (acción principal) y Esc (ampliar).
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key === "Escape") store.exitWidget();
        else if (e.key === " " && !isInteractive(e.target)) {
          e.preventDefault();
          void store.toggle();
        }
        return;
      }
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        store.setView(view === "settings" ? "timer" : "settings");
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "Escape") {
        if (view === "settings") store.setView("timer");
        else if (editing) store.setEditing(false);
        else if (timer.phase !== "idle") void store.cancel();
        return;
      }
      if (view === "settings" || isInteractive(e.target)) return;
      if (e.key === " ") {
        e.preventDefault();
        void store.toggle();
      } else if (e.key.toLowerCase() === "r") {
        void store.reset();
      } else if (timer.phase === "idle" && /^[1-4]$/.test(e.key)) {
        void store.setDuration(PRESETS_MIN[Number(e.key) - 1]! * 60_000);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  if (!ready) return <div className="app" />;
  return (
    <div className="app" data-phase={timer.phase} data-kind={timer.kind} data-compact={(compact && !widget) || undefined} data-widget={widget || undefined}
      style={widget ? ({ "--widget-opacity": `${settings.widgetOpacity}%` } as React.CSSProperties) : undefined}
    >
      {widget ? <WidgetView /> : compact ? <CompactView /> : view === "settings" ? <SettingsView /> : <TimerView />}
      <div className="sr-only" aria-live="polite">
        {statusLabel(timer)}
      </div>
    </div>
  );
}
