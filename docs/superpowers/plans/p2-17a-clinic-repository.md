# P2-17a: Clinic 리포지토리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clinic 엔티티의 DB 접근 계층 구현. 3개 메서드 (matchByVector 없음).

**Architecture:** store-repository.ts와 거의 동일 패턴. 차이: `store_type` → `clinic_type`, 테이블명 `stores` → `clinics`. query-utils.ts 재사용, client 파라미터 주입 (core/ import 없음). matchByVector 없음 (match_clinics RPC 미설계). findById JOIN 없음 (search-engine.md §2.1 line 144: clinic 자체 JOIN 미정의).

**Tech Stack:** TypeScript, Supabase PostgREST, Vitest

---

## 선행 확인 (모두 완료)

- [x] query-utils.ts 8개 유틸 구현 (P2-16)
- [x] store-repository.ts 3개 메서드 구현 (P2-16a) — 동일 패턴 참조
- [x] shared/types/domain.ts Clinic 인터페이스 정의 (line 177-202)

## 설계 근거

| 결정 | 근거 | 원문 위치 |
|------|------|----------|
| 3개 메서드 (findByFilters, findById, findAll) | matchByVector 없음: match_clinics RPC 미설계 | search-engine.md §2.1 line 131 (match_products, match_treatments만) |
| 필터: district, english_support, clinic_type, search | Clinics 필터 매핑 | search-engine.md §2.3 line 265-270 |
| 정렬 허용: created_at, updated_at, rating, district | §2.3 = §6.2 일치 (4개) | search-engine.md §2.3 line 272, §6.2 line 545 |
| findById JOIN 없음 | clinic 자체 JOIN 미정의 | search-engine.md §2.1 line 144 (product→brand, treatment→clinics만) |
| client 파라미터 주입 | 기존 repository 패턴 | R-8, store-repository.ts |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `src/server/features/repositories/clinic-repository.ts` | 신규 | 3개 메서드 — DB CRUD만 (L-8) |
| `src/server/features/repositories/clinic-repository.test.ts` | 신규 | 단위 테스트 8개 |

## 미포함

| 항목 | 이유 |
|------|------|
| matchClinicsByVector | match_clinics RPC 미설계 (search-engine.md §2.1) |
| query-utils.ts 수정 | 이미 완성, 수정 없음 |

## 의존성 방향 검증

```
clinic-repository.ts
  → query-utils.ts (같은 폴더)         ✓ search-engine.md §1.3 허용
  ✗ core/ import 없음 (client 파라미터 주입)
  ✗ beauty/ import 없음
  ✗ shared/ import 없음
  ✗ features/ 타 도메인 import 없음
  순환 참조 없음
```

## Stores vs Clinics 차이점 (정확히 2곳)

| 위치 | store-repository | clinic-repository |
|------|-----------------|------------------|
| 테이블명 | `'stores'` | `'clinics'` |
| 필터 3번째 | `store_type` | `clinic_type` |

그 외 모든 구조 동일: 필터 4개(applyExact×3 + applyTextSearch×1), 정렬 4개, 에러 패턴, 반환 패턴.

---

## Task 1: clinic-repository.ts 전체 구현 + 테스트

**Files:**
- Create: `src/server/features/repositories/clinic-repository.ts`
- Create: `src/server/features/repositories/clinic-repository.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

`clinic-repository.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

function createMockClient(resolvedValue: { data: unknown; error: unknown; count?: number }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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
  };
}

describe('clinic-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findClinicsByFilters', () => {
    it('필터 적용 + limit', async () => {
      const clinics = [{ id: 'c1', name: { en: 'Seoul Derma' } }];
      const client = createMockClient({ data: clinics, error: null });

      const { findClinicsByFilters } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      const result = await findClinicsByFilters(
        client as never,
        { district: 'gangnam', clinic_type: 'dermatology' },
        5,
      );

      expect(result).toEqual(clinics);
      expect(client.from).toHaveBeenCalledWith('clinics');
    });

    it('빈 필터 → status=active만', async () => {
      const client = createMockClient({ data: [], error: null });

      const { findClinicsByFilters } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      await findClinicsByFilters(client as never, {});

      expect(client.from).toHaveBeenCalledWith('clinics');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
      });

      const { findClinicsByFilters } = await import(
        '@/server/features/repositories/clinic-repository'
      );

      await expect(
        findClinicsByFilters(client as never, {}),
      ).rejects.toThrow('Clinic search failed');
    });
  });

  describe('findClinicById', () => {
    it('정상 → Clinic', async () => {
      const clinic = { id: 'c1', name: { en: 'Seoul Derma' } };
      const client = createMockClient({ data: clinic, error: null });

      const { findClinicById } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      const result = await findClinicById(client as never, 'c1');

      expect(result).toEqual(clinic);
    });

    it('미존재 → null', async () => {
      const client = createMockClient({ data: null, error: null });

      const { findClinicById } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      const result = await findClinicById(client as never, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllClinics', () => {
    it('pagination + sort + count', async () => {
      const clinics = [{ id: 'c1' }];
      const client = createMockClient({
        data: clinics,
        error: null,
        count: 12,
      });

      const { findAllClinics } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      const result = await findAllClinics(
        client as never,
        {},
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(result.data).toEqual(clinics);
      expect(result.total).toBe(12);
    });

    it('status=all → 필터 생략', async () => {
      const client = createMockClient({ data: [], error: null, count: 0 });

      const { findAllClinics } = await import(
        '@/server/features/repositories/clinic-repository'
      );
      await findAllClinics(
        client as never,
        { status: 'all' },
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(client.from).toHaveBeenCalledWith('clinics');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
        count: null,
      });

      const { findAllClinics } = await import(
        '@/server/features/repositories/clinic-repository'
      );

      await expect(
        findAllClinics(
          client as never,
          {},
          { page: 1, pageSize: 20 },
          { field: 'created_at', order: 'desc' },
        ),
      ).rejects.toThrow('Clinic list retrieval failed');
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/server/features/repositories/clinic-repository.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: clinic-repository.ts 구현**

```typescript
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyExact,
  applyTextSearch,
  applyLimit,
  applyPagination,
  applySort,
} from './query-utils';

// ============================================================
// Clinic 리포지토리 — search-engine.md §2.1, §2.3 Clinics
// R-8: core/db(client 파라미터) + query-utils ONLY.
// L-8: DB CRUD만. 비즈니스 로직 없음.
// G-9: export 3개 (findByFilters, findById, findAll).
// matchByVector 없음: match_clinics RPC 미설계 (§2.1).
// ============================================================

/** AI tool 검색 필터 — search-engine.md §2.3 Clinics */
interface ClinicFilters {
  district?: string;
  english_support?: string;
  clinic_type?: string;
  search?: string;
}

/** 관리자 목록 필터 */
interface AdminClinicFilters extends ClinicFilters {
  status?: string; // 'all' | 'active' | 'inactive'. 기본 'active'
}

/** 관리자 허용 정렬 필드 — search-engine.md §2.3 */
const ALLOWED_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'rating',
  'district',
];

/**
 * AI tool용 필터 검색.
 * search-engine.md §2.1 findByFilters: 페이지네이션 없음, 정렬 없음 (beauty.rank() 담당).
 */
export async function findClinicsByFilters(
  client: SupabaseClient,
  filters: ClinicFilters,
  limit: number = 5,
) {
  let query = client.from('clinics').select('*').eq('status', 'active');

  query = applyExact(query, 'district', filters.district);
  query = applyExact(query, 'english_support', filters.english_support);
  query = applyExact(query, 'clinic_type', filters.clinic_type);
  query = applyTextSearch(query, 'name', filters.search);
  query = applyLimit(query, limit);

  const { data, error } = await query;

  if (error) {
    throw new Error('Clinic search failed');
  }

  return data ?? [];
}

/**
 * 카드 상세 — 단일 Clinic.
 * search-engine.md §2.1 findById. JOIN 관계 없음 (§2.1: clinic 자체 JOIN 미정의).
 */
export async function findClinicById(
  client: SupabaseClient,
  id: string,
) {
  const { data, error } = await client
    .from('clinics')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('Clinic retrieval failed');
  }

  return data;
}

/**
 * 관리자 목록 — 페이지네이션 + 정렬 + 총 건수.
 * search-engine.md §2.1 findAll.
 */
export async function findAllClinics(
  client: SupabaseClient,
  filters: AdminClinicFilters,
  pagination: { page: number; pageSize: number },
  sort: { field: string; order: 'asc' | 'desc' },
) {
  let query = client
    .from('clinics')
    .select('*', { count: 'exact', head: false });

  // status 필터: 'all'이면 생략, 기본 'active'
  const status = filters.status ?? 'active';
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  query = applyExact(query, 'district', filters.district);
  query = applyExact(query, 'english_support', filters.english_support);
  query = applyExact(query, 'clinic_type', filters.clinic_type);
  query = applyTextSearch(query, 'name', filters.search);
  query = applySort(query, sort.field, sort.order, ALLOWED_SORT_FIELDS);
  query = applyPagination(query, pagination.page, pagination.pageSize);

  const { data, error, count } = await query;

  if (error) {
    throw new Error('Clinic list retrieval failed');
  }

  return { data: data ?? [], total: count ?? 0 };
}
```

- [ ] **Step 4: 테스트 실행 → 전체 통과 확인**

Run: `npx vitest run src/server/features/repositories/clinic-repository.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 테스트 + clinic-repository 8개 모두 PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/features/repositories/clinic-repository.ts src/server/features/repositories/clinic-repository.test.ts
git commit -m "feat(P2-17a): clinic-repository — 3개 메서드 구현 + 테스트 8개

findClinicsByFilters (4필터: district, english_support, clinic_type, search),
findClinicById (단순 select, JOIN 없음), findAllClinics (4정렬필드).
matchByVector 없음 (match_clinics RPC 미설계).
search-engine.md §2.1/§2.3 Clinics 준수. store-repository 패턴 동일.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: clinic-repository → query-utils(같은 폴더) ONLY
[ ] V-2  core/ 수정 없음
[ ] V-8  beauty/ import 없음. features/ 타 모듈 import 없음
[ ] V-9  중복: findClinicsByFilters 등 프로젝트 전체 미존재
[ ] V-10 미사용 export 없음 — 3개 export
[ ] V-17 제거 안전성: clinic-repository.ts 삭제 시 빌드 무영향
```

### 품질

```
[ ] L-8  repositories DB CRUD만
[ ] R-8  core/db + shared/ ONLY (client 파라미터 주입)
[ ] Q-3  VP-3: null 필터 → WHERE 생략
[ ] G-4  미사용 import 없음 (applyArrayOverlap, applyMax 미포함)
[ ] G-8  any 없음
[ ] G-9  clinic-repository 3개 export. Filters 내부 (L-14)
[ ] G-10 ALLOWED_SORT_FIELDS 상수
[ ] Q-14 필터 매핑이 search-engine.md §2.3 + DB 스키마와 일치
```

---

## export 범위 (G-9)

| export | 소비자 | 태스크 |
|--------|--------|--------|
| `findClinicsByFilters()` | search-handler (P2-20) | ⬜ |
| `findClinicById()` | GET /api/clinics/:id (P2-26b) | ⬜ |
| `findAllClinics()` | GET /api/admin/clinics (P2-46a) | ⬜ |

3개 export. ClinicFilters/AdminClinicFilters/ALLOWED_SORT_FIELDS는 내부 (L-14).
