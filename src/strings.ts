import type { Snapshot } from "./ipc/types";

// Textos de la interfaz en un solo lugar.
export function statusLabel({ phase, kind }: Snapshot): string {
  if (phase === "idle") return "Listo";
  if (kind === "break") return phase === "running" ? "Descanso" : phase === "paused" ? "Descanso en pausa" : "Descanso terminado";
  return phase === "running" ? "En foco" : phase === "paused" ? "En pausa" : "Completada";
}

/** Acción principal de las vistas reducidas (compacta y widget) según la fase. */
export function primaryAction(timer: Snapshot, suggestBreak: boolean): { icon: "play" | "pause" | "restart"; label: string } {
  switch (timer.phase) {
    case "running":
      return { icon: "pause", label: "Pausar (Espacio)" };
    case "finished":
      return suggestBreak ? { icon: "play", label: "Iniciar descanso (Espacio)" } : { icon: "restart", label: "Nueva sesión (Espacio)" };
    case "paused":
      return { icon: "play", label: "Reanudar (Espacio)" };
    case "idle":
      return { icon: "play", label: "Iniciar (Espacio)" };
  }
}

export const PRESETS_MIN = [15, 25, 45, 60] as const;
export const APP_VERSION = "1.0";
