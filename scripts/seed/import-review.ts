// ============================================================
// Stage 3 CLI — 검수 완료 CSV import → ValidatedRecord[]
// Usage: npx tsx scripts/seed/import-review.ts --enriched <json> --reviewed <csv> [--output ./data/validated.json] [--reviewed-by admin]
// ============================================================

import { writeFileSync } from "node:fs";
import { parseArgs, requireArg } from "./parse-args";
import { importReviewed } from "./lib/review-exporter";

const USAGE = "npx tsx scripts/seed/import-review.ts --enriched <json-path> --reviewed <csv-path> [--output <path>] [--reviewed-by <name>]";

async function main() {
  const args = parseArgs();
  const enrichedPath = requireArg(args, "enriched", USAGE);
  const reviewedPath = requireArg(args, "reviewed", USAGE);
  const output = args.output ?? "./data/validated.json";

  console.log(`[import-review] enriched: ${enrichedPath}`);
  console.log(`[import-review] reviewed: ${reviewedPath}`);

  const result = importReviewed(enrichedPath, reviewedPath, {
    reviewedBy: args["reviewed-by"],
  });

  writeFileSync(output, JSON.stringify(result.records, null, 2));

  console.log(`[import-review] ${result.matched} matched, ${result.skipped} skipped → ${output}`);
  if (result.errors.length > 0) {
    console.warn(`[import-review] ${result.errors.length} errors:`);
    result.errors.forEach((e) => console.warn(`  - ${e.recordId ?? "?"}: ${e.message}`));
  }
}

main().catch((err) => { console.error("[import-review] Fatal:", err); process.exit(1); });
