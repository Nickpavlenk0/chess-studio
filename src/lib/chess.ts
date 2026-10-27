import { Chess } from "chess.js";
import type { LineNode } from "./schema";
export function playUci(chess: Chess, uci: string) {
  return chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  });
}
export function pathTo(
  root: LineNode,
  id: string,
  path: LineNode[] = [],
): LineNode[] | null {
  const p = [...path, root];
  if (root.id === id) return p;
  for (const c of root.children) {
    const found = pathTo(c, id, p);
    if (found) return found;
  }
  return null;
}
export function positionAt(root: LineNode, id: string, fen?: string) {
  const game = new Chess(fen);
  const path = pathTo(root, id);
  if (!path) throw Error("Неизвестная позиция");
  for (const n of path) if (n.move) playUci(game, n.move);
  return game;
}
export function lastNode(root: LineNode) {
  let n = root;
  while (n.children.length) n = n.children[0];
  return n;
}
export function validateTree(root: LineNode, fen?: string) {
  const ids = new Set<string>();
  function walk(n: LineNode, game: Chess) {
    if (ids.has(n.id)) throw Error(`Повтор ID: ${n.id}`);
    ids.add(n.id);
    if (n.move) playUci(game, n.move);
    for (const c of n.children) walk(c, new Chess(game.fen()));
  }
  walk(root, new Chess(fen));
}
export function validatePuzzle(p: import("./schema").Puzzle) {
  const start = new Chess(p.fen);
  if (start.turn() !== p.side) throw Error("Неверная сторона");
  if (start.isGameOver()) throw Error("Позиция уже завершена");
  for (const line of p.solutions) {
    const g = new Chess(p.fen);
    for (const m of line) playUci(g, m);
    if (line.length % 2 !== 1)
      throw Error("Решение должно завершаться ходом ученика");
  }
}
export function treeToPgn(root: LineNode, fen?: string) {
  const initial = new Chess(fen);
  function comment(n: LineNode) {
    return n.comment ? `{${n.comment.replace(/[{}]/g, "")}} ` : "";
  }
  function head(n: LineNode, g: Chess) {
    const prefix = `${g.moveNumber()}${g.turn() === "w" ? "." : "..."}`;
    return `${prefix} ${playUci(g, n.move!).san} ${comment(n)}`;
  }
  function tail(n: LineNode, g: Chess): string {
    const [main, ...variants] = n.children;
    if (!main) return "";
    const after = new Chess(g.fen());
    let output = head(main, after);
    for (const v of variants) {
      const branch = new Chess(g.fen());
      output += `(${head(v, branch)}${tail(v, branch)}) `;
    }
    return output + tail(main, after);
  }
  return `[Event "Chess Studio"]\n[Result "*"]\n${fen && fen !== new Chess().fen() ? `[SetUp "1"]\n[FEN "${initial.fen()}"]\n` : ""}\n${comment(root)}${tail(root, initial)}*`;
}
