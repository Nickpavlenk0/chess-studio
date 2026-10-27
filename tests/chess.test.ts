import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import fs from "node:fs";
import {
  playUci,
  pathTo,
  positionAt,
  validateTree,
  validatePuzzle,
  treeToPgn,
} from "../src/lib/chess";
import { puzzleSchema, openingSchema } from "../src/lib/schema";
import { checkMove } from "../src/lib/training";
const puzzleFiles = fs
  .readdirSync("src/data/puzzles")
  .map((p) =>
    puzzleSchema.parse(
      JSON.parse(fs.readFileSync("src/data/puzzles/" + p, "utf8")),
    ),
  );
const openingFiles = fs
  .readdirSync("src/data/openings")
  .map((p) =>
    openingSchema.parse(
      JSON.parse(fs.readFileSync("src/data/openings/" + p, "utf8")),
    ),
  );
describe("independently editable content", () => {
  it("contains exactly 15 different diagnostic skills and 5 opening courses", () => {
    expect(puzzleFiles).toHaveLength(15);
    expect(new Set(puzzleFiles.map((p) => p.category)).size).toBe(15);
    expect(openingFiles).toHaveLength(5);
    expect(
      new Set([...puzzleFiles, ...openingFiles].map((p) => p.id)).size,
    ).toBe(20);
  });
  for (const p of puzzleFiles)
    it(p.id + ": FEN, side and every solution are legal", () => {
      expect(() => validatePuzzle(p)).not.toThrow();
      for (const line of p.solutions) {
        let played: string[] = [];
        for (let i = 0; i < line.length; i += 2) {
          const result = checkMove(p, played, line[i]);
          expect(result.correct).toBe(true);
          expect(result.done).toBe(i === line.length - 1);
          if (result.reply) expect(result.reply).toBe(line[i + 1]);
          played = played.concat(line.slice(i, i + 2));
        }
      }
    });
  for (const o of openingFiles)
    it(o.id + ": variation tree, PGN export and practice are legal", () => {
      validateTree(o.root);
      const pgn = treeToPgn(o.root);
      const imported = new Chess();
      expect(() => imported.loadPgn(pgn)).not.toThrow();
      const practice = new Chess();
      o.practice.forEach((m) => playUci(practice, m));
      expect(practice.history().length).toBeGreaterThan(8);
    });
  it("rejects malformed or duplicated content without accepting partial moves", () => {
    expect(() => puzzleSchema.parse({ schemaVersion: 9 })).toThrow();
    const o = structuredClone(openingFiles[0].root);
    o.children[0].id = o.id;
    expect(() => validateTree(o)).toThrow("Повтор ID");
    expect(() =>
      validatePuzzle({ ...puzzleFiles[0], fen: "invalid" }),
    ).toThrow();
  });
});
describe("variation navigation", () => {
  const o = openingFiles.find((o) => o.id === "italian")!;
  const root = o.root;
  function findMovePath(target: string) {
    function search(n: typeof root): typeof root | undefined {
      if (n.move === target) return n;
      for (const c of n.children) {
        const r = search(c);
        if (r) return r;
      }
    }
    return search(root)!;
  }
  it("switches at exd5 between Na5 and Nxd5 and can return to the exact parent position", () => {
    const alt = findMovePath("f6d5");
    const path = pathTo(root, alt.id)!;
    const parent = path.at(-2)!;
    expect(parent.children.map((n) => n.move)).toEqual(["c6a5", "f6d5"]);
    const altGame = positionAt(root, alt.id);
    expect(altGame.get("d5")?.type).toBe("n");
    const main = positionAt(root, parent.children[0].id);
    expect(main.get("a5")?.type).toBe("n");
    expect(positionAt(root, parent.id).get("c6")?.type).toBe("n");
    expect(pathTo(root, "missing")).toBe(null);
  });
  it("exports both branches as valid recursive annotation variations", () => {
    const pgn = treeToPgn(root);
    expect(pgn).toContain("(5... Nxd5");
    expect(pgn).toContain("Na5");
    expect(pgn).toContain("{");
  });
});
describe("full chess rules via chess.js", () => {
  it("castles and rejects castling through check", () => {
    const g = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    playUci(g, "e1g1");
    expect(g.get("f1")?.type).toBe("r");
    const blocked = new Chess("r3kr1r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(() => playUci(blocked, "e1g1")).toThrow();
  });
  it("handles en passant", () => {
    const g = new Chess();
    ["e2e4", "a7a6", "e4e5", "d7d5", "e5d6"].forEach((m) => playUci(g, m));
    expect(g.get("d5")).toBeUndefined();
    expect(g.get("d6")?.color).toBe("w");
  });
  it("supports underpromotion and distinguishes stalemate from mate", () => {
    const g = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
    playUci(g, "a7a8n");
    expect(g.get("a8")?.type).toBe("n");
    expect(new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").isStalemate()).toBe(
      true,
    );
    expect(new Chess("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1").isCheckmate()).toBe(
      true,
    );
  });
  it("does not accept an illegal move or a legal but wrong solution", () => {
    expect(() => playUci(new Chess(), "e2e5")).toThrow();
    const p = puzzleFiles[0];
    expect(checkMove(p, [], "e3d4").correct).toBe(false);
  });
});

it("isolates a malformed material and a duplicate ID while loading valid lessons", async () => {
  const { loadContentFiles } = await import("../src/lib/content");
  const errors: string[] = [];
  const good = puzzleFiles[0];
  const result = loadContentFiles(
    {
      "good.json": good,
      "invalid.json": { schemaVersion: 9 },
      "duplicate.json": good,
    },
    (raw) => puzzleSchema.parse(raw),
    validatePuzzle,
    errors,
  );
  expect(result).toEqual([good]);
  expect(errors).toHaveLength(2);
});
