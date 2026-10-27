import { it, expect, vi } from "vitest";
import worker, { signSession, authorize, type Env } from "../worker/index";
import { SignJWT } from "jose";
const env: Env = {
  GITHUB_TOKEN: "test",
  PROGRESS_OWNER: "owner",
  PROGRESS_REPO: "chess-progress",
  GITHUB_CLIENT_ID: "public-id",
  GITHUB_CLIENT_SECRET: "test",
  SESSION_SECRET: "test-session-signing-key-with-more-than-43-characters",
  OWNER_ID: "190060641",
  FRONTEND_URL: "https://owner.github.io/chess-studio/",
  API_URL: "https://api.example",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};
it("blocks unauthenticated access before any GitHub request", async () => {
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  const res = await worker.fetch(
    new Request("https://api.example/api/progress"),
    env,
  );
  expect(res.status).toBe(401);
  expect(spy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("checks exact CORS origin but does not treat absent Origin as authentication", async () => {
  const blocked = await worker.fetch(
    new Request("https://api.example/api/progress", {
      headers: { Origin: "https://evil.example" },
    }),
    env,
  );
  expect(blocked.status).toBe(403);
  expect(blocked.headers.has("Access-Control-Allow-Origin")).toBe(false);
  const allowed = await worker.fetch(
    new Request("https://api.example/api/progress", {
      headers: { Origin: "https://owner.github.io" },
    }),
    env,
  );
  expect(allowed.status).toBe(401);
  expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://owner.github.io",
  );
  expect(allowed.headers.get("Cache-Control")).toBe("no-store");
});
it("authenticates only a signed owner session with correct purpose and audience", async () => {
  const token = await signSession(env);
  await expect(
    authorize(
      new Request("https://api.example", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    ),
  ).resolves.toBeUndefined();
  const wrong = await new SignJWT({ purpose: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("someone-else")
    .setAudience("chess-studio")
    .setIssuer(env.API_URL)
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
  await expect(
    authorize(
      new Request("https://api.example", {
        headers: { Authorization: `Bearer ${wrong}` },
      }),
      env,
    ),
  ).rejects.toThrow("Session");
});
it("fails closed without rate limiting and returns Retry-After for abuse", async () => {
  const res = await worker.fetch(
    new Request("https://api.example/api/progress"),
    { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } },
  );
  expect(res.status).toBe(429);
  expect(res.headers.get("Retry-After")).toBe("60");
});
it("starts OAuth with a signed HttpOnly state cookie and no repository scope", async () => {
  const res = await worker.fetch(
    new Request("https://api.example/auth/login"),
    env,
  );
  expect(res.status).toBe(302);
  const url = new URL(res.headers.get("Location")!);
  expect(url.origin).toBe("https://github.com");
  expect(url.searchParams.has("scope")).toBe(false);
  expect(res.headers.get("Set-Cookie")).toContain(
    "HttpOnly; Secure; SameSite=Lax",
  );
  const bad = await worker.fetch(
    new Request("https://api.example/auth/callback?code=fake&state=fake"),
    env,
  );
  expect(bad.status).toBe(401);
});
it("never writes progress to a public repository", async () => {
  const token = await signSession(env);
  const spy = vi.fn(async () => Response.json({ private: false }));
  vi.stubGlobal("fetch", spy);
  const res = await worker.fetch(
    new Request("https://api.example/api/progress", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  expect(res.status).toBe(503);
  expect(spy).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});
it("bounds request bodies even if the client omits Content-Length", async () => {
  const token = await signSession(env);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ private: true })),
  );
  const res = await worker.fetch(
    new Request("https://api.example/api/progress", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "x".repeat(33000),
    }),
    env,
  );
  expect(res.status).toBe(413);
  vi.unstubAllGlobals();
});

it("restores only an owner cookie for the exact frontend origin", async () => {
  const token = await signSession(env);
  const res = await worker.fetch(
    new Request("https://api.example/auth/session", {
      headers: {
        Origin: "https://owner.github.io",
        Cookie: "__Host-chess-session=" + token,
      },
    }),
    env,
  );
  expect(res.status).toBe(200);
  expect(((await res.json()) as { token: string }).token).toBe(token);
  expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  const noOrigin = await worker.fetch(
    new Request("https://api.example/auth/session", {
      headers: { Cookie: "__Host-chess-session=" + token },
    }),
    env,
  );
  expect(noOrigin.status).toBe(403);
});
it("rejects expired and state-purpose tokens as API sessions", async () => {
  for (const [purpose, expiration] of [
    ["session", "1 second ago"],
    ["oauth-state", "1h"],
  ]) {
    const token = await new SignJWT({ purpose })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(env.OWNER_ID)
      .setIssuer(env.API_URL)
      .setAudience("chess-studio")
      .setExpirationTime(expiration)
      .sign(new TextEncoder().encode(env.SESSION_SECRET));
    await expect(
      authorize(
        new Request(env.API_URL, {
          headers: { Authorization: "Bearer " + token },
        }),
        env,
      ),
    ).rejects.toThrow("Session");
  }
});

it("OAuth callback verifies the real numeric owner and issues only a scoped session", async () => {
  const state = await new SignJWT({
    purpose: "oauth-state",
    nonce: "test-nonce",
    popup: true,
    channel: "00c4de25-61a0-4f5b-a284-69b907770f13",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
  const req = () =>
    new Request(
      env.API_URL + "/auth/callback?code=one-time-code&state=test-nonce",
      { headers: { Cookie: "__Host-chess-oauth=" + state } },
    );
  for (const owner of [1, Number(env.OWNER_ID)]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        String(input).includes("access_token")
          ? Response.json({ access_token: "oauth-test-token" })
          : Response.json({ id: owner }),
      ),
    );
    const res = await worker.fetch(req(), env);
    expect(res.status).toBe(owner === 1 ? 403 : 200);
    if (owner !== 1) {
      const html = await res.text();
      expect(html).toContain("postMessage");
      expect(html).toContain("https://owner.github.io");
      expect(html).toContain("&channel=");
      expect(html).not.toContain("oauth-test-token");
      expect(res.headers.get("Set-Cookie")).toContain("__Host-chess-session=");
      expect(res.headers.get("Content-Security-Policy")).toContain(
        "default-src 'none'",
      );
    }
    vi.unstubAllGlobals();
  }
});

it("keeps owner storage diagnostics unavailable to anonymous visitors", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const res = await worker.fetch(
    new Request(env.API_URL + "/api/storage-status"),
    env,
  );
  expect(res.status).toBe(401);
  expect(await res.text()).toContain("OWNER_SESSION_REQUIRED");
  expect(fetcher).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("allows a read-only storage check with a signed owner cookie without exposing training data", async () => {
  const token = await signSession(env);
  const fetcher = vi.fn(async (input) =>
    String(input).endsWith("/chess-progress")
      ? Response.json({ private: true })
      : Response.json({
          sha: "current",
          size: 30,
          encoding: "base64",
          content: btoa(JSON.stringify({ schemaVersion: 1, events: [] })),
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  const res = await worker.fetch(
    new Request(env.API_URL + "/api/storage-status", {
      headers: { Cookie: "__Host-chess-session=" + token },
    }),
    env,
  );
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("STORAGE_READ_OK");
  expect(html).not.toContain(token);
  expect(html).not.toContain('"events"');
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  for (const call of fetcher.mock.calls) expect(call).toHaveLength(2);
  vi.unstubAllGlobals();
});
it("shows the owner the actual storage failure code without leaking upstream messages or token values", async () => {
  const token = await signSession(env);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ message: "secret-sentinel" }, { status: 404 }),
    ),
  );
  const res = await worker.fetch(
    new Request(env.API_URL + "/api/storage-status", {
      headers: { Cookie: "__Host-chess-session=" + token },
    }),
    env,
  );
  expect(res.status).toBe(502);
  const html = await res.text();
  expect(html).toContain("GITHUB_REPOSITORY_UNAVAILABLE");
  expect(html).toContain("Contents → Read and write");
  expect(html).not.toContain(token);
  expect(html).not.toContain("secret-sentinel");
  vi.unstubAllGlobals();
});
it("rejects a foreign origin and does not fall back from an invalid bearer token to a valid cookie", async () => {
  const token = await signSession(env);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const cases: Record<string, string>[] = [
    { Origin: "https://evil.example", Cookie: "__Host-chess-session=" + token },
    {
      Authorization: "Bearer invalid",
      Cookie: "__Host-chess-session=" + token,
    },
  ];
  for (const headers of cases) {
    const res = await worker.fetch(
      new Request(env.API_URL + "/api/storage-status", { headers }),
      env,
    );
    expect([401, 403]).toContain(res.status);
  }
  expect(fetcher).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("returns a machine-readable storage code for the authenticated progress API", async () => {
  const token = await signSession(env);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ message: "Bad credentials" }, { status: 401 }),
    ),
  );
  const res = await worker.fetch(
    new Request(env.API_URL + "/api/progress", {
      headers: { Authorization: "Bearer " + token },
    }),
    env,
  );
  expect(res.status).toBe(502);
  expect(await res.json()).toMatchObject({ code: "GITHUB_TOKEN_INVALID" });
  vi.unstubAllGlobals();
});
