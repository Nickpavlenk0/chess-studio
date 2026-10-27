import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { ArrowRight } from "lucide-react";
import { useStudio } from "../StudioContext";
import { openings } from "../lib/content";
import { playUci } from "../lib/chess";
import type { Puzzle } from "../lib/schema";
import Study from "../components/Study";
import { RetryExercise } from "../components/Exercise";
import { PageTitle, Missing } from "../components/Ui";
export function OpeningCatalog() {
  return (
    <>
      <PageTitle
        eyebrow="ШКОЛА ДЕБЮТОВ"
        title="Первые ходы с пониманием"
        text="Не заучивайте последовательность. Изучайте центр, развитие и планы обеих сторон."
      />
      <div className="opening-grid">
        {openings.map((o, i) => (
          <Link
            className={"opening-card opening-" + i}
            key={o.id}
            to={`/openings/${o.id}`}
          >
            <div>
              <span className="badge">
                {o.side === "w" ? "За белых" : "За чёрных"} · {o.eco}
              </span>
              <span className="opening-symbol">
                {["♘", "♗", "♞", "♟", "♝"][i]}
              </span>
            </div>
            <div className="eyebrow">{o.level}</div>
            <h2>{o.title}</h2>
            <p>{o.subtitle}</p>
            <div className="card-footer">
              <span>Теория · варианты · практика</span>
              <ArrowRight size={20} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
export function OpeningPage() {
  const { id } = useParams();
  const o = openings.find((o) => o.id === id);
  const [tab, setTab] = useState("study");
  const { sessionId } = useStudio();
  if (!o) return <Missing />;
  const g = new Chess();
  let line = o.practice.slice();
  if (o.side === "b") {
    playUci(g, line[0]);
    line = line.slice(1);
  }
  if (line.length % 2 === 0) line = line.slice(0, -1);
  const p: Puzzle = {
    schemaVersion: 1,
    id: o.id,
    version: o.version,
    title: "Закрепите изученную линию",
    instruction:
      "Воспроизведите основную линию по памяти. Соперник отвечает автоматически.",
    fen: g.fen(),
    side: o.side,
    category: o.title,
    difficulty: "Базовая",
    solutions: [line],
    hint: o.idea,
    explanation: o.after,
    source: "Авторский учебный курс Chess Studio",
    verification: {
      engine: "Легальность: chess.js + python-chess",
      depth: 0,
      bestMoves: [],
      score: "n/a",
    },
  };
  return (
    <>
      <Link className="back-link" to="/openings">
        ← Каталог дебютов
      </Link>
      <PageTitle
        eyebrow={`${o.eco} · ${o.side === "w" ? "ЗА БЕЛЫХ" : "ЗА ЧЁРНЫХ"}`}
        title={o.title}
        text={o.subtitle}
      />
      <div className="tabs">
        {[
          ["study", "Интерактивная студия"],
          ["theory", "Идеи и планы"],
          ["practice", "Проверить себя"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "study" && <Study key={o.id} root={o.root} />}{" "}
      {tab === "theory" && (
        <div className="theory-grid">
          <article className="panel">
            <div className="eyebrow">КОНТЕКСТ</div>
            <h2>История и идея</h2>
            <p>{o.history}</p>
            <p>{o.idea}</p>
            <h3>Пешечная структура</h3>
            <p>{o.structure}</p>
            <h3>После дебюта</h3>
            <p>{o.after}</p>
          </article>
          <article className="panel">
            <h3>Ваш план</h3>
            <ul>
              {o.plans.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <h3>Что хочет соперник</h3>
            <ul>
              {o.opponentPlans.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <h3>Частые ошибки</h3>
            <ul>
              {o.mistakes.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <h3>Тактические ориентиры</h3>
            <ul>
              {o.traps.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </article>
        </div>
      )}
      {tab === "practice" && (
        <RetryExercise
          key={o.id}
          puzzle={p}
          kind="opening"
          sessionId={sessionId}
        />
      )}
    </>
  );
}
