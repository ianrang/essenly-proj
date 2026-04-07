# P2-16: Product 리포지토리 구현 계획

> 상태: 최종 확정
> 선행: P2-12~15 (beauty/ 모듈 완성)
> 근거: search-engine.md §2.1~§2.4, CLAUDE.md R-8/L-8

---

## 목적

Product 엔티티의 DB 접근 계층. AI tool 검색(findByFilters/matchByVector), 카드 상세(findById), 관리자 목록(findAll)을 제공.
SQL 하드 필터(1~2단계)를 담당하며, 반환 데이터는 beauty/ 순수 함수(3~5단계)의 입력이 됨.

---

## 범위

### 포함

| 파일 | 작업 | 비고 |
|------|------|------|
| `features/repositories/query-utils.ts` | 신규 | 공통 필터/페이지네이션/정렬 유틸 (전 repository 재사용) |
| `features/repositories/product-repository.ts` | skeleton → 구현 | 4개 메서드 |
| `features/repositories/product-repository.test.ts` | 신규 | 단위 테스트 |
| `features/repositories/query-utils.test.ts` | 신규 | 유틸 테스트 |

### 미포함

| 파일 | 이유 | 태스크 |
|------|------|--------|
| `store-repository.ts` | skeleton 미존재. 신규 생성 | P2-16a |
| `treatment-repository.ts` | P2-17 |
| `clinic-repository.ts` | P2-17a |
| `knowledge-repository.ts` | P2-18 |

---

## 의존성

### 사용하는 기존 모듈 (수정 없음)

| 모듈 | 용도 | 수정 |
|------|------|------|
| `shared/types/domain.ts` | Product, Brand 타입 | 없음 |

### 의존 방향 검증

```
features/repositories/product-repository.ts
  → repositories/query-utils.ts (같은 폴더)     설계 §1.3 허용
  → shared/types/domain.ts (type import)        R-8 허용
  X core/ import 없음 (client 파라미터 주입)
  X beauty/ import 없음
  X features/ 타 모듈 import 없음

features/repositories/query-utils.ts
  X 외부 import 없음 (Supabase query builder 체이닝만)
  X shared/ import 불필요 (범용 SQL 유틸)
```

**R-8 규칙**: "repositories/*.ts import 범위: core/db/ + shared/ ONLY"
- client는 파라미터로 수신 → core/db import 불필요
- query-utils.ts는 같은 폴더 (설계 §1.3 명시)

순환 참조 없음.

---

## 설계 결정

### D-1. query-utils.ts — 공통 유틸 (search-engine.md §2.2 원문)

```typescript
// 모든 함수: value가 null/undefined이면 query 그대로 반환 (VP-3)

export function applyArrayOverlap(query, column, values)
export function applyExact(query, column, value)
export function applyMax(query, column, value)
export function applyMin(query, column, value)
export function applyTextSearch(query, column, text)
export function applyPagination(query, page, pageSize)
export function applyLimit(query, limit)
export function applySort(query, field, order, allowedFields)
```

**L-8 준수**: SQL 연산자만 래핑. 비즈니스 로직 없음.
**VP-3**: 모든 함수 null-safe.

### D-2. product-repository.ts — 4개 메서드

**findByFilters** (search-engine.md §2.1, §2.3 Products):
```typescript
export async function findProductsByFilters(
  client: SupabaseClient,
  filters: ProductFilters,
  limit: number = 5,
): Promise<Product[]>
```
- 필터: skin_types(overlap), concerns(overlap), category(exact), budget_max(max), search(text)
- 정렬 없음 (beauty.rank()가 담당)
- `status = 'active'` 기본

**matchByVector** (search-engine.md §2.1):
```typescript
export async function matchProductsByVector(
  client: SupabaseClient,
  embedding: number[],
  filters: ProductFilters,
  limit: number = 5,
): Promise<(Product & { similarity: number })[]>
```
- `client.rpc('match_products', params)` 호출
- RPC 시그니처: `match_products(query_embedding, match_count, filter_skin_types, filter_concerns, filter_max_price)`

**findById** (search-engine.md §2.1):
```typescript
export async function findProductById(
  client: SupabaseClient,
  id: string,
): Promise<Product | null>
```
- `select('*, brand:brands(*)')` — brand JOIN
- `status` 필터 없음 (관리자도 사용 가능)

**findAll** (search-engine.md §2.1):
```typescript
export async function findAllProducts(
  client: SupabaseClient,
  filters: AdminProductFilters,
  pagination: { page: number; pageSize: number },
  sort: { field: string; order: 'asc' | 'desc' },
): Promise<{ data: Product[]; total: number }>
```
- 허용 정렬 필드: `created_at`, `updated_at`, `rating`, `price`, `review_count`
- status 필터: `all`이면 생략, 기본 `active`
- count: Supabase `{ count: 'exact', head: false }`

### D-3. ProductFilters 인터페이스

```typescript
// product-repository.ts 내부 (L-14)
interface ProductFilters {
  skin_types?: string[];
  concerns?: string[];
  category?: string;
  budget_max?: number;
  search?: string;
}
```

Q-14: search-engine.md §2.3 Products 필터 매핑과 일치.
모든 필드 optional → VP-3 null-safe.

### D-4. export 범위 (G-9)

| export | 소비자 |
|--------|--------|
| `findProductsByFilters()` | search-handler (P2-20) |
| `matchProductsByVector()` | search-handler (P2-20) |
| `findProductById()` | GET /api/products/:id (P2-26b) |
| `findAllProducts()` | GET /api/admin/products (P2-46a) |

4개 export. ProductFilters/AdminProductFilters는 내부 (L-14).

query-utils.ts: 8개 export (전 repository 재사용).

### D-5. purchase_links 컬럼 미존재

DB products 테이블에 `purchase_links` 컬럼 없음. `Product` 인터페이스에는 정의되어 있으나 DB에서 반환되지 않음 → Supabase select('*')에 포함되지 않으므로 null.
repository에서 별도 처리 불필요.

---

## 테스트

### query-utils.test.ts

| 테스트 | 검증 |
|--------|------|
| applyArrayOverlap: 값 있음 → overlaps 호출 | |
| applyArrayOverlap: null → query 미변경 (VP-3) | |
| applyExact: 값 있음 → eq 호출 | |
| applyExact: undefined → query 미변경 | |
| applyMax: 값 있음 → lte 호출 | |
| applyTextSearch: 값 있음 → or ILIKE 호출 | |
| applyLimit: limit 적용 | |
| applySort: 허용 필드 → order 적용 | |
| applySort: 미허용 필드 → 기본값 사용 | |
| applyPagination: page/pageSize → range 호출 | |

### product-repository.test.ts

| 테스트 | 검증 |
|--------|------|
| findByFilters: 필터 적용 + limit | |
| findByFilters: 빈 필터 → status=active만 | |
| findByFilters: DB 에러 → throw | |
| matchByVector: rpc 호출 파라미터 | |
| findById: 정상 → Product + brand JOIN | |
| findById: 미존재 → null | |
| findAllProducts: pagination + sort + count | |
| findAllProducts: status=all → 필터 생략 | |

---

## 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: repository → query-utils(같은 폴더) + shared/types(type) ONLY
[ ] V-2  core/ 수정 없음
[ ] V-8  beauty/ import 없음. features/ 타 모듈 import 없음
[ ] V-9  중복: findByFilters 등 프로젝트 전체 미존재
[ ] V-10 미사용 export 없음
[ ] V-17 제거 안전성: core/, shared/, beauty/ 빌드 무영향
```

### 품질

```
[ ] L-8  repositories DB CRUD만: 비즈니스 로직(필터링 점수, 정렬 로직) 없음
[ ] R-8  core/db + shared/ ONLY (client 파라미터 주입 → core import 불필요)
[ ] Q-3  VP-3: null 필터 → WHERE 생략
[ ] G-8  any 없음
[ ] G-9  product-repository 4개 export, query-utils 8개 export
[ ] G-10 허용 정렬 필드: ALLOWED_SORT_FIELDS 상수
```

### 테스트

```
[ ] query-utils.test.ts 10개
[ ] product-repository.test.ts 8개
[ ] npx vitest run 전체 통과
```
