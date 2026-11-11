import type { BuiltinSound, Sound } from "../ipc/types";
import { schedulePatch } from "./synth";

export interface PlayOptions {
  sound: Sound;
  /** 0–100. */
  volume: number;
  muted: boolean;
}

/** Curva perceptual: el control lineal 0–100 se eleva al cuadrado. */
export function gainFor(volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return v * v;
}

/**
 * Reproduce el aviso de fin de sesión y las vistas previas.
 * El `AudioContext` se crea en el primer uso y se reutiliza.
 */
export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private stopCurrent: (() => void) | null = null;
  private custom: { key: string; buffer: AudioBuffer } | null = null;

  constructor(
    private readonly createContext: () => AudioContext = () => new AudioContext(),
    private readonly loadCustom: () => Promise<ArrayBuffer> = () => Promise.reject(new Error("sin sonido personalizado")),
  ) {}

  /** Olvida el archivo personalizado decodificado (p. ej. al elegir otro). */
  invalidateCustom(): void {
    this.custom = null;
  }

  stop(): void {
    this.stopCurrent?.();
    this.stopCurrent = null;
  }

  /** Devuelve `true` si se ha emitido sonido. */
  async play(opts: PlayOptions, customKey: string | null = null): Promise<boolean> {
    if (opts.muted || opts.volume <= 0) return false;
    this.stop();
    const ctx = (this.ctx ??= this.createContext());
    if (ctx.state === "suspended") await ctx.resume();
    const master = ctx.createGain();
    master.gain.value = gainFor(opts.volume);
    master.connect(ctx.destination);

    if (opts.sound === "custom") {
      const buffer = await this.customBuffer(ctx, customKey);
      if (buffer) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(master);
        src.start();
        this.stopCurrent = () => {
          try {
            src.stop();
          } catch {
            /* ya había terminado */
          }
          master.disconnect();
        };
        return true;
      }
    }
    // Si el archivo personalizado falta o no se puede decodificar, suena la campana.
    const builtin: BuiltinSound = opts.sound === "custom" ? "bell" : opts.sound;
    const oscs = schedulePatch(ctx, master, builtin, ctx.currentTime + 0.02);
    this.stopCurrent = () => {
      for (const o of oscs) {
        try {
          o.stop();
        } catch {
          /* ya había terminado */
        }
      }
      master.disconnect();
    };
    return true;
  }

  private async customBuffer(ctx: AudioContext, key: string | null): Promise<AudioBuffer | null> {
    if (key && this.custom?.key === key) return this.custom.buffer;
    try {
      const bytes = await this.loadCustom();
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      if (key) this.custom = { key, buffer };
      return buffer;
    } catch {
      return null;
    }
  }
}
