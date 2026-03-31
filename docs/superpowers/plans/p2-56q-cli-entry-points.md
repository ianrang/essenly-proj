# P2-56q: CLI 진입점 (8개 + 레거시 삭제)

## Context

scripts/seed/lib/의 서비스 함수들을 터미널에서 실행할 수 있는 CLI 명령어로 연결하는 thin layer. 파이프라인의 최종 통합.

**선행 완료**: P2-56n (fetch-service ✅), P2-56o (enrich-service ✅), P2-56o2 (review-exporter ✅), P2-56p (loader ✅), P2-56b (config ✅)

---

## 설계 결정

### D-1. CLI = thin layer (L-1, P-9)

각 CLI 파일의 책임:
1. process.argv 인자 파싱
2. (필요 시) JSON 파일 읽기
3. lib/ 서비스 함수 호출
4. (필요 시) JSON 파일 쓰기
5. 콘솔 결과 출력

비즈니스 로직 0. 인자 변환 + I/O 조합만.

### D-2. 공통 인자 파싱 헬퍼

```typescript
/** process.argv에서 --key=value 추출 */
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? "true";
  }
  return args;
}
```

각 CLI 내부에 인라인. 외부 라이브러리 없음 (Q-9). 10줄 미만.

### D-3. Stage 간 데이터 전달 — JSON 파일

개별 CLI 실행 시 Stage 간 데이터를 JSON 파일로 전달:

```
fetch.ts --output ./data/raw.json
  → raw.json (RawRecord[])

enrich.ts --input ./data/raw.json --output ./data/enriched.json
  → enriched.json (EnrichedRecord[])

export-review.ts --input ./data/enriched.json --output-dir ./review/
  → review/ 디렉토리에 엔티티별 JSON+CSV 쌍

import-review.ts --enriched ./review/enriched-product-*.json --reviewed ./review/review-product-*.csv
  → validated.json (ValidatedRecord[])

validate.ts --input ./data/validated.json
  → 콘솔 검증 결과

load.ts --input ./data/validated.json
  → DB UPSERT
```

run-all.ts는 인메모리 직접 연결 (파일 중간 저장 불필요).

### D-4. validate.ts — DB 없이 독립 검증

loader.ts의 loadRecords는 SupabaseClient 필수. validate.ts는 DB 없이 zod 스키마만으로 검증:

```typescript
// validate.ts — @/shared/validation 스키마 직접 사용
import { productCreateSchema, ... } from "@/shared/validation";

// ValidatedRecord[].data를 엔티티별 스키마로 safeParse
// → 통과/실패 건수 + 에러 상세 출력
```

loader.ts 내부 validateRecords와 로직이 유사하나:
- loader는 DB 적재 전 내부 검증 (private 함수)
- validate.ts는 독립 CLI 검증 (DB 불필요)
- 두 곳 모두 `@/shared/validation` 스키마를 사용하므로 검증 기준은 동일
- validate.ts가 loader.ts를 import하지 않음 → 순환 의존 없음

### D-5. run-all.ts — 두 모드

```
기본 모드 (검수 대기):
  $ npx tsx scripts/seed/run-all.ts
  → Stage 1(fetch) → 2(enrich) → 3(export) → 중단 + 안내 메시지

자동 모드 (전체 자동):
  $ npx tsx scripts/seed/run-all.ts --auto-approve
  → Stage 1(fetch) → 2(enrich) → (자동 승인) → 4(validate+load)
```

자동 승인: EnrichedRecord → ValidatedRecord 직접 변환 (isApproved=true, reviewedBy="auto-pipeline").

### D-6. 레거시 삭제

`run.ts` + `interface.ts` 삭제:
- run.ts: SeedRecord/DataSource 기반 레거시. lib/ 파이프라인과 무관
- interface.ts: run.ts만 참조. lib/ 내 역참조 0건
- P-10 검증 완료: 삭제해도 빌드 에러 0건

---

## CLI 8개 상세

### 1. fetch.ts (Stage 1)

```
$ npx tsx scripts/seed/fetch.ts [--targets places,ingredients,products] [--output ./data/raw.json]
```

- lib/ 호출: `fetchAllRecords(options)`
- 인자 → FetchOptions 매핑: --targets → targets 배열
- 출력: JSON 파일 + 콘솔 요약

### 2. import-csv.ts (Stage 1)

```
$ npx tsx scripts/seed/import-csv.ts --file ./data/products.csv --entity-type product [--output ./data/raw-csv.json]
```

- lib/ 호출: `loadCsvAsRawRecords(filePath, entityType)`
- 출력: JSON 파일 + 콘솔 요약

### 3. enrich.ts (Stage 2)

```
$ npx tsx scripts/seed/enrich.ts --input ./data/raw.json [--output ./data/enriched.json] [--skip-translation] [--entity-types product,ingredient]
```

- lib/ 호출: `enrichRecords(records, options)`
- 입력: JSON 파일(RawRecord[])
- 출력: JSON 파일(EnrichedRecord[]) + 콘솔 요약

### 4. export-review.ts (Stage 3)

```
$ npx tsx scripts/seed/export-review.ts --input ./data/enriched.json [--output-dir ./review/] [--entity-types product]
```

- lib/ 호출: `exportForReview(records, options)`
- 입력: JSON 파일(EnrichedRecord[])
- 출력: 엔티티별 JSON+CSV 쌍

### 5. import-review.ts (Stage 3)

```
$ npx tsx scripts/seed/import-review.ts --enriched ./review/enriched-product-*.json --reviewed ./review/review-product-*.csv [--output ./data/validated.json]
```

- lib/ 호출: `importReviewed(enrichedPath, reviewedCsvPath, options)`
- 출력: JSON 파일(ValidatedRecord[]) + 콘솔 요약

### 6. validate.ts (Stage 4 — DB 불필요)

```
$ npx tsx scripts/seed/validate.ts --input ./data/validated.json
```

- `@/shared/validation` 스키마로 직접 safeParse
- 출력: 콘솔 (통과/실패 건수 + 에러 상세)

### 7. load.ts (Stage 4 — DB 필수)

```
$ npx tsx scripts/seed/load.ts --input ./data/validated.json [--dry-run] [--batch-size 50] [--entity-types product,brand]
```

- lib/ 호출: `createPipelineClient()` + `loadRecords(client, records, options)`
- 입력: JSON 파일(ValidatedRecord[])
- 출력: DB UPSERT + 콘솔 요약

### 8. run-all.ts (전체 파이프라인)

```
# 검수 모드 (기본)
$ npx tsx scripts/seed/run-all.ts [--output-dir ./review/]

# 자동 모드
$ npx tsx scripts/seed/run-all.ts --auto-approve [--dry-run]
```

- 기본: fetch → enrich → export-review → 중단 + 안내
- --auto-approve: fetch → enrich → validate → load

---

## 의존성

```
scripts/seed/
  fetch.ts          → lib/fetch-service.ts
  import-csv.ts     → lib/providers/csv-loader.ts
  enrich.ts         → lib/enrich-service.ts
  export-review.ts  → lib/review-exporter.ts (exportForReview)
  import-review.ts  → lib/review-exporter.ts (importReviewed)
  validate.ts       → @/shared/validation (zod 스키마), lib/types.ts
  load.ts           → lib/loader.ts, lib/db-client.ts
  run-all.ts        → lib/fetch-service, enrich-service, review-exporter, loader, db-client

역방향: 없음. lib/ → scripts/seed/*.ts 참조 없음.
```

---

## 규칙 준수 체크리스트

| 규칙 | 준수 | 근거 |
|------|------|------|
| P-1 (4계층 DAG) | ✅ | scripts/ → lib/, shared/validation |
| P-2 (core 불변) | ✅ | core/ 수정 0건 |
| P-4/P-9 (Composition Root) | ✅ | CLI가 lib/ 함수 조합 호출 |
| P-7 (단일 변경점) | ✅ | 새 Stage 추가 = CLI 1개 + run-all 1단계 |
| P-8 (순환 금지) | ✅ | CLI → lib/ 단방향. lib/ → CLI 없음 |
| P-10 (제거 안전성) | ✅ | CLI 삭제해도 lib/ 빌드 에러 없음 |
| G-2 (중복 금지) | ✅ | parseArgs 공통 헬퍼. validate.ts는 shared/validation 스키마 재사용 |
| G-3 (패스스루 금지) | ✅ | 인자 파싱 + I/O + 콘솔 출력 = 부가 로직 |
| G-4 (미사용 금지) | ✅ | 레거시 run.ts + interface.ts 삭제 |
| G-8 (any 금지) | ✅ | Record<string, unknown> |
| G-9 (export 최소화) | ✅ | CLI는 export 없음 (진입점) |
| L-1 (thin handler) | ✅ | 비즈니스 로직 0. 조합만 |
| Q-6 (함수≤40줄) | ✅ | main() 내 단순 순차 호출 |
| Q-7 (에러 불삼킴) | ✅ | try-catch + process.exit(1) |
| Q-8 (env 런타임 검증) | ✅ | config.ts의 pipelineEnv 경유 |
| N-2 (kebab-case) | ✅ | fetch.ts, import-csv.ts, export-review.ts 등 |

---

## 변경 파일 목록

### 신규 생성 (8개)

| 파일 | 목적 | 줄 수 (추정) |
|------|------|-------------|
| `scripts/seed/fetch.ts` | Stage 1 CLI | ~50 |
| `scripts/seed/import-csv.ts` | Stage 1 CSV CLI | ~45 |
| `scripts/seed/enrich.ts` | Stage 2 CLI | ~55 |
| `scripts/seed/export-review.ts` | Stage 3 export CLI | ~50 |
| `scripts/seed/import-review.ts` | Stage 3 import CLI | ~50 |
| `scripts/seed/validate.ts` | Stage 4 검증 CLI | ~70 |
| `scripts/seed/load.ts` | Stage 4 적재 CLI | ~55 |
| `scripts/seed/run-all.ts` | 전체 파이프라인 | ~90 |

### 삭제 (2개)

| 파일 | 이유 |
|------|------|
| `scripts/seed/run.ts` | 레거시 (SeedRecord 기반, lib/ 미사용) |
| `scripts/seed/interface.ts` | 레거시 (run.ts만 참조, 미사용 타입) |

### 기존 파일 수정 (0개)

lib/ 파일 수정 없음. shared/ 수정 없음.

---

## 테스트 전략

CLI는 thin layer이므로 단위 테스트 불필요 — lib/ 서비스 함수에 이미 506개 테스트 존재.

검증 방법:
1. `npx tsc --noEmit` — 타입 에러 0건
2. 레거시 삭제 후 빌드 에러 0건 확인
3. (선택) 각 CLI `--help` 또는 인자 없이 실행 → 사용법 출력 확인

---

## 구현 순서

1. 레거시 삭제 (run.ts + interface.ts)
2. CLI 8개 구현 (fetch → import-csv → enrich → export-review → import-review → validate → load → run-all)
3. tsc --noEmit
4. 전체 테스트 확인
