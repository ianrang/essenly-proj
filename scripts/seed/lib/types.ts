// ============================================================
// Pipeline Types — data-pipeline.md §3, P0-33 PoC 계승
// P-9: shared/types import만. server/ import 금지.
// L-14: 파이프라인 전용 타입 — shared/에 넣지 않는다.
// ============================================================

import type {
  Product,
  Store,
  Clinic,
  Treatment,
  Brand,
  Ingredient,
} from "@/shared/types";

// ── 엔티티 타입 ──────────────────────────────────────────────

/** 6개 도메인 엔티티 식별자 */
export type EntityType =
  | "product"
  | "store"
  | "clinic"
  | "treatment"
  | "brand"
  | "ingredient";

/** 도메인 엔티티 유니온 (DB 읽기 형태) */
export type DomainEntity =
  | Product
  | Store
  | Clinic
  | Treatment
  | Brand
  | Ingredient;

// ── Stage 1: Fetch ───────────────────────────────────────────

/** 프로바이더에서 가져온 원시 데이터 */
export interface RawRecord {
  source: string;
  sourceId: string;
  entityType: EntityType;
  data: Record<string, unknown>;
  fetchedAt: string;
}

// ── Stage 2: Enrich ──────────────────────────────────────────

/** AI 보강 메타데이터 */
export interface EnrichmentMetadata {
  translatedFields: string[];
  classifiedFields: string[];
  confidence: Record<string, number>;
}

/** AI 번역/분류/생성 후 레코드 */
export interface EnrichedRecord {
  source: string;
  sourceId: string;
  entityType: EntityType;
  data: Record<string, unknown>;
  enrichments: EnrichmentMetadata;
  enrichedAt: string;
}

// ── Stage 3: Review / Validate ───────────────────────────────

/** 검수 완료 레코드 */
export interface ValidatedRecord {
  entityType: EntityType;
  data: Record<string, unknown>;
  isApproved: boolean;
  reviewedBy?: string;
  reviewNotes?: string;
}

// ── Stage 4: Load ────────────────────────────────────────────

/** DB 적재 결과 (엔티티 단위) */
export interface LoadResult {
  entityType: EntityType;
  total: number;
  inserted: number;
  updated: number;
  failed: number;
  errors: PipelineError[];
}

// ── 공통 ─────────────────────────────────────────────────────

/** 파이프라인 에러 */
export interface PipelineError {
  stage: string;
  recordId?: string;
  message: string;
  details?: unknown;
}

/** 파이프라인 stage 실행 결과 */
export interface PipelineResult {
  stage: "fetch" | "enrich" | "review" | "load";
  startedAt: string;
  completedAt: string;
  total: number;
  succeeded: number;
  failed: number;
  errors: PipelineError[];
}

// ── PlaceProvider (P0-33 PoC 계승) ───────────────────────────

/** 장소 검색 옵션 */
export interface SearchOptions {
  lat?: number;
  lng?: number;
  radius?: number;
}

/** 프로바이더가 반환하는 원시 장소 데이터 */
export interface RawPlace {
  source: string;
  sourceId: string;
  name: string;
  nameEn?: string;
  category?: string;
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  website?: string;
  operatingHours?: string;
  rating?: number;
  placeUrl?: string;
  raw?: Record<string, unknown>;
}

/** 장소 데이터 프로바이더 인터페이스 (S1 카카오 등) */
export interface PlaceProvider {
  readonly name: string;
  isAvailable(): boolean;
  search(query: string, options?: SearchOptions): Promise<RawPlace[]>;
}
