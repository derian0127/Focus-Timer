import type { FullStyle } from "../ipc/types";
import { remainingFraction, suggestsBreak } from "../lib/time";
import { useModel, useStore } from "../state/context";
import { primaryAction } from "../strings";
import { IconButton } from "./controls";
import { Bar, Ring, Segments, Time } from "./Counter";

/**
 * Widget: lo que queda de la ventana al minimizar. Muestra solo el contador,
 * con el estilo elegido en Ajustes; el backend ajusta el tamaño de la ventana
 * a ese estilo (Digital 124 × 84, Minimal 124 × 60, Anillo 104 × 104). Los dos
 * botones aparecen al pasar el ratón; el resto de la superficie arrastra.
 */
export function WidgetView() {
  const store = useStore();
  const { timer, settings } = useModel();
  const style: FullStyle = settings.counterStyle === "compact" ? settings.lastFullStyle : settings.counterStyle;
  const showTime = timer.phase === "idle" || settings.timeVisibility === "show";
  const fraction = timer.phase === "finished" ? 1 : remainingFraction(timer);
  const action = primaryAction(timer, suggestsBreak(timer));
  const time = <Time ms={timer.remainingMs} />;
  return (
    <main className="widget" data-style={style} data-tauri-drag-region>
      <div className="widget-face">
        {style === "ring" ? (
          <Ring fraction={fraction} small>
            {showTime && time}
          </Ring>
        ) : style === "digital" ? (
          showTime ? (
            <>
              {time}
              <Bar fraction={fraction} />
            </>
          ) : (
            <Segments fraction={fraction} />
          )
        ) : showTime ? (
          time
        ) : (
          <Bar fraction={fraction} thin />
        )}
      </div>
      <div className="widget-actions">
        <IconButton icon={action.icon} label={action.label} variant="tonal" size={32} onClick={() => void store.toggle()} />
        <IconButton icon="expand" label="Ampliar ventana (Esc)" size={32} onClick={store.exitWidget} />
      </div>
    </main>
  );
}
