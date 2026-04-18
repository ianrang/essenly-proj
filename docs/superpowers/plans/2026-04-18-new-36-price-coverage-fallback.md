# NEW-36: 가격 파이프라인 커버리지 100% 자동 적재

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** products 가격 커버리지 100% 달성 (128건 NULL 해소). treatments 메타데이터 정합성 확보. 관리자 수동 입력 없이 자동 적재.

**Architecture:** scripts/(Composition Root) → shared/constants(카테고리 quantile) 단순 구조. 2단계 fallback: OY 실가격 보강(36-a) → 카테고리 기본값(36-d). 서버/클라이언트 코드 무수정.

**Tech Stack:** TypeScript, tsx (스크립트 실행), @supabase/supabase-js, playwright (headless 브라우저 — OY Global은 React SPA, JS 렌더링 필수)

**정본 Spec:** `docs/superpowers/specs/2026-04-18-new-36-price-coverage-fallback-design.md` v1.0

**Branch:** `feat/new-35-36-price-tier-fallback` (이미 시작됨)

---

## 파일 맵

### 신규 파일 (3개)

| 경로 | 책임 |
|------|------|
| `scripts/seed/lib/oy-parser.ts` | OY 상세 페이지 price 추출 순수 함수 (collect-oy-bestsellers.ts에서 분리) |
| `scripts/seed/backfill-price.ts` | 36-a + 36-d + 메타데이터 백필 실행 스크립트 |
| `scripts/seed/lib/oy-parser.test.ts` | parseUsdPrice 단위 테스트 |

### 수정 파일 (2개)

| 경로 | 변경 |
|------|------|
| `scripts/seed/collect-oy-bestsellers.ts` | parseUsdPrice → oy-parser.ts import로 전환 (중복 제거) |
| `package.json` | `backfill:price` 스크립트 추가 |

---

## Task 1: oy-parser.ts — 파서 분리 + 테스트

**TDD**: 테스트 먼저

- [ ] **Step 1: oy-parser.test.ts 작성**

```typescript
// parseUsdPrice 검증:
// - "US$28.90" → Math.round(28.90 * 1380) = 39882
// - "$12.50" → Math.round(12.50 * 1380) = 17250
// - "US$1,234.56" → Math.round(1234.56 * 1380) = 1703653
// - "" → null
// - "가격 없음" → null
// - "US$0" → null (0 이하 거부)
// - "US$-5" → null (음수 거부)
//
// fetchProductPrice 검증 (HTTP mock 사용):
// - 정상 HTML → { price, priceOriginal } 반환
// - 가격 요소 없는 HTML → null 반환
// - HTTP 에러 → null 반환
```

- [ ] **Step 2: oy-parser.ts 구현**

```typescript
// collect-oy-bestsellers.ts:91-98의 parseUsdPrice 이동
// + fetchProductPrice(browser, url): 단일 OY URL에서 price 추출
//   - Playwright Page로 JS 렌더링 후 .price-info strong 셀렉터 사용
//   - 기존 extractProductDetail() 패턴 재사용 (waitUntil: "networkidle")
// USD_TO_KRW = 1380 상수 포함
// 외부 의존: playwright (headless 브라우저)
```

- [ ] **Step 3: 테스트 통과 확인**

---

## Task 2: collect-oy-bestsellers.ts 리팩토링

- [ ] **Step 1: parseUsdPrice 로컬 정의 → oy-parser.ts import로 교체**

```typescript
// 변경 전: function parseUsdPrice(text: string): number | null { ... }
// 변경 후: import { parseUsdPrice } from './lib/oy-parser';
// USD_TO_KRW 상수도 oy-parser.ts로 이동
```

- [ ] **Step 2: 기존 테스트(loader.test.ts 등) 통과 확인**

---

## Task 3: backfill-price.ts — 메인 스크립트 구현

- [ ] **Step 1: backfill-price.test.ts 작성 (순수 로직 단위 테스트)**

```typescript
// shouldOverwrite(existingSource, newSource) 검증:
// - (null, 'real') → true
// - ('category-default', 'real') → true
// - ('real', 'category-default') → false (높은→낮은 금지)
// - ('manual', 'real') → false (manual 최우선)
// - ('real', 'real') → false (동일 소스 중복 금지)
//
// computeCategoryFallback(category, quantiles) 검증:
// - 'skincare' → { price_min: p25, price_max: p75 }
// - 존재하지 않는 카테고리 → null
```

- [ ] **Step 2: backfill-price.ts 구현 (--dry-run 플래그 포함)**

```typescript
// CLI: tsx scripts/seed/backfill-price.ts [--dry-run]
// --dry-run: DB 쓰기 없이 결과 리포트만 출력 (변경 예정 건수, 대상 ID 목록)
//
// 실행 흐름:
// 1. DB에서 price IS NULL인 products 조회 (url 포함)
// 2. 36-a: OY URL 보유 건 → fetchProductPrice() 배치 실행
//    - 10건씩 배치, CRAWL_DELAY_MS=3000
//    - 성공: price, price_source='real', price_source_url, price_updated_at 업데이트
//    - 실패: 로그 기록, 스킵
// 3. 36-d: 36-a 이후 여전히 NULL인 건 → 카테고리 p25/p75 fallback
//    - DB에서 카테고리별 quantile 실시간 산출
//    - price_min=p25, price_max=p75, range_source='category-default'
// 4. 메타데이터 백필:
//    - treatments 53건: price_source='manual', range_source='manual' WHERE price_source IS NULL
//    - products drift 2건: price_source='real' WHERE price IS NOT NULL AND price_source IS NULL
// 5. 결과 리포트 출력 (성공/실패/스킵 건수)
```

- [ ] **Step 3: package.json에 스크립트 추가**

```json
"backfill:price": "tsx scripts/seed/backfill-price.ts"
```

- [ ] **Step 4: 테스트 통과 확인**

---

## Task 4: 로컬 실행 + 검증

- [ ] **Step 1: `npm run backfill:price` 실행 (dry-run 모드 먼저)**

실행 전 확인사항:
- `.env.local`에 SUPABASE_SERVICE_ROLE_KEY 존재
- 현재 DB 상태: products price NULL 건수 확인

- [ ] **Step 2: dry-run 결과 검토 → 사용자 승인 후 실제 실행**

- [ ] **Step 3: 실행 후 검증**
```bash
# price NULL 잔여 건수 확인
# price_source 분포 확인
# treatments price_source NULL 건수 확인 (0이어야 함)
```

---

## Task 5: 전체 검증

- [ ] **Step 1: `npm run test` — 전체 단위 테스트 통과**
- [ ] **Step 2: `npm run test:integration` — 전체 통합 테스트 통과 (Q-16 drift)**
- [ ] **Step 3: `npx tsc --noEmit` — 타입 에러 0건**
- [ ] **Step 4: V-1~V-27 체크리스트 self-verify**

---

## 의존 그래프

```
Task 1 (oy-parser.ts 분리)
  ↓
Task 2 (collect-oy-bestsellers 리팩토링) ← Task 1 의존
  ↓
Task 3 (backfill-price.ts 구현) ← Task 1 의존
  ↓
Task 4 (로컬 실행) ← Task 3 의존, 사용자 승인 필요
  ↓
Task 5 (전체 검증) ← Task 4 완료 후
```

---

## 리스크

| 리스크 | 확률 | 대응 |
|--------|------|------|
| OY 페이지 구조 변경 → 파서 실패 | 낮음 (동일 파서 사용, 최근 성공) | 36-d 카테고리 fallback으로 100% 보증 |
| OY 서버 rate limit | 낮음 (3초 간격, 128건) | 배치 사이즈 축소, 간격 증가 |
| 카테고리별 quantile 편향 | 중간 | 36-a 성공률이 높으면 fallback 대상 소수 → 영향 미미 |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ISSUES (claude) | Playwright 치명적, range_source 누락 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 9 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**UNRESOLVED:** 0
**VERDICT:** ENG CLEARED — Playwright로 수정, range_source 추가, dry-run 스펙 추가 완료.
