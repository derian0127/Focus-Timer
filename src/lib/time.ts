import { BREAK_SUGGESTION_THRESHOLD_MS, MAX_DURATION_MS, MIN_DURATION_MS, type Snapshot } from "../ipc/types";

/** Segundos que se muestran: se redondea hacia arriba para que 00:00 solo aparezca al terminar. */
export function displaySeconds(ms: number): number {
  return Math.ceil(Math.max(0, ms) / 1_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `MM:SS`; los minutos pueden tener tres cifras (hasta 180:00). */
export function formatClock(ms: number): string {
  const total = displaySeconds(ms);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Texto para lectores de pantalla: «15 minutos y 32 segundos». */
export function formatSpoken(ms: number): string {
  const total = displaySeconds(ms);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} ${m === 1 ? "minuto" : "minutos"}`);
  if (s > 0 || m === 0) parts.push(`${s} ${s === 1 ? "segundo" : "segundos"}`);
  return parts.join(" y ");
}

export type ParseResult = { ok: true; ms: number } | { ok: false; reason: "format" | "range" };

const DIGITS = /^\d{1,3}$/;

/** Valida minutos y segundos escritos por el usuario. */
export function parseParts(minutes: string, seconds: string): ParseResult {
  const m = minutes.trim() === "" ? "0" : minutes.trim();
  const s = seconds.trim() === "" ? "0" : seconds.trim();
  if (!DIGITS.test(m) || !DIGITS.test(s)) return { ok: false, reason: "format" };
  const mi = Number(m);
  const si = Number(s);
  if (si > 59) return { ok: false, reason: "range" };
  const ms = (mi * 60 + si) * 1_000;
  if (ms < MIN_DURATION_MS || ms > MAX_DURATION_MS) return { ok: false, reason: "range" };
  return { ok: true, ms };
}

/** Acepta `MM:SS` o solo minutos (`25`). */
export function parseClock(text: string): ParseResult {
  const t = text.trim();
  if (t.includes(":")) {
    const [m = "", s = "", extra] = t.split(":");
    if (extra !== undefined) return { ok: false, reason: "format" };
    return parseParts(m, s);
  }
  return parseParts(t, "0");
}

/** Al terminar una sesión de enfoque de 5 minutos o más se sugiere un descanso. */
export function suggestsBreak(s: Snapshot): boolean {
  return s.phase === "finished" && s.kind === "focus" && s.durationMs >= BREAK_SUGGESTION_THRESHOLD_MS;
}

/** Fracción de tiempo restante, entre 0 y 1. */
export function remainingFraction(s: Snapshot): number {
  if (s.durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, s.remainingMs / s.durationMs));
}

/** Hora local a la que termina la sesión, p. ej. «11:42». */
export function endsAt(remainingMs: number, now: Date = new Date()): string {
  return new Date(now.getTime() + remainingMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
