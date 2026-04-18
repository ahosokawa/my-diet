import { BACKUP_FILENAME } from "./envelope";

const API = "https://api.github.com";

export type BackupError =
  | { kind: "auth" }
  | { kind: "gone" }
  | { kind: "rate"; resetAt?: number }
  | { kind: "offline" }
  | { kind: "other"; status: number; message: string };

export type ResponseLike = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
};

export function classifyHttpError(res: ResponseLike): BackupError {
  if (res.status === 401) return { kind: "auth" };
  if (res.status === 404) return { kind: "gone" };
  if (res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    const resetAt = reset ? Number(reset) * 1000 : undefined;
    return { kind: "rate", resetAt };
  }
  if (res.status === 403) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      const reset = res.headers.get("x-ratelimit-reset");
      const resetAt = reset ? Number(reset) * 1000 : undefined;
      return { kind: "rate", resetAt };
    }
    return { kind: "auth" };
  }
  return { kind: "other", status: res.status, message: `HTTP ${res.status}` };
}

export function formatError(err: BackupError): string {
  switch (err.kind) {
    case "auth":
      return "Authentication failed (check PAT and `gist` scope)";
    case "gone":
      return "Gist not found (may have been deleted)";
    case "rate": {
      if (err.resetAt) {
        const mins = Math.max(1, Math.ceil((err.resetAt - Date.now()) / 60000));
        return `Rate limited, retry in ~${mins}m`;
      }
      return "Rate limited";
    }
    case "offline":
      return "Offline";
    case "other":
      return err.message;
  }
}

function headers(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function call(pat: string, path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API}${path}`, { ...init, headers: { ...headers(pat), ...(init.headers ?? {}) } });
  } catch {
    throw { kind: "offline" } satisfies BackupError;
  }
}

export async function createGist(pat: string, content: string): Promise<{ id: string }> {
  const res = await call(pat, "/gists", {
    method: "POST",
    body: JSON.stringify({
      description: "my-diet backup",
      public: false,
      files: { [BACKUP_FILENAME]: { content } },
    }),
  });
  if (!res.ok) throw classifyHttpError(res);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export async function updateGist(pat: string, id: string, content: string): Promise<void> {
  const res = await call(pat, `/gists/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      files: { [BACKUP_FILENAME]: { content } },
    }),
  });
  if (!res.ok) throw classifyHttpError(res);
}

export async function fetchGist(pat: string, id: string): Promise<string> {
  const res = await call(pat, `/gists/${encodeURIComponent(id)}`, { method: "GET" });
  if (!res.ok) throw classifyHttpError(res);
  const data = (await res.json()) as {
    files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
  };
  const file = data.files?.[BACKUP_FILENAME];
  if (!file) throw { kind: "other", status: 200, message: `File ${BACKUP_FILENAME} not in gist` } satisfies BackupError;
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url);
    if (!raw.ok) throw classifyHttpError(raw);
    return raw.text();
  }
  return file.content ?? "";
}

export function isBackupError(x: unknown): x is BackupError {
  return !!x && typeof x === "object" && "kind" in x;
}
