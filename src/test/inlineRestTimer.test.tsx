import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InlineRestTimer from "@/components/workout/InlineRestTimer";

type WorkerMock = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  worker: null as WorkerMock | null,
  playCountdown: vi.fn<() => Promise<boolean>>(),
  startKeepAlive: vi.fn(),
  stopKeepAlive: vi.fn(),
  stopCountdown: vi.fn(),
  unlock: vi.fn(),
}));

vi.mock("@/services/timerWorker", () => ({
  createTimerWorker: vi.fn(() => {
    mocks.worker = {
      onmessage: null,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };

    return mocks.worker as unknown as Worker;
  }),
}));

vi.mock("@/services/RestTimerAudioService", () => ({
  restTimerAudio: {
    playCountdown: mocks.playCountdown,
    startKeepAlive: mocks.startKeepAlive,
    stopKeepAlive: mocks.stopKeepAlive,
    stopCountdown: mocks.stopCountdown,
    unlock: mocks.unlock,
  },
}));

describe("InlineRestTimer", () => {
  beforeEach(() => {
    mocks.worker = null;
    vi.clearAllMocks();
  });

  it("retries countdown playback at completion if the 3-second attempt fails", async () => {
    mocks.playCountdown.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    render(<InlineRestTimer seconds={60} onComplete={vi.fn()} onSkip={vi.fn()} />);

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "tick", remaining: 3, remainingMs: 3000 } } as MessageEvent);
    });
    await waitFor(() => expect(mocks.playCountdown).toHaveBeenCalledTimes(1));

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "done", remaining: 0, remainingMs: 0 } } as MessageEvent);
    });
    await waitFor(() => expect(mocks.playCountdown).toHaveBeenCalledTimes(2));
  });

  it("does not replay the countdown on completion after a successful 3-second trigger", async () => {
    mocks.playCountdown.mockResolvedValue(true);

    render(<InlineRestTimer seconds={60} onComplete={vi.fn()} onSkip={vi.fn()} />);

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "tick", remaining: 3, remainingMs: 3000 } } as MessageEvent);
    });
    await waitFor(() => expect(mocks.playCountdown).toHaveBeenCalledTimes(1));

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "done", remaining: 0, remainingMs: 0 } } as MessageEvent);
    });
    await waitFor(() => expect(mocks.playCountdown).toHaveBeenCalledTimes(1));
  });
});