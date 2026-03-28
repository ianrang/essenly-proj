// ============================================================
// Pipeline Environment Variables — data-pipeline.md §3
// P-9: scripts/ → shared/ 허용. server/ import 금지.
// Q-8: process.env 직접 접근은 이 파일에서만.
// P-2: core/config.ts 수정 금지 — 파이프라인 전용 독립 검증.
// ============================================================

import { z } from "zod";

const pipelineEnvSchema = z
  .object({
    // ── 파이프라인 전용 ──────────────────────────────────────────
    /** S1: 카카오 로컬 API (stores, clinics 수집) */
    KAKAO_API_KEY: z.string().min(1).optional(),
    /** S3/S4/S5: 식약처 공공데이터 API (ingredients) */
    MFDS_SERVICE_KEY: z.string().min(1).optional(),
    /** S6: EU CosIng CSV 파일 경로 */
    COSING_CSV_PATH: z.string().default("./data/cosing.csv"),
    /** DB 적재 배치 크기 (data-pipeline.md §3.4) */
    PIPELINE_BATCH_SIZE: z.coerce.number().int().min(1).default(100),

    // ── DB (loader 필요) ──────────────────────────────────────
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

    // ── AI (번역/분류 모듈 필요) ────────────────────────────────
    AI_PROVIDER: z.enum(["anthropic", "google"]),
    AI_MODEL: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    EMBEDDING_PROVIDER: z
      .enum(["google", "voyage", "openai"])
      .default("google"),

    // ── App ───────────────────────────────────────────────────
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  })
  .superRefine((data, ctx) => {
    // AI_PROVIDER별 API 키 조건부 필수 (core/config.ts 패턴 동일)
    if (data.AI_PROVIDER === "anthropic" && !data.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ANTHROPIC_API_KEY is required when AI_PROVIDER is anthropic",
        path: ["ANTHROPIC_API_KEY"],
      });
    }
    if (
      data.AI_PROVIDER === "google" &&
      !data.GOOGLE_GENERATIVE_AI_API_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "GOOGLE_GENERATIVE_AI_API_KEY is required when AI_PROVIDER is google",
        path: ["GOOGLE_GENERATIVE_AI_API_KEY"],
      });
    }
  });

/** 검증된 파이프라인 환경변수. 다른 seed/ 파일은 이 객체만 import. */
export const pipelineEnv = pipelineEnvSchema.parse(process.env);
