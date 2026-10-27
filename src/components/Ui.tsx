import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogIn, ShieldCheck } from "lucide-react";
import { useStudio } from "../StudioContext";
import { puzzles, openings } from "../lib/content";
export function CloudNotice() {
  const s = useStudio();
  return (
    <div className="cloud-notice">
      <ShieldCheck size={20} />
      <div>
        <strong>
          {s.authenticated
            ? "Вход через GitHub выполнен"
            : s.configured
              ? "Ваш прогресс — в вашем GitHub"
              : "Облачная синхронизация не настроена"}
        </strong>
        <p>
          {s.authenticated
            ? "Сохранение подтверждается отдельно для каждого упражнения."
            : s.configured
              ? "Войдите через GitHub, чтобы сохранять результаты. Учебные материалы доступны всем."
              : "Материалы и доска работают. Для сохранения результатов владелец должен развернуть Worker — инструкция в DEPLOYMENT.md."}
        </p>
      </div>
      {s.configured && (
        <button className="button small" onClick={s.login}>
          {s.authenticated ? "Обновить вход" : "Войти"} <LogIn size={15} />
        </button>
      )}
    </div>
  );
}
export function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <div className="metric">
      <div>
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
export function Recent({
  events,
}: {
  events: ReturnType<typeof useStudio>["events"];
}) {
  return (
    <div className="recent-list">
      {events.map((e) => (
        <div className="recent-row" key={e.id}>
          <span
            className={
              "result-icon " + (e.outcome === "solved" ? "" : "revealed")
            }
          >
            {e.outcome === "solved" ? "✓" : "↗"}
          </span>
          <div>
            <strong>
              {puzzles.find((p) => p.id === e.contentId)?.title ||
                openings.find((o) => o.id === e.contentId)?.title ||
                e.contentId}
            </strong>
            <small>
              {e.category} ·{" "}
              {new Date(e.completedAt).toLocaleDateString("ru-RU")}
            </small>
          </div>
          <span>
            {e.outcome === "revealed"
              ? "С разбором"
              : e.attempts.every((a) => a.correct) && e.hints === 0
                ? "Без ошибок"
                : "Решено"}
            <small>
              {e.attempts.filter((a) => !a.correct).length} ошибок ·{" "}
              {Math.round(e.durationMs / 1000)} с
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
    </div>
  );
}
export function Missing() {
  return (
    <div className="empty">
      <h1>Материал не найден</h1>
      <Link to="/">На главную</Link>
    </div>
  );
}
