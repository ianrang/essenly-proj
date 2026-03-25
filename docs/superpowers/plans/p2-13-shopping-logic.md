# P2-13: 쇼핑 도메인 로직 구현 계획

> 상태: 최종 확정
> 선행: P2-12 (judgment.ts — ScoredItem 계약)
> 근거: search-engine.md §3.2 shopping.ts, CLAUDE.md §2.3 beauty/ 단방향 규칙

---

## 목적

Repository SQL(1~2단계)을 통과한 Product[]에 대해 **DV-1(선호 성분)/DV-2(기피 성분) 기반 4단계 개인화 점수**를 계산하는 순수 함수.
search-handler(P2-20)에서 `scoreProducts()` → `rank()` 순서로 호출.

---

## 범위

### 포함

| 파일 | 작업 | 비고 |
|------|------|------|
| `features/beauty/shopping.ts` | skeleton → 구현 | scoreProducts (export 1개) |
| `features/beauty/shopping.test.ts` | 신규 | 단위 테스트 (P2-27 부분) |

### 미포함

| 파일 | 이유 |
|------|------|
| `beauty/judgment.ts` | P2-12 완료. 수정 없음 |
| `beauty/treatment.ts` | P2-14 |
| `beauty/derived.ts` | P2-15 |
| `shared/types/domain.ts` | Product 타입 이미 정의. 수정 없음 |

---

## 의존성

### 사용하는 기존 모듈 (수정 없음)

| 모듈 | 용도 | 수정 |
|------|------|------|
| `beauty/judgment.ts` | ScoredItem 타입 import | 없음 |
| `shared/types/domain.ts` | Product 타입 import | 없음 |

### 의존 방향 검증

```
features/beauty/shopping.ts
  → beauty/judgment.ts (type import: ScoredItem)     §2.3 허용
  → shared/types/domain.ts (type import: Product)    R-7 허용
  X core/ import 없음
  X features/ 타 모듈 import 없음
  X beauty/treatment.ts, beauty/derived.ts import 없음  §2.3 준수
  X DB/API 호출 없음 (L-7)
```

**§2.3 원문 대조:**
```
shopping.ts  → judgment.ts   ✓ (공통 필터 사용)
shopping.ts  → treatment.ts  ✗ (peer 간 직접 의존 금지)
shopping.ts  → derived.ts    ✗ (peer 간 직접 의존 금지)
```

순환 참조 없음. judgment.ts → shopping.ts 역방향 없음.

---

## 설계 결정

### D-1. 함수 시그니처

원문 (search-engine.md §3.2):
```typescript
function scoreProduct(product, preferredIngredients, avoidedIngredients): { score, reasons }
```

구현:
```typescript
/** 복수 Product → ScoredItem[] 변환 (search-handler 소비) */
export function scoreProducts(
  products: Product[],
  preferredIngredients: string[],
  avoidedIngredients: string[],
): ScoredItem[]
```

**원문과의 차이:**
- 원문 `scoreProduct` (단수) → 내부 헬퍼로 유지, export 안 함 (G-9)
- export는 `scoreProducts` (복수) 1개만 — search-handler가 Product[] 단위로 호출
- 반환 타입: `{ score, reasons }` → `ScoredItem` — judgment.ts 계약에 맞게 확장 (id, warnings, is_highlighted 포함)

### D-2. 점수 계산 로직

```
기본 점수: 0.5 (BASE_SCORE)
선호 성분 매칭: +0.1 per match (PREFERRED_BONUS, 최대 0.5 합산)
기피 성분 매칭: -0.15 per match (AVOIDED_PENALTY)
최종: clamp(0, 1)
```

**명명된 상수 (G-10 매직 넘버 금지):**
```typescript
const BASE_SCORE = 0.5;
const PREFERRED_BONUS = 0.1;
const AVOIDED_PENALTY = 0.15;
```

### D-3. VP-3 null-safe

| 입력 | 동작 |
|------|------|
| `preferredIngredients = []` | 가산 없음 → 기본 점수 |
| `avoidedIngredients = []` | 감산 없음 → 기본 점수 |
| `product.key_ingredients = null` | 매칭 불가 → 기본 점수 |
| `product.key_ingredients = []` | 매칭 불가 → 기본 점수 |

### D-4. ScoredItem 변환

```typescript
// 내부 헬퍼 (export 안 함)
function scoreProduct(product, preferred, avoided): { score, reasons, warnings }

// export 함수
function scoreProducts(products, preferred, avoided): ScoredItem[] {
  return products.map(product => {
    const { score, reasons, warnings } = scoreProduct(product, preferred, avoided);
    return {
      id: product.id,
      score,
      reasons,
      warnings,
      is_highlighted: product.is_highlighted,  // VP-1: 그대로 전달
    };
  });
}
```

### D-5. 3단계 제약 조건 — Product에 해당 없음

search-engine.md §3.1: "3단계 = 다운타임 계산만 담당", "budget/price는 1단계 SQL에서 이미 처리"
Product에는 `downtime_days` 필드 없음 → shopping.ts에 3단계 로직 없음.

### D-6. export 범위 (G-9)

| export | 용도 | 소비자 |
|--------|------|--------|
| `scoreProducts()` | Product[] → ScoredItem[] | search-handler (P2-20) |

1개 export. `scoreProduct` (단수)는 내부 헬퍼.

---

## 구현

### shopping.ts

```typescript
import 'server-only';
import type { Product } from '@/shared/types/domain';
import type { ScoredItem } from './judgment';

// ============================================================
// 쇼핑 도메인 로직 — search-engine.md §3.2
// 4단계 개인화 점수: DV-1/2 기반 성분 매칭.
// §2.3: shopping.ts → judgment.ts (단방향).
// R-7: shared/ + beauty/judgment ONLY.
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 1개 (scoreProducts).
// ============================================================

const BASE_SCORE = 0.5;
const PREFERRED_BONUS = 0.1;
const AVOIDED_PENALTY = 0.15;

function scoreProduct(
  product: Product,
  preferredIngredients: string[],
  avoidedIngredients: string[],
): { score: number; reasons: string[]; warnings: string[] } {
  const ingredients = product.key_ingredients ?? [];
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (ingredients.length === 0) {
    return { score: BASE_SCORE, reasons, warnings };
  }

  let score = BASE_SCORE;

  for (const ingredient of ingredients) {
    if (preferredIngredients.includes(ingredient)) {
      score += PREFERRED_BONUS;
      reasons.push(ingredient);
    }
    if (avoidedIngredients.includes(ingredient)) {
      score -= AVOIDED_PENALTY;
      warnings.push(ingredient);
    }
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    reasons,
    warnings,
  };
}

export function scoreProducts(
  products: Product[],
  preferredIngredients: string[],
  avoidedIngredients: string[],
): ScoredItem[] {
  return products.map((product) => {
    const { score, reasons, warnings } = scoreProduct(
      product,
      preferredIngredients,
      avoidedIngredients,
    );
    return {
      id: product.id,
      score,
      reasons,
      warnings,
      is_highlighted: product.is_highlighted,
    };
  });
}
```

### 테스트

| 테스트 | 검증 |
|--------|------|
| scoreProducts: 선호 성분 매칭 → 점수 가산 | score > BASE_SCORE, reasons에 성분명 |
| scoreProducts: 기피 성분 매칭 → 점수 감산 | score < BASE_SCORE, warnings에 성분명 |
| scoreProducts: 선호+기피 동시 → 상쇄 | 가산+감산 결과 |
| scoreProducts: key_ingredients null → 기본 점수 | score === BASE_SCORE |
| scoreProducts: DV-1/2 빈 배열 → 기본 점수 (VP-3) | score === BASE_SCORE |
| scoreProducts: score clamp 0~1 | 다수 기피 시 0 미만 방지 |
| scoreProducts: is_highlighted 그대로 전달 (VP-1) | ScoredItem.is_highlighted === Product.is_highlighted |
| scoreProducts: 빈 배열 입력 → 빈 배열 반환 | products=[] → [] |

---

## 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: shopping.ts → judgment.ts(type) + shared/types(type) ONLY
[ ] V-2  core/ 수정 없음
[ ] V-7  순수 함수: DB/API 호출 없음
[ ] V-8  §2.3: shopping→judgment ✓, shopping→treatment ✗, shopping→derived ✗
[ ] V-9  중복: judgment.ts의 rank()와 로직 중복 없음
[ ] V-10 미사용 export 없음
[ ] V-17 제거 안전성: shopping.ts 삭제해도 core/, shared/, judgment.ts 빌드 무영향
```

### 품질

```
[ ] Q-2  VP-1: is_highlighted → ScoredItem에 그대로 전달, 점수 산출 미참여
[ ] Q-3  VP-3: key_ingredients null, DV-1/2 빈 배열 → 기본 점수
[ ] G-2  중복 금지: 성분 매칭은 shopping.ts에만 존재
[ ] G-3  패스스루 래퍼 없음
[ ] G-8  any 없음
[ ] G-9  export 1개 (scoreProducts)
[ ] G-10 매직 넘버 없음: BASE_SCORE, PREFERRED_BONUS, AVOIDED_PENALTY 상수
```

### 테스트

```
[ ] shopping.test.ts 8개
[ ] npx vitest run 전체 통과
[ ] grep: is_highlighted가 score 계산에 미참조
```
