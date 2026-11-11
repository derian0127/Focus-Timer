import { useEffect, useRef, useState } from "react";
import { parseParts } from "../lib/time";

/**
 * Editor de minutos y segundos. Informa del valor válido actual (o `null`)
 * con `onChange`; Enter confirma y Esc descarta.
 */
export function DurationEditor({
  initialMs,
  onChange,
  onCommit,
  onCancel,
}: {
  initialMs: number;
  onChange: (ms: number | null) => void;
  onCommit: (ms: number) => void;
  onCancel: () => void;
}) {
  const total = Math.round(initialMs / 1_000);
  const [min, setMin] = useState(String(Math.floor(total / 60)));
  const [sec, setSec] = useState(String(total % 60).padStart(2, "0"));
  const minRef = useRef<HTMLInputElement>(null);
  const parsed = parseParts(min, sec);

  useEffect(() => {
    minRef.current?.select();
  }, []);
  useEffect(() => {
    onChange(parsed.ok ? parsed.ms : null);
  }, [min, sec]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && parsed.ok) {
      e.preventDefault();
      onCommit(parsed.ms);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };
  const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);

  return (
    <div className="editor" onKeyDown={onKeyDown}>
      <div className="editor-fields">
        <label className="editor-field">
          <input
            ref={minRef}
            className="editor-input"
            inputMode="numeric"
            aria-invalid={!parsed.ok}
            aria-describedby="editor-hint"
            value={min}
            onChange={(e) => setMin(digits(e.target.value, 3))}
          />
          <span>minutos</span>
        </label>
        <span className="editor-colon" aria-hidden="true">
          :
        </span>
        <label className="editor-field">
          <input
            className="editor-input"
            inputMode="numeric"
            aria-invalid={!parsed.ok}
            aria-describedby="editor-hint"
            value={sec}
            onChange={(e) => setSec(digits(e.target.value, 2))}
          />
          <span>segundos</span>
        </label>
      </div>
      <p id="editor-hint" className="caption" data-error={!parsed.ok || undefined} role={parsed.ok ? undefined : "alert"}>
        {parsed.ok ? "De 00:01 a 180:00 · Enter para confirmar" : "Introduce una duración entre 00:01 y 180:00"}
      </p>
    </div>
  );
}
