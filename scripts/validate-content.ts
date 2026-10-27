import { readFileSync, readdirSync } from "node:fs";
import { Chess } from "chess.js";
import { puzzleSchema, openingSchema } from "../src/lib/schema";
import { validatePuzzle, validateTree, playUci } from "../src/lib/chess";
const ids = new Set<string>();
const positions = new Set<string>();
const puzzleIds = new Set<string>();
let count = 0;
const failures: string[] = [];
for (const kind of ["puzzles", "openings"])
  for (const name of readdirSync(`src/data/${kind}`).filter((n) =>
    n.endsWith(".json"),
  )) {
    try {
      const raw = JSON.parse(readFileSync(`src/data/${kind}/${name}`, "utf8"));
      const item =
        kind === "puzzles" ? puzzleSchema.parse(raw) : openingSchema.parse(raw);
      if (ids.has(item.id)) throw Error("Duplicate content ID");
      ids.add(item.id);
      if ("solutions" in item) {
        validatePuzzle(item);
        puzzleIds.add(item.id);
        const positionKey = item.fen.split(" ").slice(0, 4).join(" ");
        if (positions.has(positionKey))
          throw Error("Duplicate puzzle position");
        positions.add(positionKey);
        for (const line of item.solutions) {
          const g = new Chess(item.fen);
          line.forEach((m) => playUci(g, m));
          if (item.category.startsWith("Мат в") && !g.isCheckmate())
            throw Error("Expected checkmate");
        }
      } else {
        validateTree(item.root);
        const g = new Chess();
        item.practice.forEach((m) => playUci(g, m));
      }
      count++;
    } catch (e) {
      failures.push(`${kind}/${name}: ${String(e)}`);
    }
  }
try {
  const test = JSON.parse(readFileSync("src/data/diagnostic.json", "utf8"));
  if (
    test.schemaVersion !== 1 ||
    !Array.isArray(test.taskIds) ||
    !test.taskIds.length
  )
    throw Error("Invalid diagnostic manifest");
  if (new Set(test.taskIds).size !== test.taskIds.length)
    throw Error("Duplicate diagnostic ID");
  for (const id of test.taskIds)
    if (!puzzleIds.has(id)) throw Error("Unknown diagnostic task " + id);
} catch (e) {
  failures.push(String(e));
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Validated ${count} content files; stable IDs, schemas, FENs, legal solutions and variation trees.`,
);
