import { describe, expect, it } from "vitest";
import { decideNextAction } from "../scheduler";

const base = {
  configured: true,
  autoEnabled: true,
  manual: false,
  lastBackupAt: 0,
  lastChangeAt: 100,
};

describe("decideNextAction", () => {
  it("skips when the Drive bridge is not configured", () => {
    const r = decideNextAction({ ...base, configured: false });
    expect(r).toEqual({ action: "skip", reason: "not-configured" });
  });

  it("skips non-manual call when auto is disabled", () => {
    const r = decideNextAction({ ...base, autoEnabled: false });
    expect(r).toEqual({ action: "skip", reason: "not-enabled" });
  });

  it("allows manual call even when auto is disabled", () => {
    const r = decideNextAction({ ...base, autoEnabled: false, manual: true });
    expect(r).toEqual({ action: "sync" });
  });

  it("skips non-manual call when not dirty", () => {
    const r = decideNextAction({ ...base, lastBackupAt: 200, lastChangeAt: 100 });
    expect(r).toEqual({ action: "skip", reason: "not-dirty" });
  });

  it("allows manual call even when not dirty", () => {
    const r = decideNextAction({ ...base, manual: true, lastBackupAt: 200, lastChangeAt: 100 });
    expect(r).toEqual({ action: "sync" });
  });

  it("syncs when dirty", () => {
    expect(decideNextAction(base)).toEqual({ action: "sync" });
  });

  it("treats missing timestamps as nothing to sync", () => {
    const r = decideNextAction({ configured: true, autoEnabled: true, manual: false });
    expect(r).toEqual({ action: "skip", reason: "not-dirty" });
  });
});
