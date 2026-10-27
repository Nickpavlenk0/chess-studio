import { progressSchema, type ProgressEvent } from "./schema";
export type SyncState = "saving" | "saved" | "error";
export interface Pending {
  event: ProgressEvent;
  state: SyncState;
  error?: string;
}
export function mergeEvents(a: ProgressEvent[], b: ProgressEvent[]) {
  return [...new Map([...a, ...b].map((e) => [e.id, e])).values()].sort(
    (x, y) => x.completedAt.localeCompare(y.completedAt),
  );
}
export function summarize(events: ProgressEvent[]) {
  const puzzles = events.filter((e) => e.kind === "puzzle");
  const first = puzzles.filter(
    (e) =>
      e.outcome === "solved" &&
      e.hints === 0 &&
      e.attempts.every((a) => a.correct),
  );
  const categories = [...new Set(puzzles.map((e) => e.category))].map(
    (category) => {
      const rows = puzzles.filter((e) => e.category === category);
      return {
        category,
        total: rows.length,
        correct: rows.filter(
          (e) =>
            e.outcome === "solved" &&
            e.attempts.every((a) => a.correct) &&
            e.hints === 0,
        ).length,
        errors: rows.reduce(
          (s, e) => s + e.attempts.filter((a) => !a.correct).length,
          0,
        ),
      };
    },
  );
  return {
    total: puzzles.length,
    firstPercent: puzzles.length
      ? Math.round((first.length / puzzles.length) * 100)
      : 0,
    categories,
    openings: [
      ...new Set(
        events
          .filter((e) => e.kind === "opening" && e.outcome === "solved")
          .map((e) => e.contentId),
      ),
    ],
  };
}
export class CloudApi {
  constructor(
    public base: string,
    public token: string,
  ) {}
  async request(path: string, init?: RequestInit) {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      if (res.status === 401)
        throw Error("Сессия истекла. Войдите снова, затем повторите отправку.");
      if (res.status === 429)
        throw Error("Лимит запросов. Повторите отправку через минуту.");
      throw Error(`Облако недоступно (${res.status}). Повторите отправку.`);
    }
    return res.json();
  }
  async load() {
    return mergeEvents(
      [],
      progressSchema.parse(await this.request("/api/progress")).events,
    );
  }
  async save(event: ProgressEvent) {
    const result = await this.request("/api/progress", {
      method: "POST",
      body: JSON.stringify(event),
    });
    if (result.id !== event.id || result.saved !== true)
      throw Error("Сервер не подтвердил запись");
    return result;
  }
}
