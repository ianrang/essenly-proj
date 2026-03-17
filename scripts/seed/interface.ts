/**
 * DataSource Interface — 시드 데이터 파이프라인 (Q-3 반영)
 * 런타임 코드와 분리된 오프라인 도구.
 * 실행: npx tsx scripts/seed/run.ts --source=ai
 */

export interface SeedRecord {
  table: string;
  data: Record<string, unknown>;
}

export interface DataSource {
  /** Human-readable name */
  readonly name: string;

  /** Generate or load seed data */
  generate(): Promise<SeedRecord[]>;

  /** Validate generated records */
  validate(records: SeedRecord[]): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  table: string;
  field: string;
  message: string;
  record?: Record<string, unknown>;
}

/** Supported data source types */
export type DataSourceType = "ai" | "csv" | "manual";
