import { knownSyncError } from "../src/lib/sync-errors";
import { HttpError } from "./github";
function escape(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
/** Owner-only, read-only diagnosis. No event data, token values, or upstream bodies. */
export function storageStatusPage(error: unknown, authenticated: boolean) {
  const code = error instanceof HttpError ? error.code : undefined;
  const ok = authenticated && !error;
  const message = !authenticated
    ? "Сессия входа не найдена. В исходной вкладке студии нажмите «Обновить вход», затем откройте эту проверку ещё раз."
    : ok
      ? "Приватный репозиторий и файл прогресса доступны серверу для чтения. Вернитесь в исходную вкладку и нажмите «Повторить отправку»."
      : knownSyncError(code) ||
        "Сервер не смог проверить хранилище. Сообщите тренеру код ошибки; вкладку с решением оставьте открытой.";
  const hint =
    code === "GITHUB_REPOSITORY_UNAVAILABLE" ||
    code === "GITHUB_PERMISSION_DENIED"
      ? "Откройте настройки fine-grained токена «Chess Studio progress» в GitHub. Resource owner: Nickpavlenk0. Repository access: Only select repositories → chess-progress. Repository permissions: Contents → Read and write. Сохраните изменения."
      : code === "GITHUB_TOKEN_INVALID" || code === "GITHUB_TOKEN_MISSING"
        ? "В Cloudflare откройте chess-studio-api → Settings → Variables and Secrets. Проверьте секрет GITHUB_TOKEN: в нём должен быть токен доступа GitHub для chess-progress. Значение токена в чат не отправляйте."
        : "";
  const status = !authenticated
    ? 401
    : error instanceof HttpError
      ? error.status
      : error
        ? 502
        : 200;
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Chess Studio — проверка хранилища</title><style>body{font:17px/1.7 system-ui,sans-serif;background:#f7f8f5;color:#263b35;margin:0;padding:30px 20px}main{max-width:650px;margin:auto;padding:25px;background:white;border:1px solid #e6eae3;border-radius:14px}h1{font-size:26px;line-height:1.3}code{display:inline-block;overflow-wrap:anywhere;padding:7px 10px;background:#edf2e9;border-radius:5px;font-size:13px}small{color:#6e7b70}p{overflow-wrap:anywhere}</style><main><small>CHESS STUDIO</small><h1>${ok ? "Хранилище доступно" : "Проверка хранилища"}</h1><p>${escape(message)}</p>${hint ? "<p>" + escape(hint) + "</p>" : ""}<code>${escape(!authenticated ? "OWNER_SESSION_REQUIRED" : code || (!error ? "STORAGE_READ_OK" : "STORAGE_CHECK_FAILED"))}</code><p><small>Эта страница ничего не изменяет в GitHub. Не закрывайте исходную вкладку с неподтверждённым результатом.</small></p></main></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
