import { describe, expect, it, vi } from "vitest";
import { gainFor, SoundPlayer } from "../src/audio/player";
import { patchDuration, PATCHES, schedulePatch, SOUND_LABELS } from "../src/audio/synth";
import type { BuiltinSound } from "../src/ipc/types";

/** AudioContext mínimo que registra lo que se programa. */
function fakeContext(state: AudioContextState = "running") {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; frequency: ReturnType<typeof param> }[] = [];
  const gains: { gain: ReturnType<typeof param>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; buffer: unknown }[] = [];
  const ctx = {
    state,
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    createOscillator: vi.fn(() => {
      const o = { type: "sine", frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(o);
      return o;
    }),
    createGain: vi.fn(() => {
      const g = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
      gains.push(g);
      return g;
    }),
    createBufferSource: vi.fn(() => {
      const s = { buffer: null as unknown, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      sources.push(s);
      return s;
    }),
    decodeAudioData: vi.fn(async (b: ArrayBuffer) => ({ decodedBytes: b.byteLength })),
  };
  return { ctx, oscillators, gains, sources, asContext: () => ctx as unknown as AudioContext };
}

const sounds = Object.keys(PATCHES) as BuiltinSound[];

describe("sonidos integrados", () => {
  it("hay cuatro, todos con nombre", () => {
    expect(sounds).toEqual(["bell", "bowl", "wood", "chime"]);
    for (const s of sounds) expect(SOUND_LABELS[s]).toBeTruthy();
  });

  it.each(sounds)("%s: discreto (≤ 5 s) y con parciales válidos", (name) => {
    expect(patchDuration(name)).toBeGreaterThan(0.3);
    expect(patchDuration(name)).toBeLessThanOrEqual(5);
    for (const p of PATCHES[name]) {
      expect(p.f).toBeGreaterThan(60);
      expect(p.f).toBeLessThan(8000);
      expect(p.g).toBeGreaterThan(0);
      expect(p.decay).toBeGreaterThan(0);
    }
  });

  it.each(sounds)("%s: programa un oscilador por parcial sin saturar", (name) => {
    const f = fakeContext();
    const oscs = schedulePatch(f.asContext(), {} as AudioNode, name, 1);
    expect(oscs).toHaveLength(PATCHES[name].length);
    const peaks = f.gains.map((g) => g.gain.linearRampToValueAtTime.mock.calls[0]![0] as number);
    expect(peaks.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    for (const o of f.oscillators) {
      expect(o.start).toHaveBeenCalledOnce();
      expect(o.stop).toHaveBeenCalledOnce();
      expect(o.start.mock.calls[0]![0]).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("reproductor", () => {
  it("la curva de volumen es cuadrática y acotada", () => {
    expect(gainFor(0)).toBe(0);
    expect(gainFor(50)).toBe(0.25);
    expect(gainFor(100)).toBe(1);
    expect(gainFor(250)).toBe(1);
    expect(gainFor(-5)).toBe(0);
  });

  it("reproduce el sonido elegido con el volumen indicado", async () => {
    const f = fakeContext();
    const player = new SoundPlayer(f.asContext);
    expect(await player.play({ sound: "wood", volume: 50, muted: false })).toBe(true);
    expect(f.oscillators).toHaveLength(PATCHES.wood.length);
    expect(f.gains[0]!.gain.value).toBe(0.25);
  });

  it("no suena si está silenciado o el volumen es 0", async () => {
    const f = fakeContext();
    const create = vi.fn(f.asContext);
    const player = new SoundPlayer(create);
    expect(await player.play({ sound: "bell", volume: 80, muted: true })).toBe(false);
    expect(await player.play({ sound: "bell", volume: 0, muted: false })).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("reanuda un contexto suspendido y lo reutiliza", async () => {
    const f = fakeContext("suspended");
    const create = vi.fn(f.asContext);
    const player = new SoundPlayer(create);
    await player.play({ sound: "bell", volume: 70, muted: false });
    await player.play({ sound: "bell", volume: 70, muted: false });
    expect(f.ctx.resume).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it("detiene el sonido anterior al reproducir otro", async () => {
    const f = fakeContext();
    const player = new SoundPlayer(f.asContext);
    await player.play({ sound: "bell", volume: 70, muted: false });
    const first = [...f.oscillators];
    await player.play({ sound: "chime", volume: 70, muted: false });
    for (const o of first) expect(o.stop).toHaveBeenCalledTimes(2);
  });

  it("reproduce el archivo personalizado y lo decodifica una sola vez", async () => {
    const f = fakeContext();
    const load = vi.fn(async () => new ArrayBuffer(128));
    const player = new SoundPlayer(f.asContext, load);
    await player.play({ sound: "custom", volume: 70, muted: false }, "C:\\ding.mp3");
    await player.play({ sound: "custom", volume: 70, muted: false }, "C:\\ding.mp3");
    expect(load).toHaveBeenCalledOnce();
    expect(f.sources).toHaveLength(2);
    expect(f.oscillators).toHaveLength(0);
    player.invalidateCustom();
    await player.play({ sound: "custom", volume: 70, muted: false }, "C:\\ding.mp3");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("si el archivo personalizado falla, suena la campana", async () => {
    const f = fakeContext();
    const player = new SoundPlayer(f.asContext, () => Promise.reject(new Error("no existe")));
    expect(await player.play({ sound: "custom", volume: 70, muted: false }, "x.mp3")).toBe(true);
    expect(f.oscillators).toHaveLength(PATCHES.bell.length);
  });
});
