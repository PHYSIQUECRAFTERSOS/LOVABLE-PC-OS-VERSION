import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InlineRestTimer from "@/components/workout/InlineRestTimer";

type WorkerMock = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
};

let worker: WorkerMock | null = null;

const playCountdown = vi.fn<() => Promise<boolean>>();
const startKeepAlive = vi.fn();
const stopKeepAlive = vi.fn();
const stopCountdown = vi.fn();
const unlock = vi.fn();

vi.mock("@/services/timerWorker", () => ({
  createTimerWorker: vi.fn(() => {
    worker = {
      onmessage: null,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };

    return worker as unknown as Worker;
  }),
}));

vi.mock("@/services/RestTimerAudioService", () => ({
  restTimerAudio: {
    playCountdown,
    startKeepAlive,
    stopKeepAlive,
    stopCountdown,
    unlock,
  },
}));

describe("InlineRestTimer", () => {
  beforeEach(() => {
    worker = null;
    vi.clearAllMocks();
  });

  it("retries countdown playback at completion if the 3-second attempt fails", async () => {
    playCountdown.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    render(<InlineRestTimer seconds={60} onComplete={vi.fn()} onSkip={vi.fn()} />);

    worker?.onmessage?.({ data: { type: "tick", remaining: 3, remainingMs: 3000 } } as MessageEvent);
    await waitFor(() => expect(playCountdown).toHaveBeenCalledTimes(1));

    worker?.onmessage?.({ data: { type: "done", remaining: 0, remainingMs: 0 } } as MessageEvent);
    await waitFor(() => expect(playCountdown).toHaveBeenCalledTimes(2));
  });

  it("does not replay the countdown on completion after a successful 3-second trigger", async () => {
    playCountdown.mockResolvedValue(true);

    render(<InlineRestTimer seconds={60} onComplete={vi.fn()} onSkip={vi.fn()} />);

    worker?.onmessage?.({ data: { type: "tick", remaining: 3, remainingMs: 3000 } } as MessageEvent);
    await waitFor(() => expect(playCountdown).toHaveBeenCalledTimes(1));

    worker?.onmessage?.({ data: { type: "done", remaining: 0, remainingMs: 0 } } as MessageEvent);
    await waitFor(() => expect(playCountdown).toHaveBeenCalledTimes(1));
  });
});