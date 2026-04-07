# P2-56f: 식약처 원료성분 프로바이더 (S3)

## Context

식약처 화장품 원료성분정보 API(S3)를 호출하여 ingredients 기본 레코드를 수집하는 프로바이더.
ingredients 3원 소스(S3→S6→S4) 중 **1순위 기본 소스**. 전체 풀 다운로드 → RawRecord[].

**선행 완료**: P2-V2 (API 실제 호출 검증 ✅), P2-56c (types.ts ✅)
**후속 의존**: P2-56g (S4 사용제한 — 체인 의존)

---

## 설계 결정

### D-1. 함수 export (PlaceProvider 미구현)

PlaceProvider는 키워드 검색 + 장소 데이터(RawPlace) 전용.
S3는 전체 풀 다운로드 + ingredients(RawRecord) → 시그니처 불일치.
fetch-service는 Promise.allSettled로 개별 함수 호출 → 공통 인터페이스 불필요 (G-4).

### D-2. sourceId = INGR_KOR_NAME

S3 API에 고유 ID 필드 없음. 후보 평가:
- INGR_KOR_NAME: 유니크, NULL 없음, S4 매칭 키(INGR_STD_NAME) 호환 → **채택**
- INGR_ENG_NAME: NULL 가능 → 부적합
- CAS_NO: 대부분 NULL (P2-V2) → 부적합

### D-3. 전체 풀 다운로드 전략

설계 문서 확정: "전체 풀 다운로드(~22K건, 페이지네이션) → 로컬 검색이 실용적"
- INGR_ENG_NAME 파라미터 필터 미작동 (P2-V2)
- 프로바이더는 페이지네이션 끝까지 요청
- 일일 한도(10,000건) 초과 시 API 에러 → 그때까지의 결과 반환 (graceful)

### D-4. 응답 타입 — inline assertion (kakao-local 패턴)

공공데이터포털 응답 wrapper를 프로바이더 내부에서 inline 타입 처리.
S4/S5도 동일 구조이므로, 3개 모두 구현 후 공통 타입 추출 여부를 판단 (G-4).

### D-5. config.ts 수정 없음

MFDS_SERVICE_KEY 이미 정의 (optional). 추가 환경변수 불필요.

---

## API 사양 (P2-V2 검증 완료)

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `GET https://apis.data.go.kr/1471000/CsmtcsIngdCpntInfoService01/getCsmtcsIngdCpntInfoService01` |
| 인증 | `serviceKey` 쿼리 파라미터 (URL 인코딩) |
| 페이지네이션 | `pageNo` (1부터), `numOfRows` (페이지 크기), `type=json` |
| 종료 조건 | `body.totalCount` 기반 — 수집 건수 ≥ totalCount면 종료 |
| 응답 필드 | INGR_KOR_NAME, INGR_ENG_NAME, CAS_NO, ORIGIN_MAJOR_KOR_NAME, INGR_SYNONYM |

### 공공데이터포털 표준 JSON 응답 구조

```typescript
{
  header: { resultCode: string; resultMsg: string };
  body: {
    numOfRows: number;
    pageNo: number;
    totalCount: number;
    items: Array<Record<string, unknown>>;  // 또는 items: { item: [...] }
  };
}
```

---

## 파일 목록

### 신규 생성 (2개)

| 파일 | 역할 |
|------|------|
| `scripts/seed/lib/providers/mfds-ingredient.ts` | S3 프로바이더 |
| `scripts/seed/lib/providers/mfds-ingredient.test.ts` | 단위 테스트 |

### 수정 없음

| 파일 | 이유 |
|------|------|
| config.ts | MFDS_SERVICE_KEY 이미 정의 |
| types.ts | RawRecord 그대로 사용 |
| retry.ts | fetchWithRetry 그대로 사용 |
| kakao-local.ts, csv-loader.ts | 독립 모듈 |

---

## 코드 구조

### mfds-ingredient.ts

```typescript
// scripts/seed/lib/providers/mfds-ingredient.ts
// 식약처 화장품 원료성분정보 API (S3) — data-collection.md §3.4
// P-9: scripts/ 내부만. server/ import 금지.
// Q-8: pipelineEnv 경유.

import { pipelineEnv } from "../../config";
import { fetchWithRetry } from "../retry";
import type { RawRecord } from "../types";

// ── 상수 ──────────────────────────────────────────────────

/** 페이지당 요청 건수 (공공데이터포털 표준 최대) */
const PAGE_SIZE = 100;

/** S3 엔드포인트 (P2-V2 검증 완료) */
const MFDS_INGREDIENT_ENDPOINT =
  "https://apis.data.go.kr/1471000/CsmtcsIngdCpntInfoService01/getCsmtcsIngdCpntInfoService01";

// ── API 응답 → RawRecord 변환 ─────────────────────────────

/** S3 API item 1건을 RawRecord로 변환 */
export function mapItemToRawRecord(
  item: Record<string, unknown>,
): RawRecord {
  return {
    source: "mfds-ingredient",
    sourceId: String(item.INGR_KOR_NAME ?? ""),
    entityType: "ingredient",
    data: item,
    fetchedAt: new Date().toISOString(),
  };
}

// ── 전체 풀 다운로드 ──────────────────────────────────────

/** S3 전체 원료성분 다운로드 → RawRecord[] */
export async function fetchAllMfdsIngredients(): Promise<RawRecord[]> {
  const serviceKey = pipelineEnv.MFDS_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("MFDS_SERVICE_KEY is not configured");
  }

  const seen = new Map<string, RawRecord>();

  for (let pageNo = 1; ; pageNo++) {
    const params = new URLSearchParams({
      serviceKey,
      type: "json",
      numOfRows: String(PAGE_SIZE),
      pageNo: String(pageNo),
    });

    const response = await fetchWithRetry(
      `${MFDS_INGREDIENT_ENDPOINT}?${params}`,
      {},
    );

    if (!response.ok) {
      throw new Error(
        `MFDS S3 API error ${response.status}: ${await response.text()}`,
      );
    }

    const data: unknown = await response.json();
    const body = (data as Record<string, unknown>).body as {
      totalCount?: number;
      items?: unknown;
    } | undefined;

    // items 구조: { item: [...] } 또는 직접 배열
    const rawItems = body?.items;
    const items: Record<string, unknown>[] = Array.isArray(rawItems)
      ? rawItems
      : Array.isArray((rawItems as Record<string, unknown>)?.item)
        ? (rawItems as Record<string, unknown>).item as Record<string, unknown>[]
        : [];

    for (const item of items) {
      const record = mapItemToRawRecord(item);
      if (record.sourceId && !seen.has(record.sourceId)) {
        seen.set(record.sourceId, record);
      }
    }

    // 종료 조건: totalCount 도달 또는 빈 페이지
    const totalCount = body?.totalCount ?? 0;
    if (items.length === 0 || seen.size >= totalCount) {
      break;
    }
  }

  return [...seen.values()];
}
```

### 설계 포인트

1. **mapItemToRawRecord export**: 단위 테스트 가능 + kakao-local 패턴 일관
2. **sourceId dedup**: `Map<string, RawRecord>` — kakao-local과 동일 패턴
3. **items 구조 방어**: 공공데이터포털 JSON은 `items: { item: [...] }` 또는 `items: [...]` 두 형태 가능
4. **fetchedAt per record**: 각 item마다 타임스탬프 (페이지네이션이 시간에 걸쳐 실행)
5. **graceful 종료**: items 빈 배열 또는 totalCount 도달 시 종료

---

## 의존 방향 검증

```
mfds-ingredient.ts
  → config.ts      (pipelineEnv — Q-8)
  → retry.ts       (fetchWithRetry — P-7)
  → types.ts       (RawRecord — type import)
```

kakao-local.ts와 동일 의존 구조. 역방향·순환 없음.

---

## 규칙 준수 매트릭스

| 규칙 | 적용 |
|------|------|
| P-5 | CLI → fetchAllMfdsIngredients → fetchWithRetry → fetch. **3단계** |
| P-7 | retry.ts 공유 (재시도 정책 단일 변경점) |
| P-8 | 단방향: mfds-ingredient → retry, config, types. 순환 없음 |
| P-9 | scripts/ 내부. server/ import 없음 |
| P-10 | 삭제해도 core/, features/ 빌드 에러 없음 |
| G-3 | API 응답 → RawRecord 변환 (패스스루 아님) |
| G-4 | 공통 data.go.kr 타입은 S4/S5 후 판단 |
| G-5 | kakao-local 패턴 (export 매핑함수 + 메인함수, dedup Map, fetchWithRetry) |
| G-8 | any 없음. unknown + assertion |
| G-9 | export 2개: mapItemToRawRecord, fetchAllMfdsIngredients |
| G-10 | PAGE_SIZE, MFDS_INGREDIENT_ENDPOINT 상수 |
| L-14 | scripts/seed/lib/providers/ |
| N-2 | mfds-ingredient.ts (kebab-case) |
| Q-8 | pipelineEnv.MFDS_SERVICE_KEY |

---

## 테스트 계획

### mfds-ingredient.test.ts

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | mapItemToRawRecord 정상 변환 | source, sourceId, entityType, data, fetchedAt |
| 2 | sourceId — INGR_KOR_NAME 매핑 | 한글 성분명 → sourceId |
| 3 | INGR_KOR_NAME 없으면 빈 문자열 | 폴백 |
| 4 | data에 원본 전체 보존 | item 참조 동등 |
| 5 | fetchedAt ISO 8601 형식 | 정규식 검증 |
| 6 | fetchAllMfdsIngredients — MFDS_SERVICE_KEY 있으면 호출 가능 | isAvailable 대응 |
| 7 | fetchAllMfdsIngredients — 키 없으면 에러 | 설정 누락 방어 |
| 8 | 페이지네이션 — totalCount 도달 시 종료 | 다수 페이지 mock |
| 9 | sourceId dedup | 동일 INGR_KOR_NAME 중복 제거 |
| 10 | API 에러 시 throw | response.ok false |

---

## 검증 체크리스트

```
□ V-1  의존성 DAG 위반 없음
□ V-2  core/ 수정 없음
□ V-9  기존 코드와 중복 없음
□ V-10 미사용 export 없음
□ V-12 any 타입 없음
□ V-17 제거 안전성: 삭제해도 빌드 에러 없음
□ V-18 scripts/ 의존 방향 준수
□ 테스트 전체 통과
□ npx tsc --noEmit scripts/ 에러 0건
```
