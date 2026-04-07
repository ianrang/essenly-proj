// ============================================================
// Stage 2 CLI — AI 번역/분류/생성
// Usage: npx tsx scripts/seed/enrich.ts --input ./data/raw.json [--output ./data/enriched.json]
//        [--skip-translation] [--skip-classification] [--skip-generation]
//        [--entity-types product,ingredient] [--target-langs en,ja]
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs, splitArg, requireArg } from "./parse-args";
import { enrichRecords } from "./lib/enrich-service";
import type { EnrichOptions } from "./lib/enrich-service";
import type { EntityType, RawRecord } from "./lib/types";

const USAGE = "npx tsx scripts/seed/enrich.ts --input <path> [--output <path>] [--skip-translation] [--skip-classification] [--skip-generation] [--entity-types <list>] [--target-langs <list>]";

async function main() {
  const args = parseArgs();
  const input = requireArg(args, "input", USAGE);
  const output = args.output ?? "./data/enriched.json";

  const records: RawRecord[] = JSON.parse(readFileSync(input, "utf-8"));

  const options: EnrichOptions = {};
  const entityTypes = splitArg(args["entity-types"]) as EntityType[];
  if (entityTypes.length > 0) options.entityTypes = entityTypes;

  const targetLangs = splitArg(args["target-langs"]);
  if (targetLangs.length > 0) options.targetLangs = targetLangs;

  if (args["skip-translation"]) options.skipTranslation = true;
  if (args["skip-classification"]) options.skipClassification = true;
  if (args["skip-generation"]) options.skipGeneration = true;

  console.log(`[enrich] input: ${input} (${records.length} records)`);

  const { records: enriched, result } = await enrichRecords(records, options);

  writeFileSync(output, JSON.stringify(enriched, null, 2));

  console.log(`[enrich] ${result.succeeded} succeeded, ${result.failed} failed → ${output}`);
  if (result.failed > 0) {
    result.errors.forEach((e) => console.warn(`  - ${e.recordId ?? "?"}: ${e.message}`));
  }
}

main().catch((err) => { console.error("[enrich] Fatal:", err); process.exit(1); });
