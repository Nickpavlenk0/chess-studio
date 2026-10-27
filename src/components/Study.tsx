import { useState } from "react";
import { Chess } from "chess.js";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  CornerDownRight,
} from "lucide-react";
import Board from "./Board";
import { lastNode, pathTo, positionAt, playUci, treeToPgn } from "../lib/chess";
import type { LineNode } from "../lib/schema";
import { useStudio } from "../StudioContext";
export function download(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function MoveTree({
  node,
  fen,
  active,
  onSelect,
  depth = 0,
}: {
  node: LineNode;
  fen: string;
  active: string;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  const g = new Chess(fen);
  let label = "Начало";
  if (node.move) {
    const n = g.moveNumber();
    const side = g.turn();
    const m = playUci(g, node.move);
    label = `${n}${side === "w" ? "." : "…"} ${m.san}`;
  }
  return (
    <div className={"tree-node " + (depth ? "variation" : "")}>
      <button
        className={"move-chip " + (active === node.id ? "selected" : "")}
        onClick={() => onSelect(node.id)}
      >
        {depth > 0 && <CornerDownRight size={12} />} {label}
      </button>
      {node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((c, i) => (
            <MoveTree
              key={c.id}
              node={c}
              fen={g.fen()}
              active={active}
              onSelect={onSelect}
              depth={depth + (i > 0 ? 1 : 0)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
export default function Study({
  root: initialRoot,
  compact = false,
  fen,
}: {
  root: LineNode;
  compact?: boolean;
  fen?: string;
}) {
  const [root, setRoot] = useState(initialRoot);
  const [active, setActive] = useState(root.id);
  const [notice, setNotice] = useState("");
  const { boardTheme } = useStudio();
  const path = pathTo(root, active)!;
  const node = path.at(-1)!;
  const game = positionAt(root, active, fen);
  const history = game.history({ verbose: true });
  const last = history.at(-1);
  function move(uci: string) {
    const copy = structuredClone(root);
    const current = pathTo(copy, active)!.at(-1)!;
    try {
      const g = new Chess(game.fen());
      playUci(g, uci);
      let child = current.children.find((c) => c.move === uci);
      if (!child) {
        child = {
          id: "user-" + crypto.randomUUID(),
          move: uci,
          comment: "Ваш вариант. Его можно экспортировать в PGN.",
          children: [],
        };
        current.children.push(child);
      }
      setRoot(copy);
      setActive(child.id);
      return true;
    } catch {
      return false;
    }
  }
  function exportPgn() {
    download(
      "chess-studio.pgn",
      treeToPgn(root, fen),
      "application/x-chess-pgn",
    );
  }
  return (
    <div className={"study-layout " + (compact ? "compact" : "")}>
      <div>
        <Board
          fen={game.fen()}
          onMove={move}
          theme={boardTheme}
          lastMove={last ? [last.from, last.to] : undefined}
          arrows={node.arrows}
          highlights={node.highlights}
        />
        <div className="playback">
          <button
            aria-label="В начало"
            disabled={active === root.id}
            onClick={() => setActive(root.id)}
          >
            <ChevronFirst />
          </button>
          <button
            aria-label="Предыдущий ход"
            disabled={path.length < 2}
            onClick={() => setActive(path.at(-2)!.id)}
          >
            <ChevronLeft />
          </button>
          <span>
            {history.length
              ? `Ход ${Math.ceil(history.length / 2)}`
              : "Начальная позиция"}
          </span>
          <button
            aria-label="Следующий ход"
            disabled={!node.children.length}
            onClick={() => setActive(node.children[0].id)}
          >
            <ChevronRight />
          </button>
          <button
            aria-label="В конец варианта"
            disabled={!node.children.length}
            onClick={() => setActive(lastNode(node).id)}
          >
            <ChevronLast />
          </button>
        </div>
      </div>
      <div className="study-panel">
        <div className="eyebrow">ИНТЕРАКТИВНАЯ СТУДИЯ</div>
        <h3>{node.comment ? "Понимайте каждый ход" : "Исследуйте позицию"}</h3>
        <p className="position-comment">
          {node.comment ||
            "Сделайте ход на доске или выберите продолжение в дереве."}
        </p>
        {path.some((n, i) => i > 0 && path[i - 1].children[0]?.id !== n.id) && (
          <button
            className="text-button"
            onClick={() => {
              const i = path
                .map((n, i) => i > 0 && path[i - 1].children[0]?.id !== n.id)
                .lastIndexOf(true);
              setActive(path[i - 1].id);
            }}
          >
            ↖ К месту разветвления
          </button>
        )}
        <div className="move-tree">
          <MoveTree
            node={root}
            fen={new Chess(fen).fen()}
            active={active}
            onSelect={setActive}
          />
        </div>
        <div className="study-footer">
          <button className="text-button" onClick={exportPgn}>
            <Download size={15} /> PGN с вариантами
          </button>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(game.fen());
                setNotice("FEN скопирован");
              } catch {
                setNotice(game.fen());
              }
            }}
          >
            Копировать FEN
          </button>
        </div>
        {notice && (
          <p className="tiny" role="status">
            {notice}
          </p>
        )}
        <p className="tiny">
          Первое продолжение — основная линия. Вложенные ветки — альтернативы.
          Свои ходы создают новые ветки в памяти вкладки.
        </p>
      </div>
    </div>
  );
}
