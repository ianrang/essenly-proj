# P2-56m: AI 설명 생성 모듈 (description-generator.ts)

## Context

Stage 2 Enrichment의 세 번째(마지막) AI 모듈. 엔티티의 description, review_summary 등 자유 텍스트를 AI로 생성. ko + en 동시 생성.

**선행 완료**: P2-56k (translator + ai-client ✅), P2-56l (classifier ✅)

---

## 설계 결정 (전문가 리뷰 완료)

### D-1. GenerationFieldSpec — classifier의 FieldSpec과 분리

분류는 이산 허용값(allowedValues) 기반, 생성은 자유 텍스트. FieldSpec 재사용 시 allowedValues가 미사용(G-4 위반). 따라서 생성 전용 인터페이스 정의.

```typescript
export interface GenerationFieldSpec {
  fieldName: string;      // "description" | "review_summary"
  promptHint: string;     // 생성 지시 문맥
  maxLength?: number;     // 출력 길이 가이드 (선택)
}
```

### D-2. 출력 형식 — { ko: string; en: string }

- description-generator는 번역기가 아님. 2개 언어를 동시 생성.
- LocalizedText 반환 시 ja/zh/es/fr undefined → "번역 실패"와 구분 불가.
- 좁은 타입으로 계약 명확화.
- 추가 4언어는 enrich-service(P2-56o)에서 translator 재호출.

### D-3. types.ts 수정 안 함

EnrichmentMetadata에 generatedFields 부재. 현재 읽는 코드 0건. P2-56o에서 추가.

### D-4. review_summary는 products 전용

schema.dbml: products.review_summary 존재, treatments/stores/clinics에 없음. generator는 범용. enrich-service가 entityType별로 fieldSpecs 결정.

### D-5. "AI 생성" 면책 — UI 렌더링 책임

schema.dbml note: "AI-generated summary". 텍스트에 면책 문구 삽입 안 함.

---

## 파일 목록

### 신규 (2개)

| 파일 | 역할 |
|------|------|
| `scripts/seed/lib/enrichment/description-generator.ts` | AI 설명 생성 모듈 |
| `scripts/seed/lib/enrichment/description-generator.test.ts` | 단위 테스트 |

### 수정 (0개)

---

## 코드 구조

```typescript
// scripts/seed/lib/enrichment/description-generator.ts

import { generateText } from "ai";
import { getPipelineModel } from "./ai-client";

// ── 타입 ──
export interface GenerationFieldSpec { fieldName; promptHint; maxLength? }

interface GeneratedText { ko: string; en: string }

export interface GenerateResult {
  generated: Record<string, GeneratedText>;
  generatedFields: string[];
}

type GenerateInputData = Record<string, string | string[] | number | null | undefined>;

// ── 프롬프트 ──
function serializeInputData(inputData): string { ... }
function buildGenerationPrompt(inputData, fieldSpecs): string { ... }

// ── 파싱 ──
function parseGenerationResponse(text, fieldSpecs): Record<string, GeneratedText> | null { ... }

// ── 폴백 ──
function buildEmptyResult(fieldSpecs): GenerateResult { ... }

// ── 메인 ──
export async function generateDescriptions(inputData, fieldSpecs): Promise<GenerateResult> { ... }
```

---

## 의존 방향

```
description-generator.ts → ai-client.ts  (getPipelineModel)
                         → ai            (generateText)

enrich-service (P2-56o) → description-generator.ts
```

역방향 없음. 순환 없음. server/ import 없음. shared/constants import 없음. shared/types import 없음 (GeneratedText는 { ko, en } 자체 정의).

---

## 에러 처리

- AI 호출 실패 → 빈 결과 (ko: "", en: "")
- JSON 파싱 실패 → 빈 결과
- 응답에 필드 누락 → 해당 필드만 빈 결과
- ko 또는 en 누락 → 빈 문자열 폴백
- fieldSpecs 비어있음 → 빈 결과 즉시 반환

---

## 테스트 계획

| # | 테스트 | 분기 |
|---|--------|------|
| 1 | 정상 생성 — 단일 필드 (description) | happy path |
| 2 | 정상 생성 — 복수 필드 (description + review_summary) | 복수 필드 |
| 3 | 빈 fieldSpecs → 빈 결과, AI 호출 없음 | early return |
| 4 | AI 호출 실패 → 빈 결과 | catch |
| 5 | AI 응답 브레이스 없음 → 빈 결과 (jsonMatch null) | parseResponse null 경로 1 |
| 6 | 유효하지 않은 JSON → 빈 결과 (JSON.parse catch) | parseResponse null 경로 2 |
| 7 | AI 응답에 일부 필드 누락 → 해당 필드만 빈 결과 | 부분 성공 |
| 8 | ko 누락 → 빈 문자열 폴백 | 필드 내 부분 누락 |
| 9 | en 누락 → 빈 문자열 폴백 | 필드 내 부분 누락 |
| 10 | 마크다운 코드 펜스 → 정상 파싱 | regex 추출 |
| 11 | promptHint가 프롬프트에 포함 검증 | 프롬프트 검증 |
| 12 | maxLength가 프롬프트에 포함 검증 | 프롬프트 검증 |
| 13 | inputData 직렬화 — 문자열/배열/숫자/null 처리 | serializeInputData |
| 14 | ko/en 값이 비문자열 → 빈 문자열 폴백 | 타입 방어 |
