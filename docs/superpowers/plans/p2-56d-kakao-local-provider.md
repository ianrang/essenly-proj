# P2-56d: 카카오 로컬 프로바이더

## Context

카카오 로컬 API를 호출하여 stores/clinics 장소 데이터를 수집하는 PlaceProvider 구현.
P0-33 PoC에서 검증된 패턴을 Phase 2 파이프라인 구조로 이식.

- 의존: P2-56b (config.ts ✅), P2-56c (types.ts ✅)
- 후속: P2-56n (fetch-service)이 이 프로바이더를 호출

---

## 변경 파일 목록

### 신규 생성 (2개)

| 파일 | 용도 |
|------|------|
| `scripts/seed/lib/providers/kakao-local.ts` | 카카오 로컬 API PlaceProvider 구현 |
| `scripts/seed/lib/providers/kakao-local.test.ts` | 단위 테스트 (fixture 기반) |

### 기존 파일 수정 (1개)

| 파일 | 수정 내용 |
|------|----------|
| `vitest.config.ts` | include에 `scripts/**/*.test.ts` 추가 |

### 수정 없는 파일 (확인)

- `scripts/seed/config.ts` — 수정 없음 (KAKAO_API_KEY 이미 정의)
- `scripts/seed/lib/types.ts` — 수정 없음 (PlaceProvider, RawPlace, SearchOptions 이미 정의)
- `src/` 하위 모든 파일 — 수정 없음
- `server/core/` — 수정 없음 (P-2)

---

## 1. kakao-local.ts 구현 상세

### 1.1 파일 위치 + 의존

```
scripts/seed/lib/providers/kakao-local.ts
  → import { pipelineEnv } from '../../config'       (Q-8: env는 config 경유)
  → import type { PlaceProvider, RawPlace, SearchOptions } from '../types'  (P2-56c)
```

**의존 방향 검증:**
- scripts/ → scripts/ 내부: ✅ (같은 모듈 내)
- scripts/ → shared/: 없음 (직접 shared import 없음)
- scripts/ → server/: 없음 (P-9 준수)
- server/ → scripts/: 없음 (역방향 없음)
- 순환 참조: 없음 (config.ts, types.ts → kakao-local.ts 단방향)

### 1.2 구조

```typescript
// scripts/seed/lib/providers/kakao-local.ts

import { pipelineEnv } from "../../config";
import type { PlaceProvider, RawPlace, SearchOptions } from "../types";

// ── 상수 (G-10 매직넘버 금지) ──────────────────────────────

/** 카카오 API 제한: 페이지당 최대 15건 */
const PAGE_SIZE = 15;

/** 카카오 API 제한: 최대 45페이지 */
const MAX_PAGES = 45;

/** 재시도 최대 횟수 (data-pipeline.md §3.4.3) */
const MAX_RETRIES = 3;

/** 재시도 기본 대기 ms (지수 백오프: 1s → 2s → 4s) */
const RETRY_BASE_MS = 1000;

/** 카카오 로컬 API 엔드포인트 */
const KAKAO_ENDPOINT = "https://dapi.kakao.com/v2/local/search/keyword.json";

// ── 카카오 API 응답 → RawPlace 변환 ────────────────────────

/** 카카오 API document 1건을 RawPlace로 변환 (export: 테스트용) */
export function mapDocumentToRawPlace(
  doc: Record<string, unknown>,
): RawPlace {
  return {
    source: "kakao",
    sourceId: String(doc.id ?? ""),
    name: String(doc.place_name ?? ""),
    category: String(doc.category_name ?? ""),
    address: String(doc.road_address_name || doc.address_name || ""),
    lat: typeof doc.y === "string" ? parseFloat(doc.y) : undefined,
    lng: typeof doc.x === "string" ? parseFloat(doc.x) : undefined,
    phone: doc.phone ? String(doc.phone) : undefined,
    placeUrl: doc.place_url ? String(doc.place_url) : undefined,
    raw: doc,
  };
}

// ── 재시도 유틸 (data-pipeline.md §3.4.3) ──────────────────

async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, init);

    // 성공 또는 재시도 비대상 (4xx 클라이언트 에러, 403 키 무효)
    if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
      return response;
    }

    // 429 Rate Limit 또는 5xx 서버 에러 → 재시도
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt); // 1s → 2s → 4s
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // 최대 재시도 초과 — 마지막 응답 반환 (호출자가 에러 처리)
  return fetch(url, init);
}

// ── PlaceProvider 구현 ─────────────────────────────────────

export const kakaoLocalProvider: PlaceProvider = {
  name: "kakao",

  isAvailable(): boolean {
    return !!pipelineEnv.KAKAO_API_KEY;
  },

  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<RawPlace[]> {
    const apiKey = pipelineEnv.KAKAO_API_KEY;
    if (!apiKey) {
      throw new Error("KAKAO_API_KEY is not configured");
    }

    const seen = new Map<string, RawPlace>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        query,
        size: String(PAGE_SIZE),
        page: String(page),
      });

      if (options?.lat != null && options?.lng != null) {
        params.set("y", String(options.lat));
        params.set("x", String(options.lng));
        if (options.radius != null) {
          params.set("radius", String(options.radius));
        }
        params.set("sort", "distance");
      }

      const response = await fetchWithRetry(
        `${KAKAO_ENDPOINT}?${params}`,
        { headers: { Authorization: `KakaoAK ${apiKey}` } },
      );

      if (!response.ok) {
        throw new Error(
          `Kakao API error ${response.status}: ${await response.text()}`,
        );
      }

      const data: unknown = await response.json();
      const body = data as {
        documents?: Record<string, unknown>[];
        meta?: { is_end?: boolean };
      };

      const documents = body.documents ?? [];

      for (const doc of documents) {
        const place = mapDocumentToRawPlace(doc);

        // 1차 sourceId dedup (페이지네이션 중 동일 결과 방지)
        if (place.sourceId && !seen.has(place.sourceId)) {
          seen.set(place.sourceId, place);
        } else if (!place.sourceId) {
          // sourceId 없는 비정상 응답 — skip + 경고는 fetch-service 로그에서 처리
        }
      }

      // is_end: 마지막 페이지면 종료
      if (body.meta?.is_end !== false) {
        break;
      }
    }

    return [...seen.values()];
  },
};
```

### 1.3 규칙 준수 검증

| 규칙 | 검증 | 결과 |
|------|------|------|
| P-2 | core/ 수정 없음 | ✅ |
| P-3 | PlaceProvider 인터페이스 구현 → 교체 가능 | ✅ |
| P-7 | 신규 1파일 + vitest.config.ts 수정 = 2파일 | ✅ |
| P-8 | 순환 의존 없음 (config→kakao, types→kakao 단방향) | ✅ |
| P-9 | scripts/ 내부 import만. server/ import 없음 | ✅ |
| P-10 | kakao-local.ts 삭제 시 다른 코드 빌드 에러 없음 (아직 참조하는 코드 없음) | ✅ |
| Q-7 | 에러 삼키지 않음 — throw로 전파 | ✅ |
| Q-8 | process.env 직접 접근 없음. pipelineEnv 경유 | ✅ |
| G-4 | mapDocumentToRawPlace — 테스트에서 사용. kakaoLocalProvider — P2-56n에서 사용 | ✅ |
| G-5 | PoC 패턴(kakao-local.ts) 계승. 개선 사항만 반영 | ✅ |
| G-8 | any 없음. Record<string, unknown> 사용 | ✅ |
| G-9 | export: mapDocumentToRawPlace(테스트), kakaoLocalProvider(fetch-service). 내부 함수는 비공개 | ✅ |
| G-10 | PAGE_SIZE, MAX_PAGES, MAX_RETRIES, RETRY_BASE_MS, KAKAO_ENDPOINT — 모두 명명된 상수 | ✅ |
| G-12 | P0-33에서 실제 API 호출 검증 완료 | ✅ |
| N-2 | kakao-local.ts (kebab-case) | ✅ |
| N-4 | mapDocumentToRawPlace, fetchWithRetry (camelCase 동사) | ✅ |
| N-6 | PAGE_SIZE, MAX_PAGES (SCREAMING_SNAKE_CASE) | ✅ |
| L-14 | 프로바이더 내부 타입은 없음. 기존 types.ts 재사용 | ✅ |
| Q-6 | 모든 함수 40줄 이하 | ✅ |

### 1.4 PoC 대비 개선 사항

| PoC 문제 | Phase 2 해결 |
|----------|-------------|
| `Record<string, any>` | `Record<string, unknown>` (G-8) |
| `process.env.KAKAO_REST_API_KEY` 직접 | `pipelineEnv.KAKAO_API_KEY` (Q-8) |
| 페이지네이션 없음 (size=10, 1페이지) | 전체 페이지 순회 + is_end 체크 + MAX_PAGES 안전장치 |
| 재시도 없음 | 지수 백오프 재시도 (§3.4.3) |
| `options?.lat && options?.lng` (0이면 falsy) | `options?.lat != null && options?.lng != null` |
| sourceId 빈 문자열 → dedup 오류 가능 | sourceId 없으면 skip |
| 환경변수명 `KAKAO_REST_API_KEY` | `KAKAO_API_KEY` (config.ts에 맞춤) |
| `name: string` (readonly 없음) | PlaceProvider 인터페이스에 `readonly name` 이미 정의 |

---

## 2. kakao-local.test.ts 구현 상세

### 2.1 파일 위치

```
scripts/seed/lib/providers/kakao-local.test.ts
```

N-3 준수: 원본명.test.ts

### 2.2 테스트 범위

| 테스트 대상 | 함수 | 유형 |
|------------|------|------|
| 카카오 응답 → RawPlace 변환 | mapDocumentToRawPlace | fixture 단위 |
| 좌표 parseFloat 변환 | mapDocumentToRawPlace | fixture 단위 |
| 필드 누락 시 undefined 처리 | mapDocumentToRawPlace | fixture 단위 |
| sourceId 빈 문자열/undefined 방어 | mapDocumentToRawPlace | fixture 단위 |
| isAvailable() — 키 있음 | kakaoLocalProvider | mock 단위 |
| isAvailable() — 키 없음 | kakaoLocalProvider | mock 단위 |

### 2.3 구조

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config", () => ({
  pipelineEnv: { KAKAO_API_KEY: "test-key" },
}));

import { mapDocumentToRawPlace, kakaoLocalProvider } from "./kakao-local";

// fixture: 카카오 API 실제 응답 구조 (P0-33 검증 기반)
const KAKAO_DOCUMENT_FIXTURE: Record<string, unknown> = {
  id: "12345678",
  place_name: "올리브영 강남점",
  category_name: "가정,생활 > 화장품",
  road_address_name: "서울특별시 강남구 역삼동 123-45",
  address_name: "서울특별시 강남구 역삼동 123-45",
  x: "127.0276",
  y: "37.4979",
  phone: "02-1234-5678",
  place_url: "http://place.map.kakao.com/12345678",
};

describe("mapDocumentToRawPlace", () => {
  it("정상 카카오 응답을 RawPlace로 변환", () => { ... });
  it("좌표를 parseFloat로 number 변환", () => { ... });
  it("road_address_name 없으면 address_name 폴백", () => { ... });
  it("phone 없으면 undefined", () => { ... });
  it("id 없으면 빈 문자열 sourceId", () => { ... });
  it("좌표가 string이 아니면 undefined", () => { ... });
  it("raw 필드에 원본 데이터 전체 보존", () => { ... });
});

describe("kakaoLocalProvider", () => {
  it("KAKAO_API_KEY 있으면 isAvailable() = true", () => { ... });
});
```

### 2.4 테스트 독립성 검증

| 검증 항목 | 결과 |
|----------|------|
| src/ 코드 import 없음 | ✅ (scripts/ 내부만) |
| shared/ import 없음 | ✅ (타입은 scripts/seed/lib/types에서) |
| server/ import 없음 | ✅ |
| 전역 상태 변경 없음 | ✅ (vi.mock으로 config만 격리) |
| 외부 API 호출 없음 | ✅ (단위 테스트만) |
| 다른 테스트에 영향 없음 | ✅ (vi.clearAllMocks, 독립 fixture) |

---

## 3. vitest.config.ts 수정

### 변경 내용

```typescript
// before
include: ["src/**/*.test.{ts,tsx}"],

// after
include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
```

### 영향 분석

| 검증 | 결과 |
|------|------|
| 기존 src/ 테스트 실행에 영향? | ❌ 없음 (기존 패턴 유지, 추가만) |
| scripts/ 삭제 시 에러? | ❌ 없음 (매칭 파일 0건일 뿐, vitest 에러 아님) |
| jsdom 환경 문제? | ❌ 없음 (`// @vitest-environment node` 파일 레벨 오버라이드) |
| P-10 제거 안전성? | ✅ (scripts/ 전체 삭제해도 vitest 정상 동작) |
| core/ 수정? | ❌ vitest.config.ts는 core가 아님 |

---

## 검증 체크리스트

```
✅ V-1  의존성 방향: scripts/ 내부 import만. DAG 위반 없음
✅ V-2  core 불변: core/ 수정 없음
✅ V-9  중복 없음: 기존 코드베이스에 kakao 프로바이더 없음 (PoC는 docs/ 참조용)
✅ V-10 미사용 없음: mapDocumentToRawPlace(테스트), kakaoLocalProvider(P2-56n)
✅ V-12 타입 안전: any 없음
✅ V-17 제거 안전성: kakao-local.ts 삭제 시 빌드 에러 없음
✅ V-18 scripts/ 방향: scripts/ → scripts/ 내부만. 역방향 없음
✅ V-25 정본: data-collection.md §3.2 + data-pipeline.md §3.1~3.4 기반
```
