import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import type { ProgressEvent } from "../src/lib/schema";
const puzzles = fs
  .readdirSync("src/data/puzzles")
  .map((name) =>
    JSON.parse(fs.readFileSync("src/data/puzzles/" + name, "utf8")),
  );
async function move(page: Page, uci: string) {
  await page.getByRole("textbox", { name: "Ход в SAN или UCI" }).fill(uci);
  await page.getByRole("button", { name: "Сделать ход", exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw Error("Persistent storage is forbidden");
    };
    indexedDB.open = () => {
      throw Error("IndexedDB is forbidden");
    };
    if (navigator.serviceWorker)
      navigator.serviceWorker.register = () => {
        throw Error("Persistent service worker is forbidden");
      };
  });
  await page.route("https://worker.test/**", (route) =>
    route.fulfill({ status: 401, json: { error: "sign in required" } }),
  );
});
test("responsive dashboard, dark theme, all 5 routes and Pages refresh", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("");
  await expect(page.getByRole("heading", { name: /Каждый ход/ })).toBeVisible();
  await expect(page.getByText("GitHub подключён")).toHaveCount(0);
  await page.getByRole("button", { name: "Переключить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Переключить тему" }).click();
  for (const [hash, heading] of [
    ["training", "Учитесь видеть больше"],
    ["openings", "Первые ходы с пониманием"],
    ["analysis", "Исследуйте свои идеи"],
    ["progress", "Ваш путь в шахматах"],
  ]) {
    await page.goto("#/" + hash);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("");
  await page.screenshot({
    path: `docs/screenshots/home-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test("does not reveal a solution on a wrong move; failed sync survives navigation and can export", async ({
  page,
}) => {
  await page.goto("#/training/" + puzzles[0].id);
  await expect(page.locator(".san-line")).toHaveCount(0);
  await move(page, "e5f6");
  await expect(
    page.getByText("Этот ход не решает задачу.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".san-line")).toHaveCount(0);
  await move(page, puzzles[0].solutions[0][0]);
  await move(page, puzzles[0].solutions[0][2]);
  await expect(
    page.getByText("Решение найдено.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".sync-message")).toContainText(
    "Ошибка синхронизации",
  );
  await page.goto("#/progress");
  await expect(
    page.getByRole("heading", { name: "Ожидают подтверждения" }),
  ).toBeVisible();
  await expect(
    page.locator(".metrics .metric").first().locator("strong"),
  ).toHaveText("0");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  expect((await download).suggestedFilename()).toBe("chess-progress.json");
});
test("sync retries the same event, restores from cloud after reload and shows confirmed statistics", async ({
  page,
}) => {
  const rows: ProgressEvent[] = [];
  let fail = true;
  const ids: string[] = [];
  await page.route("https://worker.test/**", async (route) => {
    const req = route.request();
    if (req.url().endsWith("/auth/session"))
      return route.fulfill({ json: { token: "test-session" } });
    if (req.method() === "POST") {
      const event = req.postDataJSON() as ProgressEvent;
      ids.push(event.id);
      if (fail)
        return route.fulfill({
          status: 502,
          json: { code: "GITHUB_REPOSITORY_UNAVAILABLE", error: "unavailable" },
        });
      if (!rows.some((r) => r.id === event.id)) rows.push(event);
      return route.fulfill({ json: { saved: true, id: event.id } });
    }
    return route.fulfill({ json: { schemaVersion: 1, events: rows } });
  });
  await page.goto("#/training/" + puzzles[4].id);
  await expect(page.getByText("GitHub подключён")).toBeVisible();
  await move(page, puzzles[4].solutions[0][0]);
  await expect(page.locator(".sync-message")).toContainText(
    "Ошибка синхронизации",
  );
  await expect(page.locator(".sync-message")).toContainText(
    "Repository access",
  );
  await expect(
    page.getByText("Личный журнал подключён", { exact: true }),
  ).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Повторить отправку" }).click();
  await expect(page.locator(".sync-message")).toContainText("Сохранено");
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await page.goto("#/progress");
  await expect(
    page.locator(".metrics .metric").first().locator("strong"),
  ).toHaveText("1");
  await page.reload();
  await expect(
    page.locator(".metrics .metric").first().locator("strong"),
  ).toHaveText("1");
  expect(rows).toHaveLength(1);
});
test("study switches the actual Italian alternatives and returns to branch point", async ({
  page,
}) => {
  await page.goto("#/openings/italian");
  await page.getByRole("button", { name: "5… Nxd5", exact: false }).click();
  await expect(page.locator(".position-comment")).toContainText("...Nxd5?!");
  await page.getByRole("button", { name: "6. Nxf7", exact: false }).click();
  await expect(page.locator(".position-comment")).toContainText("жертва");
  await page
    .getByRole("button", { name: "К месту разветвления", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "5. exd5", exact: true }),
  ).toHaveClass(/selected/);
  await page.getByRole("button", { name: "5… Na5", exact: false }).click();
  await expect(page.locator(".position-comment")).toContainText(
    "Основное ...Na5",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PGN с вариантами" }).click();
  expect((await download).suggestedFilename()).toBe("chess-studio.pgn");
});
test("analysis imports FEN and offers all four promotion pieces", async ({
  page,
}) => {
  await page.goto("#/analysis");
  await page
    .getByRole("textbox", { name: "FEN позиции", exact: true })
    .fill("7k/P7/8/8/8/8/8/7K w - - 0 1");
  await page.getByRole("button", { name: "Загрузить FEN" }).click();
  await move(page, "a7a8");
  await expect(
    page.getByRole("dialog", { name: "Превращение пешки" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Конь", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "1. a8=N", exact: false }),
  ).toBeVisible();
});
test("mobile tap selects and moves a piece, highlights legal squares", async ({
  page,
}) => {
  await page.goto("#/analysis");
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(
    page.getByRole("button", { name: "1. e4", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Перевернуть доску" }).click();
  await expect(page.locator(".board-frame")).toBeVisible();
});

test("completes all 15 diagnostic tasks and preserves a separate new test history", async ({
  page,
}) => {
  const rows: ProgressEvent[] = [];
  await page.route("https://worker.test/**", async (route) => {
    const req = route.request();
    if (req.url().endsWith("/auth/session"))
      return route.fulfill({ json: { token: "test-session" } });
    if (req.method() === "POST") {
      const e = req.postDataJSON() as ProgressEvent;
      rows.push(e);
      return route.fulfill({ json: { saved: true, id: e.id } });
    }
    return route.fulfill({ json: { schemaVersion: 1, events: rows } });
  });
  await page.goto("#/diagnostic");
  await expect(page.getByText("GitHub подключён")).toBeVisible();
  for (let i = 0; i < puzzles.length; i++) {
    await expect(
      page.getByRole("heading", { name: `Позиция ${i + 1} из 15` }),
    ).toBeVisible();
    for (const uci of puzzles[i].solutions[0].filter(
      (_: string, index: number) => index % 2 === 0,
    ))
      await move(page, uci);
    await expect(page.locator(".sync-message")).toContainText("Сохранено");
    await page.getByRole("button", { name: "Дальше", exact: false }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Диагностика завершена" }),
  ).toBeVisible();
  expect(rows).toHaveLength(15);
  expect(new Set(rows.map((e) => e.sessionId)).size).toBe(1);
  expect(
    rows.every((e) => e.mode === "diagnostic" && e.outcome === "solved"),
  ).toBe(true);
  await page.getByRole("button", { name: "Пройти заново" }).click();
  await move(page, puzzles[0].solutions[0][0]);
  await move(page, puzzles[0].solutions[0][2]);
  await expect(page.locator(".sync-message")).toContainText("Сохранено");
  expect(rows).toHaveLength(16);
  expect(rows[15].sessionId).not.toBe(rows[0].sessionId);
});

test("blocked login popup does not navigate away or drop an unsaved result", async ({
  page,
}) => {
  await page.goto("#/training/" + puzzles[4].id);
  await move(page, puzzles[4].solutions[0][0]);
  await expect(page.locator(".sync-message")).toContainText(
    "Ошибка синхронизации",
  );
  await page.goto("#/progress");
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page
    .locator(".cloud-notice")
    .getByRole("button", { name: "Войти", exact: false })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Разрешите всплывающее окно",
  );
  await expect(
    page.getByRole("heading", { name: "Ожидают подтверждения" }),
  ).toBeVisible();
  expect(page.url()).toContain("#/progress");
});

test("black opening practice starts after the first white move and records a completed line", async ({
  page,
}) => {
  const opening = JSON.parse(
    fs.readFileSync("src/data/openings/04-caro-kann.json", "utf8"),
  );
  await page.goto("#/openings/caro-kann");
  await page
    .getByRole("button", { name: "Проверить себя", exact: true })
    .click();
  await expect(
    page.getByText("Вы играете чёрными", { exact: true }),
  ).toBeVisible();
  for (let index = 1; index < opening.practice.length; index += 2)
    await move(page, opening.practice[index]);
  await expect(
    page.getByText("Решение найдено.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".sync-message")).toContainText(
    "Ошибка синхронизации",
  );
});

test("resumes a diagnostic after a full reload using only cloud history", async ({
  page,
}) => {
  const rows: ProgressEvent[] = [];
  await page.route("https://worker.test/**", async (route) => {
    const req = route.request();
    if (req.url().endsWith("/auth/session"))
      return route.fulfill({ json: { token: "test-session" } });
    if (req.method() === "POST") {
      const e = req.postDataJSON() as ProgressEvent;
      rows.push(e);
      return route.fulfill({ json: { saved: true, id: e.id } });
    }
    return route.fulfill({ json: { schemaVersion: 1, events: rows } });
  });
  await page.goto("#/diagnostic");
  await expect(page.getByText("GitHub подключён")).toBeVisible();
  await move(page, puzzles[0].solutions[0][0]);
  await move(page, puzzles[0].solutions[0][2]);
  await expect(page.locator(".sync-message")).toContainText("Сохранено");
  await page.goto("#/diagnostic?resume=1");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Позиция 2 из 15" }),
  ).toBeVisible();
  await move(page, puzzles[1].solutions[0][0]);
  await move(page, puzzles[1].solutions[0][2]);
  await expect(page.locator(".sync-message")).toContainText("Сохранено");
  expect(rows[1].sessionId).toBe(rows[0].sessionId);
});
