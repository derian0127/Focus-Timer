import { useEffect, useState } from "react";
import { SOUND_LABELS } from "../audio/synth";
import { MIN_WIDGET_OPACITY, type BuiltinSound, type CounterStyle } from "../ipc/types";
import { fileName, formatClock, parseClock } from "../lib/time";
import { useModel, useStore } from "../state/context";
import { APP_VERSION } from "../strings";
import { IconButton, Row, Segmented, Stack, Switch } from "./controls";
import { TitleBar } from "./TitleBar";

const STYLES: { value: CounterStyle; label: string }[] = [
  { value: "digital", label: "Digital" },
  { value: "ring", label: "Anillo" },
  { value: "minimal", label: "Minimal" },
  { value: "compact", label: "Compacto" },
];

const PICK = "__pick__";

function StyleGlyph({ style }: { style: CounterStyle }) {
  switch (style) {
    case "digital":
      return <span className="glyph-digital">25:00</span>;
    case "ring":
      return <span className="glyph-ring" />;
    case "minimal":
      return <span className="glyph-minimal" />;
    case "compact":
      return <span className="glyph-compact" />;
  }
}

function DurationField({ valueMs, onCommit }: { valueMs: number; onCommit: (ms: number) => void }) {
  const [text, setText] = useState(formatClock(valueMs));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setText(formatClock(valueMs)), [valueMs]);
  const commit = () => {
    const r = parseClock(text);
    if (r.ok) {
      setInvalid(false);
      setText(formatClock(r.ms));
      if (r.ms !== valueMs) onCommit(r.ms);
    } else setInvalid(true);
  };
  return (
    <div className="field-wrap">
      <input
        className="field"
        aria-label="Duración predeterminada, en minutos y segundos"
        aria-invalid={invalid}
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          setText(e.target.value.replace(/[^\d:]/g, "").slice(0, 6));
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            e.stopPropagation();
            setText(formatClock(valueMs));
            setInvalid(false);
          }
        }}
      />
      {invalid && (
        <span className="field-error" role="alert">
          Entre 00:01 y 180:00
        </span>
      )}
    </div>
  );
}

export function SettingsView() {
  const store = useStore();
  const { settings: s } = useModel();
  const patch = store.patchSettings;
  return (
    <>
      <TitleBar />
      <main className="settings">
        <h2 className="section">Sesión</h2>
        <Row label="Duración predeterminada">
          <DurationField valueMs={s.defaultDurationMs} onCommit={(ms) => void patch({ defaultDurationMs: ms })} />
        </Row>

        <h2 className="section">Apariencia</h2>
        <Stack label="Estilo del contador">
          <div className="tiles" role="radiogroup" aria-label="Estilo del contador">
            {STYLES.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={s.counterStyle === o.value}
                className="tile"
                onClick={() => void patch({ counterStyle: o.value })}
              >
                <span className="tile-glyph" aria-hidden="true">
                  <StyleGlyph style={o.value} />
                </span>
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        </Stack>
        <Stack label="Tiempo">
          <Segmented
            label="Tiempo"
            value={s.timeVisibility}
            options={[
              { value: "show", label: "Mostrar tiempo" },
              { value: "progress", label: "Solo progreso" },
            ]}
            onChange={(v) => void patch({ timeVisibility: v })}
          />
        </Stack>
        <Stack label="Tema">
          <Segmented
            label="Tema"
            value={s.theme}
            options={[
              { value: "system", label: "Sistema" },
              { value: "light", label: "Claro" },
              { value: "dark", label: "Oscuro" },
            ]}
            onChange={(v) => void patch({ theme: v })}
          />
        </Stack>
        <Stack label="Transparencia del widget">
          <div className="volume-row">
            <input
              className="slider"
              type="range"
              min={0}
              max={100 - MIN_WIDGET_OPACITY}
              step={5}
              aria-label="Transparencia del widget"
              value={100 - s.widgetOpacity}
              style={{ "--fill": `${((100 - s.widgetOpacity) / (100 - MIN_WIDGET_OPACITY)) * 100}%` } as React.CSSProperties}
              onChange={(e) => void patch({ widgetOpacity: 100 - Number(e.target.value) })}
            />
            <output className="volume-value volume-value-wide">{100 - s.widgetOpacity} %</output>
          </div>
        </Stack>

        <h2 className="section">Sonido</h2>
        <Stack label="Sonido al terminar">
          <div className="sound-row">
            <select
              className="select"
              aria-label="Sonido al terminar"
              value={s.sound}
              onChange={(e) => {
                const v = e.target.value;
                if (v === PICK) void store.pickCustomSound();
                else void patch({ sound: v as BuiltinSound | "custom" });
              }}
            >
              {(Object.keys(SOUND_LABELS) as BuiltinSound[]).map((k) => (
                <option key={k} value={k}>
                  {SOUND_LABELS[k]}
                </option>
              ))}
              {s.customSoundPath && <option value="custom">Archivo: {fileName(s.customSoundPath)}</option>}
              <option value={PICK}>Elegir archivo de audio…</option>
            </select>
            <IconButton icon="play" label="Escuchar vista previa" variant="tonal" onClick={() => void store.previewSound()} />
          </div>
        </Stack>
        <Stack label="Volumen">
          <div className="volume-row">
            <IconButton
              icon={s.muted ? "mute" : "volume"}
              label={s.muted ? "Activar sonido" : "Silenciar"}
              size={32}
              pressed={s.muted}
              onClick={() => void patch({ muted: !s.muted })}
            />
            <input
              className="slider"
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label="Volumen"
              disabled={s.muted}
              value={s.volume}
              style={{ "--fill": `${s.volume}%` } as React.CSSProperties}
              onChange={(e) => void patch({ volume: Number(e.target.value) })}
            />
            <output className="volume-value">{s.muted ? "—" : s.volume}</output>
          </div>
        </Stack>

        <h2 className="section">Sistema</h2>
        <Row label="Iniciar con Windows">
          <Switch label="Iniciar con Windows" checked={s.autostart} onChange={(v) => void patch({ autostart: v })} />
        </Row>
        <Stack label="Al cerrar la ventana">
          <Segmented
            label="Al cerrar la ventana"
            value={s.closeBehavior}
            options={[
              { value: "tray", label: "Minimizar a la bandeja" },
              { value: "exit", label: "Salir" },
            ]}
            onChange={(v) => void patch({ closeBehavior: v })}
          />
        </Stack>
        <p className="about">Focus Timer {APP_VERSION} · Tus datos no salen de este equipo</p>
      </main>
    </>
  );
}
