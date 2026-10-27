import { useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  Lightbulb,
  Flag,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
} from "lucide-react";
import Board from "./Board";
import type { Puzzle, ProgressEvent } from "../lib/schema";
import { checkMove } from "../lib/training";
import { playUci } from "../lib/chess";
import { useStudio } from "../StudioContext";
export function SyncBadge({ id }: { id: string }) {
  const { pending, retry } = useStudio();
  const item = pending.find((p) => p.event.id === id);
  if (!item) return null;
  return (
    <div className={"sync-message " + item.state} role="status">
      <strong>
        {item.state === "saving"
          ? "Сохраняется…"
          : item.state === "saved"
            ? "✓ Сохранено"
            : "Ошибка синхронизации"}
      </strong>
      {item.state === "error" && (
        <>
          <p>{item.error}</p>
          <button className="text-button" onClick={retry}>
            Повторить отправку
          </button>
          <span className="tiny"> Ответ хранится в памяти этой вкладки.</span>
        </>
      )}
    </div>
  );
}
export default function Exercise({
  puzzle,
  kind = "puzzle",
  mode,
  sessionId,
  onNext,
}: {
  puzzle: Puzzle;
  kind?: "puzzle" | "opening";
  mode?: "diagnostic" | "practice" | "opening";
  sessionId: string;
  onNext?: () => void;
}) {
  const { save, boardTheme } = useStudio();
  const [game, setGame] = useState(() => new Chess(puzzle.fen));
  const [played, setPlayed] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<ProgressEvent["attempts"]>([]);
  const [hints, setHints] = useState(0);
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState<"solved" | "revealed">();
  const [eventId, setEventId] = useState("");
  const [lastMove, setLastMove] = useState<[string, string]>();
  const [started] = useState(() => Date.now());
  const [startedAt] = useState(() => new Date().toISOString());
  const locked = useRef(false);
  function finish(
    outcome: "solved" | "revealed",
    moves: ProgressEvent["attempts"],
    line: string[],
  ) {
    if (locked.current) return;
    locked.current = true;
    setFinished(outcome);
    const id = crypto.randomUUID();
    setEventId(id);
    save({
      schemaVersion: 1,
      id,
      sessionId,
      contentId: puzzle.id,
      contentVersion: puzzle.version,
      kind,
      mode: mode || (kind === "opening" ? "opening" : "practice"),
      category: puzzle.category,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      attempts: moves,
      hints,
      outcome,
      firstMove: moves[0]?.uci ?? null,
      playedLine: line,
    });
  }
  function move(uci: string) {
    if (locked.current) return false;
    try {
      const g = new Chess(game.fen());
      const m = playUci(g, uci);
      const result = checkMove(puzzle, played, uci);
      const recorded = [
        ...attempts,
        {
          uci,
          san: m.san,
          fen: game.fen(),
          correct: result.correct,
          at: Date.now() - started,
        },
      ];
      setAttempts(recorded);
      if (!result.correct) {
        setMessage(
          "Этот ход не решает задачу. Проверьте угрозы и попробуйте ещё раз.",
        );
        return false;
      }
      const line = [...played, uci];
      setLastMove([m.from, m.to]);
      if (result.done) {
        setGame(g);
        setPlayed(line);
        setMessage("Решение найдено. Отличная работа с позицией.");
        finish("solved", recorded, line);
        return true;
      }
      if (result.reply) {
        const reply = playUci(g, result.reply);
        line.push(result.reply);
        setLastMove([reply.from, reply.to]);
      }
      setGame(g);
      setPlayed(line);
      setMessage("Верно. Соперник ответил — найдите продолжение.");
      return true;
    } catch {
      return false;
    }
  }
  function reveal() {
    finish("revealed", attempts, played);
    setMessage(
      "Решение открыто. Эта попытка не засчитывается как самостоятельное решение.",
    );
  }
  function solutionText() {
    const g = new Chess(puzzle.fen);
    return puzzle.solutions[0]
      .map((m) => {
        const n = g.moveNumber();
        const turn = g.turn();
        return `${n}${turn === "w" ? "." : "…"} ${playUci(g, m).san}`;
      })
      .join(" ");
  }
  return (
    <div className="exercise-layout">
      <div>
        <Board
          fen={game.fen()}
          onMove={move}
          interactive={!finished}
          orientation={puzzle.side === "w" ? "white" : "black"}
          theme={boardTheme}
          lastMove={lastMove}
        />
        <div className="board-caption">
          <span>
            {puzzle.side === "w" ? "Вы играете белыми" : "Вы играете чёрными"}
          </span>
          <span>Без ограничения времени</span>
        </div>
      </div>
      <aside className="exercise-panel">
        <div className="eyebrow">
          {kind === "opening"
            ? "ВОСПРОИЗВЕДЕНИЕ ЛИНИИ"
            : "ПРАКТИКА · 1000–1200"}
        </div>
        <h2>{puzzle.title}</h2>
        <p>{puzzle.instruction}</p>
        <div className="thinking-note">
          <span className="small-icon">♘</span>
          <div>
            <strong>Сначала — подумайте</strong>
            <p>Проверьте шахи, взятия и угрозы. Затем сделайте ход на доске.</p>
          </div>
        </div>
        <div className="attempt-stats">
          <span>
            Ходов: <b>{attempts.length}</b>
          </span>
          <span>
            Подсказок: <b>{hints}</b>
          </span>
        </div>
        {message && (
          <div
            role="status"
            className={"feedback " + (finished === "solved" ? "success" : "")}
          >
            {finished === "solved" && <CheckCircle2 size={20} />} {message}
          </div>
        )}
        {!finished ? (
          <>
            <div className="exercise-actions">
              <button
                className="button secondary"
                disabled={hints > 0}
                onClick={() => setHints(1)}
              >
                <Lightbulb size={17} /> Подсказка
              </button>
              <button className="text-button muted" onClick={reveal}>
                <Flag size={15} /> Открыть решение
              </button>
            </div>
            {hints > 0 && <div className="hint">{puzzle.hint}</div>}
          </>
        ) : (
          <div className="solution">
            <div className="eyebrow">РАЗБОР ПОЗИЦИИ</div>
            <h3>{puzzle.category}</h3>
            <div className="san-line">{solutionText()}</div>
            <p>{puzzle.explanation}</p>
            <SyncBadge id={eventId} />
            {onNext && (
              <button className="button" onClick={onNext}>
                Дальше <ArrowRight size={18} />
              </button>
            )}
          </div>
        )}
        <div className="played-moves">
          {attempts.length > 0 && (
            <>
              <span className="tiny">ВАШИ ХОДЫ</span>
              <div>
                {attempts.map((a, i) => (
                  <span
                    key={i}
                    className={a.correct ? "correct-move" : "wrong-move"}
                  >
                    {a.san} {a.correct ? "✓" : "×"}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        <p className="tiny">
          {finished
            ? "Попытка добавлена в журнал; статус выше показывает подтверждение сервера."
            : "Неправильный ход учитывается, позиция возвращается. Подсказки и открытие решения отмечаются в истории."}
        </p>
      </aside>
    </div>
  );
}
export function RetryExercise({
  puzzle,
  kind,
  sessionId,
}: {
  puzzle: Puzzle;
  kind?: "puzzle" | "opening";
  mode?: "diagnostic" | "practice" | "opening";
  sessionId: string;
}) {
  const [key, setKey] = useState(0);
  return (
    <>
      <Exercise key={key} puzzle={puzzle} kind={kind} sessionId={sessionId} />
      <button
        className="text-button retry-exercise"
        onClick={() => setKey((k) => k + 1)}
      >
        <RotateCcw size={16} /> Новая попытка
      </button>
    </>
  );
}
