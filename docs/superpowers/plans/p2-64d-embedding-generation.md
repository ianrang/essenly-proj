# P2-64d: 임베딩 생성 + 벡터 DB 적재 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4개 엔티티(products 200, stores 337, clinics 225, treatments 53)에 1024차원 벡터 임베딩을 생성하여 DB embedding 컬럼에 적재한다.

**Architecture:** embedding-strategy.md §1~§3 설계 그대로 구현. `shared/constants/embedding.ts`(설정) → `features/embedding/text-builder.ts`(순수 함수) → `features/embedding/generator.ts`(파이프라인) → `repositories/*/updateEmbedding()`(DB UPDATE). 스크립트(`scripts/generate-embeddings.ts`)가 배치 실행. core/ 수정 0건.

**Tech Stack:** Vercel AI SDK `embed()` + `core/knowledge.ts:embedDocument()` + Supabase pgvector + Google gemini-embedding-001

---

## 정본 확인 (G-16, D-11)

| 주제 | 정본 | 확인 결과 |
|------|------|----------|
| DB 컬럼 | schema.dbml v2.1 | 4개 테이블 embedding vector(1024) ✅ |
| 텍스트 필드 | embedding-strategy.md §1.1 TEXT_FIELDS | domain.ts 타입과 1:1 매칭 ✅ |
| 임베딩 함수 | core/knowledge.ts (embedDocument) | 구현 완료 ✅ (L-4 변경 없음) |
| 환경변수 | core/config.ts | EMBEDDING_PROVIDER, EMBEDDING_DIMENSION ✅ |
| RPC 함수 | 003_vector_search_functions.sql | match_products, match_treatments ✅ (stores/clinics는 v0.2 P2-64f) |

## 의존성 방향 검증 (V-1, P-1, P-9)

```
scripts/generate-embeddings.ts           (P-9: Composition Root)
  └──→ scripts/seed/config.ts            (pipelineEnv)
  └──→ scripts/seed/lib/utils/db-client.ts (createPipelineClient)
  └──→ server/core/knowledge.ts          (embedDocument — P-9 허용: scripts → core)
  └──→ shared/constants/embedding.ts     (P-9 허용: scripts → shared)
  ※ scripts/ → server/features/ import 금지 (P-9). 스크립트가 직접 조합.

server/features/embedding/generator.ts   (features/ 비즈니스 — app/ route에서 사용)
  ├──→ ./text-builder.ts                 (같은 폴더)
  ├──→ server/core/knowledge.ts          (embedDocument — core → features 역방향 없음 ✅)
  └──→ server/features/repositories/*    (updateEmbedding, findActiveEntities)

server/features/embedding/text-builder.ts (features/ 순수 함수)
  └──→ shared/constants/embedding.ts     (EMBEDDING_CONFIG)
  └──→ shared/types/domain.ts            (Product, Store, Clinic, Treatment 타입)

shared/constants/embedding.ts            (shared/ 순수 상수)
  └──→ (없음 — 독립)
```

**P-9 준수**: `scripts/ → server/core/, shared/` 만 import. `scripts/ → server/features/` 금지.
스크립트는 core/knowledge.ts(embedDocument) + shared/constants를 직접 사용하여 배치 로직을 자체 구성.
generator.ts는 app/ route handler(admin CRUD 비동기 재생성)에서 사용하며, scripts/에서는 import하지 않음.

역방향 import 없음 ✅. 순환 참조 없음 ✅. core/ → features/ import 없음 ✅.

## 규칙 준수 매트릭스

| 규칙 | 준수 방법 |
|------|----------|
| P-1 (4계층 DAG) | shared/ ← features/ ← scripts/. 역방향 없음 |
| P-2 (Core 불변) | core/ 수정 0건. embedDocument() 기존 함수 호출만 |
| P-3 (Last Leaf) | features/embedding/ 삭제해도 core, 타 features 무영향 |
| P-7 (단일 변경점) | 정책 변경 = embedding.ts 1파일 |
| P-9 (스크립트 Composition Root) | scripts/ → server/core/, shared/ 만 import. features/ import 금지 |
| P-10 (제거 안전성) | features/embedding/ 전체 삭제 후 빌드 에러 0건 |
| R-3 (core → features 금지) | core/knowledge.ts는 features/ import 없음 |
| L-0a (server-only) | 모든 server/ 파일 첫 줄 import 'server-only' |
| L-0c (shared 양쪽 사용) | embedding.ts에 server-only/client-only 없음 |
| L-7 (beauty/ 순수 함수) | text-builder.ts: DB/API 호출 없음, 입력→출력 |
| L-13 (shared/ 순수) | embedding.ts: 상수만, 런타임 부작용 없음 |
| L-16 (shared/ 단방향) | embedding.ts는 외부 import 없음 (독립) |
| G-4 (미사용 코드 금지) | text-builder: script 테스트에서 검증 + v0.2 generator에서 import. script: 직접 실행 |
| G-8 (any 금지) | 타입 명시 (Product, Store, Clinic, Treatment) |
| G-9 (export 최소화) | text-builder: 4개, generator: 2개, embedding.ts: 1개 |
| G-10 (매직 넘버 금지) | BATCH_DELAY_MS, MAX_TEXT_LENGTH 상수화 |
| Q-7 (에러 불삼킴) | 배치 실패 시 console.error 로깅 |
| Q-8 (env 검증) | scripts: pipelineEnv, server: core/config.ts 경유 |

---

## File Structure

### 신규 파일 (4개)

| 파일 | 책임 | 계층 |
|------|------|------|
| `src/shared/constants/embedding.ts` | EMBEDDING_CONFIG 상수 (TEXT_FIELDS, BATCH_DELAY 등) | shared/ |
| `src/server/features/embedding/text-builder.ts` | 엔티티 → 임베딩 텍스트 변환 순수 함수 4개 | features/ |
| `src/server/features/embedding/text-builder.test.ts` | text-builder 단위 테스트 | features/ |
| `scripts/generate-embeddings.ts` | 초기 일괄 적재 배치 스크립트 (P-9: core/ + shared/ 만 import) | scripts/ |

> **generator.ts는 MVP 범위 외**: admin CRUD 비동기 재생성용(embedding-strategy.md §3.4)이며 MVP에 admin CRUD가 없으므로 G-4(미사용 코드 금지) 준수를 위해 v0.2에서 구현. 스크립트는 core/knowledge.ts + shared/constants를 직접 사용하여 배치 로직을 자체 구성 (P-9 준수).

### 수정 파일 (1개)

| 파일 | 변경 내용 |
|------|----------|
| `src/shared/constants/index.ts` | `export * from './embedding'` 추가 (1줄) |

> **repositories 수정 불필요**: 스크립트가 Supabase client를 직접 사용하여 UPDATE (scripts/ = Composition Root, P-9). repository 메서드 추가는 admin CRUD 구현(v0.2) 시 함께 추가.

### 수정하지 않는 파일 (확인)

| 파일 | 이유 |
|------|------|
| `src/server/core/knowledge.ts` | P-2: core 불변. embedDocument() 그대로 사용 |
| `src/server/core/config.ts` | P-2: core 불변. getEmbeddingModel() 그대로 사용 |
| `src/server/features/chat/tools/search-handler.ts` | 검색 흐름 변경 없음 |
| `src/server/features/repositories/*.ts` | G-4: MVP에 호출자 없음. v0.2 admin CRUD 시 추가 |
| `supabase/migrations/*` | embedding 컬럼 이미 존재 |

---

## Task 1: shared/constants/embedding.ts — 임베딩 설정 상수

**Files:**
- Create: `src/shared/constants/embedding.ts`
- Modify: `src/shared/constants/index.ts`

- [ ] **Step 1: embedding.ts 상수 파일 생성**

```typescript
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
```

- [ ] **Step 2: index.ts에 re-export 추가**

`src/shared/constants/index.ts` 마지막 줄에 추가:
```typescript
export * from './embedding';
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: PASS (타입 에러 0건)

- [ ] **Step 4: 커밋**

```bash
git add src/shared/constants/embedding.ts src/shared/constants/index.ts
git commit -m "feat(P2-64d): shared/constants/embedding.ts 상수 추가"
```

---

## Task 2: text-builder.ts — 임베딩 텍스트 빌더 (TDD)

**Files:**
- Create: `src/server/features/embedding/text-builder.test.ts`
- Create: `src/server/features/embedding/text-builder.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
// src/server/features/embedding/text-builder.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('text-builder', () => {
  describe('buildProductEmbeddingText', () => {
    it('모든 필드 결합 — " | " 구분', async () => {
      const { buildProductEmbeddingText } = await import('./text-builder');
      const product = {
        name: { en: 'Snail Mucin', ko: '달팽이 무신' },
        description: { en: 'Hydrating essence', ko: '수분 에센스' },
        category: 'skincare',
        skin_types: ['dry', 'sensitive'],
        concerns: ['dryness', 'redness'],
        key_ingredients: ['snail mucin', 'hyaluronic acid'],
        tags: ['bestseller', 'hydrating'],
      };
      const result = buildProductEmbeddingText(product as never);
      expect(result).toContain('Snail Mucin. 달팽이 무신');
      expect(result).toContain('skincare');
      expect(result).toContain('dry, sensitive');
      expect(result).toContain('snail mucin, hyaluronic acid');
      expect(result).toContain('bestseller, hydrating');
      expect(result).toContain(' | ');
    });

    it('null 필드 건너뜀', async () => {
      const { buildProductEmbeddingText } = await import('./text-builder');
      const product = {
        name: { en: 'Test' },
        description: null,
        category: null,
        skin_types: [],
        concerns: [],
        key_ingredients: null,
        tags: [],
      };
      const result = buildProductEmbeddingText(product as never);
      expect(result).toBe('Test');
      expect(result).not.toContain(' | ');
    });

    it('MAX_TEXT_LENGTH 초과 시 잘림', async () => {
      const { buildProductEmbeddingText } = await import('./text-builder');
      const product = {
        name: { en: 'A'.repeat(2500) },
        description: null,
        category: null,
        skin_types: [],
        concerns: [],
        key_ingredients: null,
        tags: [],
      };
      const result = buildProductEmbeddingText(product as never);
      expect(result.length).toBe(2000);
    });
  });

  describe('buildStoreEmbeddingText', () => {
    it('stores 필드 결합', async () => {
      const { buildStoreEmbeddingText } = await import('./text-builder');
      const store = {
        name: { en: 'Olive Young', ko: '올리브영' },
        description: { en: 'K-beauty store' },
        district: 'Myeongdong',
        store_type: 'beauty_store',
        english_support: 'good',
        tourist_services: ['tax_refund'],
        tags: ['popular'],
      };
      const result = buildStoreEmbeddingText(store as never);
      expect(result).toContain('Olive Young. 올리브영');
      expect(result).toContain('Myeongdong');
      expect(result).toContain('beauty_store');
      expect(result).toContain('tax_refund');
    });
  });

  describe('buildClinicEmbeddingText', () => {
    it('clinics 필드 결합', async () => {
      const { buildClinicEmbeddingText } = await import('./text-builder');
      const clinic = {
        name: { en: 'Seoul Clinic', ko: '서울클리닉' },
        description: null,
        district: 'Gangnam',
        clinic_type: 'dermatology',
        english_support: 'fluent',
        consultation_type: ['in_person', 'video'],
        tags: ['foreigner_friendly'],
      };
      const result = buildClinicEmbeddingText(clinic as never);
      expect(result).toContain('Seoul Clinic. 서울클리닉');
      expect(result).toContain('Gangnam');
      expect(result).toContain('in_person, video');
    });
  });

  describe('buildTreatmentEmbeddingText', () => {
    it('treatments 필드 결합', async () => {
      const { buildTreatmentEmbeddingText } = await import('./text-builder');
      const treatment = {
        name: { en: 'Botox', ko: '보톡스' },
        description: { en: 'Wrinkle reduction' },
        category: 'injectable',
        target_concerns: ['wrinkles'],
        suitable_skin_types: ['normal', 'dry'],
        tags: ['popular'],
      };
      const result = buildTreatmentEmbeddingText(treatment as never);
      expect(result).toContain('Botox. 보톡스');
      expect(result).toContain('injectable');
      expect(result).toContain('wrinkles');
      expect(result).toContain('normal, dry');
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/server/features/embedding/text-builder.test.ts`
Expected: FAIL (모듈 미존재)

- [ ] **Step 3: text-builder.ts 구현**

```typescript
// src/server/features/embedding/text-builder.ts
import 'server-only';
import { EMBEDDING_CONFIG } from '@/shared/constants/embedding';
import type { Product, Store, Clinic, Treatment } from '@/shared/types/domain';

// ============================================================
// 임베딩 텍스트 빌더 — embedding-strategy.md §2.2
// L-7 준수: 순수 함수만 (DB/API 호출 없음).
// G-9: export 4개 (build*EmbeddingText).
// ============================================================

function getLocalizedText(field: Record<string, string> | null): string {
  if (!field) return '';
  return EMBEDDING_CONFIG.TEXT_LANGUAGES
    .map(lang => field[lang] || '')
    .filter(Boolean)
    .join('. ');
}

function getTagsText(tags: string[] | null): string {
  if (!tags?.length) return '';
  const filter = EMBEDDING_CONFIG.TAG_FILTER;
  if (!filter) return tags.join(', ');
  return tags.filter(t => !filter.exclude.includes(t)).join(', ');
}

function joinParts(parts: (string | undefined | null)[]): string {
  return parts
    .filter(Boolean)
    .join(' | ')
    .slice(0, EMBEDDING_CONFIG.MAX_TEXT_LENGTH);
}

export function buildProductEmbeddingText(product: Product): string {
  return joinParts([
    getLocalizedText(product.name),
    getLocalizedText(product.description),
    product.category,
    product.skin_types?.join(', '),
    product.concerns?.join(', '),
    Array.isArray(product.key_ingredients)
      ? product.key_ingredients.join(', ')
      : '',
    getTagsText(product.tags),
  ]);
}

export function buildStoreEmbeddingText(store: Store): string {
  return joinParts([
    getLocalizedText(store.name),
    getLocalizedText(store.description),
    store.district,
    store.store_type,
    store.english_support,
    store.tourist_services?.join(', '),
    getTagsText(store.tags),
  ]);
}

export function buildClinicEmbeddingText(clinic: Clinic): string {
  return joinParts([
    getLocalizedText(clinic.name),
    getLocalizedText(clinic.description),
    clinic.district,
    clinic.clinic_type,
    clinic.english_support,
    clinic.consultation_type?.join(', '),
    getTagsText(clinic.tags),
  ]);
}

export function buildTreatmentEmbeddingText(treatment: Treatment): string {
  return joinParts([
    getLocalizedText(treatment.name),
    getLocalizedText(treatment.description),
    treatment.category,
    treatment.target_concerns?.join(', '),
    treatment.suitable_skin_types?.join(', '),
    getTagsText(treatment.tags),
  ]);
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/server/features/embedding/text-builder.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/server/features/embedding/text-builder.ts src/server/features/embedding/text-builder.test.ts
git commit -m "feat(P2-64d): text-builder 순수 함수 4개 + 테스트"
```

---

## Task 3: scripts/generate-embeddings.ts — 배치 스크립트 (P-9 준수)

**Files:**
- Create: `scripts/generate-embeddings.ts`

> P-9: `scripts/ → server/core/, shared/` 만 허용. `scripts/ → server/features/` 금지.
> 스크립트는 Composition Root로서 core/knowledge.ts(embedDocument) + shared/constants를 직접 사용.
> text-builder의 순수 함수 로직을 스크립트 내 로컬 헬퍼로 구성 (features/ import 없이).

- [ ] **Step 1: 배치 스크립트 작성**

```typescript
// scripts/generate-embeddings.ts
// P-9: scripts/ = Composition Root. server/core/ + shared/ import만 허용.
// server/features/ import 금지 → text-builder 로직을 로컬 헬퍼로 구성.
// 실행: npx tsx scripts/generate-embeddings.ts

import { createPipelineClient } from './seed/lib/utils/db-client';
import { embedDocument } from '../src/server/core/knowledge';
import { EMBEDDING_CONFIG } from '../src/shared/constants/embedding';
import type { EmbeddingEntityType } from '../src/shared/constants/embedding';

// ============================================================
// 텍스트 빌더 — embedding-strategy.md §2.2 로직 재현.
// features/embedding/text-builder.ts와 동일 로직이지만,
// P-9 제약으로 features/ import 불가 → 스크립트 내 로컬 구현.
// text-builder.ts가 정본. 변경 시 양쪽 동기화 필요.
// ============================================================

function getLocalizedText(field: Record<string, string> | null): string {
  if (!field) return '';
  return EMBEDDING_CONFIG.TEXT_LANGUAGES
    .map(lang => field[lang] || '')
    .filter(Boolean)
    .join('. ');
}

function getTagsText(tags: string[] | null): string {
  if (!tags?.length) return '';
  const filter = EMBEDDING_CONFIG.TAG_FILTER;
  if (!filter) return tags.join(', ');
  return tags.filter(t => !filter.exclude.includes(t)).join(', ');
}

function joinParts(parts: (string | undefined | null)[]): string {
  return parts
    .filter(Boolean)
    .join(' | ')
    .slice(0, EMBEDDING_CONFIG.MAX_TEXT_LENGTH);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 스크립트 전용, DB 레코드 any 허용
type Entity = Record<string, any>;

const TEXT_BUILDERS: Record<EmbeddingEntityType, (e: Entity) => string> = {
  products: (p) => joinParts([
    getLocalizedText(p.name), getLocalizedText(p.description),
    p.category, p.skin_types?.join(', '), p.concerns?.join(', '),
    Array.isArray(p.key_ingredients) ? p.key_ingredients.join(', ') : '',
    getTagsText(p.tags),
  ]),
  stores: (s) => joinParts([
    getLocalizedText(s.name), getLocalizedText(s.description),
    s.district, s.store_type, s.english_support,
    s.tourist_services?.join(', '), getTagsText(s.tags),
  ]),
  clinics: (c) => joinParts([
    getLocalizedText(c.name), getLocalizedText(c.description),
    c.district, c.clinic_type, c.english_support,
    c.consultation_type?.join(', '), getTagsText(c.tags),
  ]),
  treatments: (t) => joinParts([
    getLocalizedText(t.name), getLocalizedText(t.description),
    t.category, t.target_concerns?.join(', '),
    t.suitable_skin_types?.join(', '), getTagsText(t.tags),
  ]),
};

// ============================================================
// 배치 처리
// ============================================================

const TABLE_NAMES: Record<EmbeddingEntityType, string> = {
  products: 'products',
  stores: 'stores',
  clinics: 'clinics',
  treatments: 'treatments',
};

const ENTITY_TYPES: EmbeddingEntityType[] = ['products', 'stores', 'clinics', 'treatments'];

async function batchGenerate(
  client: ReturnType<typeof createPipelineClient>,
  entityType: EmbeddingEntityType,
): Promise<{ success: number; failed: number }> {
  const table = TABLE_NAMES[entityType];
  const buildText = TEXT_BUILDERS[entityType];

  // active 엔티티 전체 조회
  const { data: entities, error } = await client
    .from(table)
    .select('*')
    .eq('status', 'active');

  if (error) throw new Error(`${table} fetch failed: ${error.message}`);
  if (!entities?.length) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  for (const entity of entities) {
    try {
      const text = buildText(entity);
      if (!text) { success++; continue; }

      const embedding = await embedDocument(text);

      const { error: updateError } = await client
        .from(table)
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', entity.id);

      if (updateError) throw updateError;
      success++;
    } catch (err) {
      console.error('[EMBEDDING_FAILED]', {
        entityType, entityId: entity.id,
        error: (err as Error).message,
      });
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, EMBEDDING_CONFIG.BATCH_DELAY_MS));
  }

  return { success, failed };
}

async function main() {
  const client = createPipelineClient();

  console.log('=== Embedding Generation Start ===\n');

  const results: Record<string, { success: number; failed: number }> = {};

  for (const entityType of ENTITY_TYPES) {
    console.log(`[${entityType}] Generating embeddings...`);
    const result = await batchGenerate(client, entityType);
    results[entityType] = result;
    console.log(`[${entityType}] Done: ${result.success} success, ${result.failed} failed\n`);
  }

  console.log('=== Summary ===');
  let totalSuccess = 0;
  let totalFailed = 0;
  for (const [type, result] of Object.entries(results)) {
    console.log(`  ${type}: ${result.success}/${result.success + result.failed}`);
    totalSuccess += result.success;
    totalFailed += result.failed;
  }
  console.log(`\nTotal: ${totalSuccess} success, ${totalFailed} failed`);

  if (totalFailed > 0) {
    console.error('\n⚠ Some embeddings failed. Check logs above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: P-9 의존성 검증**

Run: `grep -n "import.*from" scripts/generate-embeddings.ts`
Expected: `server/core/` 또는 `shared/` 또는 `./seed/` import만. `server/features/` import 0건.

- [ ] **Step 3: 커밋**

```bash
git add scripts/generate-embeddings.ts
git commit -m "feat(P2-64d): generate-embeddings.ts 배치 스크립트 (P-9 준수)"
```

---

## Task 4: 전체 테스트 + 타입 체크 + 제거 안전성 검증

- [ ] **Step 1: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 + 신규 테스트 모두 PASS

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: P-10 제거 안전성 검증**

features/embedding/ 폴더를 삭제해도 빌드 에러가 없는지 확인:
- text-builder.ts를 import하는 외부 파일이 없어야 함
- scripts/generate-embeddings.ts는 features/ import 없음 (P-9: 로컬 헬퍼로 구성)
- 결론: features/embedding/ 삭제 시 server/, client/, shared/에 빌드 에러 0건 ✅

Run: `grep -r "features/embedding" src/ --include="*.ts" | grep -v "features/embedding/"`
Expected: 0건 (features/embedding을 참조하는 src/ 내 외부 코드 없음)

Run: `grep -r "features/embedding" scripts/ --include="*.ts"`
Expected: 0건 (P-9: scripts → features/ import 없음)

- [ ] **Step 4: 커밋**

```bash
git commit -m "verify(P2-64d): 전체 테스트 + 타입 체크 + 제거 안전성 통과"
```

---

## Task 5: 배치 실행 — 실제 임베딩 생성

> ⚠ 이 태스크는 실제 Google API를 호출합니다. `.env`에 GOOGLE_GENERATIVE_AI_API_KEY가 필요합니다.

- [ ] **Step 1: .env 확인**

Run: `grep GOOGLE_GENERATIVE_AI_API_KEY .env`
Expected: API 키가 설정되어 있음

Run: `grep EMBEDDING_PROVIDER .env`
Expected: `google` 또는 미설정 (기본값 google)

- [ ] **Step 2: 배치 스크립트 실행**

Run: `npx tsx scripts/generate-embeddings.ts`
Expected output:
```
=== Embedding Generation Start ===

[products] Generating embeddings...
[products] Done: ~200 success, 0 failed

[stores] Generating embeddings...
[stores] Done: ~337 success, 0 failed

[clinics] Generating embeddings...
[clinics] Done: ~225 success, 0 failed

[treatments] Generating embeddings...
[treatments] Done: ~53 success, 0 failed

=== Summary ===
  products: ~200/200
  stores: ~337/337
  clinics: ~225/225
  treatments: ~53/53

Total: ~815 success, 0 failed
```

예상 소요: ~815건 × 1초 ≈ 14분

- [ ] **Step 3: DB 검증 — embedding NOT NULL 건수 확인**

Supabase SQL Editor에서 실행:
```sql
SELECT 'products' as entity, count(*) as total, count(embedding) as with_embedding FROM products WHERE status='active'
UNION ALL
SELECT 'stores', count(*), count(embedding) FROM stores WHERE status='active'
UNION ALL
SELECT 'clinics', count(*), count(embedding) FROM clinics WHERE status='active'
UNION ALL
SELECT 'treatments', count(*), count(embedding) FROM treatments WHERE status='active';
```

Expected: total = with_embedding (모든 active 엔티티에 embedding 존재)

- [ ] **Step 4: 벡터 검색 동작 확인**

Supabase SQL Editor에서 간단 검색 테스트:
```sql
-- products에서 아무 embedding을 가져와서 자기 자신 검색 (similarity ≈ 1.0 예상)
SELECT id, name->>'en', 1 - (embedding <=> (SELECT embedding FROM products WHERE embedding IS NOT NULL LIMIT 1)) as similarity
FROM products
WHERE embedding IS NOT NULL
ORDER BY embedding <=> (SELECT embedding FROM products WHERE embedding IS NOT NULL LIMIT 1)
LIMIT 3;
```

Expected: 첫 번째 결과의 similarity ≈ 1.0

---

## 검증 체크리스트 (V-*)

```
□ V-1  의존성 DAG: shared/ ← features/ ← app/. scripts/ → core/, shared/ 만 (P-9)
□ V-2  core 불변: core/ 파일 수정 0건
□ V-3  Composition Root: scripts/가 조합 (P-9). features/ import 없음
□ V-4  features 독립: embedding/ ↔ 타 features/ 직접 호출 없음
□ V-5  콜 스택 ≤ 4: script → embedDocument → embed (3단계)
□ V-6  바인딩 ≤ 4: text-builder → shared/constants (2단계)
□ V-7  text-builder 순수 함수: DB/API 호출 없음
□ V-9  중복: text-builder.ts ↔ script 로컬 헬퍼 의도적 재현 (P-9 제약). 정본 = text-builder.ts
□ V-10 미사용 코드 없음: text-builder = 테스트 검증 + v0.2 generator. script = 직접 실행
□ V-12 any: script 전용 Entity = Record<string, any> (DB 레코드, eslint-disable 명시)
□ V-16 shared/ 단방향: embedding.ts → 외부 import 없음 (독립)
□ V-17 제거 안전성: features/embedding/ 삭제 → core, 타 features, scripts 빌드 에러 0건
□ V-18 scripts/ 의존: scripts/ → server/core/, shared/ 만 (P-9 준수. features/ import 없음)
□ V-22 스키마 정합성: embedding vector(1024) 컬럼 존재 확인
□ V-23 설계 교차: embedding-strategy.md §1~§3. generator.ts(§3.3~§3.4)는 v0.2 admin CRUD와 함께 구현
```
