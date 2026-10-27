import { z } from "zod";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { puzzleSchema, openingSchema, progressSchema } from "../src/lib/schema";
mkdirSync("docs/schemas", { recursive: true });
for (const [name, schema] of Object.entries({
  puzzle: puzzleSchema,
  opening: openingSchema,
  progress: progressSchema,
})) {
  const text = JSON.stringify(z.toJSONSchema(schema), null, 2) + "\n";
  const path = `docs/schemas/${name}.schema.json`;
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== text)
      throw Error(`${path} is stale. Run npm run schemas.`);
  } else writeFileSync(path, text);
}
