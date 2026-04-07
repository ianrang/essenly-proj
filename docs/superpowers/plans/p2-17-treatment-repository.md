# P2-17: Treatment 리포지토리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Treatment 엔티티의 DB 접근 계층 구현. stale RPC 수정 포함.

**Architecture:** product-repository.ts와 동일 패턴. query-utils.ts 재사용, client 파라미터 주입 (core/ import 없음). findById에서 clinic_treatments junction 테이블 경유 clinics JOIN (embedding 제외 명시 필드). stale match_treatments RPC를 004 마이그레이션 반영으로 수정.

**Tech Stack:** TypeScript, Supabase PostgREST, pgvector RPC, Vitest

---

## 선행 확인 (모두 완료)

- [x] query-utils.ts 8개 유틸 구현 (P2-16)
- [x] product-repository.ts 4개 메서드 구현 (P2-16)
- [x] beauty/treatment.ts 순수 함수 구현 (P2-14)
- [x] shared/types/domain.ts Treatment 인터페이스 정의
- [x] DB 마이그레이션 001~006 적용

## 설계 근거

| 결정 | 근거 | 원문 위치 |
|------|------|----------|
| 4개 메서드 (findByFilters, matchByVector, findById, findAll) | 전 repository 동일 계약 | search-engine.md §2.1 |
| 필터: skin_types, concerns, category, budget_max, max_downtime, search | Treatments 필터 매핑 | search-engine.md §2.3 |
| 정렬 허용: created_at, updated_at, rating, price_min, duration_minutes, downtime_days, review_count | §2.3 정본 (§6.2에 review_count 누락은 §2.3을 정본으로) | search-engine.md §2.3, §6.2 |
| findById clinics JOIN: embedding 제외 명시 필드 | clinics에 vector(1024) 존재, 카드 표시 불필요 | DB 001_initial_schema.sql:215 |
| RPC 수정: price_range→price_min/max, 필터 추가 | 004에서 price_range 삭제됨, RPC가 stale | 004_schema_v2.sql:13-17 |
| client 파라미터 주입 (core/db import 없음) | product-repository.ts 기존 패턴 | R-8, product-repository.ts:48 |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `supabase/migrations/007_fix_match_treatments.sql` | 신규 | match_treatments RPC 수정 (price_range→price_min/max, 필터 2개 추가) |
| `src/server/features/repositories/treatment-repository.ts` | skeleton→구현 | 4개 메서드 — DB CRUD만 (L-8) |
| `src/server/features/repositories/treatment-repository.test.ts` | 신규 | 단위 테스트 10개 |

## 미포함

| 항목 | 이유 | 태스크 |
|------|------|--------|
| clinic-repository.ts | 별도 도메인 | P2-17a |
| store-repository.ts | 별도 도메인 | P2-16a |
| query-utils.ts | 이미 완성, 수정 없음 | P2-16 (완료) |
| shared/types/domain.ts | Treatment 인터페이스 이미 정의, 수정 없음 | — |

## 의존성 방향 검증

```
treatment-repository.ts
  → query-utils.ts (같은 폴더)         ✓ search-engine.md §1.3 허용
  → shared/types/domain.ts (type import) ✓ R-8 허용
  ✗ core/ import 없음 (client 파라미터 주입)
  ✗ beauty/ import 없음
  ✗ features/ 타 도메인 import 없음
  순환 참조 없음
```

---

## Task 1: match_treatments RPC 수정 (migration)

**Files:**
- Create: `supabase/migrations/007_fix_match_treatments.sql`

**배경:**
- 004_schema_v2.sql에서 `treatments.price_range JSONB` → `price_min INT, price_max INT, price_currency TEXT` 분리
- 003의 `match_treatments` RPC가 여전히 `price_range jsonb` 반환 → 런타임 에러
- match_products에는 `filter_max_price`가 있으나 match_treatments에는 없음 → 비대칭
- search-engine.md §2.3: budget_max(→price_max), max_downtime(→downtime_days) 필터 필요

- [ ] **Step 1: migration 파일 작성**

```sql
-- ============================================================
-- Migration 007: match_treatments RPC 수정
-- 004_schema_v2.sql의 price_range → price_min/max 변경 반영
-- + filter_max_price, filter_max_downtime 파라미터 추가
-- ============================================================

CREATE OR REPLACE FUNCTION match_treatments(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_skin_types text[] DEFAULT NULL,
  filter_concerns text[] DEFAULT NULL,
  filter_max_price int DEFAULT NULL,
  filter_max_downtime int DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  category text,
  suitable_skin_types text[],
  target_concerns text[],
  price_min int,
  price_max int,
  price_currency text,
  duration_minutes int,
  downtime_days int,
  rating float,
  is_highlighted boolean,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.name, t.category, t.suitable_skin_types, t.target_concerns,
    t.price_min, t.price_max, t.price_currency,
    t.duration_minutes, t.downtime_days,
    t.rating, t.is_highlighted,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM treatments t
  WHERE t.embedding IS NOT NULL
    AND t.status = 'active'
    AND (filter_skin_types IS NULL OR t.suitable_skin_types && filter_skin_types)
    AND (filter_concerns IS NULL OR t.target_concerns && filter_concerns)
    AND (filter_max_price IS NULL OR t.price_max <= filter_max_price)
    AND (filter_max_downtime IS NULL OR t.downtime_days <= filter_max_downtime)
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: 003과 교차 검증**

match_products RPC 패턴과 비교:
- match_products: filter_skin_types, filter_concerns, filter_max_price ← 3개 필터
- match_treatments (수정 후): filter_skin_types, filter_concerns, filter_max_price, filter_max_downtime ← 4개 필터

차이점 (정당한 이유):
- `filter_max_downtime`: treatment 전용. 시술 다운타임 필터는 products에 없는 treatment 고유 속성 (search-engine.md §2.3)
- 반환 컬럼: price_min/max/currency (treatment은 가격 범위), products는 price (단일)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_fix_match_treatments.sql
git commit -m "fix: match_treatments RPC — price_range→price_min/max 반영 + 가격/다운타임 필터 추가

004_schema_v2에서 treatments.price_range JSONB가 price_min/max/currency로
분리되었으나 003의 RPC가 미갱신. 반환 컬럼과 필터를 현행 스키마에 맞춤.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: treatment-repository.ts — findTreatmentsByFilters

**Files:**
- Modify: `src/server/features/repositories/treatment-repository.ts`
- Create: `src/server/features/repositories/treatment-repository.test.ts`

**설계:**
- search-engine.md §2.3 Treatments 필터 매핑 그대로 구현
- product-repository.ts:47-68 패턴 복제 + 차이 반영:
  - `skin_types` → 컬럼 `suitable_skin_types` (products는 `skin_types`)
  - `concerns` → 컬럼 `target_concerns` (products는 `concerns`)
  - `budget_max` → 컬럼 `price_max` (products는 `price`)
  - `max_downtime` → 컬럼 `downtime_days` (products에 없음, treatment 전용)
  - 테이블: `treatments` (products는 `products`)

- [ ] **Step 1: TreatmentFilters 인터페이스 + 파일 헤더 작성 (테스트 먼저)**

`treatment-repository.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

function createMockClient(resolvedValue: { data: unknown; error: unknown; count?: number }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
  };
  const thenableChain = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolvedValue);
      }
      return target[prop as keyof typeof target];
    },
  });

  return {
    from: vi.fn(() => thenableChain),
    rpc: vi.fn().mockResolvedValue(resolvedValue),
  };
}

describe('treatment-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findTreatmentsByFilters', () => {
    it('필터 적용 + limit', async () => {
      const treatments = [{ id: 't1', name: { en: 'Botox' } }];
      const client = createMockClient({ data: treatments, error: null });

      const { findTreatmentsByFilters } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      const result = await findTreatmentsByFilters(
        client as never,
        { skin_types: ['dry'], category: 'injection', max_downtime: 3 },
        5,
      );

      expect(result).toEqual(treatments);
      expect(client.from).toHaveBeenCalledWith('treatments');
    });

    it('빈 필터 → status=active만', async () => {
      const client = createMockClient({ data: [], error: null });

      const { findTreatmentsByFilters } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      await findTreatmentsByFilters(client as never, {});

      expect(client.from).toHaveBeenCalledWith('treatments');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
      });

      const { findTreatmentsByFilters } = await import(
        '@/server/features/repositories/treatment-repository'
      );

      await expect(
        findTreatmentsByFilters(client as never, {}),
      ).rejects.toThrow('Treatment search failed');
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/server/features/repositories/treatment-repository.test.ts`
Expected: FAIL — `findTreatmentsByFilters` not exported

- [ ] **Step 3: findTreatmentsByFilters 구현**

`treatment-repository.ts` (skeleton 교체):

```typescript
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyArrayOverlap,
  applyExact,
  applyMax,
  applyTextSearch,
  applyLimit,
  applyPagination,
  applySort,
} from './query-utils';

// ============================================================
// Treatment 리포지토리 — search-engine.md §2.1, §2.3 Treatments
// R-8: core/db(client 파라미터) + shared/ + query-utils ONLY.
// L-8: DB CRUD만. 비즈니스 로직(다운타임 판단, 랭킹) 없음.
// G-9: export 4개 (findByFilters, matchByVector, findById, findAll).
// ============================================================

/** AI tool 검색 필터 — search-engine.md §2.3 Treatments */
interface TreatmentFilters {
  skin_types?: string[];
  concerns?: string[];
  category?: string;
  budget_max?: number;
  max_downtime?: number;
  search?: string;
}

/** 관리자 목록 필터 */
interface AdminTreatmentFilters extends TreatmentFilters {
  status?: string; // 'all' | 'active' | 'inactive'. 기본 'active'
}

/** 관리자 허용 정렬 필드 — search-engine.md §2.3 */
const ALLOWED_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'rating',
  'price_min',
  'duration_minutes',
  'downtime_days',
  'review_count',
];

/**
 * AI tool용 필터 검색.
 * search-engine.md §2.1 findByFilters: 페이지네이션 없음, 정렬 없음 (beauty.rank() 담당).
 */
export async function findTreatmentsByFilters(
  client: SupabaseClient,
  filters: TreatmentFilters,
  limit: number = 5,
) {
  let query = client.from('treatments').select('*').eq('status', 'active');

  query = applyArrayOverlap(query, 'suitable_skin_types', filters.skin_types);
  query = applyArrayOverlap(query, 'target_concerns', filters.concerns);
  query = applyExact(query, 'category', filters.category);
  query = applyMax(query, 'price_max', filters.budget_max);
  query = applyMax(query, 'downtime_days', filters.max_downtime);
  query = applyTextSearch(query, 'name', filters.search);
  query = applyLimit(query, limit);

  const { data, error } = await query;

  if (error) {
    throw new Error('Treatment search failed');
  }

  return data ?? [];
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/server/features/repositories/treatment-repository.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/features/repositories/treatment-repository.ts src/server/features/repositories/treatment-repository.test.ts
git commit -m "feat(P2-17): findTreatmentsByFilters — AI tool용 필터 검색

search-engine.md §2.3 Treatments 매핑. 6개 필터 (skin_types, concerns,
category, budget_max, max_downtime, search). query-utils 재사용.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: matchTreatmentsByVector

**Files:**
- Modify: `src/server/features/repositories/treatment-repository.ts`
- Modify: `src/server/features/repositories/treatment-repository.test.ts`

**설계:**
- product-repository.ts:74-93 패턴 + Task 1에서 수정한 RPC 시그니처 반영
- RPC 파라미터: query_embedding, match_count, filter_skin_types, filter_concerns, filter_max_price, filter_max_downtime

- [ ] **Step 1: 테스트 추가**

`treatment-repository.test.ts`에 describe 블록 추가:

```typescript
  describe('matchTreatmentsByVector', () => {
    it('rpc 호출 파라미터', async () => {
      const treatments = [{ id: 't1', similarity: 0.92 }];
      const client = createMockClient({ data: treatments, error: null });

      const { matchTreatmentsByVector } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      const result = await matchTreatmentsByVector(
        client as never,
        [0.1, 0.2, 0.3],
        { skin_types: ['oily'], budget_max: 200000, max_downtime: 3 },
        5,
      );

      expect(result).toEqual(treatments);
      expect(client.rpc).toHaveBeenCalledWith('match_treatments', {
        query_embedding: [0.1, 0.2, 0.3],
        match_count: 5,
        filter_skin_types: ['oily'],
        filter_concerns: null,
        filter_max_price: 200000,
        filter_max_downtime: 3,
      });
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'RPC error' },
      });

      const { matchTreatmentsByVector } = await import(
        '@/server/features/repositories/treatment-repository'
      );

      await expect(
        matchTreatmentsByVector(client as never, [0.1], {}, 5),
      ).rejects.toThrow('Treatment vector search failed');
    });
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/server/features/repositories/treatment-repository.test.ts`
Expected: FAIL — `matchTreatmentsByVector` not exported

- [ ] **Step 3: matchTreatmentsByVector 구현**

`treatment-repository.ts`에 추가 (findTreatmentsByFilters 아래):

```typescript
/**
 * AI tool용 벡터 검색.
 * search-engine.md §2.1 matchByVector: pgvector RPC (007_fix_match_treatments.sql).
 */
export async function matchTreatmentsByVector(
  client: SupabaseClient,
  embedding: number[],
  filters: TreatmentFilters,
  limit: number = 5,
) {
  const { data, error } = await client.rpc('match_treatments', {
    query_embedding: embedding,
    match_count: limit,
    filter_skin_types: filters.skin_types ?? null,
    filter_concerns: filters.concerns ?? null,
    filter_max_price: filters.budget_max ?? null,
    filter_max_downtime: filters.max_downtime ?? null,
  });

  if (error) {
    throw new Error('Treatment vector search failed');
  }

  return data ?? [];
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/server/features/repositories/treatment-repository.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/features/repositories/treatment-repository.ts src/server/features/repositories/treatment-repository.test.ts
git commit -m "feat(P2-17): matchTreatmentsByVector — pgvector RPC 벡터 검색

007_fix_match_treatments.sql RPC 호출. 4개 필터 (skin_types, concerns,
max_price, max_downtime) 전달.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: findTreatmentById (clinics JOIN — embedding 제외)

**Files:**
- Modify: `src/server/features/repositories/treatment-repository.ts`
- Modify: `src/server/features/repositories/treatment-repository.test.ts`

**설계:**
- search-engine.md §2.1: "treatment → clinics" JOIN
- junction 테이블: `clinic_treatments(clinic_id, treatment_id)` — 001_initial_schema.sql:257
- clinics에 `embedding vector(1024)` 존재 → `select('*')` 시 4KB+/clinic 낭비
- **명시 필드**: id, name, district, english_support, clinic_type, rating, review_count, booking_url, images, is_highlighted, highlight_badge
- `status = 'active'` 필터 없음 (findById는 관리자도 사용 — product-repository.ts:99 패턴)

**Supabase nested select 구문:**
```
*, clinics:clinic_treatments(clinic:clinics(id, name, district, english_support, clinic_type, rating, review_count, booking_url, images, is_highlighted, highlight_badge))
```

- [ ] **Step 1: 테스트 추가**

```typescript
  describe('findTreatmentById', () => {
    it('정상 → Treatment + clinics JOIN', async () => {
      const treatment = {
        id: 't1',
        name: { en: 'Botox' },
        clinics: [{ clinic: { id: 'c1', name: { en: 'Clinic A' } } }],
      };
      const client = createMockClient({ data: treatment, error: null });

      const { findTreatmentById } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      const result = await findTreatmentById(client as never, 't1');

      expect(result).toEqual(treatment);
    });

    it('미존재 → null', async () => {
      const client = createMockClient({ data: null, error: null });

      const { findTreatmentById } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      const result = await findTreatmentById(client as never, 'nonexistent');

      expect(result).toBeNull();
    });
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/server/features/repositories/treatment-repository.test.ts`
Expected: FAIL — `findTreatmentById` not exported

- [ ] **Step 3: findTreatmentById 구현**

```typescript
/** clinics JOIN 필드 — embedding(vector 4KB+) 제외, 카드 표시용 */
const CLINIC_CARD_FIELDS = [
  'id', 'name', 'district', 'english_support', 'clinic_type',
  'rating', 'review_count', 'booking_url', 'images',
  'is_highlighted', 'highlight_badge',
].join(', ');

/**
 * 카드 상세 — 단일 Treatment + clinics JOIN.
 * search-engine.md §2.1 findById: "treatment → clinics".
 * clinics embedding(vector 1024) 제외 — 카드 표시 불필요, 4KB+/clinic 절감.
 */
export async function findTreatmentById(
  client: SupabaseClient,
  id: string,
) {
  const { data, error } = await client
    .from('treatments')
    .select(`*, clinics:clinic_treatments(clinic:clinics(${CLINIC_CARD_FIELDS}))`)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('Treatment retrieval failed');
  }

  return data;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/server/features/repositories/treatment-repository.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/features/repositories/treatment-repository.ts src/server/features/repositories/treatment-repository.test.ts
git commit -m "feat(P2-17): findTreatmentById — clinics JOIN (embedding 제외)

clinic_treatments junction 경유. clinics embedding(vector 1024, 4KB+)
제외하여 카드 표시용 11개 필드만 반환.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: findAllTreatments (관리자 목록)

**Files:**
- Modify: `src/server/features/repositories/treatment-repository.ts`
- Modify: `src/server/features/repositories/treatment-repository.test.ts`

**설계:**
- product-repository.ts:120-151 패턴
- Treatments 전용 차이:
  - 필터 컬럼명: suitable_skin_types, target_concerns, price_max, downtime_days
  - max_downtime 필터 추가
  - 정렬 허용 필드: created_at, updated_at, rating, price_min, duration_minutes, downtime_days, review_count
- clinics JOIN 없음 (관리자 목록은 treatment 자체 데이터만, 상세는 별도 조회)

- [ ] **Step 1: 테스트 추가**

```typescript
  describe('findAllTreatments', () => {
    it('pagination + sort + count', async () => {
      const treatments = [{ id: 't1' }];
      const client = createMockClient({
        data: treatments,
        error: null,
        count: 15,
      });

      const { findAllTreatments } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      const result = await findAllTreatments(
        client as never,
        {},
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(result.data).toEqual(treatments);
      expect(result.total).toBe(15);
    });

    it('status=all → 필터 생략', async () => {
      const client = createMockClient({ data: [], error: null, count: 0 });

      const { findAllTreatments } = await import(
        '@/server/features/repositories/treatment-repository'
      );
      await findAllTreatments(
        client as never,
        { status: 'all' },
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(client.from).toHaveBeenCalledWith('treatments');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
        count: null,
      });

      const { findAllTreatments } = await import(
        '@/server/features/repositories/treatment-repository'
      );

      await expect(
        findAllTreatments(
          client as never,
          {},
          { page: 1, pageSize: 20 },
          { field: 'created_at', order: 'desc' },
        ),
      ).rejects.toThrow('Treatment list retrieval failed');
    });
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/server/features/repositories/treatment-repository.test.ts`
Expected: FAIL — `findAllTreatments` not exported

- [ ] **Step 3: findAllTreatments 구현**

```typescript
/**
 * 관리자 목록 — 페이지네이션 + 정렬 + 총 건수.
 * search-engine.md §2.1 findAll.
 */
export async function findAllTreatments(
  client: SupabaseClient,
  filters: AdminTreatmentFilters,
  pagination: { page: number; pageSize: number },
  sort: { field: string; order: 'asc' | 'desc' },
) {
  let query = client
    .from('treatments')
    .select('*', { count: 'exact', head: false });

  // status 필터: 'all'이면 생략, 기본 'active'
  const status = filters.status ?? 'active';
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  query = applyArrayOverlap(query, 'suitable_skin_types', filters.skin_types);
  query = applyArrayOverlap(query, 'target_concerns', filters.concerns);
  query = applyExact(query, 'category', filters.category);
  query = applyMax(query, 'price_max', filters.budget_max);
  query = applyMax(query, 'downtime_days', filters.max_downtime);
  query = applyTextSearch(query, 'name', filters.search);
  query = applySort(query, sort.field, sort.order, ALLOWED_SORT_FIELDS);
  query = applyPagination(query, pagination.page, pagination.pageSize);

  const { data, error, count } = await query;

  if (error) {
    throw new Error('Treatment list retrieval failed');
  }

  return { data: data ?? [], total: count ?? 0 };
}
```

- [ ] **Step 4: 테스트 실행 → 전체 통과 확인**

Run: `npx vitest run src/server/features/repositories/treatment-repository.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/features/repositories/treatment-repository.ts src/server/features/repositories/treatment-repository.test.ts
git commit -m "feat(P2-17): findAllTreatments — 관리자 목록 (페이지네이션+정렬)

7개 허용 정렬 필드 (search-engine.md §2.3). status 'all' 시 필터 생략.
clinics JOIN 없음 (관리자 목록은 treatment 자체 데이터만).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 전체 테스트 + 검증 체크리스트

**Files:** (수정 없음 — 검증만)

- [ ] **Step 1: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 테스트 + treatment-repository 10개 모두 PASS

- [ ] **Step 2: 아키텍처 검증**

```
[x] V-1  import: treatment-repository → query-utils(같은 폴더) + shared/(type만) ONLY
[x] V-2  core/ 수정 없음
[x] V-8  beauty/ import 없음. features/ 타 모듈 import 없음
[x] V-9  중복: findTreatmentsByFilters 등 프로젝트 전체 미존재 확인
[x] V-10 미사용 export 없음 — 4개 export, 소비자 명확 (P2-20, P2-26b, P2-46a)
[x] V-17 제거 안전성: treatment-repository.ts 삭제 시 core/, shared/, beauty/ 빌드 무영향
[x] V-18 scripts/ 영향 없음
```

- [ ] **Step 3: 품질 검증**

```
[x] L-8  repositories DB CRUD만: 비즈니스 로직(다운타임 판단, 랭킹 점수) 없음
[x] R-8  core/db + shared/ ONLY (client 파라미터 주입 → core import 불필요)
[x] Q-3  VP-3: null 필터 → WHERE 생략 (query-utils가 보장)
[x] G-8  any 없음 (query-utils의 eslint-disable 주석은 기존 패턴)
[x] G-9  treatment-repository 4개 export. Filters 인터페이스는 내부 (L-14)
[x] G-10 허용 정렬 필드: ALLOWED_SORT_FIELDS 상수
[x] Q-14 필터 매핑이 search-engine.md §2.3 + DB 스키마(001+004)와 일치
```

- [ ] **Step 4: 의존성 순환 검증**

```bash
# treatment-repository.ts에서 외부 import 확인
grep -n "from " src/server/features/repositories/treatment-repository.ts
```

Expected:
- `from '@supabase/supabase-js'` (type import)
- `from './query-utils'` (같은 폴더)
- 그 외 import 없음

---

## 설계 문서 불일치 기록

| 문서 A | 문서 B | 불일치 | 결정 |
|--------|--------|--------|------|
| search-engine.md §2.3 | search-engine.md §6.2 | §6.2 treatments 정렬에 `review_count` 누락 | §2.3을 정본으로 (엔티티별 상세 매핑). §6.2는 요약 테이블. ALLOWED_SORT_FIELDS에 review_count 포함 |

---

## export 범위 (G-9)

| export | 소비자 | 태스크 |
|--------|--------|--------|
| `findTreatmentsByFilters()` | search-handler (P2-20) | ⬜ |
| `matchTreatmentsByVector()` | search-handler (P2-20) | ⬜ |
| `findTreatmentById()` | GET /api/treatments/:id (P2-26b) | ⬜ |
| `findAllTreatments()` | GET /api/admin/treatments (P2-46a) | ⬜ |

4개 export. TreatmentFilters/AdminTreatmentFilters/ALLOWED_SORT_FIELDS/CLINIC_CARD_FIELDS는 내부 (L-14).
