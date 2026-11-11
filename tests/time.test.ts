import { describe, expect, it } from "vitest";
import { displaySeconds, endsAt, fileName, formatClock, formatSpoken, parseClock, parseParts, remainingFraction, suggestsBreak } from "../src/lib/time";

describe("formato del tiempo", () => {
  it("redondea hacia arriba: 00:00 solo al terminar", () => {
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(25 * 60_000 - 1)).toBe("25:00");
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-50)).toBe("00:00");
    expect(displaySeconds(999)).toBe(1);
  });

  it("admite minutos de tres cifras", () => {
    expect(formatClock(180 * 60_000)).toBe("180:00");
    expect(formatClock(100 * 60_000 + 5_000)).toBe("100:05");
  });

  it("genera texto hablado en singular y plural", () => {
    expect(formatSpoken(25 * 60_000)).toBe("25 minutos");
    expect(formatSpoken(61_000)).toBe("1 minuto y 1 segundo");
    expect(formatSpoken(30_000)).toBe("30 segundos");
    expect(formatSpoken(0)).toBe("0 segundos");
  });

  it("calcula la fracción restante acotada", () => {
    expect(remainingFraction({ phase: "running", kind: "focus", durationMs: 1000, remainingMs: 250 })).toBe(0.25);
    expect(remainingFraction({ phase: "running", kind: "focus", durationMs: 1000, remainingMs: 5000 })).toBe(1);
    expect(remainingFraction({ phase: "finished", kind: "focus", durationMs: 1000, remainingMs: 0 })).toBe(0);
    expect(remainingFraction({ phase: "idle", kind: "focus", durationMs: 0, remainingMs: 0 })).toBe(0);
  });

  it("sugiere descanso solo tras 5 minutos o más de enfoque", () => {
    const done = (kind: "focus" | "break", durationMs: number) => ({ phase: "finished" as const, kind, durationMs, remainingMs: 0 });
    expect(suggestsBreak(done("focus", 5 * 60_000))).toBe(true);
    expect(suggestsBreak(done("focus", 5 * 60_000 - 1))).toBe(false);
    expect(suggestsBreak(done("break", 15 * 60_000))).toBe(false);
    expect(suggestsBreak({ phase: "running", kind: "focus", durationMs: 25 * 60_000, remainingMs: 1 })).toBe(false);
  });

  it("calcula la hora de fin", () => {
    const now = new Date(2026, 10, 10, 11, 0, 0);
    expect(endsAt(42 * 60_000, now)).toMatch(/11:42/);
  });

  it("extrae el nombre de archivo de rutas de Windows y POSIX", () => {
    expect(fileName("C:\\Users\\a\\Music\\ding.mp3")).toBe("ding.mp3");
    expect(fileName("/home/a/ding.ogg")).toBe("ding.ogg");
  });
});

describe("validación de duraciones", () => {
  it("acepta los límites", () => {
    expect(parseParts("0", "1")).toEqual({ ok: true, ms: 1_000 });
    expect(parseParts("180", "0")).toEqual({ ok: true, ms: 180 * 60_000 });
    expect(parseParts("25", "")).toEqual({ ok: true, ms: 25 * 60_000 });
    expect(parseParts("", "30")).toEqual({ ok: true, ms: 30_000 });
  });

  it("rechaza valores fuera de rango", () => {
    expect(parseParts("0", "0")).toEqual({ ok: false, reason: "range" });
    expect(parseParts("180", "1")).toEqual({ ok: false, reason: "range" });
    expect(parseParts("181", "0")).toEqual({ ok: false, reason: "range" });
    expect(parseParts("10", "60")).toEqual({ ok: false, reason: "range" });
    expect(parseParts("999", "59")).toEqual({ ok: false, reason: "range" });
  });

  it("rechaza texto que no son cifras", () => {
    for (const bad of ["-5", "1.5", "1e3", "abc", "2 5", "1234", "٣"]) {
      expect(parseParts(bad, "0")).toEqual({ ok: false, reason: "format" });
    }
    expect(parseParts("5", "x")).toEqual({ ok: false, reason: "format" });
  });

  it("interpreta MM:SS y minutos sueltos", () => {
    expect(parseClock("25:00")).toEqual({ ok: true, ms: 25 * 60_000 });
    expect(parseClock(" 1:30 ")).toEqual({ ok: true, ms: 90_000 });
    expect(parseClock("45")).toEqual({ ok: true, ms: 45 * 60_000 });
    expect(parseClock("1:2:3")).toEqual({ ok: false, reason: "format" });
    expect(parseClock("")).toEqual({ ok: false, reason: "range" });
    expect(parseClock(":")).toEqual({ ok: false, reason: "range" });
  });
});
