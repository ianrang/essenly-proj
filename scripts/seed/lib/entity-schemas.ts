// ============================================================
// 엔티티별 zod 스키마 매핑 — validate.ts + run-all.ts 공유 (G-2)
// P-9: scripts/ → @/shared/validation import 허용.
// ============================================================

import { z } from "zod";

import {
  productCreateSchema,
  storeCreateSchema,
  clinicCreateSchema,
  treatmentCreateSchema,
  brandCreateSchema,
  ingredientCreateSchema,
  doctorCreateSchema,
} from "@/shared/validation";

import type { EntityType } from "./types";

/** 엔티티별 zod 검증 스키마 (loader.ts ENTITY_CONFIG과 동일 기준) */
export const ENTITY_SCHEMAS: Record<EntityType, z.ZodSchema> = {
  product: productCreateSchema,
  store: storeCreateSchema,
  clinic: clinicCreateSchema,
  treatment: treatmentCreateSchema,
  brand: brandCreateSchema,
  ingredient: ingredientCreateSchema,
  doctor: doctorCreateSchema,
};
