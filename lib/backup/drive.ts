// Client side of the Apps Script Drive bridge (see bridge-script.ts).
// Requests are POSTs with a text/plain body so the browser sends them as
// "simple" CORS requests (no preflight, which Apps Script can't answer);
// fetch follows the script's 302 to googleusercontent.com transparently.

export type BackupError =
  | { kind: "auth" }
  | { kind: "gone" }
  | { kind: "rate" }
  | { kind: "offline" }
  | { kind: "other"; message: string };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

type BridgeReply = { ok: boolean; error?: string; content?: string; writtenAt?: number };

export function formatError(err: BackupError): string {
  switch (err.kind) {
    case "auth":
      return "Secret mismatch — re-copy the setup script and redeploy";
    case "gone":
      return "Backup file not found in Drive";
    case "rate":
      return "Google is rate limiting, will retry";
    case "offline":
      return "Offline";
    case "other":
      return err.message;
  }
}

export function isBackupError(x: unknown): x is BackupError {
  return !!x && typeof x === "object" && "kind" in x;
}

async function call(
  url: string,
  body: Record<string, unknown>,
  fetchImpl: FetchLike
): Promise<BridgeReply> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
    });
  } catch {
    throw { kind: "offline" } satisfies BackupError;
  }
  if (res.status === 429) throw { kind: "rate" } satisfies BackupError;
  if (!res.ok) throw { kind: "other", message: `HTTP ${res.status}` } satisfies BackupError;

  let data: BridgeReply;
  try {
    data = (await res.json()) as BridgeReply;
  } catch {
    // Apps Script serves an HTML error page (with 200) when the deployment
    // is wrong — e.g. access not set to "Anyone", or the script threw.
    throw {
      kind: "other",
      message: "Bridge returned an unexpected response — check the deployment",
    } satisfies BackupError;
  }
  if (!data.ok) {
    if (data.error === "auth") throw { kind: "auth" } satisfies BackupError;
    if (data.error === "missing") throw { kind: "gone" } satisfies BackupError;
    throw { kind: "other", message: `Bridge error: ${data.error ?? "unknown"}` } satisfies BackupError;
  }
  return data;
}

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

export async function pushFiles(
  url: string,
  secret: string,
  files: Record<string, string>,
  fetchImpl: FetchLike = defaultFetch
): Promise<void> {
  await call(url, { secret, action: "write", files }, fetchImpl);
}

export async function readFile(
  url: string,
  secret: string,
  name: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<string> {
  const data = await call(url, { secret, action: "read", name }, fetchImpl);
  return data.content ?? "";
}
