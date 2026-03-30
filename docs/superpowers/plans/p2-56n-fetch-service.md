# P2-56n: fetch-service (Stage 1 오케스트레이션)

## Context

7개 프로바이더를 병렬 호출(Promise.allSettled)하여 RawRecord[]를 수집하는 Stage 1 오케스트레이터.
카카오 장소 → classifyPlace(store/clinic 분류) + 4단계 중복 제거. ingredients 3원 소스(S3+S6+S4) 텍스트 매칭 합병.

**선행 완료**: Layer 1 프로바이더 전체 ✅ (P2-56d, P2-56e2, P2-56f~j)

---

## 설계 결정

### D-1. fetch-service = Composition Root (P-4, P-9)

fetch-service.ts는 scripts/seed/의 보조 Composition Root 역할 (P-9).
각 프로바이더의 고유 시그니처를 직접 호출한다.

**RecordProvider 통합 인터페이스 도입하지 않음**:
- G-3(패스스루 래퍼 금지): 인터페이스 래핑 = 인자를 전달만 하는 함수
- P-7(단일 변경점): 기존 프로바이더 7개 수정 필요 → 규칙 위반
- csv-loader는 필수 파라미터(filePath, entityType)가 있어 parameterless 인터페이스 호환 불가
- PlaceProvider는 query 동적 입력 → parameterless 인터페이스 호환 불가

새 프로바이더 추가 시: 프로바이더 파일 1개 생성 + fetch-service Promise.allSettled 배열에 1줄 추가 = P-7 준수.

### D-2. place-mapper.ts 분리 — classifyPlace + RawPlace→RawRecord 변환 + dedup

카카오 프로바이더는 RawPlace[]를 반환 (나머지 6개는 RawRecord[]). 변환 로직 분리:

```typescript
// scripts/seed/lib/place-mapper.ts

/** 카카오 카테고리+이름 → store | clinic 분류 (P0-33 PoC 계승) */
export function classifyPlace(place: RawPlace): "store" | "clinic"

/** RawPlace → RawRecord 변환 (classifyPlace 적용) */
export function mapPlaceToRawRecord(place: RawPlace): RawRecord

/** 4단계 중복 제거 (data-collection.md §3.2) */
export function deduplicatePlaces(places: RawPlace[]): RawPlace[]
```

분리 근거:
- Q-6(함수≤40줄): classifyPlace + dedup + 변환을 fetch-service에 섞으면 비대
- P-7: 카카오 분류 키워드 수정 시 place-mapper.ts 1파일
- P-10: 삭제해도 빌드 에러 0건

### D-3. 4단계 중복 제거 — 카카오 장소 데이터에만 적용

data-collection.md §3.2 L287:
> 1차 카카오 id → 2차 place_url → 3차 name.ko + 좌표 50m → 4차 name.ko + address.ko 정규화

구현:
- 1차 sourceId: kakao-local.ts 내부에서 이미 처리 (Map dedup)
- 2차 placeUrl: 같은 placeUrl → 중복
- 3차 좌표 근접: `|Δlat| < 0.00045 && |Δlng| < 0.00056` (서울 위도 50m 근사)
- 4차 주소 정규화: "서울특별시" → "서울", 공백/구두점 제거 후 비교

다른 프로바이더(mfds, cosing, csv, scraper)는 자체 sourceId Map dedup으로 충분.
교차 프로바이더 중복 없음 (카카오=장소, mfds/cosing=원료, scraper=제품 — 엔티티 타입이 다름).

### D-4. S3↔S6↔S4 ingredients 합병 — fetch-service 담당

cosing-csv.ts L4 주석: "S3↔S6 매칭은 fetch-service 담당"

합병 순서 (data-collection.md §3.7 L450-462):
```
S3(원료성분) → 기본 레코드
  ↓ INGR_ENG_NAME ↔ INCI name 텍스트 매칭 (1차) + CAS_NO (보조)
S6(CosIng) → inci_name + function 보강
  ↓
S4(사용제한) → 안전성 플래그 보강
```

구현: `mergeIngredientSources(s3, s6, s4): RawRecord[]` 순수 함수.
- S3 기준으로 S6/S4를 LEFT JOIN (매칭 안 되면 S3만 유지)
- 텍스트 매칭: lowercase + trim 정규화
- fetch-service 내부 함수 (외부 export 불필요 — G-9)

### D-5. S5(mfds-functional) 미포함

TODO.md P2-56n 의존성에 S5 없음. data-collection.md Phase 순서:
> Phase E (B 완료 후): S5 교차 검증

S5는 Phase E 전용 (P2-64e). fetch-service = Phase A~B 수집 담당.

### D-6. CSV 포함 — csvFiles 옵션으로 통합

data-collection.md §7.2에서 CLI는 fetch.ts(Channel A) / import-csv.ts(Channel B) 분리되지만,
fetch-service는 두 채널 모두 오케스트레이션. 출력 타입 동일(RawRecord[]).

csvFiles 옵션이 비어있으면 API만 실행 → fetch.ts CLI 호환.
csvFiles 옵션이 있으면 CSV도 로드 → import-csv.ts CLI 호환.

### D-7. FetchOptions — 회차별 유연성

```typescript
export interface FetchOptions {
  /** 수집 대상 — 생략 시 전체 */
  targets?: ("places" | "ingredients" | "products")[];
  /** 카카오 검색 쿼리 목록 */
  placeQueries?: { query: string; options?: SearchOptions }[];
  /** Channel B CSV 파일 */
  csvFiles?: { path: string; entityType: EntityType }[];
  /** Web scraper 사이트 설정 오버라이드 */
  siteConfigs?: SiteConfig[];
  /** 결과 JSON 로그 경로 */
  logDir?: string;
}
```

### D-8. Promise.allSettled — 에러 격리

data-collection.md §7.0 L671:
> S1 실패해도 S7 독립 실행. Promise.allSettled 사용.

그룹별 Promise.allSettled:
- places 그룹: kakaoLocalProvider.search() 호출들
- ingredients 그룹: fetchAllMfdsIngredients() + loadCosIngIngredients() + fetchAllMfdsRestricted()
- products 그룹: scrapeProducts()
- csv 그룹: loadCsvAsRawRecords() 호출들

실패 프로바이더 → PipelineError 기록 + 스킵. 성공 프로바이더 결과만 합산.

### D-9. 결과 로그

loader.ts 패턴과 동일. `docs/data-logs/fetch-{timestamp}.json`.

---

## 의존성

```
scripts/seed/lib/
  place-mapper.ts  → types.ts (RawPlace, RawRecord, EntityType)
  fetch-service.ts → types.ts, config.ts
                   → providers/kakao-local.ts (kakaoLocalProvider)
                   → providers/mfds-ingredient.ts (fetchAllMfdsIngredients)
                   → providers/mfds-restricted.ts (fetchAllMfdsRestricted)
                   → providers/cosing-csv.ts (loadCosIngIngredients)
                   → providers/web-scraper.ts (scrapeProducts)
                   → providers/csv-loader.ts (loadCsvAsRawRecords)
                   → place-mapper.ts (classifyPlace, mapPlaceToRawRecord, deduplicatePlaces)

역방향: 없음. server/, client/, core/ import: 없음.
```

---

## 규칙 준수 체크리스트

| 규칙 | 준수 | 근거 |
|------|------|------|
| P-1 (4계층 DAG) | ✅ | scripts/ → scripts/ 내부 + shared/ |
| P-2 (core 불변) | ✅ | core/ 수정 0건 |
| P-4 (Composition Root) | ✅ | fetch-service가 조합 루트. 프로바이더 직접 호출 |
| P-7 (단일 변경점) | ✅ | 새 프로바이더 = 2파일 (신규 + fetch-service 1줄) |
| P-8 (순환 의존 금지) | ✅ | 단방향만 |
| P-9 (scripts/ → shared/) | ✅ | server/ import 없음 |
| P-10 (제거 안전성) | ✅ | 삭제해도 빌드 에러 0 |
| G-2 (중복 금지) | ✅ | 기존 프로바이더 재사용 |
| G-3 (패스스루 래퍼 금지) | ✅ | 직접 호출, 인터페이스 래핑 없음 |
| G-5 (기존 패턴) | ✅ | loader.ts의 options 패턴 동일 |
| G-8 (any 금지) | ✅ | Record<string, unknown> |
| G-9 (export 최소화) | ✅ | fetchAllRecords + FetchOptions만 |
| G-10 (매직 넘버 금지) | ✅ | 50m 근사값 상수 선언 |
| Q-6 (함수≤40줄) | ✅ | 그룹별 헬퍼 분리 |
| Q-8 (env 모듈 경유) | ✅ | pipelineEnv |
| L-14 (모듈 전용 타입) | ✅ | FetchOptions = scripts/seed/lib/ 내부 |
| N-2 (kebab-case) | ✅ | fetch-service.ts, place-mapper.ts |

---

## 변경 파일 목록

### 신규 생성 (4개)

| 파일 | 목적 | 줄 수 (추정) |
|------|------|-------------|
| `scripts/seed/lib/place-mapper.ts` | classifyPlace + RawPlace→RawRecord + 4단계 dedup | ~90 |
| `scripts/seed/lib/place-mapper.test.ts` | place-mapper 단위 테스트 | ~180 |
| `scripts/seed/lib/fetch-service.ts` | Stage 1 오케스트레이션 | ~180 |
| `scripts/seed/lib/fetch-service.test.ts` | fetch-service 단위 테스트 | ~250 |

### 기존 파일 수정 (0개)

- 프로바이더 7개: 수정 없음
- types.ts: 수정 없음
- config.ts: 수정 없음

---

## 테스트 전략

### place-mapper.test.ts

1. classifyPlace: 피부과 → clinic, 올리브영 → store, 모호한 이름 → store(기본값)
2. classifyPlace: 대소문자 무관 (OLIVE YOUNG = olive young)
3. mapPlaceToRawRecord: RawPlace → RawRecord 변환 (entityType = classifyPlace 결과)
4. mapPlaceToRawRecord: source="kakao", sourceId 보존
5. deduplicatePlaces: sourceId 동일 → 1건
6. deduplicatePlaces: placeUrl 동일 → 1건
7. deduplicatePlaces: 이름 동일 + 좌표 50m 이내 → 1건
8. deduplicatePlaces: 이름 동일 + 주소 정규화 일치 → 1건
9. deduplicatePlaces: 좌표 100m 이상 → 별개
10. deduplicatePlaces: 빈 배열 → 빈 결과

### fetch-service.test.ts

모든 프로바이더 mock (vi.mock). 실제 API 호출 0건.

1. places 수집: kakaoLocalProvider.search mock → RawRecord[] 반환 (classifyPlace 적용)
2. ingredients 수집: S3+S6+S4 mock → 합병된 RawRecord[]
3. products 수집: scrapeProducts mock → RawRecord[]
4. CSV 수집: loadCsvAsRawRecords mock → RawRecord[]
5. Promise.allSettled: 1개 프로바이더 에러 → 나머지 정상 반환 + PipelineError 기록
6. targets 필터: "ingredients"만 → places/products 미호출
7. 빈 옵션 → 전체 수집 시도
8. placeQueries 미지정 → places 스킵
9. S3↔S6 합병: INGR_ENG_NAME 매칭 검증
10. S3↔S4 합병: 안전성 필드 보강 검증
11. 결과 로그 JSON 저장 검증
12. isAvailable() false → 해당 프로바이더 스킵

---

## 구현 순서

1. `place-mapper.ts` + 테스트
2. `fetch-service.ts` + 테스트
3. 전체 테스트 실행 + tsc --noEmit
