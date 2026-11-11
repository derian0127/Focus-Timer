import type { BuiltinSound } from "../ipc/types";

// Sonidos integrados sintetizados con Web Audio: no hay archivos de audio que
// empaquetar ni licenciar. Cada parcial es un oscilador senoidal con una
// envolvente de ataque corto y caída exponencial.

interface Partial {
  /** Frecuencia en Hz. */
  f: number;
  /** Ganancia de pico relativa (0–1). */
  g: number;
  /** Segundos hasta que el parcial se apaga. */
  decay: number;
  /** Retraso respecto al inicio del sonido, en segundos. */
  at?: number;
  attack?: number;
}

const bellNote = (f: number, at = 0, scale = 1): Partial[] =>
  [
    [1, 1, 2.2],
    [2, 0.45, 1.6],
    [3.01, 0.22, 1.1],
    [4.2, 0.1, 0.7],
    [5.43, 0.05, 0.5],
  ].map(([ratio, g, decay]) => ({ f: f * ratio!, g: g! * scale, decay: decay!, at }));

const woodNote = (f: number, at = 0): Partial[] => [
  { f, g: 1, decay: 0.45, at },
  { f: f * 4, g: 0.25, decay: 0.12, at },
  { f: f * 9.2, g: 0.06, decay: 0.05, at },
];

export const PATCHES: Record<BuiltinSound, Partial[]> = {
  // Campana suave: un solo golpe con parciales ligeramente inarmónicos.
  bell: bellNote(660),
  // Cuenco: grave y largo; los pares desafinados producen un batido lento.
  bowl: [
    { f: 196, g: 1, decay: 4.2, attack: 0.04 },
    { f: 196.9, g: 0.8, decay: 4.2, attack: 0.04 },
    { f: 531, g: 0.35, decay: 3, attack: 0.04 },
    { f: 532.6, g: 0.3, decay: 3, attack: 0.04 },
    { f: 1009, g: 0.12, decay: 1.8, attack: 0.04 },
  ],
  // Madera: dos toques secos tipo marimba.
  wood: [...woodNote(523.25), ...woodNote(783.99, 0.16)],
  // Dos notas: intervalo ascendente de cuarta.
  chime: [...bellNote(783.99, 0, 0.8), ...bellNote(1046.5, 0.28, 0.8)],
};

export const SOUND_LABELS: Record<BuiltinSound, string> = {
  bell: "Campana suave",
  bowl: "Cuenco",
  wood: "Madera",
  chime: "Dos notas",
};

/** Duración total del sonido en segundos. */
export function patchDuration(name: BuiltinSound): number {
  return Math.max(...PATCHES[name].map((p) => (p.at ?? 0) + p.decay));
}

/**
 * Programa el sonido en `ctx` a partir de `when` y lo conecta a `dest`.
 * Devuelve los osciladores creados para poder detenerlos.
 */
export function schedulePatch(ctx: BaseAudioContext, dest: AudioNode, name: BuiltinSound, when: number): OscillatorNode[] {
  const partials = PATCHES[name];
  // Se normaliza para que la suma de picos no sature.
  const norm = 1 / partials.reduce((sum, p) => sum + p.g, 0);
  return partials.map((p) => {
    const t0 = when + (p.at ?? 0);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(p.f, t0);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(p.g * norm, t0 + (p.attack ?? 0.005));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay);
    osc.connect(env);
    env.connect(dest);
    osc.start(t0);
    osc.stop(t0 + p.decay + 0.05);
    return osc;
  });
}
