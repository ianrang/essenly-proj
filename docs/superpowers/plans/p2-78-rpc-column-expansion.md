# P2-78: match_products/match_treatments RPC 카드 렌더링 컬럼 확장

**Goal:** 벡터 검색 RPC 함수의 RETURNS TABLE을 카드 렌더링에 필요한 전체 필드로 확장하여, SQL 폴백(`select('*')`)과 반환 필드를 동일화한다.

**Architecture:** SQL 마이그레이션 1개 파일 추가. 코드 수정 0건. core/shared/features 무수정.

---

> 버전: 1.0
> 작성일: 2026-04-06
> 선행: P2-66 (purchase_links 렌더링 ✅), P2-67 (english_label 배지 ✅)
> 정본: schema.dbml (DB 구조), search-engine.md §2.1 (RPC 설계)

## 1. 문제

벡터 검색 RPC(`match_products`, `match_treatments`)의 RETURNS TABLE이 카드 렌더링 필수 필드를 누락.

### 1.1 match_products — 누락 14개 필드

| 현재 반환 (9) | 카드 필요하나 누락 (14) |
|-------------|-------------------|
| id, name, category, skin_types, concerns, price, rating, is_highlighted, similarity | description, brand_id, subcategory, hair_types, key_ingredients, volume, purchase_links, english_label, tourist_popular, highlight_badge, review_count, review_summary, images, tags |

**영향:** 벡터 경로로 찾은 상품 카드에서 "Buy Online" 링크 없음, "English Label" 배지 없음, Kit CTA 미작동(highlight_badge 없음), 이미지/태그/설명 없음.

### 1.2 match_treatments — 누락 9개 필드

| 현재 반환 (13) | 카드 필요하나 누락 (9) |
|-------------|-------------------|
| id, name, category, suitable_skin_types, target_concerns, price_min, price_max, price_currency, duration_minutes, downtime_days, rating, is_highlighted, similarity | description, subcategory, session_count, precautions, aftercare, highlight_badge, review_count, images, tags |

## 2. 수정 범위

### 신규 파일

| 파일 | 내용 |
|------|------|
| `supabase/migrations/012_expand_rpc_columns.sql` | match_products + match_treatments CREATE OR REPLACE |

### 수정/영향 파일: 0건

- **코드 수정 0건** — repository의 `client.rpc()` 호출은 반환 데이터를 그대로 전달. RETURNS TABLE 확장은 하위 호환.
- **core/ 수정 0건** (P-2)
- **shared/ 수정 0건**
- **features/ 수정 0건** — search-handler.ts의 `...product` 스프레드가 추가 필드를 자동 포함.
- **테스트 수정 0건** — 기존 테스트는 mock RPC 결과를 사용. 실제 DB RPC 테스트는 P2-72(검색 통합 테스트) 범위.

### 제외 필드 (의도적)

| 필드 | 제외 이유 |
|------|---------|
| `embedding vector(1024)` | 4KB+ 데이터. 카드 렌더링 불필요. 전송 비용만 증가 |
| `created_at`, `updated_at` | 카드 미사용. 관리자 목록(findAll)에서만 사용 |
| `status` | RPC WHERE 절에서 이미 `status = 'active'` 필터. 반환 불필요 |

## 3. SQL 상세

### 3.1 match_products (003 대체)

기존 파라미터/WHERE/ORDER 동일. RETURNS TABLE만 확장.

```sql
CREATE OR REPLACE FUNCTION match_products(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_skin_types text[] DEFAULT NULL,
  filter_concerns text[] DEFAULT NULL,
  filter_max_price int DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  description jsonb,
  brand_id uuid,
  category text,
  subcategory text,
  skin_types text[],
  hair_types text[],
  concerns text[],
  key_ingredients jsonb,
  price int,
  volume text,
  purchase_links jsonb,
  english_label boolean,
  tourist_popular boolean,
  is_highlighted boolean,
  highlight_badge jsonb,
  rating float,
  review_count int,
  review_summary jsonb,
  images text[],
  tags text[],
  similarity float
)
```

### 3.2 match_treatments (007 대체)

기존 파라미터/WHERE/ORDER 동일. RETURNS TABLE만 확장.

```sql
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
  description jsonb,
  category text,
  subcategory text,
  target_concerns text[],
  suitable_skin_types text[],
  price_min int,
  price_max int,
  price_currency text,
  duration_minutes int,
  downtime_days int,
  session_count text,
  precautions jsonb,
  aftercare jsonb,
  is_highlighted boolean,
  highlight_badge jsonb,
  rating float,
  review_count int,
  images text[],
  tags text[],
  similarity float
)
```

## 4. 아키텍처 검증

| 규칙 | 검증 |
|------|------|
| P-2 (Core 불변) | core/ 수정 0건 ✓ |
| P-7 (단일 변경점) | SQL 마이그레이션 1파일만 수정 ✓ |
| G-6 (core 수정 금지) | 해당 없음 (SQL only) ✓ |
| G-15 (수정 전 영향 분석) | repository rpc() 호출 → 반환 데이터 패스스루 → 영향 0건 ✓ |
| Q-14 (스키마 정합성) | RETURNS TABLE 필드명/타입이 schema.dbml과 1:1 일치 ✓ |
| V-22 (스키마 정합성) | DB 컬럼 타입과 RPC RETURNS 타입 정확히 일치 ✓ |
| V-26 (API 레이어) | RPC 확장은 하위 호환. 기존 호출 코드 변경 불필요 ✓ |

## 5. 검증 체크리스트

```
□ 012 마이그레이션 파일 작성
□ match_products RETURNS TABLE: schema.dbml products 컬럼과 1:1 (embedding/created_at/updated_at/status 제외)
□ match_treatments RETURNS TABLE: schema.dbml treatments 컬럼과 1:1 (embedding/created_at/updated_at/status 제외)
□ 기존 파라미터/WHERE/ORDER 변경 없음
□ 코드 수정 0건
□ npx vitest run 전체 통과 (기존 테스트 영향 없음)
□ Supabase Dashboard SQL Editor에서 실행 (별도 수동 작업)
```
