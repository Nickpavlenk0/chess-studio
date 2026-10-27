import { progressSchema, type ProgressEvent } from "../src/lib/schema";
export interface GitHubConfig {
  GITHUB_TOKEN: string;
  PROGRESS_OWNER: string;
  PROGRESS_REPO: string;
}
const PATH = "progress.json";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function headers(env: GitHubConfig) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Chess-Studio-Worker",
    "Content-Type": "application/json",
  };
}
function url(env: GitHubConfig) {
  if (
    !/^[\w.-]+$/.test(env.PROGRESS_OWNER) ||
    !/^[\w.-]+$/.test(env.PROGRESS_REPO)
  )
    throw new HttpError(503, "Server configuration error");
  return `https://api.github.com/repos/${env.PROGRESS_OWNER}/${env.PROGRESS_REPO}/contents/${PATH}`;
}
export async function readProgress(
  env: GitHubConfig,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(url(env), { headers: headers(env) });
  if (response.status === 404) {
    /* A missing file is acceptable only in an accessible private repo. */ const repo =
      await fetcher(
        `https://api.github.com/repos/${env.PROGRESS_OWNER}/${env.PROGRESS_REPO}`,
        { headers: headers(env) },
      );
    if (!repo.ok)
      throw new HttpError(502, "Private progress repository unavailable");
    const meta = (await repo.json()) as { private?: boolean };
    if (!meta.private)
      throw new HttpError(503, "Progress repository must be private");
    return { sha: undefined, events: [] as ProgressEvent[] };
  }
  if (!response.ok) throw new HttpError(502, "GitHub read failed");
  const file = (await response.json()) as {
    sha: string;
    content?: string;
    encoding?: string;
    size: number;
  };
  if (file.size > 8_000_000)
    throw new HttpError(507, "Progress file requires owner maintenance");
  let raw: string;
  if (file.encoding === "base64" && file.content) {
    const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, "")), (c) =>
      c.charCodeAt(0),
    );
    raw = new TextDecoder().decode(bytes);
  } else {
    const rawResponse = await fetcher(url(env), {
      headers: { ...headers(env), Accept: "application/vnd.github.raw+json" },
    });
    if (!rawResponse.ok) throw new HttpError(502, "GitHub raw read failed");
    raw = await rawResponse.text();
  }
  let parsed;
  try {
    parsed = progressSchema.parse(JSON.parse(raw));
  } catch {
    throw new HttpError(
      502,
      "Progress schema invalid; existing data preserved",
    );
  }
  const ids = new Set(parsed.events.map((e) => e.id));
  if (ids.size !== parsed.events.length)
    throw new HttpError(502, "Duplicate event IDs in progress file");
  return { sha: file.sha, events: parsed.events };
}
export async function saveProgress(
  env: GitHubConfig,
  event: ProgressEvent,
  fetcher: typeof fetch = fetch,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readProgress(env, fetcher);
    const existing = current.events.find((e) => e.id === event.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(event))
        throw new HttpError(
          409,
          "Event ID already contains a different result",
        );
      return { id: event.id, saved: true, duplicate: true };
    }
    const body =
      JSON.stringify(
        { schemaVersion: 1, events: [...current.events, event] },
        null,
        2,
      ) + "\n";
    const bytes = new TextEncoder().encode(body);
    if (bytes.length > 8_000_000)
      throw new HttpError(507, "Progress file requires owner maintenance");
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const res = await fetcher(url(env), {
      method: "PUT",
      headers: headers(env),
      body: JSON.stringify({
        message: `training: ${event.kind} ${event.contentId} [${event.id}]`,
        content: btoa(binary),
        ...(current.sha ? { sha: current.sha } : {}),
      }),
    });
    if (res.ok) {
      await res.json();
      return { id: event.id, saved: true, duplicate: false };
    }
    if (res.status !== 409 && res.status !== 422)
      throw new HttpError(502, "GitHub write failed");
  }
  throw new HttpError(409, "Concurrent update. Retry the same event ID");
}
export async function assertPrivateRepository(env: GitHubConfig) {
  const res = await fetch(
    `https://api.github.com/repos/${env.PROGRESS_OWNER}/${env.PROGRESS_REPO}`,
    { headers: headers(env) },
  );
  if (!res.ok)
    throw new HttpError(502, "Private progress repository unavailable");
  const repo = (await res.json()) as { private: boolean };
  if (repo.private !== true)
    throw new HttpError(503, "Progress repository must be private");
}
