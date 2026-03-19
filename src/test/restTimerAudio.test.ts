import { beforeEach, describe, expect, it, vi } from "vitest";

const createdContexts: MockAudioContext[] = [];
const createdSources: MockBufferSourceNode[] = [];

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
  static nextState: AudioContextState | "interrupted" = "running";

  state = MockAudioContext.nextState as AudioContextState;
  currentTime = 0;
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
  createBufferSource = vi.fn(() => {
    const source = new MockBufferSourceNode();
    createdSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  });
  createOscillator = vi.fn(() => new MockOscillatorNode() as unknown as OscillatorNode);
  decodeAudioData = vi.fn(async () => ({ duration: 3 } as AudioBuffer));
}

describe("restTimerAudio", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    createdContexts.length = 0;
    createdSources.length = 0;
    MockAudioContext.nextState = "running";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })));
    vi.stubGlobal("AudioContext", MockAudioContext as unknown as typeof AudioContext);
  });

  it("fetches the versioned countdown asset and starts playback", async () => {
    const audio = await import("@/utils/restTimerAudio");

    await audio.preloadCountdownSound();
    await audio.playCountdownSound();

    expect(fetch).toHaveBeenCalledWith("/assets/sounds/rest-timer-countdown-v2.mp3", { cache: "force-cache" });
    expect(createdContexts).toHaveLength(1);
    expect(createdSources[0]?.start).toHaveBeenCalledWith(0);
  });

  it("resumes an interrupted audio context before playback", async () => {
    const audio = await import("@/utils/restTimerAudio");
    await audio.preloadCountdownSound();

    createdContexts[0].state = "interrupted" as AudioContextState;
    await audio.playCountdownSound();

    expect(createdContexts[0].resume).toHaveBeenCalled();
    expect(createdSources[0]?.start).toHaveBeenCalledWith(0);
  });

  it("falls back to an oscillator tone when the mp3 cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const audio = await import("@/utils/restTimerAudio");

    await audio.playCountdownSound();

    expect(fetch).toHaveBeenCalled();
    expect(createdContexts[0]?.createOscillator).toHaveBeenCalled();
  });
});
