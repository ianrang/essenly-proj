# P2-56o: enrich-service (Stage 2 오케스트레이션)

## Context

RawRecord[] (Stage 1)를 받아 엔티티 타입별로 번역+분류(confidence)+생성을 수행하여 EnrichedRecord[]를 반환하는 Stage 2 오케스트레이터. 건별 try-catch로 에러 격리. deterministic UUID 생성.

**선행 완료**: P2-56k (translator ✅), P2-56l (classifier ✅), P2-56m (description-generator ✅), P2-56r (PoC ✅)

---

## 설계 결정

### D-1. ENRICHMENT_CONFIG — 엔티티별 보강 설정 매핑

7개 entityType별 번역/분류/생성 대상이 다름 (data-collection.md §6.3).
caller-decides-scope 패턴을 enrich-service가 수행:

```typescript
const ENRICHMENT_CONFIG: Record<EntityType, {
  translateKeys: Record<string, string>;     // 출력필드명 → data에서 ko 텍스트 추출 경로
  classifySpecs: FieldSpec[];                // classifier 입력
  generateSpecs: GenerationFieldSpec[];      // description-generator 입력
}>
```

| entityType | translateKeys | classifySpecs | generateSpecs |
|-----------|--------------|-------------|--------------|
| product | name, description | skin_types + concerns | description + review_summary |
| store | name, description | — | description |
| clinic | name, description | — | description |
| treatment | name, description | target_concerns + suitable_skin_types | description |
| brand | name | — | — |
| ingredient | name | caution_skin_types | — |
| doctor | name | — | — |

- shared/constants의 SKIN_TYPES, SKIN_CONCERNS import하여 FieldSpec.allowedValues 전달
- P-7: 보강 범위 변경 = ENRICHMENT_CONFIG 1곳 수정
- G-10: 매직 문자열 없음 — 상수에서 import

### D-2. deterministic UUID — enrichRecord 내부에서 생성

P2-56p 설계(D-2): "enrich-service에서 data.id에 삽입. loader는 data.id 존재 가정."

```typescript
const id = generateEntityId(record.entityType, record.source, record.sourceId);
enrichedData.id = id;
```

번역/분류/생성 전에 세팅 → AI 실패해도 id 유지.

### D-3. 오케스트레이션 순서 — 5단계

1. data.id 생성 (deterministic UUID)
2. 기존 텍스트 번역 (ko → 6언어)
3. 분류 (skin_types, concerns + confidence)
4. description/review_summary 생성 (ko+en)
5. 생성된 en 텍스트를 4언어로 재번역 (ja/zh/es/fr)

description-generator.ts L4: "추가 언어는 enrich-service에서 translator 재호출."

### D-4. 텍스트 추출 — entityType별 extractFields

프로바이더별 data 구조가 다름:
- place-mapper: `data.name = { ko: "...", en: "" }`
- S3 merge: `data.INGR_KOR_NAME = "..."`
- csv/scraper: 다양

ENRICHMENT_CONFIG.translateKeys가 `{ 출력필드: data키 }` 매핑:
```typescript
product: { name: "name_ko", description: "description_ko" }
ingredient: { name: "INGR_KOR_NAME" }
store: { name: "name.ko" }
```

순수 함수 `extractTranslateFields(data, translateKeys)` → `Record<string, string>`

### D-5. 건별 try-catch — 에러 격리

data-collection.md §7.0 L672:
> "200건 중 1건 실패 시 해당 건만 스킵. 건별 try-catch."

```typescript
for (const record of records) {
  try {
    const enriched = await enrichRecord(record, config, options);
    results.push(enriched);
  } catch (err) {
    errors.push({ stage: "enrich", recordId: record.sourceId, message: ... });
  }
}
```

실패 건은 PipelineError 기록. 성공 건만 EnrichedRecord[]에 포함.

### D-6. 50% 임계치 — 자동 중단 없음

data-collection.md §7.0 L673: "50건 미만 성공 시 원인 조사 후 재실행"

이것은 운영 가이드라인. enrich-service는:
- 50% 미만이어도 계속 실행
- PipelineResult에 succeeded/failed 수치 기록
- CLI(P2-56q)에서 경고 출력

### D-7. EnrichOptions — 회차별 유연성

```typescript
export interface EnrichOptions {
  entityTypes?: EntityType[];
  targetLangs?: readonly string[];
  skipTranslation?: boolean;
  skipClassification?: boolean;
  skipGeneration?: boolean;
  logDir?: string;
}
```

loader LoadOptions, fetch-service FetchOptions 패턴과 동일.

### D-8. 결과 로그

loader/fetch-service 패턴 동일. `docs/data-logs/enrich-{timestamp}.json`.

---

## 의존성

```
scripts/seed/lib/
  enrich-service.ts → types.ts (RawRecord, EnrichedRecord, EnrichmentMetadata, PipelineError, PipelineResult)
                    → config.ts (pipelineEnv — 현재 직접 사용 없으나 미래 확장용 import 보류)
                    → id-generator.ts (generateEntityId)
                    → enrichment/translator.ts (translateFields, ALL_TARGET_LANGS)
                    → enrichment/classifier.ts (classifyFields, FieldSpec)
                    → enrichment/description-generator.ts (generateDescriptions, GenerationFieldSpec)
                    → @/shared/constants (SKIN_TYPES, SKIN_CONCERNS)

역방향: 없음. server/, client/, core/ import: 없음.
```

---

## 규칙 준수 체크리스트

| 규칙 | 준수 | 근거 |
|------|------|------|
| P-1 (4계층 DAG) | ✅ | scripts/ → shared/constants + scripts/ 내부 |
| P-2 (core 불변) | ✅ | core/ 수정 0건 |
| P-7 (단일 변경점) | ✅ | 보강 범위 변경 = ENRICHMENT_CONFIG 1곳 |
| P-8 (순환 금지) | ✅ | 단방향만 |
| P-9 (scripts/ → shared/) | ✅ | shared/constants import만 |
| P-10 (제거 안전성) | ✅ | 삭제해도 빌드 에러 0 |
| G-2 (중복 금지) | ✅ | 기존 3개 AI 모듈 + id-generator 재사용 |
| G-3 (패스스루 금지) | ✅ | 오케스트레이션 로직 추가 (순서, 재번역, 병합) |
| G-5 (기존 패턴) | ✅ | loader/fetch-service Options 패턴 |
| G-8 (any 금지) | ✅ | Record<string, unknown> |
| G-9 (export 최소화) | ✅ | enrichRecords + EnrichOptions만 |
| G-10 (매직넘버) | ✅ | shared/constants 상수 사용 |
| Q-6 (함수≤40줄) | ✅ | enrichRecord + 헬퍼 분리 |
| L-14 (모듈 전용) | ✅ | EnrichOptions, ENRICHMENT_CONFIG = scripts/seed/lib/ |
| N-2 (kebab-case) | ✅ | enrich-service.ts |

---

## 변경 파일 목록

### 신규 생성 (2개)

| 파일 | 목적 | 줄 수 (추정) |
|------|------|-------------|
| `scripts/seed/lib/enrich-service.ts` | Stage 2 오케스트레이션 | ~250 |
| `scripts/seed/lib/enrich-service.test.ts` | 단위 테스트 | ~350 |

### 기존 파일 수정 (0개)

---

## 테스트 전략

config, id-generator, translator, classifier, description-generator 전부 vi.mock.

1. product 전체 보강: 번역 + 분류(confidence) + 생성 + 재번역 → EnrichedRecord
2. doctor 최소 보강: 번역만 → classifySpecs=[], generateSpecs=[]
3. ingredient 보강: 번역 + caution_skin_types 분류
4. treatment 보강: 번역 + target_concerns/suitable_skin_types + description
5. 건별 try-catch: 3건 중 2번째 AI 에러 → 1,3번째 성공 + PipelineError 1건
6. entityTypes 필터: product만 → 나머지 스킵
7. skipTranslation: 번역 mock 미호출
8. skipClassification: 분류 mock 미호출
9. skipGeneration: 생성 mock 미호출
10. targetLangs 오버라이드: ["en"]만 → 재번역 없음
11. deterministic UUID: data.id = generateEntityId 결과 검증
12. EnrichmentMetadata: translatedFields, classifiedFields, confidence 정확 검증
13. 빈 레코드: [] → [] + PipelineResult.total=0
14. 생성 → 재번역: description en → translator(["ja","zh","es","fr"]) 호출 검증
15. 결과 JSON 로그 저장

---

## 구현 순서

1. `enrich-service.ts` 구현
2. `enrich-service.test.ts` 구현
3. 전체 테스트 + tsc --noEmit
