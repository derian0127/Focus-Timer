import { remainingFraction, suggestsBreak } from "../lib/time";
import { useModel, useStore } from "../state/context";
import { primaryAction, statusLabel } from "../strings";
import { IconButton } from "./controls";
import { Bar, Time } from "./Counter";

/** Ventana compacta de 300 × 64: estado, tiempo, progreso y una acción. */
export function CompactView() {
  const store = useStore();
  const { timer, settings } = useModel();
  const { phase } = timer;
  const showTime = phase === "idle" || settings.timeVisibility === "show";
  const action = primaryAction(timer, suggestsBreak(timer));
  return (
    <main className="compact" data-tauri-drag-region>
      <span className="status-dot" role="img" aria-label={statusLabel(timer)} />
      {showTime && <Time ms={timer.remainingMs} className="time-sm" />}
      <Bar fraction={phase === "finished" ? 1 : remainingFraction(timer)} />
      <div className="compact-actions">
        <IconButton icon={action.icon} label={action.label} variant="tonal" onClick={() => void store.toggle()} />
        <IconButton icon="expand" label="Ampliar ventana" onClick={() => void store.expandFromCompact()} />
      </div>
    </main>
  );
}
