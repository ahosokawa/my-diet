import { describe, expect, it } from "vitest";
import { decideNextAction } from "../scheduler";

const base = {
  patPresent: true,
  autoEnabled: true,
  manual: false,
  hasGistId: false,
  lastBackupAt: 0,
  lastChangeAt: 100,
};

describe("decideNextAction", () => {
  it("skips when no PAT", () => {
    const r = decideNextAction({ ...base, patPresent: false });
    expect(r).toEqual({ action: "skip", reason: "no-pat" });
  });

  it("skips non-manual call when auto is disabled", () => {
    const r = decideNextAction({ ...base, autoEnabled: false });
    expect(r).toEqual({ action: "skip", reason: "not-enabled" });
  });

  it("allows manual call even when auto is disabled", () => {
    const r = decideNextAction({ ...base, autoEnabled: false, manual: true });
    expect(r.action).toBe("create");
  });

  it("skips non-manual call when not dirty", () => {
    const r = decideNextAction({ ...base, lastBackupAt: 200, lastChangeAt: 100 });
    expect(r).toEqual({ action: "skip", reason: "not-dirty" });
  });

  it("allows manual call even when not dirty", () => {
    const r = decideNextAction({ ...base, manual: true, lastBackupAt: 200, lastChangeAt: 100 });
    expect(r.action).toBe("create");
  });

  it("returns create when dirty and no gist id", () => {
    const r = decideNextAction(base);
    expect(r).toEqual({ action: "create" });
  });

  it("returns update when dirty and has gist id", () => {
    const r = decideNextAction({ ...base, hasGistId: true });
    expect(r).toEqual({ action: "update" });
  });

  it("treats missing timestamps as never-backed-up and changed", () => {
    const r = decideNextAction({
      patPresent: true,
      autoEnabled: true,
      manual: false,
      hasGistId: false,
    });
    expect(r.action).toBe("skip");
    if (r.action === "skip") expect(r.reason).toBe("not-dirty");
  });
});
