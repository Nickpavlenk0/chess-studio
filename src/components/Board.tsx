import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { FlipVertical2, Eraser, Pencil, X } from "lucide-react";
interface Props {
  fen: string;
  onMove?: (uci: string) => boolean;
  orientation?: "white" | "black";
  lastMove?: [string, string];
  arrows?: [string, string][];
  highlights?: string[];
  theme?: string;
  interactive?: boolean;
}
export default function Board({
  fen,
  onMove,
  orientation = "white",
  lastMove,
  arrows = [],
  highlights = [],
  theme = "sage",
  interactive = true,
}: Props) {
  const game = useMemo(() => new Chess(fen), [fen]);
  const [flipped, setFlipped] = useState(false);
  const [typedMove, setTypedMove] = useState("");
  const [moveError, setMoveError] = useState("");
  const [selected, setSelected] = useState<string>();
  const [promotion, setPromotion] = useState<{ from: string; to: string }>();
  const [annotate, setAnnotate] = useState(false);
  const [marks, setMarks] = useState<string[]>([]);
  const [userArrows, setUserArrows] = useState<[string, string][]>([]);
  const [arrowFrom, setArrowFrom] = useState<string>();
  useEffect(() => {
    setSelected(undefined);
    setPromotion(undefined);
    setArrowFrom(undefined);
  }, [fen]);
  const styles: Record<string, CSSProperties> = {};
  highlights.concat(marks).forEach((s) => {
    styles[s] = { backgroundColor: "#d4a451aa" };
  });
  lastMove?.forEach((s) => {
    styles[s] = { backgroundColor: "#d7d47d99" };
  });
  if (game.isCheck()) {
    const king = game
      .board()
      .flat()
      .find((p) => p?.type === "k" && p.color === game.turn());
    if (king)
      styles[king.square] = {
        background:
          "radial-gradient(ellipse at center,#e45d50 0%,#b83b3980 75%)",
      };
  }
  if (selected) {
    styles[selected] = { backgroundColor: "#e4bd5999" };
    game.moves({ square: selected as Square, verbose: true }).forEach((m) => {
      styles[m.to] = {
        backgroundImage: game.get(m.to)
          ? "radial-gradient(transparent 58%,#1b39384d 60%)"
          : "radial-gradient(#1b39384d 19%,transparent 22%)",
      };
    });
  }
  function move(from: string, to: string, piece?: string) {
    if (!interactive || !onMove) return false;
    const legal = game
      .moves({ square: from as Square, verbose: true })
      .filter((m) => m.to === to);
    if (!legal.length) return false;
    if (legal.some((m) => m.promotion) && !piece) {
      setPromotion({ from, to });
      return false;
    }
    const ok = onMove(from + to + (piece || ""));
    setSelected(undefined);
    return ok;
  }
  function click(square: string) {
    if (annotate) {
      if (arrowFrom) {
        if (arrowFrom === square)
          setMarks((m) =>
            m.includes(square) ? m.filter((s) => s !== square) : [...m, square],
          );
        else setUserArrows((a) => [...a, [arrowFrom, square]]);
        setArrowFrom(undefined);
      } else setArrowFrom(square);
      return;
    }
    if (selected && move(selected, square)) return;
    const p = game.get(square as Square);
    setSelected(p?.color === game.turn() && interactive ? square : undefined);
  }
  const palette =
    theme === "walnut"
      ? ["#eddfca", "#a67d5c"]
      : theme === "slate"
        ? ["#e5e9ef", "#7b8fa5"]
        : ["#e9eddf", "#7c9b83"];
  return (
    <div className="board-shell">
      <div className="board-frame">
        <Chessboard
          options={{
            id: "studio-board",
            position: fen,
            boardOrientation: flipped
              ? orientation === "white"
                ? "black"
                : "white"
              : orientation,
            lightSquareStyle: { backgroundColor: palette[0] },
            darkSquareStyle: { backgroundColor: palette[1] },
            squareStyles: styles,
            onSquareClick: ({ square }) => click(square),
            allowDragging: interactive && !annotate,
            canDragPiece: ({ piece }) => piece.pieceType[0] === game.turn(),
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              targetSquare ? move(sourceSquare, targetSquare) : false,
            allowDrawingArrows: true,
            arrows: [...arrows, ...userArrows].map(
              ([startSquare, endSquare]) => ({
                startSquare,
                endSquare,
                color: "#d99636d9",
              }),
            ),
            onSquareRightClick: ({ square }) =>
              setMarks((m) =>
                m.includes(square)
                  ? m.filter((s) => s !== square)
                  : [...m, square],
              ),
            animationDurationInMs: 180,
            showAnimations: true,
            showNotation: true,
            dragActivationDistance: 7,
          }}
        />
        {promotion && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Превращение пешки"
            className="promotion"
          >
            <strong>Превратить пешку в…</strong>
            <div>
              {[
                ["q", "Ферзь"],
                ["r", "Ладья"],
                ["b", "Слон"],
                ["n", "Конь"],
              ].map(([p, name]) => (
                <button
                  key={p}
                  onClick={() => {
                    move(promotion.from, promotion.to, p);
                    setPromotion(undefined);
                  }}
                >
                  {name}
                </button>
              ))}
              <button
                aria-label="Отменить превращение"
                onClick={() => setPromotion(undefined)}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="board-tools">
        <span className="turn-dot" />
        {game.turn() === "w" ? "Ход белых" : "Ход чёрных"}
        {game.isCheckmate()
          ? " · Мат"
          : game.isStalemate()
            ? " · Пат"
            : game.isCheck()
              ? " · Шах"
              : game.isDraw()
                ? " · Ничья"
                : ""}
        <div className="spacer" />
        <button
          className="icon-button"
          title="Перевернуть доску"
          aria-label="Перевернуть доску"
          onClick={() => setFlipped((v) => !v)}
        >
          <FlipVertical2 size={17} />
        </button>
        <button
          className={"icon-button " + (annotate ? "active" : "")}
          title="Рисовать: две клетки — стрелка, дважды одна — выделение"
          aria-label="Режим аннотаций"
          aria-pressed={annotate}
          onClick={() => {
            setAnnotate((v) => !v);
            setSelected(undefined);
          }}
        >
          <Pencil size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Очистить аннотации"
          onClick={() => {
            setUserArrows([]);
            setMarks([]);
            setArrowFrom(undefined);
          }}
        >
          <Eraser size={17} />
        </button>
      </div>
      {annotate && (
        <p className="tiny">
          Коснитесь начала и конца стрелки. Два касания одной клетки —
          выделение.{arrowFrom && ` Начало: ${arrowFrom}.`}
        </p>
      )}
      {interactive && onMove && (
        <form
          className="keyboard-move"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const g = new Chess(fen);
              let uci = typedMove.trim();
              if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
                const m = g.move(uci);
                uci = m.from + m.to + (m.promotion || "");
              }
              const accepted = move(uci.slice(0, 2), uci.slice(2, 4), uci[4]);
              setMoveError(
                accepted
                  ? ""
                  : "Ход не принят. Проверьте позицию или условие задачи.",
              );
              setTypedMove("");
            } catch {
              setMoveError("Введите легальный ход в SAN или UCI.");
            }
          }}
        >
          <label className="sr-only" htmlFor="keyboard-move">
            Ход в SAN или UCI
          </label>
          <input
            id="keyboard-move"
            value={typedMove}
            onChange={(e) => setTypedMove(e.target.value)}
            placeholder="Ход: Nf3 или g1f3"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={!typedMove.trim()}>
            Сделать ход
          </button>
          {moveError && <p role="status">{moveError}</p>}
        </form>
      )}
    </div>
  );
}
