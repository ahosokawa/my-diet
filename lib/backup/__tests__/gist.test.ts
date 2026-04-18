import { describe, expect, it } from "vitest";
import { classifyHttpError, formatError, type ResponseLike } from "../gist";

function mockRes(status: number, headers: Record<string, string> = {}): ResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  };
}

describe("classifyHttpError", () => {
  it("401 → auth", () => {
    expect(classifyHttpError(mockRes(401))).toEqual({ kind: "auth" });
  });

  it("404 → gone", () => {
    expect(classifyHttpError(mockRes(404))).toEqual({ kind: "gone" });
  });

  it("429 → rate (with resetAt when header present)", () => {
    const err = classifyHttpError(mockRes(429, { "x-ratelimit-reset": "1700000000" }));
    expect(err.kind).toBe("rate");
    if (err.kind === "rate") expect(err.resetAt).toBe(1700000000 * 1000);
  });

  it("403 with remaining=0 → rate", () => {
    const err = classifyHttpError(
      mockRes(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000001" })
    );
    expect(err.kind).toBe("rate");
    if (err.kind === "rate") expect(err.resetAt).toBe(1700000001 * 1000);
  });

  it("403 without rate-limit hint → auth", () => {
    expect(classifyHttpError(mockRes(403))).toEqual({ kind: "auth" });
  });

  it("500 → other", () => {
    const err = classifyHttpError(mockRes(500));
    expect(err.kind).toBe("other");
    if (err.kind === "other") expect(err.status).toBe(500);
  });
});

describe("formatError", () => {
  it("returns strings for every variant", () => {
    expect(formatError({ kind: "auth" })).toMatch(/auth/i);
    expect(formatError({ kind: "gone" })).toMatch(/not found/i);
    expect(formatError({ kind: "rate" })).toMatch(/rate/i);
    expect(formatError({ kind: "offline" })).toMatch(/offline/i);
    expect(formatError({ kind: "other", status: 500, message: "boom" })).toBe("boom");
  });

  it("rate with resetAt includes a time hint", () => {
    const resetAt = Date.now() + 5 * 60_000;
    const s = formatError({ kind: "rate", resetAt });
    expect(s).toMatch(/\d+m/);
  });
});
