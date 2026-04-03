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

describe("InlineRestTimer", () => {
  beforeEach(() => {
    mocks.worker = null;
    vi.clearAllMocks();
    // Mock navigator.vibrate
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(() => true),
      writable: true,
      configurable: true,
    });
  });

  it("triggers haptic vibration when the timer finishes", async () => {
    const onComplete = vi.fn();
    render(<InlineRestTimer seconds={60} onComplete={onComplete} onSkip={vi.fn()} />);

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "tick", remaining: 3, remainingMs: 3000 } } as MessageEvent);
    });
    expect(navigator.vibrate).not.toHaveBeenCalled();

    await act(async () => {
      mocks.worker?.onmessage?.({ data: { type: "done", remaining: 0, remainingMs: 0 } } as MessageEvent);
    });
    await waitFor(() => expect(navigator.vibrate).toHaveBeenCalledWith([200, 100, 200]));
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
