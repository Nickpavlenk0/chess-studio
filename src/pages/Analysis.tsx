import { useState } from "react";
import { Chess } from "chess.js";
import type { LineNode } from "../lib/schema";
import Study from "../components/Study";
import { PageTitle } from "../components/Ui";
export default function Analysis() {
  const [root, setRoot] = useState<LineNode>({
    id: "analysis-root",
    comment:
      "Свободная доска. Делайте ходы, возвращайтесь назад и создавайте альтернативы. Все ветви можно выгрузить в PGN.",
    children: [],
  });
  const [key, setKey] = useState(0);
  const [pgn, setPgn] = useState("");
  const [fenInput, setFenInput] = useState("");
  const [analysisFen, setAnalysisFen] = useState<string>();
  const [error, setError] = useState("");
  function load() {
    try {
      const g = new Chess();
      g.loadPgn(pgn, { strict: false });
      const moves = g.history({ verbose: true });
      let current: LineNode = {
        id: "import-root",
        comment:
          "Импортирована основная линия PGN. Ветви из PGN не импортируются; добавляйте их на доске.",
        children: [],
      };
      const next = current;
      for (const [i, m] of moves.entries()) {
        const child = {
          id: "import-" + i,
          move: m.from + m.to + (m.promotion || ""),
          children: [],
        };
        current.children = [child];
        current = child;
      }
      setRoot(next);
      setAnalysisFen(g.getHeaders().FEN);
      setKey((k) => k + 1);
      setError("");
    } catch {
      setError("Не удалось прочитать PGN. Проверьте запись ходов.");
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="ЛАБОРАТОРИЯ"
        title="Исследуйте свои идеи"
        text="Свободный анализ без компьютерного соперника. Проверяйте варианты и добавляйте объясняющие стрелки."
      />
      <Study key={key} root={root} fen={analysisFen} />
      <div className="panel import-panel">
        <h3>Открыть позицию FEN</h3>
        <label htmlFor="fen">FEN позиции</label>
        <input
          id="fen"
          className="fen-input"
          value={fenInput}
          onChange={(e) => setFenInput(e.target.value)}
          placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        />
        <button
          className="button secondary"
          disabled={!fenInput.trim()}
          onClick={() => {
            try {
              const g = new Chess(fenInput);
              setAnalysisFen(g.fen());
              setRoot({
                id: "fen-root",
                comment:
                  "Позиция загружена из FEN. Исследуйте легальные продолжения.",
                children: [],
              });
              setKey((k) => k + 1);
              setError("");
            } catch {
              setError("Некорректная позиция FEN. Проверьте запись.");
            }
          }}
        >
          Загрузить FEN
        </button>
        <h3>Открыть партию</h3>
        <label htmlFor="pgn">PGN (импорт основной линии)</label>
        <textarea
          id="pgn"
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
          placeholder="1. e4 e5 2. Nf3 Nc6"
        />
        <button
          className="button secondary"
          onClick={load}
          disabled={!pgn.trim()}
        >
          Загрузить PGN
        </button>
        <button
          className="text-button"
          onClick={() => {
            setRoot({ id: "analysis-root", children: [] });
            setAnalysisFen(undefined);
            setKey((k) => k + 1);
          }}
        >
          Новая доска
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    </>
  );
}
