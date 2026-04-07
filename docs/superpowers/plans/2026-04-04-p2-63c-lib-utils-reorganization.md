# P2-63c: lib/ 유틸리티 서브디렉토리 정리 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans

**Goal:** scripts/seed/lib/ 루트의 유틸리티 4파일을 lib/utils/로 이동, import 경로 16건 수정.

**Architecture:** 로직 변경 0건. 파일 이동 + 경로 수정만. P2-61 classifiers/ 패턴과 동일.

---

## 이동 대상 (7파일)

| 파일 | 유형 |
|------|------|
| csv-parser.ts + csv-parser.test.ts | 순수 유틸 |
| retry.ts + retry.test.ts | 순수 유틸 |
| id-generator.ts + id-generator.test.ts | 순수 유틸 |
| db-client.ts | 순수 인프라 (테스트 없음) |

## 경로 수정 (16건/13파일)

| 파일 | 변경 대상 import | 수정 |
|------|-----------------|------|
| lib/review-exporter.ts:12 | `"./csv-parser"` | → `"./utils/csv-parser"` |
| lib/enrich-service.ts:26 | `"./id-generator"` | → `"./utils/id-generator"` |
| lib/loader.test.ts:62 | `"./id-generator"` | → `"./utils/id-generator"` |
| lib/providers/cosing-csv.ts:11 | `"../csv-parser"` | → `"../utils/csv-parser"` |
| lib/providers/cosing-csv.test.ts:17 | `"../csv-parser"` | → `"../utils/csv-parser"` |
| lib/providers/csv-loader.ts:8 | `"../csv-parser"` | → `"../utils/csv-parser"` |
| lib/providers/csv-loader.test.ts:9 | `"../csv-parser"` | → `"../utils/csv-parser"` |
| lib/providers/kakao-local.ts:8 | `"../retry"` | → `"../utils/retry"` |
| lib/providers/mfds-ingredient.ts:9 | `"../retry"` | → `"../utils/retry"` |
| lib/providers/mfds-ingredient.test.ts:17 | `"../retry"` | → `"../utils/retry"` |
| lib/providers/mfds-functional.ts:11 | `"../retry"` | → `"../utils/retry"` |
| lib/providers/mfds-functional.test.ts:17 | `"../retry"` | → `"../utils/retry"` |
| lib/providers/mfds-restricted.ts:11 | `"../retry"` | → `"../utils/retry"` |
| lib/providers/mfds-restricted.test.ts:17 | `"../retry"` | → `"../utils/retry"` |
| scripts/seed/load.ts:8 | `"./lib/db-client"` | → `"./lib/utils/db-client"` |
| scripts/seed/run-all.ts:13 | `"./lib/db-client"` | → `"./lib/utils/db-client"` |

## 실행 순서

1. mkdir lib/utils/
2. git mv 7파일
3. 16건 import 경로 수정
4. npx vitest run scripts/seed/lib/ → 296 pass 확인
5. npx tsc --noEmit | grep scripts/seed → 0건 확인
6. 커밋
