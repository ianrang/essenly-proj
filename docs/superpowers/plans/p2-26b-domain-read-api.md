# P2-26b: 도메인 데이터 공개 읽기 API 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4개 엔티티 × 2 (목록 + 상세) = 8개 공개 읽기 엔드포인트. 카드 상세 (search-engine.md 경로 2) + 브라우징 목록.

**Architecture:** L-1 thin route. `optionalAuthenticateUser` (이미 구현) → 인증 시 RLS client, 비인증 시 service_role client. repository `findAll*` (목록: offset→page 변환 + total) + `findById` (상세) 재사용. embedding 필드 제외 (response mapping).

**Tech Stack:** Next.js App Router, Zod, Supabase

---

## G-14 설계 교차 검증

| 확인 항목 | 원문 | 결과 |
|----------|------|------|
| 8개 엔드포인트 | api-spec.md §2.2 (line 188-297) | ✅ |
| 인증: 선택 | auth-matrix.md line 149-156 | ✅ optionalAuthenticateUser 이미 구현 (auth.ts:63) |
| embedding 미반환 | api-spec.md §2.2 line 228 | ✅ route에서 제외 |
| products/:id → brand JOIN | findProductById 이미 `select('*, brand:brands(*)')` | ✅ |
| treatments/:id → clinics JOIN | findTreatmentById 이미 `clinics:clinic_treatments(...)` | ✅ |
| stores/:id, clinics/:id → 단순 select | findStoreById/findClinicById `select('*')` | ✅ |
| RLS: domain data publicly readable | 001:375-385 `USING (true)` | ✅ |
| 목록 meta: total, limit, offset | api-spec.md §2.2 line 229 | ✅ |
| rate limit 60/분 | api-spec.md §4.1 line 478 | ✅ |
| migration 불필요 | V-23: 테이블 전부 001에 존재 | ✅ |
| core/ 수정 불필요 | optionalAuthenticateUser 이미 존재 (auth.ts:63) | ✅ |

## 파일 구조 (8 route + 4 test)

| 파일 | 엔드포인트 | repository |
|------|----------|-----------|
| `app/api/products/route.ts` | GET /api/products | findProductsByFilters |
| `app/api/products/[id]/route.ts` | GET /api/products/:id | findProductById |
| `app/api/treatments/route.ts` | GET /api/treatments | findTreatmentsByFilters |
| `app/api/treatments/[id]/route.ts` | GET /api/treatments/:id | findTreatmentById |
| `app/api/stores/route.ts` | GET /api/stores | findStoresByFilters |
| `app/api/stores/[id]/route.ts` | GET /api/stores/:id | findStoreById |
| `app/api/clinics/route.ts` | GET /api/clinics | findClinicsByFilters |
| `app/api/clinics/[id]/route.ts` | GET /api/clinics/:id | findClinicById |

**테스트**: 4개 테스트 파일 (엔티티별 1파일, 목록+상세 합침)

## 공통 패턴 (L-1 thin route)

### 목록 (GET /api/{entity})

```typescript
import 'server-only';
import { z } from 'zod';
import { optionalAuthenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
import { findAll{Entity}s } from '@/server/features/repositories/{entity}-repository';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const RATE_LIMIT_CONFIG = { limit: 60, windowMs: 60 * 1000, window: 'minute' } as const;

export async function GET(req: Request) {
  // 1. 인증 (선택 — auth-matrix.md §3.2)
  const user = await optionalAuthenticateUser(req);

  // 2. Rate limit (IP 또는 user_id)
  const identifier = user?.id ?? req.headers.get('x-forwarded-for') ?? 'unknown';
  const rateResult = checkRateLimit(identifier, 'public', RATE_LIMIT_CONFIG);
  if (!rateResult.allowed) { ... 429 }

  // 3. 쿼리 파라미터 검증 (limit, offset + 엔티티별 필터)
  // api-spec §2.2: limit/offset. stores/clinics는 'query' 파라미터 → repository 'search'로 매핑.
  const limit = Math.min(parsedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parsedOffset ?? 0;
  const page = Math.floor(offset / limit) + 1;

  // 4. client 생성
  const client = user
    ? createAuthenticatedClient(user.token)
    : createServiceClient();

  // 5. findAll* 재사용 — total + 페이지네이션 (G-2: 관리자 함수 재활용)
  const { data: rawData, total } = await findAll{Entity}s(
    client,
    { ...filters, status: 'active' },  // 공개 API는 active만
    { page, pageSize: limit },
    { field: 'created_at', order: 'desc' },
  );

  // 6. embedding 제외 + meta 반환
  const data = rawData.map(({ embedding, ...rest }: Record<string, unknown>) => rest);
  return Response.json({ data, meta: { total, limit, offset } });
}
```

### 상세 (GET /api/{entity}/:id)

```typescript
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // 동일 인증 + rate limit
  const { id } = await params;
  // id UUID 검증
  const entity = await find{Entity}ById(client, id);
  if (!entity) return 404;
  const { embedding, ...rest } = entity;
  return Response.json({ data: rest });
}
```

---

## Task 1: Products routes (목록 + 상세)

**Files:**
- Create: `src/app/api/products/route.ts`
- Create: `src/app/api/products/[id]/route.ts`
- Create: `src/app/api/products/route.test.ts`

Products 쿼리 파라미터 (api-spec §2.2):
- skin_types (comma → array), concerns (comma → array), category, budget_max, search, limit, offset

- [ ] Step 1: products/route.ts + [id]/route.ts 작성
- [ ] Step 2: 테스트 작성 (5개: 목록 정상, 상세 정상, 상세 404, embedding 미포함, rate limit)
- [ ] Step 3: 테스트 실행
- [ ] Step 4: Commit

## Task 2: Treatments routes

동일 패턴. 쿼리: skin_types, concerns, category, budget_max, max_downtime, search, limit, offset.

## Task 3: Stores routes

동일 패턴. 쿼리: district, english_support, store_type, query (→ repository search로 매핑), limit, offset.

## Task 4: Clinics routes

동일 패턴. 쿼리: district, english_support, clinic_type, query (→ repository search로 매핑), limit, offset.

## Task 5: 전체 테스트 + Commit

---

## 검증 체크리스트

```
[ ] L-0a server-only 첫줄 (8 route 전부)
[ ] L-1  thin route: 인증→검증→repository→응답
[ ] V-1  import: core/ + features/repositories/ ONLY (P-4 Composition Root)
[ ] V-9  중복: repository 재사용, 새 함수 작성 없음 (G-2)
[ ] V-22 embedding 미반환 (api-spec §2.2 line 228)
[ ] V-23 migration 불필요, optionalAuthenticateUser 이미 존재
[ ] Q-1  zod 쿼리 파라미터 검증
[ ] Q-7  에러 로깅
[ ] G-4  미사용 import 없음
[ ] G-10 상수: DEFAULT_LIMIT, MAX_LIMIT, RATE_LIMIT_CONFIG
```
