import { describe, expect, it } from "vitest";
import { formatError, pushFiles, readFile, type FetchLike } from "../drive";
import { bridgeScript, isBridgeUrl } from "../bridge-script";

const URL = "https://script.google.com/macros/s/AKfy-abc_123/exec";

function fakeFetch(status: number, body: string, calls: [string, RequestInit][] = []): FetchLike {
  return async (url, init) => {
    calls.push([url, init]);
    return new Response(body, { status });
  };
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected rejection");
}

describe("pushFiles", () => {
  it("POSTs a text/plain JSON body (no CORS preflight)", async () => {
    const calls: [string, RequestInit][] = [];
    await pushFiles(URL, "s3cret", { "a.md": "hi" }, fakeFetch(200, '{"ok":true}', calls));
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toMatch(/^text\/plain/);
    expect(JSON.parse(init.body as string)).toEqual({
      secret: "s3cret",
      action: "write",
      files: { "a.md": "hi" },
    });
  });

  it("maps a network failure to offline", async () => {
    const failing: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await caught(pushFiles(URL, "s", {}, failing))).toEqual({ kind: "offline" });
  });

  it("maps a non-JSON (Apps Script HTML error) body to other", async () => {
    const err = await caught(pushFiles(URL, "s", {}, fakeFetch(200, "<html>Error</html>")));
    expect(err).toMatchObject({ kind: "other" });
  });

  it("maps a secret mismatch to auth", async () => {
    const err = await caught(pushFiles(URL, "s", {}, fakeFetch(200, '{"ok":false,"error":"auth"}')));
    expect(err).toEqual({ kind: "auth" });
  });

  it("maps 429 to rate", async () => {
    expect(await caught(pushFiles(URL, "s", {}, fakeFetch(429, "")))).toEqual({ kind: "rate" });
  });
});

describe("readFile", () => {
  it("returns the file content", async () => {
    const calls: [string, RequestInit][] = [];
    const out = await readFile(URL, "s", "b.json", fakeFetch(200, '{"ok":true,"content":"{}"}', calls));
    expect(out).toBe("{}");
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ secret: "s", action: "read", name: "b.json" });
  });

  it("maps a missing file to gone", async () => {
    const err = await caught(readFile(URL, "s", "b.json", fakeFetch(200, '{"ok":false,"error":"missing"}')));
    expect(err).toEqual({ kind: "gone" });
    expect(formatError({ kind: "gone" })).toMatch(/not found/);
  });
});

describe("bridge script", () => {
  it("embeds the secret as a JS string literal", () => {
    const src = bridgeScript('ab"c');
    expect(src).toContain('var SECRET = "ab\\"c";');
    expect(src).toContain("function doPost(e)");
  });

  it("accepts consumer and Workspace /exec URLs only", () => {
    expect(isBridgeUrl(URL)).toBe(true);
    expect(isBridgeUrl("https://script.google.com/a/macros/example.com/s/AKfy123/exec")).toBe(true);
    expect(isBridgeUrl("https://script.google.com/macros/s/AKfy123/dev")).toBe(false);
    expect(isBridgeUrl("https://evil.example/macros/s/AKfy123/exec")).toBe(false);
  });
});
