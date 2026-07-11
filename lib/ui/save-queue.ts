export type SyncState = "dirty" | "saving" | "saved";

export type SaveQueue<T> = {
  /** Record the latest value and (re)arm the debounce timer. */
  push(v: T): void;
  /** Save any pending value immediately; resolves after the write lands. */
  flush(): Promise<void>;
};

/**
 * Debounced, serialized autosave. All writes run on a single promise chain
 * (strict FIFO, so last-write-wins) and only the latest pushed value is ever
 * saved — intermediate values are coalesced. A rejected save never breaks the
 * chain.
 */
export function createSaveQueue<T>(
  save: (v: T) => Promise<void>,
  opts: { delayMs?: number; onState?: (s: SyncState) => void } = {}
): SaveQueue<T> {
  const delayMs = opts.delayMs ?? 600;
  const onState = opts.onState ?? (() => {});

  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: T | undefined;
  let dirty = false;
  let pushSeq = 0;
  let chain: Promise<void> = Promise.resolve();

  function runNow(): Promise<void> {
    if (!dirty) return chain;
    dirty = false;
    const value = latest as T;
    const seq = pushSeq;
    chain = chain
      .then(() => {
        onState("saving");
        return save(value);
      })
      .then(() => {
        // Only report "saved" if nothing newer was pushed since this value
        // was captured — otherwise a stale save would mask pending work.
        if (pushSeq === seq) onState("saved");
      })
      .catch(() => {});
    return chain;
  }

  return {
    push(v: T) {
      latest = v;
      dirty = true;
      pushSeq++;
      onState("dirty");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void runNow();
      }, delayMs);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      return runNow();
    },
  };
}
