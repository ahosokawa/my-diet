import { describe, expect, it } from "vitest";
import { formatYmd, minutesToHhmm, parseYmd, shiftDate } from "../date";

describe("parseYmd / formatYmd", () => {
  it("round-trips a YYYY-MM-DD string", () => {
    expect(formatYmd(parseYmd("2026-07-08"))).toBe("2026-07-08");
    expect(formatYmd(parseYmd("2026-01-01"))).toBe("2026-01-01");
    expect(formatYmd(parseYmd("2026-12-31"))).toBe("2026-12-31");
  });

  it("anchors to local noon so DST shifts cannot move the day", () => {
    const d = parseYmd("2026-03-08"); // US spring-forward date
    expect(d.getHours()).toBe(12);
    expect(formatYmd(d)).toBe("2026-03-08");
  });
});

describe("shiftDate", () => {
  it("shifts forward and backward", () => {
    expect(shiftDate("2026-07-08", 1)).toBe("2026-07-09");
    expect(shiftDate("2026-07-08", -7)).toBe("2026-07-01");
    expect(shiftDate("2026-07-08", 0)).toBe("2026-07-08");
  });

  it("crosses month and year boundaries", () => {
    expect(shiftDate("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("crosses DST transitions without day drift", () => {
    expect(shiftDate("2026-03-07", 1)).toBe("2026-03-08");
    expect(shiftDate("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftDate("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("handles leap years", () => {
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDate("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("minutesToHhmm", () => {
  it("formats minutes since midnight", () => {
    expect(minutesToHhmm(0)).toBe("00:00");
    expect(minutesToHhmm(485)).toBe("08:05");
    expect(minutesToHhmm(1439)).toBe("23:59");
  });

  it("wraps past midnight", () => {
    expect(minutesToHhmm(1440)).toBe("00:00");
    expect(minutesToHhmm(1470)).toBe("00:30");
  });
});
