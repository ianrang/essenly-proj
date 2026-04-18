# NEW-35: 도메인별 가격 티어 시스템 설계

- 작성일: 2026-04-18
- 정본 상태: v1.0 (초안)
- 선행 설계: 브레인스토밍 결정사항 (2026-04-17, `feat/new-35-36-price-tier-fallback` 브랜치)
- DB 정본: `docs/03-design/schema.dbml` §products, §treatments (price 관련 컬럼)
- 요구사항 정본: `docs/03-design/PRD.md` §3.5 (가격 표시 통화), §4-B DOM-1 (제품 가격)
- 감사 데이터 정본: `docs/audit/price-coverage-20260417.md` (N=469 products, N=53 treatments)
- TODO 정본: `TODO.md` line 541 (NEW-35 정의)

---

## §1. 배경

### 1.1 문제

현재 ProductCard와 TreatmentCard는 절대 금액을 그대로 표시한다:
- ProductCard: `₩39,841` (formatPrice, ProductCard.tsx:27-30)
- TreatmentCard: `₩50,000~₩200,000` (formatPriceRange, TreatmentCard.tsx:20-25)

외국인 여행객에게 KRW 절대 금액은 직관적이지 않다. `$$ · ~₩40k`처럼 상대적 가격 포지션($ / $$ / $$$)과 축약 금액을 함께 표시하면 의사결정이 용이하다.

### 1.2 도메인별 차이

products(화장품)와 treatments(시술)는 가격대가 근본적으로 다르다 (04-17 감사 기준):
- Products: p25=₩25,392, p50=₩39,841, p75=₩48,552 (range: ₩10k~₩159k)
- Treatments price_min: p25=₩50,000, p50=₩80,000, p75=₩200,000 (range: ₩30k~₩500k)

동일 임계값을 사용하면 treatments가 전부 `$$$`가 되므로 도메인별 분리가 필수.

### 1.3 브레인스토밍 결정 (2026-04-17)

- **옵션 B 확정 (라운딩 친화)**: 정확한 quantile 대신 친화 숫자로 반올림
- **단일 변경점 강제**: 모든 임계값·중앙값은 `shared/constants/price-tier.ts` 1파일에서만 정의

---

## §2. 설계 결정

### §2.1 확정 임계값

| 도메인 | $ (Budget) | $$ (Mid-range) | $$$ (Premium) | 근거 |
|--------|-----------|----------------|---------------|------|
| products | <₩25,000 | ₩25,000–₩50,000 | >₩50,000 | p25=25,392→25k (오차 1.5%), p75=48,552→50k (오차 3%) |
| treatments | <₩50,000 | ₩50,000–₩200,000 | >₩200,000 | p25=50,000, p75=200,000 (정확 일치) |

### §2.2 가격 결정 우선순위

`computeTier()` 함수의 price 입력 결정 로직:
1. **실가격 (price)** — NOT NULL이면 사용
2. **price_min** — price NULL이고 range 존재 시 (treatments 임계값이 price_min 기준이므로 일관성 확보. 중앙값 사용 시 spec 임계값과 불일치 발생)
3. **null 반환** — 둘 다 없으면 티어 판정 불가, UI에서 "Price varies" 폴백

### §2.3 표기 형식

- 정상: `$$ · ~₩40k` (티어 배지 + 중앙값 축약)
- 폴백: `$$ · Price varies` (티어만 있고 구체 금액 없음)
- null: 표시 안 함 (price 정보 완전 부재)

### §2.4 축약 규칙 (format-price-short)

| 원본 | 축약 | 규칙 |
|------|------|------|
| ₩39,841 | ₩40k | 천 단위 반올림 후 k 접미사 |
| ₩200,000 | ₩200k | |
| ₩1,500,000 | ₩1.5M | 백만 단위 |

### §2.5 ⓘ 툴팁

도메인별 금액 차이 혼동 방지:
- 텍스트: `"$$: Mid-range, typically ₩25,000–₩50,000 for products"`
- aria-label: 도메인 + 절대 범위 명시 (접근성)
- trigger: tap (모바일) / hover (데스크톱)

---

## §3. 계층 배치

| 파일 | 계층 | 규칙 근거 |
|------|------|----------|
| `shared/constants/price-tier.ts` | shared/constants | S-5, S-8, G-10, P-7 단일 변경점 |
| `shared/utils/format-price-short.ts` | shared/utils | L-13 순수 유틸 |
| `server/features/beauty/derived.ts` (computeTier 추가) | server/features | L-7 순수 함수 |
| `client/ui/primitives/price-tier-badge.tsx` | client/ui | R-11, L-17~L-19 비즈니스 무관 |
| `client/features/cards/ProductCard.tsx` (수정) | client/features | 기존 파일 |
| `client/features/cards/TreatmentCard.tsx` (수정) | client/features | 기존 파일 |

### 의존 방향 검증

```
ProductCard → PriceTierBadge (client/ui) ✓ (R-11: ui는 shared만 import)
ProductCard → price-tier.ts (shared/constants) ✓
TreatmentCard → PriceTierBadge ✓
TreatmentCard → price-tier.ts ✓
PriceTierBadge → format-price-short.ts (shared/utils) ✓
PriceTierBadge → price-tier.ts (shared/constants) ✗ — ui는 shared만 import 가능하므로 ✓
derived.ts → price-tier.ts (shared/constants) ✓ (R-5: beauty/ → shared/ 허용)
```

R-11 위반 없음. 순환 의존 없음. 콜스택 ≤ 4.

---

## §4. PriceTierBadge 인터페이스

```typescript
interface PriceTierBadgeProps {
  tier: '$' | '$$' | '$$$' | null;
  displayPrice: string | null;   // "~₩40k" 형태, null이면 "Price varies"
  domain: 'product' | 'treatment';
  thresholdLabel: string;        // "₩25,000–₩50,000" (툴팁용)
}
```

- `tier === null` → 렌더링 안 함 (가격 정보 완전 부재)
- 비즈니스 용어 없음 (L-17): skin_type, concerns 등 미포함
- props와 디자인 토큰만으로 렌더링 완결 (L-19)

---

## §5. 테스트 전략

| 대상 | 파일 | 케이스 |
|------|------|--------|
| price-tier config | `shared/constants/price-tier.test.ts` | config 구조 검증, 도메인별 임계값 존재 |
| computeTier | `server/features/beauty/derived.test.ts` (추가) | 도메인×가격 구간 매트릭스, range fallback, null 반환 |
| format-price-short | `shared/utils/format-price-short.test.ts` | k/M 축약, 반올림, 0/음수/null 처리 |
| PriceTierBadge | `client/ui/primitives/price-tier-badge.test.tsx` | 렌더링, 폴백 텍스트, 툴팁, null tier 미렌더링 |
| ProductCard 회귀 | `client/features/cards/ProductCard.test.tsx` (수정) | PriceTierBadge 렌더 확인 |
| TreatmentCard 회귀 | `client/features/cards/TreatmentCard.test.tsx` (수정) | PriceTierBadge 렌더 확인 |
