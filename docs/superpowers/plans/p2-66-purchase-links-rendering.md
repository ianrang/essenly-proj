# P2-66: ProductCard purchase_links 렌더링

> Date: 2026-04-05
> Status: Completed (2026-04-05)
> Dependency: P2-64a (데이터 적재)
> Scope: `client/features/cards/ProductCard.tsx` 1파일 수정 + 테스트 1파일 추가

---

## 1. 목적

ProductCard 푸터에 구매 링크를 표시하여, 사용자가 추천 제품을 바로 구매할 수 있는 경로를 제공한다.

- **사양 정본**: user-screens.md §1.3 line 73 — `purchase_links | 푸터 구매 링크 | 다수 시 첫번째만 표시. 외부 링크 (새 탭)`
- **수익 모델 연결**: PRD §2.3 제휴 수수료 (G-13)
- **KPI 연결**: ANALYTICS.md K5 외부 링크 클릭률 >20% (이벤트 발화는 별도 태스크)

---

## 2. 의사결정 (확정)

| # | 결정 | 근거 |
|---|------|------|
| D-1 | 링크 텍스트 = `"Buy Online"` 통일 라벨 | 대상이 외국인 여행객 → "coupang" 인지도 낮음. 첫 번째만 표시하므로 플랫폼 비교 불필요. CTA 역할이 중요 |
| D-2 | 푸터 순서: store 다음에 purchase 추가 | user-screens.md 순서 "영문 라벨 배지 · 지도 링크 · 구매 링크". P2-67(영문 배지)은 별도 삽입 |
| D-3 | 푸터 구조화(wrapper div) 안 함 | P-7 단일변경점, G-4 미사용코드 금지. P2-67 시 독립 삽입 가능 |

---

## 3. 수정 범위

### 3.1 수정 파일: `src/client/features/cards/ProductCard.tsx`

**변경 내용**: store `<p>` 블록(line 96-112) 다음에 purchase 링크 블록 추가.

```tsx
{/* Purchase Link */}
{product.purchase_links && product.purchase_links.length > 0 && (
  <p className="text-[10px] text-muted-foreground">
    <a
      href={product.purchase_links[0].url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline transition-colors hover:text-foreground"
    >
      Buy Online
    </a>
  </p>
)}
```

**패턴 일관성**:
- store map 링크와 동일한 `<p className="text-[10px] text-muted-foreground"><a>` 패턴
- TreatmentCard booking_url과 동일한 `target="_blank" rel="noopener noreferrer"` 패턴
- 조건부 렌더링: `&&` 가드로 null/undefined 안전 처리

### 3.2 추가 파일: `src/client/features/cards/ProductCard.test.tsx`

ProductCard 컴포넌트 렌더링 단위 테스트 신규 작성.

**테스트 케이스**:

| # | 케이스 | 검증 대상 |
|---|--------|----------|
| T-1 | purchase_links 배열 존재 시 | "Buy Online" 텍스트 렌더링 + href 정확성 + target="_blank" |
| T-2 | purchase_links 다수 시 | 첫 번째만 렌더링 (두 번째 URL 미존재) |
| T-3 | purchase_links null 시 | 구매 링크 미렌더링 |
| T-4 | purchase_links 빈 배열 시 | 구매 링크 미렌더링 |

---

## 4. 수정하지 않는 것

| 파일/영역 | 이유 |
|-----------|------|
| `card-mapper.ts` | product 객체를 그대로 전달 → purchase_links 자동 포함. 변경 불필요 |
| `domain.ts` (타입) | `PurchaseLink` 인터페이스 + `Product.purchase_links` 이미 정의됨 |
| `validation/product.ts` | `purchaseLinkSchema` 이미 정의됨 |
| `search-handler.ts` | `...product` spread로 전체 필드 전달. 변경 불필요 |
| `match_products` RPC | 벡터 검색 경로의 컬럼 누락은 P2-78 별도 태스크 (core/ 변경 = L-4) |
| `external_link_click` 이벤트 | KPI 이벤트 발화는 별도 태스크 범위 |
| english_label 배지 | P2-67 별도 태스크 |

---

## 5. 데이터 경로 검증

```
DB products.purchase_links (jsonb)
  ↓ findProductsByFilters: select('*') → 포함 ✅
  ↓ matchProductsByVector: RPC 미반환 ⚠️ → P2-78에서 해결
  ↓ search-handler: ...product spread → 그대로 전달 ✅
  ↓ card-mapper: product 객체 그대로 전달 (line 140) ✅
  ↓ ProductCard: product.purchase_links 접근 ✅

null/undefined 안전성:
  - null (SQL 경로, 데이터 없음) → && 가드 → 미렌더링 ✅
  - undefined (벡터 경로, 컬럼 누락) → && 가드 → 미렌더링 ✅
  - [] (빈 배열) → length > 0 가드 → 미렌더링 ✅
  - [link, ...] → 정상 렌더링 ✅
```

---

## 6. 규칙 검증 체크리스트

```
✅ V-1  의존성 방향: client/features/cards/ → shared/types/ (DAG 준수)
✅ V-2  core 불변: core/ 수정 없음
✅ V-3  Composition Root: 해당 없음 (컴포넌트 렌더링만)
✅ V-4  features 독립: 타 features/ import 없음
✅ V-5  콜 스택 ≤ 4: 해당 없음 (컴포넌트)
✅ V-9  중복: 기존 purchase 링크 렌더링 코드 없음 (신규)
✅ V-10 불필요 코드: 미사용 export, 패스스루 래퍼 없음
✅ V-11 is_highlighted: 렌더링 외 미사용
✅ V-12 타입 안전: any 없음. PurchaseLink 타입 활용
✅ V-13 디자인 토큰: text-muted-foreground, hover:text-foreground (토큰만 사용)
✅ V-15 ui/ 순수성: ProductCard는 client/features/ 소속 (ui/ 아님)
✅ V-17 제거 안전성: 이 코드 블록 삭제해도 다른 코드에 영향 없음
✅ V-22 스키마 정합성: PurchaseLink {platform, url, affiliate_code?} = DB jsonb 구조 일치

P-7  단일 변경점: ProductCard.tsx 1파일 수정
G-4  미사용 코드 금지: P2-67용 코드 미리 안 만듦
G-5  기존 패턴 따르기: store 링크와 동일 패턴
Q-3  null-safe: null/undefined/빈배열 모두 안전 처리
S-5  하드코딩 금지: 디자인 토큰만 사용
L-0b client-only: 파일 첫 줄 import 유지
L-12 모바일 퍼스트: 기존 푸터 스타일 유지 (추가 브레이크포인트 불필요)
```

---

## 7. 관련 태스크

| 태스크 | 관계 | 상태 |
|--------|------|------|
| P2-64a | 선행 (데이터 적재) | ⬜ |
| P2-67 | 후행 (english_label 배지, 같은 푸터 영역) | ⬜ |
| P2-68 | 형제 (store map_url E2E) | ⬜ |
| P2-78 | 후행 (match_products RPC 컬럼 확장) | ⬜ 신규 |
