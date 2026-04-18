# NEW-36: 가격 파이프라인 커버리지 100% 자동 적재 설계

- 작성일: 2026-04-18
- 정본 상태: v1.0 (초안)
- 선행 설계: 브레인스토밍 결정사항 (2026-04-17, `feat/new-35-36-price-tier-fallback` 브랜치)
- DB 정본: `docs/03-design/schema.dbml` §products, §treatments (price 관련 컬럼)
- 감사 데이터 정본: `docs/audit/price-coverage-20260417.md` (2026-04-17 기준)
- TODO 정본: `TODO.md` line 542 (NEW-36 정의)
- 파서 정본: `scripts/seed/collect-oy-bestsellers.ts` (parseUsdPrice, lines 91-98)
- G-12 사전 검증: NEW-27/NEW-40에서 OY Global 상업적 사용 확인 완료

---

## §1. 배경

### 1.1 현재 상태 (2026-04-17 감사 기준)

| 항목 | 수량 | 상세 |
|------|------|------|
| products 전체 | 597건 | |
| products price NULL | 128건 (21.4%) | 100% `global.oliveyoung.com` URL 보유, 전부 2026-04 생성 |
| products price NULL 원인 | — | NEW-27에서 URL만 추출, price 추출 누락 |
| treatments 전체 | 53건 | |
| treatments price_min/max NULL | 0건 (0%) | 전부 채워짐 |
| treatments price_source NULL | 53건 (100%) | manual seed였으나 source 미기록 |
| products drift | 2건 | price=SET이지만 price_source=NULL |

### 1.2 목표

**100% 가격 정보 보유** — 관리자 수동 입력 없이 자동 적재.

### 1.3 스코프 결정 (2026-04-17 브레인스토밍)

기존 4단계 → **2단계로 축소 확정**:
- ~~36-b heuristic 범위 추정~~ → 제외 (brand_price_tier 매핑 테이블 부재)
- ~~36-c AI 범위 보강~~ → 제외 (G-12 상업적 신뢰성 리스크, UX 폴백 "Price varies" 허용)

---

## §2. 설계 결정

### §2.1 36-a: OY 실가격 보강 패스

**대상**: 128건 products (price IS NULL AND url LIKE '%global.oliveyoung.com%')

**방법**: 기존 `scripts/seed/collect-oy-bestsellers.ts`의 `parseUsdPrice()` 함수 재사용.
- USD 가격 텍스트 → regex 추출 → KRW 변환 (USD_TO_KRW=1380)
- 동일 파서, 동일 도메인 → 실패 위험 낮음

**배치 전략**:
- 10건씩 13배치 (총 128건, 마지막 배치 8건)
- CRAWL_DELAY_MS=3000ms (NEW-40 준수, OY 서버 부하 방지)
- 예상 소요: ~130건 × 3초 = ~6.5분

**DB 업데이트 (성공 시)**:
```sql
UPDATE products SET
  price = <추출값>,
  price_source = 'real',
  price_source_url = <기존 url 컬럼 값>,
  price_updated_at = now()
WHERE id = <id>;
```

**실패 처리**:
- 개별 실패는 로그 기록 후 스킵 (다음 건 진행)
- 실패 건은 36-d 카테고리 fallback 대상이 됨
- 전체 배치 실패 시 (네트워크 등) 사용자에게 보고

### §2.2 36-d: 카테고리 기본값 fallback

**대상**: 36-a 이후 여전히 price IS NULL인 products

**방법**: 카테고리별 p25/p75를 price_min/price_max로 할당.

04-17 감사 기준 카테고리별 quantile:

| 카테고리 | p25 (₩) | p75 (₩) | 비고 |
|---------|---------|---------|------|
| skincare | 감사 리포트에서 산출 필요 | | null 82건 (최다) |
| makeup | 감사 리포트에서 산출 필요 | | null 25건 |
| haircare | 감사 리포트에서 산출 필요 | | null 9건 |
| bodycare | 감사 리포트에서 산출 필요 | | null 9건 |
| tools | 감사 리포트에서 산출 필요 | | null 3건 |

> 주의: 카테고리별 quantile은 36-a 실행 후 재산출해야 정확. 36-a 성공분이 반영된 데이터 기준.

**DB 업데이트**:
```sql
UPDATE products SET
  price_min = <category_p25>,
  price_max = <category_p75>,
  range_source = 'category-default',
  price_updated_at = now()
WHERE id = <id> AND price IS NULL;
```

### §2.3 메타데이터 백필

| 대상 | 건수 | 변경 |
|------|------|------|
| treatments price_source NULL | 53건 | `price_source = 'manual'` |
| products drift (price SET, source NULL) | 2건 | `price_source = 'real'` |

### §2.4 덮어쓰기 우선순위

`manual` > `real` > `category-default`

낮은 신뢰도로 높은 신뢰도를 덮어쓰기 금지. 스크립트에서 기존 price_source를 확인하고, 우선순위가 높은 값이 이미 있으면 스킵.

---

## §3. 계층 배치

| 파일 | 계층 | 역할 |
|------|------|------|
| `scripts/seed/backfill-price.ts` (신규) | scripts/ | 36-a + 36-d + 메타데이터 백필 실행 스크립트 |
| `scripts/seed/lib/oy-parser.ts` (신규) | scripts/seed/lib | parseUsdPrice + fetchProductPrice 추출 (collect-oy-bestsellers.ts에서 분리) |
| `scripts/seed/collect-oy-bestsellers.ts` (수정) | scripts/seed | oy-parser.ts import로 전환 (중복 제거) |

### 의존 방향 검증 (P-9)

```
scripts/seed/backfill-price.ts → scripts/seed/lib/oy-parser.ts ✓ (scripts 내부)
scripts/seed/backfill-price.ts → shared/constants/ ✓ (P-9: scripts → shared 허용)
scripts/seed/collect-oy-bestsellers.ts → scripts/seed/lib/oy-parser.ts ✓
oy-parser.ts → (외부 라이브러리만, server/client/shared 무참조) ✓
```

역방향 없음. 제거 안전성(P-10): backfill-price.ts 삭제 시 core/features/client/shared 무영향.

---

## §4. 멱등성 설계 (Q-12)

재실행 시 중복 데이터 방지:
- 36-a: `WHERE price IS NULL` 조건으로 이미 채워진 건 스킵
- 36-d: `WHERE price IS NULL AND price_min IS NULL` 조건
- 메타데이터 백필: `WHERE price_source IS NULL` 조건
- 덮어쓰기 우선순위 체크: 기존 source가 상위면 스킵

---

## §5. 테스트 전략

| 대상 | 파일 | 케이스 |
|------|------|--------|
| oy-parser | `scripts/seed/lib/oy-parser.test.ts` | parseUsdPrice 단위 (정상/빈값/비정상 포맷) |
| backfill 로직 | `scripts/seed/backfill-price.test.ts` | 우선순위 덮어쓰기 규칙, 멱등성, 카테고리 fallback 순수 함수 |
| 통합 검증 | 36-a 실행 후 `npm run audit:price` 재실행 (NEW-34R) | 100% 커버리지 달성 확인 |

---

## §6. 실행 순서

1. oy-parser.ts 분리 + 테스트
2. collect-oy-bestsellers.ts 리팩토링 (oy-parser import)
3. backfill-price.ts 구현 (36-a → 36-d → 메타데이터 백필)
4. 로컬 실행 + 검증
5. NEW-34R 감사 재실행
