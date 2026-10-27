import { it, expect, vi } from "vitest";
import { CloudApi, mergeEvents, summarize } from "../src/lib/progress";
import { eventSchema, type ProgressEvent } from "../src/lib/schema";
import { readProgress, saveProgress } from "../worker/github";
export function fixture(
  id = "00c4de25-61a0-4f5b-a284-69b907770f13",
): ProgressEvent {
  return {
    schemaVersion: 1,
    id,
    sessionId: "bbd40623-8491-45a5-b756-4d699ac6c3c1",
    contentId: "diag-01-000ro",
    contentVersion: 1,
    kind: "puzzle",
    mode: "diagnostic",
    category: "Вилка",
    startedAt: "2026-10-27T10:00:00.000Z",
    completedAt: "2026-10-27T10:01:00.000Z",
    durationMs: 60000,
    attempts: [
      {
        uci: "e5c7",
        san: "Bc7+",
        fen: "3R4/8/8/KB2b3/1p6/1P2k3/3p4/8 b - - 0 58",
        correct: true,
        at: 1000,
      },
    ],
    hints: 0,
    outcome: "solved",
    firstMove: "e5c7",
    playedLine: ["e5c7"],
  };
}
const env = {
  GITHUB_TOKEN: "test-not-a-secret",
  PROGRESS_OWNER: "owner",
  PROGRESS_REPO: "chess-progress",
};
function repo() {
  let events: ProgressEvent[] = [];
  let sha: string | undefined;
  let writes = 0;
  let conflict: ProgressEvent | undefined;
  const fetcher: typeof fetch = vi.fn(async (_input, init) => {
    if (String(_input).endsWith("/chess-progress"))
      return Response.json({ private: true });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      if (conflict) {
        events.push(conflict);
        conflict = undefined;
        sha = "concurrent";
        return Response.json({}, { status: 409 });
      }
      expect(body.sha).toBe(sha);
      events = JSON.parse(
        Buffer.from(body.content, "base64").toString(),
      ).events;
      sha = String(++writes);
      return Response.json({ content: { sha } }, { status: 201 });
    }
    if (!sha) return Response.json({}, { status: 404 });
    return Response.json({
      sha,
      size: 100,
      encoding: "base64",
      content: Buffer.from(
        JSON.stringify({ schemaVersion: 1, events }),
      ).toString("base64"),
    });
  });
  return {
    fetcher,
    get writes() {
      return writes;
    },
    conflict: (e: ProgressEvent) => {
      conflict = e;
    },
    get events() {
      return events;
    },
  };
}
it("persists a completed exercise and makes retry idempotent", async () => {
  const r = repo();
  const event = eventSchema.parse(fixture());
  expect((await saveProgress(env, event, r.fetcher)).saved).toBe(true);
  expect((await saveProgress(env, event, r.fetcher)).duplicate).toBe(true);
  expect(r.writes).toBe(1);
  expect((await readProgress(env, r.fetcher)).events).toEqual([event]);
});
it("retries SHA conflicts without overwriting another device", async () => {
  const r = repo();
  const other = eventSchema.parse(
    fixture("9efbf039-9231-439e-b5a4-b03aa61c63db"),
  );
  r.conflict(other);
  await saveProgress(env, eventSchema.parse(fixture()), r.fetcher);
  expect(r.events).toHaveLength(2);
});
it("rejects an ID collision with different data", async () => {
  const r = repo();
  const e = eventSchema.parse(fixture());
  await saveProgress(env, e, r.fetcher);
  await expect(
    saveProgress(env, { ...e, hints: 1 }, r.fetcher),
  ).rejects.toThrow("different result");
  expect(r.writes).toBe(1);
});
it("refuses to replace corrupt cloud data", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      sha: "s",
      size: 4,
      encoding: "base64",
      content: btoa("{}"),
    }),
  );
  await expect(saveProgress(env, fixture(), fetcher)).rejects.toThrow(
    "schema invalid",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("counts attempts, category errors and unique cloud events", () => {
  const a = fixture();
  const b = {
    ...fixture("9efbf039-9231-439e-b5a4-b03aa61c63db"),
    hints: 1,
    attempts: [{ ...a.attempts[0], correct: false }],
  };
  expect(mergeEvents([a], [a, b])).toHaveLength(2);
  const s = summarize([a, b]);
  expect(s.firstPercent).toBe(50);
  expect(s.categories[0].errors).toBe(1);
});
it("requires acknowledgement before a frontend save can succeed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ saved: false })),
  );
  await expect(
    new CloudApi("https://worker.example", "session").save(fixture()),
  ).rejects.toThrow("подтвердил");
  vi.unstubAllGlobals();
});
it("keeps auth and server failures distinguishable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 401 })),
  );
  await expect(
    new CloudApi("https://worker.example", "session").load(),
  ).rejects.toThrow("Сессия истекла");
  vi.unstubAllGlobals();
});
it("accepts voluntary reveal without fabricating a move", () => {
  expect(
    eventSchema.parse({
      ...fixture(),
      attempts: [],
      firstMove: null,
      playedLine: [],
      outcome: "revealed",
    }).firstMove,
  ).toBe(null);
  expect(() =>
    eventSchema.parse({ ...fixture(), firstMove: "a2a3" }),
  ).toThrow();
});

it.each([
  [401, {}, "GITHUB_TOKEN_INVALID"],
  [403, {}, "GITHUB_PERMISSION_DENIED"],
  [404, {}, "GITHUB_REPOSITORY_UNAVAILABLE"],
  [403, { "x-ratelimit-remaining": "0" }, "GITHUB_RATE_LIMITED"],
  [503, {}, "GITHUB_UNAVAILABLE"],
] as const)(
  "classifies GitHub %s without exposing upstream bodies",
  async (status, headers, code) => {
    const { assertPrivateRepository } = await import("../worker/github");
    const fetcher = vi.fn(async () =>
      Response.json(
        { message: "upstream-secret-sentinel" },
        { status, headers },
      ),
    );
    try {
      await assertPrivateRepository(env, fetcher);
      throw Error("Expected failure");
    } catch (e) {
      expect(e).toHaveProperty("code", code);
      expect((e as Error).message).not.toContain("upstream-secret-sentinel");
    }
  },
);
it("rejects a missing storage token before calling GitHub and trims copied whitespace", async () => {
  const { assertPrivateRepository } = await import("../worker/github");
  const fetcher = vi.fn(async (_url, init) => {
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token",
    );
    return Response.json({ private: true });
  });
  await expect(
    assertPrivateRepository({ ...env, GITHUB_TOKEN: "   " }, fetcher),
  ).rejects.toHaveProperty("code", "GITHUB_TOKEN_MISSING");
  expect(fetcher).not.toHaveBeenCalled();
  await assertPrivateRepository(
    { ...env, GITHUB_TOKEN: " test-token\n" },
    fetcher,
  );
});
it("reports missing GitHub write permission rather than retrying the event as a conflict", async () => {
  const e = eventSchema.parse(fixture());
  const fetcher = vi.fn(async (_url, init) =>
    init?.method === "PUT"
      ? Response.json({ message: "not allowed" }, { status: 403 })
      : Response.json({
          sha: "current",
          size: 30,
          encoding: "base64",
          content: btoa(JSON.stringify({ schemaVersion: 1, events: [] })),
        }),
  );
  await expect(saveProgress(env, e, fetcher)).rejects.toHaveProperty(
    "code",
    "GITHUB_PERMISSION_DENIED",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("shows a precise storage error while preserving the distinction from a session error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { code: "GITHUB_REPOSITORY_UNAVAILABLE", error: "secret-sentinel" },
        { status: 502 },
      ),
    ),
  );
  await expect(
    new CloudApi("https://worker.example", "session").load(),
  ).rejects.toThrow("Repository access");
  vi.unstubAllGlobals();
});
it("does not show arbitrary upstream messages for an unknown error code", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { code: "UNKNOWN", error: "secret-sentinel" },
        { status: 502 },
      ),
    ),
  );
  await expect(
    new CloudApi("https://worker.example", "session").load(),
  ).rejects.toThrow("Облако недоступно (502)");
  vi.unstubAllGlobals();
});
