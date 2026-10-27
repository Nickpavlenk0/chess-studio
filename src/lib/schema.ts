import { z } from "zod";
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/);
const square = z.string().regex(/^[a-h][1-8]$/);
const uci = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
export const puzzleSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  version: z.number().int().positive(),
  title: z.string().min(1),
  instruction: z.string().min(1),
  fen: z.string(),
  side: z.enum(["w", "b"]),
  category: z.string().min(1),
  difficulty: z.enum(["Базовая", "Средняя", "Выше средней"]),
  solutions: z.array(z.array(uci).min(1)).min(1),
  hint: z.string(),
  explanation: z.string(),
  source: z.string(),
  verification: z.object({
    engine: z.string(),
    depth: z.number(),
    bestMoves: z.array(uci),
    score: z.string(),
  }),
});
export type Puzzle = z.infer<typeof puzzleSchema>;
export interface LineNode {
  id: string;
  move?: string;
  comment?: string;
  arrows?: [string, string][];
  highlights?: string[];
  children: LineNode[];
}
export const nodeSchema: z.ZodType<LineNode> = z.lazy(() =>
  z.object({
    id,
    move: uci.optional(),
    comment: z.string().optional(),
    arrows: z.array(z.tuple([square, square])).optional(),
    highlights: z.array(square).optional(),
    children: z.array(nodeSchema),
  }),
);
export const openingSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  version: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string(),
  side: z.enum(["w", "b"]),
  eco: z.string(),
  level: z.string(),
  history: z.string(),
  idea: z.string(),
  structure: z.string(),
  plans: z.array(z.string()),
  opponentPlans: z.array(z.string()),
  mistakes: z.array(z.string()),
  traps: z.array(z.string()),
  after: z.string(),
  root: nodeSchema,
  practice: z.array(uci).min(2),
});
export type Opening = z.infer<typeof openingSchema>;
export const attemptSchema = z
  .object({
    uci,
    san: z.string().max(20),
    fen: z.string().max(150),
    correct: z.boolean(),
    at: z.number().nonnegative(),
  })
  .strict();
export const eventSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    contentId: id,
    contentVersion: z.number().int().positive(),
    kind: z.enum(["puzzle", "opening"]),
    mode: z.enum(["diagnostic", "practice", "opening"]),
    category: z.string().min(1).max(80),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    durationMs: z.number().int().min(0).max(604800000),
    attempts: z.array(attemptSchema).max(1000),
    hints: z.number().int().min(0).max(100),
    outcome: z.enum(["solved", "revealed"]),
    firstMove: uci.nullable(),
    playedLine: z.array(uci).max(1000),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.outcome === "solved" && (!e.attempts.length || !e.playedLine.length))
      ctx.addIssue({
        code: "custom",
        message: "Solved event needs actual moves",
      });
    if (e.firstMove !== (e.attempts[0]?.uci ?? null))
      ctx.addIssue({ code: "custom", message: "First move mismatch" });
    if (Date.parse(e.completedAt) < Date.parse(e.startedAt))
      ctx.addIssue({ code: "custom", message: "Invalid chronology" });
  });
export type ProgressEvent = z.infer<typeof eventSchema>;
export const progressSchema = z.object({
  schemaVersion: z.literal(1),
  events: z.array(eventSchema),
});
