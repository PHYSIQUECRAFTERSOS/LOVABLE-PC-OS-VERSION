import { beforeEach, describe, expect, it, vi } from "vitest";

const createdContexts: MockAudioContext[] = [];

class MockGainNode {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
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
  static nextState: AudioContextState | "interrupted" = "running";

  state = MockAudioContext.nextState as AudioContextState;
  currentTime = 0;
  sampleRate = 44100;
  destination = {} as AudioDestinationNode;

  constructor() {
    createdContexts.push(this);
  }

  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createGain = vi.fn(() => new MockGainNode() as unknown as GainNode);
  createBuffer = vi.fn(() => ({ duration: 0 } as AudioBuffer));
  createBufferSource = vi.fn(() => {
    const src = { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    return src as unknown as AudioBufferSourceNode;
  });
  createOscillator = vi.fn(() => new MockOscillatorNode() as unknown as OscillatorNode);
}

describe("RestTimerAudioService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    createdContexts.length = 0;
    MockAudioContext.nextState = "running";
    vi.stubGlobal("AudioContext", MockAudioContext as unknown as typeof AudioContext);
  });

  it("recovers an interrupted iOS audio context before alarm playback", async () => {
    MockAudioContext.nextState = "interrupted";
    const { restTimerAudio } = await import("@/services/RestTimerAudioService");

    const played = await restTimerAudio.playCompletionAlarm();

    expect(played).toBe(true);
    expect(createdContexts[0]?.resume).toHaveBeenCalled();
    expect(createdContexts[0]?.createOscillator).toHaveBeenCalled();
  });

  it("plays a synthesized three-tone alarm", async () => {
    const { restTimerAudio } = await import("@/services/RestTimerAudioService");

    const played = await restTimerAudio.playCompletionAlarm();

    expect(played).toBe(true);
    // Should create 3 oscillators for the three-tone chime
    expect(createdContexts[0]?.createOscillator).toHaveBeenCalledTimes(3);
  });

  it("backward compat: playCountdown calls playCompletionAlarm", async () => {
    const { restTimerAudio } = await import("@/services/RestTimerAudioService");

    const played = await restTimerAudio.playCountdown();

    expect(played).toBe(true);
    expect(createdContexts[0]?.createOscillator).toHaveBeenCalled();
  });
});
