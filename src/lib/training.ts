import type { Puzzle } from "./schema";
export function candidateLines(puzzle: Puzzle, played: string[]) {
  return puzzle.solutions.filter((line) =>
    played.every((m, i) => line[i] === m),
  );
}
export function checkMove(puzzle: Puzzle, played: string[], uci: string) {
  const lines = candidateLines(puzzle, [...played, uci]);
  if (!lines.length) return { correct: false, done: false, reply: undefined };
  const index = played.length + 1;
  return {
    correct: true,
    done: lines.some((l) => l.length === index),
    reply: lines[0][index],
  };
}
