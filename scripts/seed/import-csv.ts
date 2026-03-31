// ============================================================
// Stage 1 CLI — CSV 임포트 (Channel B)
// Usage: npx tsx scripts/seed/import-csv.ts --file ./data/products.csv --entity-type product [--output ./data/raw-csv.json]
// ============================================================

import { writeFileSync } from "node:fs";
import { parseArgs, requireArg } from "./parse-args";
import { loadCsvAsRawRecords } from "./lib/providers/csv-loader";
import type { EntityType } from "./lib/types";

const USAGE = "npx tsx scripts/seed/import-csv.ts --file <path> --entity-type <type> [--output <path>]";

async function main() {
  const args = parseArgs();
  const file = requireArg(args, "file", USAGE);
  const entityType = requireArg(args, "entity-type", USAGE) as EntityType;
  const output = args.output ?? "./data/raw-csv.json";

  console.log(`[import-csv] file: ${file}, entityType: ${entityType}`);

  const records = loadCsvAsRawRecords(file, entityType);

  writeFileSync(output, JSON.stringify(records, null, 2));

  console.log(`[import-csv] ${records.length} records → ${output}`);
}

main().catch((err) => { console.error("[import-csv] Fatal:", err); process.exit(1); });
