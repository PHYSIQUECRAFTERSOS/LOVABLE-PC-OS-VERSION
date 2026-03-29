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
  playCompletionAlarm: vi.fn<() => Promise<boolean>>(),
  stopAlarm: vi.fn(),
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
    playCompletionAlarm: mocks.playCompletionAlarm,
    stopAlarm: mocks.stopAlarm,
    unlock: mocks.unlock,
  },
}));

describe("InlineRestTimer", () => {
  beforeEach(() => {
    mocks.worker = null;
    vi.clearAllMocks();
  });

  it("plays the completion alarm exactly when the timer finishes", async () => {
    mocks.playCompletionAlarm.mockResolvedValue(true);

    render(<InlineRestTimer seconds={60} onComplete={vi.fn()} onSkip={vi.fn()} />);

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "tick", remaining: 3, remainingMs: 3000 } } as MessageEvent);
    });
    expect(mocks.playCompletionAlarm).not.toHaveBeenCalled();

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "done", remaining: 0, remainingMs: 0 } } as MessageEvent);
    });
    await waitFor(() => expect(mocks.playCompletionAlarm).toHaveBeenCalledTimes(1));
  });

  it("stops the alarm when the timer is skipped", async () => {
    const onSkip = vi.fn();

    const { getByRole } = render(<InlineRestTimer seconds={60} onComplete={vi.fn()} onSkip={onSkip} />);

    await act(async () => {
      getByRole("button").click();
    });

    expect(mocks.stopAlarm).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});