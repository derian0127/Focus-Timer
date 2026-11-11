import { useState } from "react";
import type { FullStyle } from "../ipc/types";
import { MAX_BREAK_MS, MIN_BREAK_MS } from "../ipc/types";
import { endsAt, formatSpoken, suggestsBreak } from "../lib/time";
import { useModel, useStore } from "../state/context";
import { PRESETS_MIN } from "../strings";
import { Button, Chip, IconButton } from "./controls";
import { Counter, Ring, Time } from "./Counter";
import { DurationEditor } from "./DurationEditor";
import { Icon } from "./icons";
import { TitleBar } from "./TitleBar";

/** Minutos de descanso editables: botones − y +, o escribiendo el número (1–60). */
function BreakStepper({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const [text, setText] = useState(String(minutes));
  const [min, max] = [MIN_BREAK_MS / 60_000, MAX_BREAK_MS / 60_000];
  const set = (m: number) => {
    const v = Math.min(max, Math.max(min, m));
    setText(String(v));
    if (v !== minutes) onChange(v);
  };
  return (
    <div className="break" role="group" aria-label="Descanso sugerido">
      <span className="break-label">Descanso</span>
      <IconButton icon="min" label="Un minuto menos" size={32} disabled={minutes <= min} onClick={() => set(minutes - 1)} />
      <input
        className="break-input"
        inputMode="numeric"
        aria-label="Minutos de descanso"
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/\D/g, "").slice(0, 2);
          setText(t);
          const n = Number(t);
          if (t !== "" && n >= min && n <= max && n !== minutes) onChange(n);
        }}
        onBlur={() => setText(String(minutes))}
      />
      <span className="break-unit">min</span>
      <IconButton icon="plus" label="Un minuto más" size={32} disabled={minutes >= max} onClick={() => set(minutes + 1)} />
    </div>
  );
}

export function TimerView() {
  const store = useStore();
  const { timer, settings, editing } = useModel();
  const [draft, setDraft] = useState<number | null>(timer.durationMs);
  const { phase } = timer;
  const style: FullStyle = settings.counterStyle === "compact" ? settings.lastFullStyle : settings.counterStyle;
  // En reposo siempre se ven las cifras: hay que poder leer y elegir la duración.
  const showTime = phase === "idle" || settings.timeVisibility === "show";
  const onBreak = timer.kind === "break";
  const offerBreak = suggestsBreak(timer);
  const breakMinutes = Math.round(settings.breakDurationMs / 60_000);

  return (
    <>
      <TitleBar />
      <main className="content">
        {phase === "finished" ? (
          <>
            <Ring fraction={1} small={offerBreak}>
              <Icon name="check" size={offerBreak ? 40 : 56} />
            </Ring>
            <div className="done-text">
              <h1>{onBreak ? "Descanso terminado" : "Sesión completada"}</h1>
              <p>
                {formatSpoken(timer.durationMs)} de {onBreak ? "descanso" : "enfoque"}
              </p>
            </div>
            {offerBreak && (
              <BreakStepper minutes={breakMinutes} onChange={(m) => void store.patchSettings({ breakDurationMs: m * 60_000 })} />
            )}
          </>
        ) : editing ? (
          <DurationEditor
            initialMs={timer.durationMs}
            onChange={setDraft}
            onCommit={(ms) => {
              void store.setDuration(ms);
              store.setEditing(false);
            }}
            onCancel={() => store.setEditing(false)}
          />
        ) : phase === "idle" ? (
          <>
            <button
              type="button"
              className="time-button"
              aria-label={`Cambiar duración: ${formatSpoken(timer.durationMs)}`}
              title="Cambiar duración"
              onClick={() => {
                setDraft(timer.durationMs);
                store.setEditing(true);
              }}
            >
              {style === "ring" ? (
                <Ring fraction={1}>
                  <Time ms={timer.remainingMs} className="time-lg" />
                </Ring>
              ) : (
                <Time ms={timer.remainingMs} className={style === "digital" ? "time-xl" : "time-lg"} />
              )}
            </button>
            <div className="presets" role="group" aria-label="Duraciones preestablecidas">
              {PRESETS_MIN.map((m) => (
                <Chip key={m} selected={timer.durationMs === m * 60_000} onClick={() => void store.setDuration(m * 60_000)}>
                  {m} min
                </Chip>
              ))}
            </div>
          </>
        ) : (
          <>
            <Counter style={style} showTime={showTime} timer={timer} />
            <p className="caption">
              {phase === "paused" ? (onBreak ? "Descanso en pausa" : "Sesión en pausa") : `Termina a las ${endsAt(timer.remainingMs)}`}
            </p>
          </>
        )}
      </main>
      <footer className="controls">
        {phase === "idle" && (
          <Button
            variant="filled"
            icon="play"
            title="Iniciar (Espacio)"
            disabled={editing && draft === null}
            onClick={() => void store.start(editing && draft !== null ? draft : undefined)}
          >
            Iniciar
          </Button>
        )}
        {(phase === "running" || phase === "paused") && (
          <>
            <IconButton icon="restart" label="Reiniciar (R)" variant="tonal" size={48} onClick={() => void store.reset()} />
            {phase === "running" ? (
              <Button variant="tonal" icon="pause" title="Pausar (Espacio)" onClick={() => void store.toggle()}>
                Pausar
              </Button>
            ) : (
              <Button variant="filled" icon="play" title="Reanudar (Espacio)" onClick={() => void store.toggle()}>
                Reanudar
              </Button>
            )}
            <IconButton icon="close" label="Cancelar sesión (Esc)" variant="tonal" size={48} onClick={() => void store.cancel()} />
          </>
        )}
        {phase === "finished" && offerBreak && (
          <>
            <Button variant="tertiary" icon="play" title="Iniciar descanso (Espacio)" onClick={() => void store.startBreak()}>
              Descansar
            </Button>
            <Button variant="text" size="m" title="Repetir la sesión de enfoque" onClick={() => void store.start()}>
              Repetir
            </Button>
            <Button variant="text" size="m" title="Cerrar (Esc)" onClick={() => void store.cancel()}>
              Cerrar
            </Button>
          </>
        )}
        {phase === "finished" && !offerBreak && (
          <>
            <Button variant="tertiary" icon={onBreak ? "play" : "restart"} title={`${onBreak ? "Nueva sesión" : "Repetir"} (Espacio)`} onClick={() => void store.start()}>
              {onBreak ? "Nueva sesión" : "Repetir"}
            </Button>
            <Button variant="text" title="Cerrar (Esc)" onClick={() => void store.cancel()}>
              Cerrar
            </Button>
          </>
        )}
      </footer>
    </>
  );
}
