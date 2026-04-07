// ============================================================
// Stage 4 CLI — DB 적재
// Usage: npx tsx scripts/seed/load.ts --input ./data/validated.json [--dry-run] [--batch-size 50] [--insert-only] [--entity-types product,brand]
// ============================================================

import { readFileSync } from "node:fs";
import { parseArgs, requireArg, splitArg } from "./parse-args";
import { createPipelineClient } from "./lib/utils/db-client";
import { loadRecords } from "./lib/loader";
import type { LoadOptions } from "./lib/loader";
import type { EntityType, ValidatedRecord } from "./lib/types";

const USAGE = "npx tsx scripts/seed/load.ts --input <path> [--dry-run] [--batch-size <n>] [--insert-only] [--entity-types <list>]";

async function main() {
  const args = parseArgs();
  const input = requireArg(args, "input", USAGE);

  const records: ValidatedRecord[] = JSON.parse(readFileSync(input, "utf-8"));

  const options: LoadOptions = {};
  if (args["dry-run"]) options.dryRun = true;
  if (args["insert-only"]) options.insertOnly = true;
  if (args["batch-size"]) {
    const n = parseInt(args["batch-size"], 10);
    if (isNaN(n) || n <= 0) {
      console.error("Error: --batch-size must be a positive integer.");
      process.exit(1);
    }
    options.batchSize = n;
  }

  const entityTypes = splitArg(args["entity-types"]) as EntityType[];
  if (entityTypes.length > 0) options.entityTypes = entityTypes;

  console.log(`[load] input: ${input} (${records.length} records)${options.dryRun ? " [DRY RUN]" : ""}`);

  const client = createPipelineClient();
  const results = await loadRecords(client, records, options);

  for (const r of results) {
    console.log(`  ${r.entityType}: ${r.inserted} inserted, ${r.updated} updated, ${r.failed} failed`);
    if (r.errors.length > 0) {
      r.errors.forEach((e) => console.warn(`    - ${e.message}`));
    }
  }

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  console.log(`\n[load] ${totalInserted} inserted, ${totalFailed} failed`);

  if (totalFailed > 0) process.exit(1);
}

main().catch((err) => { console.error("[load] Fatal:", err); process.exit(1); });
