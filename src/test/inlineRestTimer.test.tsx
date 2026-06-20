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
  playCompletionSound: vi.fn(async () => {}),
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

vi.mock("@/utils/restTimerAudio", () => ({
  preloadRestTimerAudio: vi.fn(async () => {}),
  playCompletionSound: (...args: unknown[]) => mocks.playCompletionSound(...args),
  scheduleBackgroundCompletion: vi.fn(async () => null),
  cancelBackgroundCompletion: vi.fn(async () => {}),
  ensureNotificationPermission: vi.fn(async () => false),
}));

/** Capture the runId the component sent on its most recent worker.start */
function currentRunId(): number {
  const calls = mocks.worker?.postMessage.mock.calls ?? [];
  for (let i = calls.length - 1; i >= 0; i--) {
    const arg = calls[i][0] as { type: string; runId?: number };
    if (arg.type === "start") return arg.runId ?? 0;
  }
  return 0;
}

describe("InlineRestTimer", () => {
  beforeEach(() => {
    mocks.worker = null;
    vi.clearAllMocks();
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(() => true),
      writable: true,
      configurable: true,
    });
  });

  it("does not play sound or vibrate on normal ticks (30s, 50s)", async () => {
    render(<InlineRestTimer seconds={60} onComplete={vi.fn()} onSkip={vi.fn()} />);
    const runId = currentRunId();

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "tick", runId, remaining: 50, remainingMs: 50000 } } as MessageEvent);
      mocks.worker?.onmessage?.({ data: { type: "tick", runId, remaining: 30, remainingMs: 30000 } } as MessageEvent);
    });

    expect(navigator.vibrate).not.toHaveBeenCalled();
    expect(mocks.playCompletionSound).not.toHaveBeenCalled();
  });

  it("plays sound + vibrates exactly once on done", async () => {
    const onComplete = vi.fn();
    render(<InlineRestTimer seconds={1} onComplete={onComplete} onSkip={vi.fn()} />);
    const runId = currentRunId();

    // Wait past endTime so the wall-clock guard passes.
    await new Promise((r) => setTimeout(r, 1100));

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "done", runId, remaining: 0, remainingMs: 0 } } as MessageEvent);
      // Duplicate done should be ignored.
      mocks.worker?.onmessage?.({ data: { type: "done", runId, remaining: 0, remainingMs: 0 } } as MessageEvent);
    });

    await waitFor(() => expect(navigator.vibrate).toHaveBeenCalledTimes(1));
    expect(mocks.playCompletionSound).toHaveBeenCalledTimes(1);
  });

  it("ignores done messages from a stale runId", async () => {
    render(<InlineRestTimer seconds={60} onComplete={vi.fn()} onSkip={vi.fn()} />);
    const staleRunId = currentRunId() - 1;

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "done", runId: staleRunId, remaining: 0, remainingMs: 0 } } as MessageEvent);
    });

    expect(navigator.vibrate).not.toHaveBeenCalled();
    expect(mocks.playCompletionSound).not.toHaveBeenCalled();
  });

  it("calls onSkip when the timer is skipped", async () => {
    const onSkip = vi.fn();
    const { getByRole } = render(<InlineRestTimer seconds={60} onComplete={vi.fn()} onSkip={onSkip} />);

    await act(async () => {
      getByRole("button").click();
    });

    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
