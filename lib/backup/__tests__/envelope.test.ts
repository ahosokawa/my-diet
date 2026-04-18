import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  buildEnvelope,
  checkVersion,
  parseEnvelope,
  type EnvelopeTables,
} from "../envelope";

const EMPTY: EnvelopeTables = {
  profile: [],
  targets: [],
  foods: [],
  schedule: [],
  mealLogs: [],
  weights: [],
  combos: [],
  prefs: [],
};

describe("buildEnvelope", () => {
  it("sets schemaVersion + appVersion + exportedAt", () => {
    const env = buildEnvelope(EMPTY, "1.2.3", 1000);
    expect(env.schemaVersion).toBe(SCHEMA_VERSION);
    expect(env.appVersion).toBe("1.2.3");
    expect(env.exportedAt).toBe(1000);
    expect(env.tables).toBe(EMPTY);
  });
});

describe("parseEnvelope", () => {
  it("round-trips a built envelope", () => {
    const env = buildEnvelope(EMPTY, "1.0.0", 42);
    const parsed = parseEnvelope(JSON.stringify(env));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.env.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.env.exportedAt).toBe(42);
    }
  });

  it("rejects invalid JSON", () => {
    const p = parseEnvelope("{not json");
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/json/i);
  });

  it("rejects missing schemaVersion", () => {
    const p = parseEnvelope(JSON.stringify({ exportedAt: 1, tables: EMPTY }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/schemaVersion/);
  });

  it("rejects missing tables", () => {
    const p = parseEnvelope(JSON.stringify({ schemaVersion: 5, exportedAt: 1 }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/tables/);
  });

  it("rejects when a table is missing", () => {
    const t = { ...EMPTY } as Partial<EnvelopeTables>;
    delete t.foods;
    const p = parseEnvelope(
      JSON.stringify({ schemaVersion: 5, exportedAt: 1, tables: t })
    );
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/foods/);
  });

  it("accepts an older schemaVersion", () => {
    const p = parseEnvelope(
      JSON.stringify({ schemaVersion: 3, exportedAt: 1, tables: EMPTY })
    );
    expect(p.ok).toBe(true);
  });
});

describe("checkVersion", () => {
  it("returns current when versions match", () => {
    const v = checkVersion(SCHEMA_VERSION);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.status).toBe("current");
  });
  it("returns older for lower backup version", () => {
    const v = checkVersion(SCHEMA_VERSION - 1);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.status).toBe("older");
  });
  it("refuses a newer backup version", () => {
    const v = checkVersion(SCHEMA_VERSION + 1);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/newer/);
  });
});
