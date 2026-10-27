import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useStudio } from "../StudioContext";
import { puzzles, diagnosticPuzzles } from "../lib/content";
import Exercise, { RetryExercise, SyncBadge } from "../components/Exercise";
import { PageTitle, Missing, CloudNotice } from "../components/Ui";
export function Training() {
  const [category, setCategory] = useState("Все");
  const { events } = useStudio();
  const categories = ["Все", ...new Set(puzzles.map((p) => p.category))];
  return (
    <>
      <PageTitle
        eyebrow="ПРАКТИКА"
        title="Учитесь видеть больше"
        text="Точность важнее скорости. Выберите отдельную позицию или пройдите всю диагностику."
      />
      <div className="diagnostic-banner">
        <div>
          <h2>Начальная диагностика</h2>
          <p>15 задач · разные навыки · подробная история попыток</p>
        </div>
        <Link className="button" to="/diagnostic">
          Начать <ArrowRight size={17} />
        </Link>
      </div>
      <label className="filter">
        Навык{" "}
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <div className="puzzle-grid">
        {puzzles
          .filter((p) => category === "Все" || p.category === category)
          .map((p, i) => {
            const count = events.filter((e) => e.contentId === p.id).length;
            return (
              <Link to={`/training/${p.id}`} key={p.id} className="puzzle-card">
                <span className="puzzle-number">
                  {String(puzzles.indexOf(p) + 1).padStart(2, "0")}
                </span>
                <span className="badge">{p.difficulty}</span>
                <h3>{p.title}</h3>
                <p>{p.category}</p>
                <div className="card-footer">
                  <span>
                    {count ? `Попыток в облаке: ${count}` : "Ещё не пройдено"}
                  </span>
                  <ArrowRight size={18} />
                </div>
                <span className="sr-only">Задание {i + 1}</span>
              </Link>
            );
          })}
      </div>
      <CloudNotice />
    </>
  );
}
export function PuzzlePage() {
  const { id } = useParams();
  const p = puzzles.find((p) => p.id === id);
  const { sessionId } = useStudio();
  if (!p) return <Missing />;
  return (
    <>
      <Link className="back-link" to="/training">
        ← К тренировкам
      </Link>
      <PageTitle
        eyebrow="ТАКТИЧЕСКАЯ СТУДИЯ"
        title="Одна позиция. Ваше решение."
      />
      <RetryExercise key={p.id} puzzle={p} sessionId={sessionId} />
    </>
  );
}
export function Diagnostic() {
  const s = useStudio();
  const [search] = useSearchParams();
  if (search.has("resume") && !s.hydrated)
    return (
      <>
        <PageTitle eyebrow="ДИАГНОСТИКА" title="Восстанавливаем занятие" />
        <p role="status">Читаем подтверждённые результаты из GitHub…</p>
      </>
    );
  if (search.has("resume") && !s.authenticated)
    return (
      <>
        <PageTitle eyebrow="ДИАГНОСТИКА" title="Продолжите своё занятие" />
        <CloudNotice />
        <Link className="text-button" to="/diagnostic">
          Начать новую диагностику без восстановления
        </Link>
      </>
    );
  return <DiagnosticRun />;
}
function DiagnosticRun() {
  const s = useStudio();
  const [search] = useSearchParams();
  const [resume] = useState(() => {
    const last = search.has("resume")
      ? s.events.filter((e) => e.mode === "diagnostic").at(-1)
      : undefined;
    if (!last) return undefined;
    const rows = s.events.filter((e) => e.sessionId === last.sessionId);
    const next = diagnosticPuzzles.findIndex(
      (p) => !rows.some((e) => e.contentId === p.id),
    );
    return next >= 0 ? { index: next, id: last.sessionId } : undefined;
  });
  const [index, setIndex] = useState(resume?.index || 0);
  const [runId, setRunId] = useState(() => resume?.id || crypto.randomUUID());
  const finished = index >= diagnosticPuzzles.length;
  if (!diagnosticPuzzles.length) return <Missing />;
  return (
    <>
      <Link className="back-link" to="/training">
        ← К тренировкам
      </Link>
      <div className="section-title">
        <PageTitle
          eyebrow="НАЧАЛЬНАЯ ДИАГНОСТИКА"
          title={
            finished
              ? "Диагностика завершена"
              : `Позиция ${index + 1} из ${diagnosticPuzzles.length}`
          }
          text="Не спешите. Время учитывается только для справки."
        />
        <span className="progress-count">
          {Math.min(index, diagnosticPuzzles.length)} /{" "}
          {diagnosticPuzzles.length}
        </span>
      </div>
      <div className="progress-track">
        <span
          style={{ width: `${(index / diagnosticPuzzles.length) * 100}%` }}
        />
      </div>
      {finished ? (
        <div className="panel">
          <h2>Теперь есть с чем работать</h2>
          <p>
            Сохранённые результаты доступны в разделе прогресса. Записи с
            ошибкой синхронизации остаются в этой вкладке до повторной отправки.
          </p>
          {s.pending
            .filter((p) => p.event.sessionId === runId)
            .map((p) => (
              <SyncBadge id={p.event.id} key={p.event.id} />
            ))}
          <Link className="button" to="/progress">
            Посмотреть результаты <ArrowRight size={18} />
          </Link>
          <button
            className="text-button"
            onClick={() => {
              setRunId(crypto.randomUUID());
              setIndex(0);
            }}
          >
            Пройти заново
          </button>
        </div>
      ) : (
        <Exercise
          key={`${runId}-${index}`}
          puzzle={diagnosticPuzzles[index]}
          sessionId={runId}
          mode="diagnostic"
          onNext={() => setIndex((i) => i + 1)}
        />
      )}
    </>
  );
}
