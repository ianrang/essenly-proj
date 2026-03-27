# P2-20: search_beauty_data Tool Handler 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM tool handler `search_beauty_data` 구현. repository(SQL/벡터) + beauty(판단/랭킹) 조합. MVP 핵심 검색 파이프라인.

**Architecture:** `features/chat/tools/search-handler.ts`에 구현. R-6에 따라 repositories/ + beauty/ 직접 import 허용. domain별 분기(shopping/treatment) → 벡터/SQL 분기 → score → rank → 관련 엔티티(stores/clinics) 조합 → cards 반환. SupabaseClient는 execute context로 수신 (P-4 Composition Root).

**Tech Stack:** TypeScript, Supabase, Vercel AI SDK tool, Vitest

---

## 선행 확인 (모두 완료)

- [x] core/knowledge.ts: embedQuery (P2-7)
- [x] beauty/judgment.ts: rank (P2-12)
- [x] beauty/shopping.ts: scoreProducts (P2-13)
- [x] beauty/treatment.ts: scoreTreatments (P2-14)
- [x] beauty/derived.ts: calculatePreferredIngredients, calculateAvoidedIngredients (P2-15)
- [x] product-repository: findProductsByFilters, matchProductsByVector (P2-16)
- [x] store-repository: findStoresByFilters (P2-16a)
- [x] treatment-repository: findTreatmentsByFilters, matchTreatmentsByVector (P2-17)
- [x] clinic-repository: findClinicsByFilters (P2-17a)

## 설계 근거

| 결정 | 근거 | 원문 위치 |
|------|------|----------|
| 파일: `chat/tools/search-handler.ts` | search-engine.md §1.3 코드 배치 | search-engine.md:75 |
| R-6: repositories/ + beauty/ 직접 import | tool handler 유일한 예외 | CLAUDE.md R-6 |
| 벡터/SQL 분기 | query 존재 → 벡터, 없음/실패 → SQL. MVP 단순화: hasExactFilters 생략 (§5.2 원문은 query+필터 시 SQL 권장하나, RPC에서 필터+벡터 동시 처리 가능하므로 항상 벡터 사용이 정확도 유리. 불필요한 embedding API 호출 비용은 MVP에서 허용) | search-engine.md §5.2 |
| domain 분기: shopping/treatment | tool-spec.md §1 입력 스키마 | tool-spec.md:45 |
| 에러 처리: DB 실패→에러 반환, 임베딩 실패→SQL 폴백 | tool-spec.md §4.2 | tool-spec.md:339-345 |
| stores/clinics 연결: tool handler에서 junction 조회 | R-6 허용, L-8 repository 수정 불필요 | CLAUDE.md R-6, L-8 |
| client: execute context로 수신 | P-4 Composition Root | CLAUDE.md P-4, L-1 |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `src/server/features/chat/tools/search-handler.ts` | 신규 | search_beauty_data execute 함수 |
| `src/server/features/chat/tools/search-handler.test.ts` | 신규 | 단위 테스트 |

**수정 없는 기존 파일**: repositories/*, beauty/*, core/knowledge.ts, query-utils.ts — 모두 그대로 사용.

## 의존성 방향 검증

```
chat/tools/search-handler.ts
  ├──→ repositories/product-repository (R-6 허용)
  ├──→ repositories/treatment-repository (R-6 허용)
  ├──→ repositories/store-repository (R-6 허용)
  ├──→ repositories/clinic-repository (R-6 허용)
  ├──→ beauty/shopping (R-6 허용)
  ├──→ beauty/treatment (R-6 허용)
  ├──→ beauty/judgment (R-6 허용)
  ├──→ beauty/derived (R-6 허용)
  ├──→ core/knowledge (embedQuery — R-6에서 core/ import도 허용)
  └──→ shared/types (type import)

  ✗ chat/service.ts → (R-10: tool→service 역호출 금지)
  ✗ features/ 타 도메인 service → (R-9)
  순환 참조 없음
```

**콜 스택 (P-5 ≤ 4)**:
```
route(①) → chatService(②) → search-handler(③) → repository(④) ✓
```

## 처리 흐름 (search-engine.md §1.1, §5.2)

```
execute(args, context) {
  1. args에서 domain, query, filters, limit 추출
  2. domain 분기:
     shopping → productFilters + storeFilters 구성
     treatment → treatmentFilters + clinicFilters 구성

  3. 벡터/SQL 분기 (§5.2):
     query 있음 → embedQuery(query) → matchByVector(embedding, filters, limit)
     query 없음/임베딩 실패 → findByFilters(filters, limit)

  4. beauty 판단 (§3.1):
     shopping → DV-1/2 계산 → scoreProducts → rank
     treatment → scoreTreatments(endDate, stayDays) → rank

  5. 관련 엔티티 조회 (R-6 허용):
     shopping → product_stores junction → findStoresByFilters
     treatment → clinic_treatments junction → findClinicsByFilters

  6. cards 조합 + 반환 { cards, total }
}
```

## execute context 설계 (P-4)

```typescript
interface SearchToolContext {
  client: SupabaseClient;           // route에서 생성, chatService 경유
  profile: UserProfileVars | null;  // 개인화용 (VP-3: null 허용)
  journey: JourneyContextVars | null;
  preferences: LearnedPreference[];
}
```

chatService(P2-19)가 이 context를 구성하여 tool execute에 전달. P2-20에서는 context 인터페이스만 정의하고, 실제 주입은 P2-19에서 담당.

---

## Task 1: search-handler.ts 구현

**Files:**
- Create: `src/server/features/chat/tools/search-handler.ts`

- [ ] **Step 1: search-handler.ts 작성**

```typescript
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfileVars, JourneyContextVars, LearnedPreference } from '@/shared/types/profile';
import type { SkinConcern } from '@/shared/types/domain';
import { embedQuery } from '@/server/core/knowledge';
import { findProductsByFilters, matchProductsByVector } from '@/server/features/repositories/product-repository';
import { findTreatmentsByFilters, matchTreatmentsByVector } from '@/server/features/repositories/treatment-repository';
import { scoreProducts } from '@/server/features/beauty/shopping';
import { scoreTreatments } from '@/server/features/beauty/treatment';
import { rank } from '@/server/features/beauty/judgment';
import { calculatePreferredIngredients, calculateAvoidedIngredients } from '@/server/features/beauty/derived';

// ============================================================
// search_beauty_data Tool Handler — tool-spec.md §1
// R-6: repositories/ + beauty/ + core/ 직접 import 허용 (tool handler 유일한 예외).
// R-10: service 역호출 금지.
// search-engine.md §1.1 경로1, §5.2 벡터/SQL 분기.
// ============================================================

/** tool execute에 전달되는 context (P-4: chatService가 구성) */
export interface SearchToolContext {
  client: SupabaseClient;
  profile: UserProfileVars | null;
  journey: JourneyContextVars | null;
  preferences: LearnedPreference[];
}

/** tool-spec.md §1 입력에서 추출한 필터 */
interface SearchArgs {
  query: string;
  domain: 'shopping' | 'treatment';
  filters?: {
    skin_types?: string[];
    concerns?: SkinConcern[];
    category?: string;
    budget_max_krw?: number;
    max_downtime?: number;
    english_support?: string;
  };
  limit?: number;
}

const MAX_LIMIT = 5;

/**
 * search_beauty_data tool execute 함수.
 * tool-spec.md §1: domain별 검색 + 판단 + 관련 엔티티 조합.
 * search-engine.md §5.2: 벡터/SQL 분기.
 * tool-spec.md §4.2: 에러 처리 (DB 실패→에러 반환, 임베딩 실패→SQL 폴백).
 */
export async function executeSearchBeautyData(
  args: SearchArgs,
  context: SearchToolContext,
) {
  const { client, profile, journey, preferences } = context;
  const { domain, query, filters, limit: rawLimit } = args;
  const limit = Math.min(rawLimit ?? 3, MAX_LIMIT);

  try {
    if (domain === 'shopping') {
      return await searchShopping(client, query, filters, limit, profile, preferences);
    }
    return await searchTreatment(client, query, filters, limit, journey);
  } catch {
    // tool-spec.md §4.2: DB 에러 → 에러 결과 반환, LLM이 사과
    return { cards: [], total: 0, error: 'DB_UNAVAILABLE' };
  }
}

// --- domain: shopping ---

async function searchShopping(
  client: SupabaseClient,
  query: string,
  filters: SearchArgs['filters'],
  limit: number,
  profile: UserProfileVars | null,
  preferences: LearnedPreference[],
) {
  const productFilters = {
    skin_types: filters?.skin_types,
    concerns: filters?.concerns,
    category: filters?.category,
    budget_max: filters?.budget_max_krw,
    search: undefined as string | undefined,
  };

  // §5.2 벡터/SQL 분기
  let products = await searchWithFallback(
    query,
    (embedding) => matchProductsByVector(client, embedding, productFilters, limit),
    () => findProductsByFilters(client, productFilters, limit),
  );

  // beauty 판단: DV-1/2 → scoreProducts → rank (§3.1 3~5단계)
  const preferred = calculatePreferredIngredients(
    profile?.skin_type ?? null,
    filters?.concerns ?? [],
    preferences.filter(p => p.direction === 'like'),
  );
  const avoided = calculateAvoidedIngredients(
    profile?.skin_type ?? null,
    preferences.filter(p => p.direction === 'dislike'),
  );
  const scored = scoreProducts(products, preferred, avoided);
  const ranked = rank(scored);

  // 관련 stores 조회 (R-6: tool handler에서 junction 조회 허용)
  // tool-spec.md §4.2: 부분 JOIN 실패 → 핵심 데이터 반환, 관계 필드 빈 배열
  const productIds = ranked.map(r => r.item.id);
  const storeMap = await loadRelatedStores(client, productIds, filters?.english_support)
    .catch(() => new Map<string, unknown[]>());

  const cards = ranked.map(r => {
    const product = products.find(p => p.id === r.item.id);
    return {
      ...product,
      reasons: r.item.reasons,
      stores: storeMap.get(r.item.id) ?? [],
    };
  });

  return { cards, total: cards.length };
}

// --- domain: treatment ---

async function searchTreatment(
  client: SupabaseClient,
  query: string,
  filters: SearchArgs['filters'],
  limit: number,
  journey: JourneyContextVars | null,
) {
  const treatmentFilters = {
    skin_types: filters?.skin_types,
    concerns: filters?.concerns,
    category: filters?.category,
    budget_max: filters?.budget_max_krw,
    max_downtime: filters?.max_downtime,
  };

  // §5.2 벡터/SQL 분기
  let treatments = await searchWithFallback(
    query,
    (embedding) => matchTreatmentsByVector(client, embedding, treatmentFilters, limit),
    () => findTreatmentsByFilters(client, treatmentFilters, limit),
  );

  // beauty 판단: scoreTreatments → rank (§3.1 3~5단계)
  const scored = scoreTreatments(
    treatments,
    journey?.end_date ?? null,
    journey?.stay_days ?? null,
    new Date(),
  );
  const ranked = rank(scored);

  // 관련 clinics 조회 (R-6)
  // tool-spec.md §4.2: 부분 JOIN 실패 → 핵심 데이터 반환, 관계 필드 빈 배열
  const treatmentIds = ranked.map(r => r.item.id);
  const clinicMap = await loadRelatedClinics(client, treatmentIds, filters?.english_support)
    .catch(() => new Map<string, unknown[]>());

  const cards = ranked.map(r => {
    const treatment = treatments.find(t => t.id === r.item.id);
    return {
      ...treatment,
      reasons: r.item.reasons,
      clinics: clinicMap.get(r.item.id) ?? [],
    };
  });

  return { cards, total: cards.length };
}

// --- 공통 유틸 ---

/**
 * 벡터 검색 시도 → 실패 시 SQL 폴백.
 * tool-spec.md §4.2: embedQuery 실패 → SQL 필터 검색으로 폴백.
 */
async function searchWithFallback<T>(
  query: string,
  vectorSearch: (embedding: number[]) => Promise<T[]>,
  sqlSearch: () => Promise<T[]>,
): Promise<T[]> {
  if (!query) return sqlSearch();

  try {
    const embedding = await embedQuery(query);
    return await vectorSearch(embedding);
  } catch {
    // tool-spec.md §4.2: 임베딩 실패 → SQL 폴백
    return sqlSearch();
  }
}

/**
 * product_stores junction → 관련 stores 조회.
 * R-6 허용: tool handler에서 직접 DB 조회.
 */
async function loadRelatedStores(
  client: SupabaseClient,
  productIds: string[],
  englishSupport?: string,
): Promise<Map<string, unknown[]>> {
  if (productIds.length === 0) return new Map();

  const { data: junctions } = await client
    .from('product_stores')
    .select('product_id, store:stores(id, name, district, english_support, store_type, rating)')
    .in('product_id', productIds);

  const map = new Map<string, unknown[]>();
  for (const row of junctions ?? []) {
    const store = (row as { product_id: string; store: unknown }).store;
    const pid = (row as { product_id: string }).product_id;
    if (!store) continue;
    if (englishSupport && (store as { english_support?: string }).english_support !== englishSupport) continue;
    const list = map.get(pid) ?? [];
    list.push(store);
    map.set(pid, list);
  }
  return map;
}

/**
 * clinic_treatments junction → 관련 clinics 조회.
 * R-6 허용: tool handler에서 직접 DB 조회.
 */
async function loadRelatedClinics(
  client: SupabaseClient,
  treatmentIds: string[],
  englishSupport?: string,
): Promise<Map<string, unknown[]>> {
  if (treatmentIds.length === 0) return new Map();

  const { data: junctions } = await client
    .from('clinic_treatments')
    .select('treatment_id, clinic:clinics(id, name, district, english_support, clinic_type, rating, booking_url)')
    .in('treatment_id', treatmentIds);

  const map = new Map<string, unknown[]>();
  for (const row of junctions ?? []) {
    const clinic = (row as { treatment_id: string; clinic: unknown }).clinic;
    const tid = (row as { treatment_id: string }).treatment_id;
    if (!clinic) continue;
    if (englishSupport && (clinic as { english_support?: string }).english_support !== englishSupport) continue;
    const list = map.get(tid) ?? [];
    list.push(clinic);
    map.set(tid, list);
  }
  return map;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/features/chat/tools/search-handler.ts
git commit -m "feat(P2-20): search_beauty_data tool handler 구현

domain별 분기(shopping/treatment) + 벡터/SQL 폴백 + beauty 판단 + 관련 엔티티 조합.
R-6: repositories + beauty + core/knowledge 직접 import.
tool-spec.md §1 입력/출력, §4.2 에러 처리, search-engine.md §5.2 분기.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 테스트 작성 + 실행

**Files:**
- Create: `src/server/features/chat/tools/search-handler.test.ts`

**테스트 케이스 (10개)**:

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | shopping: SQL 검색 (query 없음) → 제품 + stores 반환 | findByFilters 호출, matchByVector 미호출 |
| 2 | shopping: 벡터 검색 (query 있음) → matchByVector 호출 | embedQuery + matchByVector 호출 |
| 3 | shopping: 임베딩 실패 → SQL 폴백 | embedQuery throw → findByFilters 폴백 |
| 4 | shopping: 빈 결과 → { cards: [], total: 0 } | |
| 5 | treatment: SQL 검색 → 시술 + clinics 반환 | |
| 6 | treatment: scoreTreatments 다운타임 제외 반영 | downtime 초과 시술 필터링 |
| 7 | DB 에러 → { cards: [], total: 0, error: 'DB_UNAVAILABLE' } | tool-spec.md §4.2 |
| 8 | limit 최대 5 제한 | limit: 10 → 5로 클램프 |
| 9 | profile null (VP-3) → 기본 점수로 동작 | |
| 10 | loadRelatedStores: english_support 필터 | 매장 필터링 |

- [ ] **Step 1: 테스트 파일 작성**
- [ ] **Step 2: 테스트 실행 → 통과 확인**
- [ ] **Step 3: 전체 테스트 실행**
- [ ] **Step 4: Commit**

---

## Task 3: 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: search-handler → repositories/* + beauty/* + core/knowledge + shared/ ONLY (R-6)
[ ] V-2  core/ 수정 없음
[ ] V-4  features 독립: service 간 직접 호출 없음. search-handler → service.ts 역호출 없음 (R-10)
[ ] V-5  콜 스택 ≤ 4: route → chatService → search-handler → repository ✓
[ ] V-8  import 방향: 단방향. 순환 없음
[ ] V-9  중복: 기존 코드와 동일 구현 없음
[ ] V-17 제거 안전성: search-handler.ts 삭제 시 core/, shared/, beauty/, repositories/ 무영향
```

### 품질

```
[ ] R-6  tool handler import 범위: repositories/ + beauty/ + shared/ (+ core/knowledge for embedQuery)
[ ] R-10 tool → service 역호출 없음
[ ] Q-3  VP-3: profile/journey null 시 기본값으로 동작
[ ] Q-7  에러 불삼킴: DB 에러 → { error: 'DB_UNAVAILABLE' }, 임베딩 에러 → SQL 폴백 (로그 필요 시 추가)
[ ] G-8  any 최소화 (junction 조회의 Supabase 추론 제한으로 일부 허용)
[ ] G-9  export: executeSearchBeautyData + SearchToolContext (2개)
[ ] G-10 MAX_LIMIT 상수
[ ] Q-14 필터 매핑: tool-spec.md §1 → repository 필터와 일치
```

---

## 기존 stale 타입 기록

`shared/types/api.ts`의 `SearchBeautyDataParams` (line 7-21)가 tool-spec.md와 불일치:
- `domain: "shopping" | "clinic"` (api.ts) vs `"shopping" | "treatment"` (tool-spec.md)
- `english_support: boolean` (api.ts) vs `z.enum([...])` (tool-spec.md)

이 타입은 현재 **어디서도 import되지 않음** (Grep 결과 1파일=자기 자신). P2-20에서는 tool-spec.md 기준으로 search-handler 내부 인터페이스를 정의하므로 api.ts 수정 불필요. api.ts 정리는 별도 태스크.
