// ============================================================
// Stage 4 CLI — DB 없이 zod 검증 (독립)
// Usage: npx tsx scripts/seed/validate.ts --input ./data/validated.json [--entity-types product,brand]
// ============================================================

import { readFileSync } from "node:fs";
import { parseArgs, requireArg, splitArg } from "./parse-args";
import { ENTITY_SCHEMAS } from "./lib/entity-schemas";
import type { EntityType, ValidatedRecord } from "./lib/types";

const USAGE = "npx tsx scripts/seed/validate.ts --input <path> [--entity-types <list>]";

async function main() {
  const args = parseArgs();
  const input = requireArg(args, "input", USAGE);

  const filterTypes = splitArg(args["entity-types"]) as EntityType[];

  const records: ValidatedRecord[] = JSON.parse(readFileSync(input, "utf-8"));

  console.log(`[validate] input: ${input} (${records.length} records)`);

  let passed = 0;
  let failed = 0;

  for (const record of records) {
    if (filterTypes.length > 0 && !filterTypes.includes(record.entityType)) continue;

    const schema = ENTITY_SCHEMAS[record.entityType];
    if (!schema) {
      console.error(`  [FAIL] Unknown entityType: ${record.entityType}`);
      failed++;
      continue;
    }

    const result = schema.safeParse(record.data);
    if (result.success) {
      passed++;
    } else {
      failed++;
      const id = (record.data as Record<string, unknown>).id ?? "?";
      const issues = result.error.issues.map((i) => i.message).join("; ");
      console.error(`  [FAIL] ${record.entityType} ${id}: ${issues}`);
    }
  }

  console.log(`\n[validate] ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error("[validate] Fatal:", err); process.exit(1); });
