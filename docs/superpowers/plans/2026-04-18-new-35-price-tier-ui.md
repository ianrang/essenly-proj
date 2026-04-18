# NEW-35: 도메인별 가격 티어 시스템

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** products/treatments 카드에 상대적 가격 포지션($/$$/$$$)과 축약 금액을 표시. 외국인 여행객의 가격 직관성 개선. 단일 변경점(shared/constants/price-tier.ts) 강제.

**Architecture:** shared/constants(config) → beauty/derived(순수 함수) → client/ui(프리미티브) → client/features/cards(소비). 4계층 DAG 준수.

**Tech Stack:** TypeScript, React 19, Tailwind CSS 4, Vitest, @testing-library/react

**정본 Spec:** `docs/superpowers/specs/2026-04-18-new-35-price-tier-ui-design.md` v1.0

**Branch:** `feat/new-35-36-price-tier-fallback` (이미 시작됨)

---

## 파일 맵

### 신규 파일 (4개)

| 경로 | 책임 |
|------|------|
| `src/shared/constants/price-tier.ts` | 도메인별 임계값·중앙값·라벨 단일 config (P-7, S-5, G-10) |
| `src/shared/utils/format-price-short.ts` | ₩→축약 순수 함수 (₩40k, ₩1.5M) |
| `src/client/ui/primitives/price-tier-badge.tsx` | 티어 배지 + 축약 금액 + ⓘ 툴팁 프리미티브 (L-17~L-19) |
| `src/shared/constants/price-tier.test.ts` | config 구조 검증 |

### 수정 파일 (5개)

| 경로 | 변경 |
|------|------|
| `src/shared/utils/compute-tier.ts` | `computeTier()` 순수 함수 — thresholds를 파라미터로 주입 (§2.4 준수) |
| `src/client/features/cards/ProductCard.tsx` | formatPrice → PriceTierBadge 교체 |
| `src/client/features/cards/TreatmentCard.tsx` | formatPriceRange → PriceTierBadge 교체 |
| `src/shared/constants/index.ts` | price-tier re-export 추가 |
| ~~`src/shared/utils/index.ts`~~ | ~~제거: barrel export 없음. 직접 경로 import (G-5 기존 패턴)~~ |

---

## Task 1: shared/constants/price-tier.ts — 단일 config

**TDD**: 테스트 먼저 작성 → 실패 확인 → 구현

- [ ] **Step 1: price-tier.test.ts 작성**

```typescript
// 검증 항목:
// - PRICE_TIER_CONFIG에 'product', 'treatment' 도메인 존재
// - 각 도메인에 thresholds(3구간), medians, labels 존재
// - products: $ <25000, $$ 25000-50000, $$$ >50000
// - treatments: $ <50000, $$ 50000-200000, $$$ >200000
// - 타입 안전: TierLevel = '$' | '$$' | '$$$'
```

- [ ] **Step 2: price-tier.ts 구현**

```typescript
// PRICE_TIER_CONFIG: Record<PriceDomain, DomainTierConfig>
// DomainTierConfig: { thresholds, labels, tooltipRange }
// PriceDomain: 'product' | 'treatment'
// TierLevel: '$' | '$$' | '$$$'
// NOTE: medians 필드 제거 (Eng Review G-4 — 미사용 코드 금지)
```

- [ ] **Step 3: shared/constants/index.ts에 re-export 추가**

- [ ] **Step 4: 테스트 통과 확인** — `npx vitest run src/shared/constants/price-tier.test.ts`

---

## Task 2: shared/utils/format-price-short.ts — 축약 함수

**TDD**: 테스트 먼저

- [ ] **Step 1: format-price-short.test.ts 작성**

```typescript
// 검증 항목:
// - 39841 → "₩40k" (천 단위 반올림)
// - 200000 → "₩200k"
// - 1500000 → "₩1.5M" (백만 단위)
// - 0 → "₩0"
// - null → null 반환
// - 음수 → null 반환
```

- [ ] **Step 2: format-price-short.ts 구현**

```typescript
export function formatPriceShort(price: number | null): string | null
```

- [ ] **Step 3: 테스트 통과 확인**

---

## Task 3: shared/utils/compute-tier.ts — computeTier 순수 함수

> **Eng Review 결정**: beauty/derived.ts(server-only) → shared/utils/로 이동.
> thresholds를 파라미터로 주입하여 §2.4 utils/→constants/ 금지 준수.

**TDD**: 테스트 먼저

- [ ] **Step 1: shared/utils/compute-tier.test.ts 작성**

```typescript
// 검증 매트릭스 (thresholds를 파라미터로 전달):
// - thresholds={low:25000,high:50000}, price=20000 → '$'
// - thresholds={low:25000,high:50000}, price=35000 → '$$'
// - thresholds={low:25000,high:50000}, price=60000 → '$$$'
// - thresholds={low:50000,high:200000}, price=40000 → '$'
// - thresholds={low:50000,high:200000}, price=100000 → '$$'
// - thresholds={low:50000,high:200000}, price=300000 → '$$$'
// - 경계값: price=25000 → '$$' (이상)
// - 경계값: price=50000 → '$$' (이하)
// - 경계값: price=50001 → '$$$'
// - range fallback: price=null, min=20000, max=60000 → '$' (price_min=20000 사용, 중앙값 아님)
// - 완전 null: price=null, min=null, max=null → null
// - price 우선: price=20000, min=40000, max=60000 → '$' (price 우선)
// - 엣지: price=0 → '$' (0은 유효한 최저가)
// - 엣지: price 음수 → null (방어)
```

- [ ] **Step 2: compute-tier.ts 구현**

```typescript
// shared/utils/compute-tier.ts — constants/ import 없음 (§2.4 준수)
export type TierLevel = '$' | '$$' | '$$$';

export function computeTier(
  thresholds: { low: number; high: number },
  price: number | null,
  rangeMin?: number | null,  // price=null 시 fallback으로 사용 (price_min)
): TierLevel | null
```

L-13: 순수 유틸 함수. 부작용 없음.

- [ ] **Step 3: 테스트 통과 확인**

---

## Task 4: client/ui/primitives/price-tier-badge.tsx — UI 프리미티브

> **Design Review 결정사항 (2026-04-18)**:
> - **인라인 텍스트** 스타일 (배지/필 형태 아님). 기존 가격 표시와 동일한 시각적 무게
> - **ⓘ 아이콘**: default variant에만 표시, compact에서는 숨김 (터치 타겟 44px 확보 불가)
> - **색상**: 전 티어($, $$, $$$) 동일 text-primary. 티어별 색상 분리 없음
> - **"Price varies" 폴백**: 티어(`$$ ·`) = text-primary font-bold, `Price varies` = text-muted-foreground font-normal
> - **ⓘ 터치 타겟**: min-w-[44px] min-h-[44px] 패딩으로 확보
> - **aria-label**: "Mid-range price for products, typically ₩25,000 to ₩50,000. Approximately ₩40,000."
> - **다크모드**: CSS 변수 토큰이 자동 처리 (S-9). 별도 분기 없음

**TDD**: 테스트 먼저

- [ ] **Step 1: price-tier-badge.test.tsx 작성**

```typescript
// 검증 항목:
// - tier='$$', displayPrice='~₩40k', showInfo=true → 렌더링 + ⓘ 표시
// - tier='$$', displayPrice='~₩40k', showInfo=false → 렌더링, ⓘ 미표시 (compact용)
// - tier='$$', displayPrice=null → "$$ · Price varies" (Price varies = muted 색상)
// - tier=null → 아무것도 렌더링 안 함
// - ⓘ 버튼 클릭 시 Tooltip 표시, thresholdLabel 텍스트 포함
// - aria-label에 도메인명 + 범위 + 근사 금액 포함
// - 스타일: #hex 하드코딩 없음 (S-5), 디자인 토큰만 사용
// - ⓘ 버튼 터치 타겟 ≥ 44px
```

- [ ] **Step 2: PriceTierBadge 구현**

```tsx
// Props: tier, displayPrice, domain, thresholdLabel, showInfo (default=true)
// tier === null → return null
//
// 스타일 (Design Review 확정):
//   default variant: text-base
//     - 티어+금액: font-bold text-primary → "$$ · ~₩40k"
//     - Price varies: "$$ · " = font-bold text-primary, "Price varies" = font-normal text-muted-foreground
//     - ⓘ: ml-1 text-[11px] text-muted-foreground, min-w-[44px] min-h-[44px] 터치 타겟
//   compact variant (showInfo=false): text-xs, ⓘ 숨김
//
// Tailwind 시맨틱 토큰만 사용 (S-5, L-18)
// 비즈니스 용어 없음 (L-17): props명은 tier, displayPrice, domain, thresholdLabel
// client/ui/primitives/tooltip.tsx 재사용 (Tooltip, TooltipTrigger, TooltipContent)
```

- [ ] **Step 3: 테스트 통과 확인**

---

## Task 5: ProductCard.tsx — PriceTierBadge 교체

- [ ] **Step 1: ProductCard.test.tsx에 PriceTierBadge 렌더 회귀 테스트 추가**

```typescript
// - price=39841 → PriceTierBadge 렌더 확인 (tier='$$')
// - price=null → PriceTierBadge 미렌더링 (기존 동작 유지)
```

- [ ] **Step 2: formatPrice 로컬 함수 제거 → computeTier + PriceTierBadge 도입**

```typescript
// 변경 범위:
// - import { computeTier } from '@/shared/utils/compute-tier'
// - import { formatPriceShort } from '@/shared/utils/format-price-short'
// - import { PRICE_TIER_CONFIG } from '@/shared/constants'
// - import PriceTierBadge from '@/client/ui/primitives/price-tier-badge'
//
// default variant (ProductCard.tsx:138-141):
//   기존: <p className="mb-2 text-base font-bold text-primary">{formatPrice(product.price)}</p>
//   변경: <PriceTierBadge
//           tier={computeTier(PRICE_TIER_CONFIG.product.thresholds, product.price, product.price_min, product.price_max)}
//           displayPrice={formatPriceShort(product.price ?? ...)}
//           domain="product"
//           thresholdLabel={PRICE_TIER_CONFIG.product.tooltipRange}
//           showInfo={true}
//           className="mb-2"
//         />
//   레이아웃: PriceTierBadge 내부에서 <div className="flex items-center"> 처리
//
// compact variant (ProductCard.tsx:70-72):
//   동일 패턴, showInfo=false (ⓘ 숨김)
//
// - formatPrice 함수 삭제 (G-4 미사용 코드 금지)
```

- [ ] **Step 3: ProductCardSkeleton 가격 스켈레톤 크기 업데이트**

```typescript
// 기존: <Skeleton className="mb-3 h-5 w-16" />  (₩39,841 크기)
// 변경: <Skeleton className="mb-3 h-5 w-28" />  ($$ · ~₩40k ⓘ 크기)
```

- [ ] **Step 4: 테스트 통과 확인** — 기존 ProductCard 테스트 + 새 테스트 모두

---

## Task 6: TreatmentCard.tsx — PriceTierBadge 교체

- [ ] **Step 1: TreatmentCard.test.tsx에 PriceTierBadge 렌더 회귀 테스트 추가**

```typescript
// - price_min=50000, price_max=200000 → PriceTierBadge 렌더 (tier='$$')
// - price_min/max 모두 null → PriceTierBadge 미렌더링
```

- [ ] **Step 2: formatPriceRange 로컬 함수 제거 → computeTier + PriceTierBadge 도입**

```typescript
// 변경 범위 (ProductCard Task 5와 동일 패턴):
// - import 동일 4개
//
// default variant (TreatmentCard.tsx:105-108):
//   기존: <p className="mb-2 text-base font-bold text-primary">{formatPriceRange(...)}</p>
//   변경: <PriceTierBadge
//           tier={computeTier(PRICE_TIER_CONFIG.treatment.thresholds, treatment.price, treatment.price_min, treatment.price_max)}
//           displayPrice={formatPriceShort(treatment.price ?? treatment.price_min)}
//           domain="treatment"
//           thresholdLabel={PRICE_TIER_CONFIG.treatment.tooltipRange}
//           showInfo={true}
//           className="mb-2"
//         />
//
// compact variant (TreatmentCard.tsx:50-52): showInfo=false
//
// - formatPriceRange 함수 삭제 (G-4)
```

- [ ] **Step 3: TreatmentCardSkeleton 가격 스켈레톤 크기 업데이트**

```typescript
// 기존: <Skeleton className="mb-3 h-5 w-20" />
// 변경: <Skeleton className="mb-3 h-5 w-28" />
```

- [ ] **Step 4: 테스트 통과 확인**

---

## Task 7: 전체 검증

- [ ] **Step 1: `npm run test` — 전체 단위 테스트 통과**
- [ ] **Step 2: `npm run test:integration` — 전체 통합 테스트 통과**
- [ ] **Step 3: `npx tsc --noEmit` — 타입 에러 0건**
- [ ] **Step 4: V-1~V-27 체크리스트 self-verify**

---

## 의존 그래프

```
Task 1 (price-tier.ts)
  ↓
Task 2 (format-price-short.ts)  ←── 독립, Task 1과 병렬 가능
  ↓
Task 3 (computeTier) ← Task 1 의존
  ↓
Task 4 (PriceTierBadge) ← Task 1, 2 의존
  ↓
Task 5 (ProductCard) ← Task 3, 4 의존
Task 6 (TreatmentCard) ← Task 3, 4 의존 (Task 5와 병렬 가능)
  ↓
Task 7 (전체 검증) ← Task 5, 6 완료 후
```

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ISSUES (claude) | 9 findings, computeTier 배치 치명적 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 9 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 4/10 → 8/10, 6 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**UNRESOLVED:** 0
**VERDICT:** ENG CLEARED — 모든 이슈 해결. plan 수정 반영 완료.
