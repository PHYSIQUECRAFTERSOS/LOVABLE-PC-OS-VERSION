import { beforeEach, describe, expect, it, vi } from "vitest";

class MockGainNode {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockBufferSourceNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => this.onended?.());
}

class MockOscillatorNode {
  type = "sine";
  frequency = { value: 0 };
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => this.onended?.());
}

class MockAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  destination = {} as AudioDestinationNode;
  resume = vi.fn(async () => {
    this.state = "running";
  });
  createGain = vi.fn(() => new MockGainNode() as unknown as GainNode);
  createBufferSource = vi.fn(() => new MockBufferSourceNode() as unknown as AudioBufferSourceNode);
  createOscillator = vi.fn(() => new MockOscillatorNode() as unknown as OscillatorNode);
  decodeAudioData = vi.fn(async () => ({ duration: 3 } as AudioBuffer));
}

describe("restTimerAudio", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })));
    vi.stubGlobal("AudioContext", MockAudioContext as unknown as typeof AudioContext);
  });

  it("waits for preload and plays the countdown sound", async () => {
    const audio = await import("@/utils/restTimerAudio");

    await audio.preloadCountdownSound();
    await audio.playCountdownSound();

    const ctx = new AudioContext() as unknown as MockAudioContext;
    expect(ctx.decodeAudioData).toBeDefined();
    expect(fetch).toHaveBeenCalledWith("/assets/sounds/rest-timer-countdown.mp3", { cache: "force-cache" });
  });

  it("falls back to an oscillator tone when the mp3 cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const audio = await import("@/utils/restTimerAudio");

    await audio.playCountdownSound();

    expect(fetch).toHaveBeenCalled();
  });
});
