import { SignJWT, jwtVerify } from "jose";
import { eventSchema } from "../src/lib/schema";
import {
  assertPrivateRepository,
  HttpError,
  readProgress,
  saveProgress,
  type GitHubConfig,
} from "./github";
export interface Env extends GitHubConfig {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  OWNER_ID: string;
  FRONTEND_URL: string;
  API_URL: string;
  RATE_LIMITER: {
    limit: (o: { key: string }) => Promise<{ success: boolean }>;
  };
}
const encoder = new TextEncoder();
function key(env: Env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 43)
    throw new HttpError(503, "Session secret not configured");
  return encoder.encode(env.SESSION_SECRET);
}
export async function signSession(env: Env) {
  return new SignJWT({ purpose: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(env.OWNER_ID)
    .setAudience("chess-studio")
    .setIssuer(env.API_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key(env));
}
export async function authorize(request: Request, env: Env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer "))
    throw new HttpError(401, "Authentication required");
  try {
    const { payload } = await jwtVerify(auth.slice(7), key(env), {
      algorithms: ["HS256"],
      audience: "chess-studio",
      issuer: env.API_URL,
    });
    if (payload.sub !== env.OWNER_ID || payload.purpose !== "session")
      throw Error("Owner mismatch");
  } catch {
    throw new HttpError(401, "Session expired or invalid");
  }
}
export function validateOrigin(request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(env.FRONTEND_URL).origin)
    throw new HttpError(403, "Origin not allowed");
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
function cookieValue(req: Request, name: string) {
  return (req.headers.get("Cookie") || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1);
}
const stateCookie = "__Host-chess-oauth";
const sessionCookie = "__Host-chess-session";
const sessionFlags = "; Path=/; HttpOnly; Secure; SameSite=None";
const cookieFlags = "; Path=/; HttpOnly; Secure; SameSite=Lax";
async function oauthLogin(req: Request, env: Env) {
  const popup = new URL(req.url).searchParams.get("mode") === "popup";
  const nonce = crypto.randomUUID();
  const requestedChannel = new URL(req.url).searchParams.get("channel");
  const channel =
    requestedChannel && /^[0-9a-f-]{36}$/.test(requestedChannel)
      ? requestedChannel
      : undefined;
  const state = await new SignJWT({
    purpose: "oauth-state",
    nonce,
    popup,
    channel,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key(env));
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.API_URL + "/auth/callback");
  url.searchParams.set("state", nonce);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.href,
      "Set-Cookie": stateCookie + "=" + state + cookieFlags + "; Max-Age=600",
    },
  });
}
async function oauthCallback(req: Request, env: Env) {
  const url = new URL(req.url);
  if (url.searchParams.has("error"))
    throw new HttpError(401, "GitHub authorization declined");
  const code = url.searchParams.get("code"),
    state = url.searchParams.get("state"),
    cookie = cookieValue(req, stateCookie);
  if (!code || !state || !cookie)
    throw new HttpError(401, "OAuth state missing");
  let payload;
  try {
    payload = (await jwtVerify(cookie, key(env), { algorithms: ["HS256"] }))
      .payload;
    if (payload.purpose !== "oauth-state" || payload.nonce !== state)
      throw Error("Invalid state");
  } catch {
    throw new HttpError(401, "Invalid OAuth state");
  }
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.API_URL + "/auth/callback",
    }),
  });
  const grant = (await response.json()) as { access_token?: string };
  if (!response.ok || !grant.access_token)
    throw new HttpError(401, "GitHub OAuth exchange failed");
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${grant.access_token}`,
      "User-Agent": "Chess-Studio-Worker",
      Accept: "application/vnd.github+json",
    },
  });
  if (!userResponse.ok) throw new HttpError(401, "GitHub identity unavailable");
  const user = (await userResponse.json()) as { id: number };
  if (String(user.id) !== env.OWNER_ID)
    throw new HttpError(403, "This academy belongs to another user");
  const token = await signSession(env);
  const clear = stateCookie + "=" + cookieFlags + "; Max-Age=0";
  const target =
    env.FRONTEND_URL.replace(/#.*$/, "") +
    "#/progress?session=" +
    encodeURIComponent(token) +
    (typeof payload.channel === "string"
      ? "&channel=" + encodeURIComponent(payload.channel)
      : "");
  if (payload.popup) {
    const nonce = crypto.randomUUID();
    const origin = new URL(env.FRONTEND_URL).origin;
    const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Chess Studio — вход</title><body><p>Вход выполнен. Возвращаемся в академию…</p><a href="${target}">Вернуться в Chess Studio</a><script nonce="${nonce}">if(window.opener){window.opener.postMessage({type:'chess-studio-session',token:${JSON.stringify(token)}},${JSON.stringify(origin)});window.close()}else{location.replace(${JSON.stringify(target)})}</script></body></html>`;
    const headers = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": clear,
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
    });
    headers.append(
      "Set-Cookie",
      sessionCookie + "=" + token + sessionFlags + "; Max-Age=3600",
    );
    return new Response(html, { headers });
  }
  const headers = new Headers({ Location: target, "Set-Cookie": clear });
  headers.append(
    "Set-Cookie",
    sessionCookie + "=" + token + sessionFlags + "; Max-Age=3600",
  );
  return new Response(null, { status: 302, headers });
}
async function handle(req: Request, env: Env) {
  const url = new URL(req.url);
  if (
    !env.FRONTEND_URL ||
    !env.API_URL ||
    new URL(env.FRONTEND_URL).protocol !== "https:" ||
    new URL(env.API_URL).protocol !== "https:"
  )
    throw new HttpError(503, "HTTPS origins not configured");
  validateOrigin(req, env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/health" && req.method === "GET")
    return json({ service: "chess-studio", schemaVersion: 1 });
  if (!env.RATE_LIMITER)
    throw new HttpError(503, "Rate limiter not configured");
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const limit = await env.RATE_LIMITER.limit({ key: ip });
  if (!limit.success) throw new HttpError(429, "Too many requests");
  if (
    (url.pathname === "/auth/session" && req.method === "GET") ||
    (url.pathname === "/auth/logout" && req.method === "POST")
  ) {
    if (req.headers.get("Origin") !== new URL(env.FRONTEND_URL).origin)
      throw new HttpError(403, "Origin required");
    if (url.pathname === "/auth/logout")
      return new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookie + "=" + sessionFlags + "; Max-Age=0",
        },
      });
    const token = cookieValue(req, sessionCookie);
    if (!token) throw new HttpError(401, "No session cookie");
    await authorize(
      new Request(req.url, { headers: { Authorization: "Bearer " + token } }),
      env,
    );
    return json({ token });
  }
  if (url.pathname === "/auth/login" && req.method === "GET")
    return oauthLogin(req, env);
  if (url.pathname === "/auth/callback" && req.method === "GET")
    return oauthCallback(req, env);
  if (url.pathname !== "/api/progress") throw new HttpError(404, "Not found");
  await authorize(req, env);
  await assertPrivateRepository(env);
  if (req.method === "GET") {
    const data = await readProgress(env);
    return json({ schemaVersion: 1, events: data.events });
  }
  if (req.method === "POST") {
    if (!(req.headers.get("Content-Type") || "").startsWith("application/json"))
      throw new HttpError(415, "JSON required");
    if (Number(req.headers.get("Content-Length") || 0) > 32_768)
      throw new HttpError(413, "Result too large");
    /* Bound the stream even when Content-Length is absent or false. */ const reader =
      req.body?.getReader();
    if (!reader) throw new HttpError(400, "Body required");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 32_768) {
        await reader.cancel();
        throw new HttpError(413, "Result too large");
      }
      chunks.push(value);
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      data.set(c, offset);
      offset += c.length;
    }
    let raw;
    try {
      raw = JSON.parse(new TextDecoder().decode(data));
    } catch {
      throw new HttpError(400, "Invalid JSON");
    }
    const result = eventSchema.safeParse(raw);
    if (!result.success) throw new HttpError(400, "Invalid progress schema");
    return json(await saveProgress(env, result.data));
  }
  throw new HttpError(405, "Method not allowed");
}
export default {
  async fetch(req: Request, env: Env) {
    let response: Response;
    try {
      response = await handle(req, env);
    } catch (e) {
      response = json(
        {
          error: e instanceof HttpError ? e.message : "Unexpected server error",
        },
        e instanceof HttpError ? e.status : 500,
      );
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    if (
      env.FRONTEND_URL &&
      req.headers.get("Origin") === new URL(env.FRONTEND_URL).origin
    ) {
      headers.set(
        "Access-Control-Allow-Origin",
        new URL(env.FRONTEND_URL).origin,
      );
      headers.set("Vary", "Origin");
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      headers.set("Access-Control-Max-Age", "600");
    }
    if (response.status === 429) headers.set("Retry-After", "60");
    return new Response(response.body, { status: response.status, headers });
  },
};
