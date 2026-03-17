/**
 * Seed Data Runner
 * Usage: npx tsx scripts/seed/run.ts --source=ai|csv|manual
 */

import type { DataSource, DataSourceType } from "./interface";

async function loadSource(type: DataSourceType): Promise<DataSource> {
  switch (type) {
    case "ai":
      // TODO: Implement in Phase 3B
      throw new Error("AIGeneratedSource not yet implemented");
    case "csv":
      throw new Error("ManualCSVSource not yet implemented");
    case "manual":
      throw new Error("ManualSource not yet implemented");
    default:
      throw new Error(`Unknown source type: ${type}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = args.find((a) => a.startsWith("--source="));
  const sourceType = (sourceArg?.split("=")[1] ?? "ai") as DataSourceType;

  console.log(`🌱 Running seed with source: ${sourceType}`);

  const source = await loadSource(sourceType);
  const records = await source.generate();
  const validation = source.validate(records);

  if (!validation.valid) {
    console.error("❌ Validation failed:");
    validation.errors.forEach((e) =>
      console.error(`  ${e.table}.${e.field}: ${e.message}`),
    );
    process.exit(1);
  }

  if (validation.warnings.length > 0) {
    console.warn("⚠️ Warnings:");
    validation.warnings.forEach((w) => console.warn(`  ${w}`));
  }

  console.log(`✅ Generated ${records.length} records`);
  // TODO: Insert into Supabase
}

main().catch(console.error);
