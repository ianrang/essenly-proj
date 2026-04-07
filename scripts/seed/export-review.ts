// ============================================================
// Stage 3 CLI — 검수용 CSV+JSON export
// Usage: npx tsx scripts/seed/export-review.ts --input ./data/enriched.json [--output-dir ./review/] [--entity-types product]
// ============================================================

import { readFileSync } from "node:fs";
import { parseArgs, requireArg, splitArg } from "./parse-args";
import { exportForReview } from "./lib/review-exporter";
import type { ExportOptions } from "./lib/review-exporter";
import type { EntityType, EnrichedRecord } from "./lib/types";

const USAGE = "npx tsx scripts/seed/export-review.ts --input <path> [--output-dir <dir>] [--entity-types <list>]";

async function main() {
  const args = parseArgs();
  const input = requireArg(args, "input", USAGE);

  const records: EnrichedRecord[] = JSON.parse(readFileSync(input, "utf-8"));

  const options: ExportOptions = {};
  if (args["output-dir"]) options.outputDir = args["output-dir"];

  const entityTypes = splitArg(args["entity-types"]) as EntityType[];
  if (entityTypes.length > 0) options.entityTypes = entityTypes;

  console.log(`[export-review] input: ${input} (${records.length} records)`);

  const result = exportForReview(records, options);

  console.log(`[export-review] ${result.total} exported, ${result.skipped} skipped`);
  for (const file of result.files) {
    console.log(`  ${file.entityType}: ${file.count} records`);
    console.log(`    JSON: ${file.jsonPath}`);
    console.log(`    CSV:  ${file.csvPath}`);
  }

  if (result.files.length > 0) {
    console.log("\n검수 완료 후 실행:");
    for (const file of result.files) {
      console.log(`  npx tsx scripts/seed/import-review.ts --enriched ${file.jsonPath} --reviewed ${file.csvPath}`);
    }
  }
}

main().catch((err) => { console.error("[export-review] Fatal:", err); process.exit(1); });
