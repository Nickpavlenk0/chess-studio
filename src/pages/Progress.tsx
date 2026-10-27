import { Link } from "react-router-dom";
import {
  RefreshCw,
  Download,
  Crosshair,
  Sparkles,
  BookOpen,
  CircleHelp,
} from "lucide-react";
import { useStudio } from "../StudioContext";
import { summarize } from "../lib/progress";
import { openings, diagnosticPuzzles } from "../lib/content";
import { download } from "../components/Study";
import { SyncBadge } from "../components/Exercise";
import { PageTitle, Metric, CloudNotice, Recent } from "../components/Ui";
export default function Progress() {
  const s = useStudio();
  const stats = summarize(s.events);
  const activity = [...new Set(s.events.map((e) => e.sessionId))]
    .map((id) => {
      const events = s.events.filter((e) => e.sessionId === id);
      const good = events.filter(
        (e) =>
          e.outcome === "solved" &&
          e.hints === 0 &&
          e.attempts.every((a) => a.correct),
      ).length;
      return {
        id,
        date: events[0].completedAt,
        total: events.length,
        percent: Math.round((good / events.length) * 100),
      };
    })
    .slice(-7)
    .reverse();
  const sessions = [
    ...new Set(
      s.events.filter((e) => e.mode === "diagnostic").map((e) => e.sessionId),
    ),
  ]
    .map((id) => ({
      id,
      events: s.events.filter(
        (e) => e.mode === "diagnostic" && e.sessionId === id,
      ),
    }))
    .reverse();
  return (
    <>
      <div className="section-title">
        <PageTitle
          eyebrow="ЛИЧНЫЙ ЖУРНАЛ"
          title="Ваш путь в шахматах"
          text="Реальные попытки и наблюдения. Без искусственного рейтинга."
        />
        <div className="action-row">
          <button
            className="icon-button"
            aria-label="Обновить прогресс"
            onClick={s.refresh}
            disabled={!s.authenticated || s.loading}
          >
            <RefreshCw size={19} />
          </button>
          <button
            className="button secondary small"
            disabled={!s.events.length && !s.pending.length}
            onClick={() =>
              download(
                "chess-progress.json",
                JSON.stringify(
                  {
                    schemaVersion: 1,
                    events: s.events,
                    pending: s.pending
                      .filter((p) => p.state !== "saved")
                      .map((p) => p.event),
                  },
                  null,
                  2,
                ),
              )
            }
          >
            <Download size={16} /> Экспорт JSON
          </button>
        </div>
      </div>
      <CloudNotice />
      {s.loading && <p role="status">Загрузка журнала из GitHub…</p>}
      {s.cloudError && (
        <div className="feedback" role="alert">
          {s.cloudError}
          <button onClick={s.refresh}>Повторить</button>
        </div>
      )}
      {s.pending.some((p) => p.state !== "saved") && (
        <section className="panel">
          <h3>Ожидают подтверждения</h3>
          {s.pending
            .filter((p) => p.state !== "saved")
            .map((p) => (
              <div key={p.event.id}>
                <strong>{p.event.category}</strong>
                <SyncBadge id={p.event.id} />
              </div>
            ))}
        </section>
      )}
      <div className="metrics standalone">
        <Metric
          label="Выполнено задач"
          value={String(stats.total)}
          note="все сохранённые прохождения"
          icon={<Crosshair size={20} />}
        />
        <Metric
          label="Первая попытка"
          value={stats.total ? `${stats.firstPercent}%` : "—"}
          note="без ошибок и подсказок"
          icon={<Sparkles size={20} />}
        />
        <Metric
          label="Изучено дебютов"
          value={String(stats.openings.length)}
          note="основная линия воспроизведена"
          icon={<BookOpen size={20} />}
        />
      </div>
      <div className="progress-grid">
        <section className="panel">
          <h2>Навыки по категориям</h2>
          {!stats.categories.length ? (
            <EmptyProgress />
          ) : (
            stats.categories.map((c) => (
              <div className="category-stat" key={c.category}>
                <div>
                  <span>{c.category}</span>
                  <strong>
                    {c.correct} / {c.total}
                  </strong>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${(c.correct / c.total) * 100}%` }} />
                </div>
                <small>
                  Без ошибок и подсказок · Ошибочных ходов: {c.errors}
                </small>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <h2>На что обратить внимание</h2>
          {stats.categories.some((c) => c.errors) ? (
            stats.categories
              .filter((c) => c.errors)
              .sort((a, b) => b.errors - a.errors)
              .map((c) => (
                <div className="error-category" key={c.category}>
                  <span>{c.category}</span>
                  <strong>{c.errors} ошибок</strong>
                </div>
              ))
          ) : (
            <p className="muted">
              Повторяющиеся ошибки появятся после сохранённых попыток.
            </p>
          )}
          <h3>Прогресс по дебютам</h3>
          {openings.map((o) => (
            <div className="lesson-progress" key={o.id}>
              <Link to={`/openings/${o.id}`}>{o.title}</Link>
              <span>
                {stats.openings.includes(o.id) ? "✓ Закреплён" : "Не закреплён"}
              </span>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>Динамика занятий</h2>
          {activity.map((a) => (
            <div className="activity-row" key={a.id}>
              <div>
                <span>{new Date(a.date).toLocaleDateString("ru-RU")}</span>
                <small>{a.total} упражнений</small>
              </div>
              <progress
                max={100}
                value={a.percent}
                aria-label={`Без ошибок и подсказок: ${a.percent}%`}
              />
              <strong>{a.percent}%</strong>
            </div>
          ))}
          <p className="tiny">
            Доля упражнений без ошибок и подсказок в каждом занятии.
          </p>
          <h3>История диагностик</h3>
          {!sessions.length ? (
            <EmptyProgress />
          ) : (
            sessions.map((session) => {
              const first = session.events.filter(
                (e) =>
                  e.outcome === "solved" &&
                  e.hints === 0 &&
                  e.attempts.every((a) => a.correct),
              ).length;
              return (
                <details className="session-detail" key={session.id}>
                  <summary>
                    {new Date(session.events[0].completedAt).toLocaleDateString(
                      "ru-RU",
                    )}{" "}
                    · {new Set(session.events.map((e) => e.contentId)).size}/
                    {diagnosticPuzzles.length}
                    позиций · {first}/{session.events.length} без ошибок
                  </summary>
                  <Recent events={session.events} />
                </details>
              );
            })
          )}
        </section>
        <section className="panel">
          <h2>Последние результаты</h2>
          {s.events.length ? (
            <Recent events={s.events.slice(-10).reverse()} />
          ) : (
            <EmptyProgress />
          )}
        </section>
      </div>
    </>
  );
}
function EmptyProgress() {
  return (
    <div className="empty compact-empty">
      <CircleHelp size={28} />
      <p>
        Пока нет подтверждённых результатов.
        <br />
        Начните с диагностики и подключите облако.
      </p>
    </div>
  );
}
