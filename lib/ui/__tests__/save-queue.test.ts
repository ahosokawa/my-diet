import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveQueue, type SyncState } from "../save-queue";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSaveQueue", () => {
  it("coalesces a burst of pushes into one save of the latest value", async () => {
    const save = vi.fn(async (_: number) => {});
    const q = createSaveQueue(save, { delayMs: 600 });

    q.push(1);
    vi.advanceTimersByTime(200);
    q.push(2);
    vi.advanceTimersByTime(200);
    q.push(3);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3);
  });

  it("flush saves immediately and resolves after the write", async () => {
    let settled = false;
    const save = vi.fn(async (_: string) => {
      settled = true;
    });
    const q = createSaveQueue(save, { delayMs: 600 });

    q.push("a");
    await q.flush();
    expect(settled).toBe(true);
    expect(save).toHaveBeenCalledWith("a");

    // Timer was cancelled — no duplicate save later.
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending performs no save", async () => {
    const save = vi.fn(async (_: number) => {});
    const q = createSaveQueue(save);
    await q.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("serializes writes: a push during a slow save lands after it, in order", async () => {
    const order: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const save = vi.fn(async (v: number) => {
      if (v === 1) await gate;
      order.push(v);
    });
    const q = createSaveQueue(save, { delayMs: 100 });

    q.push(1);
    await vi.advanceTimersByTimeAsync(100); // save(1) starts, blocked on gate
    q.push(2);
    const done = q.flush();
    release();
    await done;
    expect(order).toEqual([1, 2]);
  });

  it("a rejecting save does not break subsequent saves", async () => {
    const seen: number[] = [];
    const save = vi.fn(async (v: number) => {
      if (v === 1) throw new Error("boom");
      seen.push(v);
    });
    const q = createSaveQueue(save, { delayMs: 100 });

    q.push(1);
    await vi.advanceTimersByTimeAsync(100);
    q.push(2);
    await q.flush();
    expect(seen).toEqual([2]);
  });

  it("reports state transitions dirty → saving → saved", async () => {
    const states: SyncState[] = [];
    const q = createSaveQueue(async (_: number) => {}, {
      delayMs: 100,
      onState: (s) => states.push(s),
    });

    q.push(1);
    expect(states).toEqual(["dirty"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(states).toEqual(["dirty", "saving", "saved"]);
  });

  it("does not report saved when a newer push landed mid-save", async () => {
    const states: SyncState[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const q = createSaveQueue(
      async (v: number) => {
        if (v === 1) await gate;
      },
      { delayMs: 100, onState: (s) => states.push(s) }
    );

    q.push(1);
    await vi.advanceTimersByTimeAsync(100); // saving 1, blocked
    q.push(2); // dirty again mid-save
    const done = q.flush();
    release();
    await done;
    // After save(1) completes, dirty was true → no premature "saved";
    // the final "saved" comes only after save(2).
    expect(states).toEqual(["dirty", "saving", "dirty", "saving", "saved"]);
  });
});
