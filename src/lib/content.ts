import { puzzleSchema, openingSchema } from "./schema";
import type { Puzzle, Opening } from "./schema";
import { validatePuzzle, validateTree, playUci } from "./chess";
import { Chess } from "chess.js";
const puzzleFiles = import.meta.glob("../data/puzzles/*.json", {
  eager: true,
  import: "default",
});
const openingFiles = import.meta.glob("../data/openings/*.json", {
  eager: true,
  import: "default",
});
export const contentErrors: string[] = [];
export function loadContentFiles<T extends { id: string }>(
  files: Record<string, unknown>,
  parse: (v: unknown) => T,
  check: (v: T) => void,
  errors: string[] = contentErrors,
) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const [file, raw] of Object.entries(files)) {
    try {
      const item = parse(raw);
      if (seen.has(item.id)) throw Error("Повтор ID");
      check(item);
      seen.add(item.id);
      result.push(item);
    } catch (e) {
      errors.push(`${file}: ${String(e)}`);
    }
  }
  return result;
}
export const puzzles = loadContentFiles<Puzzle>(
  puzzleFiles,
  (v) => puzzleSchema.parse(v),
  validatePuzzle,
);
export const openings = loadContentFiles<Opening>(
  openingFiles,
  (v) => openingSchema.parse(v),
  (o) => {
    validateTree(o.root);
    const g = new Chess();
    o.practice.forEach((m) => playUci(g, m));
  },
);

import diagnostic from "../data/diagnostic.json";
export const diagnosticPuzzles = diagnostic.taskIds.flatMap((id) => {
  const item = puzzles.find((p) => p.id === id);
  return item ? [item] : [];
});
