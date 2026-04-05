# P2-67: ProductCard english_label 배지

> Date: 2026-04-05
> Status: Completed (2026-04-05)
> Dependency: P2-64a (데이터 적재)
> Scope: `client/features/cards/ProductCard.tsx` 1파일 수정 + 테스트 추가

---

## 1. 목적

ProductCard 푸터에 영문 라벨 배지를 표시하여, 외국인 여행객이 제품 포장의 영문 표기 유무를 즉시 확인할 수 있도록 한다.

- **사양 정본**: user-screens.md §1.3 line 71 — `english_label → 푸터 배지 → true → "English Label" 배지`
- **푸터 순서**: user-screens.md line 57 — "**영문 라벨 배지** · 지도 링크 · 구매 링크" (배지가 첫 번째)

---

## 2. 의사결정 (확정)

| # | 결정 | 근거 |
|---|------|------|
| D-1 | 배지 스타일 = 패턴 B (tags와 동일한 neutral pill) | 프로젝트 내 pill 배지 5곳 모두 동일 스타일. 푸터 내 유일한 pill이므로 위치·개수로 자연 구분. sage 등 신규 색상 도입은 일관성 악화 |
| D-2 | 배치 위치 = Store 블록 앞 | user-screens.md 순서 "영문 라벨 배지 → 지도 링크 → 구매 링크" |
| D-3 | 텍스트 = "English Label" | user-screens.md line 71 명시 |

---

## 3. 수정 범위

### 3.1 수정 파일: `src/client/features/cards/ProductCard.tsx`

**변경 내용**: Store 블록(line 96) 앞에 english_label 배지 블록 추가.

```tsx
{/* English Label Badge */}
{product.english_label && (
  <span className="inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
    English Label
  </span>
)}
```

**패턴 일관성**:
- ProductCard tags (line 88)와 동일 클래스: `rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground`
- TreatmentCard category (line 43), TreatmentCard tags (line 109)와 동일 패턴
- 프로젝트 내 pill 배지 5곳과 완전 동일

### 3.2 테스트 추가: `src/client/features/cards/ProductCard.test.tsx`

기존 P2-66 테스트 파일에 english_label describe 블록 추가.

**테스트 케이스**:

| # | 케이스 | 검증 대상 |
|---|--------|----------|
| T-1 | english_label true | "English Label" 텍스트 렌더링 |
| T-2 | english_label false | 배지 미렌더링 |

---

## 4. 수정하지 않는 것

| 파일/영역 | 이유 |
|-----------|------|
| `card-mapper.ts` | product 객체 그대로 전달 → english_label 자동 포함 |
| `domain.ts` | `Product.english_label: boolean` 이미 정의 |
| `validation/product.ts` | `z.boolean().default(false)` 이미 정의 |
| `search-handler.ts` | `...product` spread로 전체 필드 전달 |
| `match_products` RPC | P2-78 별도 태스크 |
| `globals.css` | 기존 토큰만 사용. 새 색상/변수 불필요 |
| P2-66 purchase 링크 | 독립 블록. 무영향 |

---

## 5. 데이터 경로 검증

```
DB products.english_label (boolean, default false, NOT NULL)
  ↓ findProductsByFilters: select('*') → 포함 ✅
  ↓ matchProductsByVector: RPC 미반환 ⚠️ → P2-78
  ↓ search-handler: ...product spread → 전달 ✅
  ↓ card-mapper: product 객체 그대로 전달 ✅
  ↓ ProductCard: product.english_label 접근 ✅

boolean 타입 안전성:
  - true → 렌더링 ✅
  - false → falsy → 미렌더링 ✅
  - undefined (벡터 경로) → falsy → 미렌더링 ✅
```

---

## 6. 규칙 검증 체크리스트

```
✅ V-1  의존성 방향: client/features/cards/ → shared/types/ (DAG 준수)
✅ V-2  core 불변: core/ 수정 없음
✅ V-4  features 독립: 타 features/ import 없음
✅ V-9  중복: 기존 english_label 렌더링 코드 없음 (신규)
✅ V-10 불필요 코드: 미사용 export, 패스스루 래퍼 없음
✅ V-12 타입 안전: any 없음. boolean 직접 사용
✅ V-13 디자인 토큰: border-border, text-muted-foreground (기존 토큰만)
✅ V-17 제거 안전성: 블록 삭제해도 다른 코드 무영향

P-7  단일 변경점: ProductCard.tsx 1파일 수정
G-4  미사용 코드 금지: 새 유틸/컴포넌트 미생성
G-5  기존 패턴 따르기: tags pill 배지와 동일
Q-3  null-safe: boolean이므로 null 불가. undefined도 falsy 처리
S-5  하드코딩 금지: 디자인 토큰만 사용
S-10 컴포넌트 스타일 자족: 외부 CSS 의존 없음
L-0b client-only: 기존 guard 유지
```
