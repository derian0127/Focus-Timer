import type { FullStyle, Snapshot } from "../ipc/types";
import { formatClock, formatSpoken, remainingFraction } from "../lib/time";

/** Tiempo restante. `role="timer"` no interrumpe al lector de pantalla cada segundo. */
export function Time({ ms, className = "" }: { ms: number; className?: string }) {
  const text = formatClock(ms);
  return (
    <span className={`time ${className}`} role="timer" aria-label={`Quedan ${formatSpoken(ms)}`} data-long={text.length > 5 || undefined}>
      {text}
    </span>
  );
}

export function Bar({ fraction, thin = false }: { fraction: number; thin?: boolean }) {
  return (
    <div className={`bar ${thin ? "bar-thin" : ""}`} role="progressbar" aria-label="Tiempo restante" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
      <div className="bar-fill" style={{ transform: `scaleX(${fraction})` }} />
    </div>
  );
}

const SEGMENTS = 12;

export function Segments({ fraction }: { fraction: number }) {
  const lit = Math.ceil(fraction * SEGMENTS);
  return (
    <div className="segments" role="progressbar" aria-label="Tiempo restante" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span key={i} className="segments-cell" data-lit={i < lit || undefined} />
      ))}
    </div>
  );
}

export function Ring({ fraction, children, small = false }: { fraction: number; children?: React.ReactNode; small?: boolean }) {
  return (
    <div className={`ring ${small ? "ring-sm" : ""}`}>
      <svg viewBox="0 0 100 100" role="progressbar" aria-label="Tiempo restante" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
        <circle className="ring-track" cx="50" cy="50" r="48" />
        {fraction > 0 && (
          <circle className="ring-fill" cx="50" cy="50" r="48" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - fraction} />
        )}
      </svg>
      <div className="ring-content">{children}</div>
    </div>
  );
}

/**
 * Contador de la ventana principal en uno de los tres estilos completos.
 * `showTime=false` deja solo el indicador de progreso.
 */
export function Counter({ style, showTime, timer }: { style: FullStyle; showTime: boolean; timer: Snapshot }) {
  const fraction = remainingFraction(timer);
  const time = <Time ms={timer.remainingMs} className={style === "digital" ? "time-xl" : "time-lg"} />;
  switch (style) {
    case "ring":
      return <Ring fraction={fraction}>{showTime && time}</Ring>;
    case "digital":
      return showTime ? (
        <div className="counter-digital">
          {time}
          <Bar fraction={fraction} />
        </div>
      ) : (
        <Segments fraction={fraction} />
      );
    case "minimal":
      return showTime ? time : <Bar fraction={fraction} thin />;
  }
}
