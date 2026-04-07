// src/shared/constants/embedding.ts
// L-13: 순수 상수만, 런타임 부작용 없음.
// L-0c: server-only/client-only 없음 (shared/).
// L-16: 외부 import 없음 (독립).

/** 임베딩 설정 상수 — embedding-strategy.md §1.1 */
export const EMBEDDING_CONFIG = {
  /** 텍스트 구성 변경 시 증가. 구 버전 임베딩 재생성 기준. */
  VERSION: 'v1',

  /** 임베딩 텍스트에 포함할 언어 (v0.2 V2-10: ja/zh 추가 검토) */
  TEXT_LANGUAGES: ['en', 'ko'] as const,

  /** 엔티티별 임베딩 텍스트 구성 필드 (schema.dbml 컬럼명 기준) */
  TEXT_FIELDS: {
    products: ['name', 'description', 'category', 'skin_types',
               'concerns', 'key_ingredients', 'tags'] as const,
    stores: ['name', 'description', 'district', 'store_type',
             'english_support', 'tourist_services', 'tags'] as const,
    clinics: ['name', 'description', 'district', 'clinic_type',
              'english_support', 'consultation_type', 'tags'] as const,
    treatments: ['name', 'description', 'category', 'target_concerns',
                 'suitable_skin_types', 'tags'] as const,
  },

  /** 태그 필터링 (MVP: null = 전체 포함. v0.2 V2-9에서 규칙 정의 후 활성화) */
  TAG_FILTER: null as null | { include: string[]; exclude: string[] },

  /** 배치 임베딩 간격 ms (rate limit 대응. Google AI Studio Free: 1,500 req/min) */
  BATCH_DELAY_MS: 1000,

  /** 임베딩 텍스트 최대 길이 (토큰 효율. gemini-embedding-001 최대 ~2,048 tokens) */
  MAX_TEXT_LENGTH: 2000,
} as const;

/** 임베딩 대상 엔티티 타입 */
export type EmbeddingEntityType = keyof typeof EMBEDDING_CONFIG.TEXT_FIELDS;
