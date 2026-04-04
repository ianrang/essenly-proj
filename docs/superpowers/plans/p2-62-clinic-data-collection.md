# P2-62: Phase A — clinics 30+ (S1 자동수집)

> **정본**: schema.dbml (DB) > PRD.md (요구사항) > TDD.md (구현 방침) > 이 계획서
> **선행 완료**: P2-61 (stores 272건), P2-61b (수동 보완), P2-59 (큐레이션 30건)
> **목표**: 카카오 API → 분류 → AI 번역 → 검수 CSV → DB UPSERT. 30건+ 클리닉 적재.

---

## §1. 수정 범위 — 3건

### 1-1. 신규: `scripts/seed/lib/classifiers/clinic-type-classifier.ts`

**목적**: clinic_type 세부 분류 (dermatology / plastic_surgery / aesthetic / med_spa / null)

**설계**:

```typescript
// 인터페이스 — LLM 교체 가능 (G-11)
export interface ClinicTypeClassifier {
  classify(data: Record<string, unknown>): string | null;
}

// 정규식 규칙 — 순서 중요 (첫 매칭 우선)
const CLASSIFIER_RULES: ClassifierRule[] = [
  { type: "dermatology",     patterns: [/피부과/i, /dermatolog/i, /피부클리닉/i] },
  { type: "plastic_surgery", patterns: [/성형외과/i, /plastic/i] },
  { type: "med_spa",         patterns: [/메드스파/i, /med.?spa/i] },
  { type: "aesthetic",       patterns: [/에스테틱/i, /aesthetic/i, /피부관리/i, /skincare/i] },
];

// 폴백: null (CLINIC_TYPES에 "other" 없음 → "other" 반환 시 z.enum 검증 실패)
const FALLBACK_TYPE = null;
```

**규칙 준수 근거**:

| 규칙 | 준수 | 근거 |
|------|------|------|
| P-9 | ✅ | scripts/ 내부 import만. shared/ import 없음 (G-5: store 패턴 동일 — STORE_TYPES도 미import) |
| P-10 | ✅ | 삭제 시 enrich-service.ts 1파일만 영향 (scripts/ 내부). core/, features/, client/ 무영향 |
| P-7 | ✅ | 1파일 신규 생성 |
| P-8 | ✅ | 단방향만: enrich-service → classifier. 역참조 없음 |
| G-2 | ✅ | 기존 store-type-classifier와 동일 역할 없음 (store 분류 ≠ clinic 분류) |
| G-5 | ✅ | store-type-classifier.ts와 동일 구조: interface + ClassifierRule[] + class + default instance |
| G-8 | ✅ | `Record<string, unknown>` 사용. any 없음 |
| G-9 | ✅ | export: interface + class + default instance (3개만) |
| G-10 | ✅ | 정규식 상수화 (CLASSIFIER_RULES) |
| G-11 | ✅ | 인터페이스 분리 → LLM 교체 가능 |
| N-2 | ✅ | `clinic-type-classifier.ts` (kebab-case) |
| Q-14 | ✅ | 반환값 = CLINIC_TYPES 4값 + null. clinicCreateSchema `z.enum(CLINIC_TYPES).nullable().optional()` 통과 |

**store-type-classifier.ts와의 차이점 (정당한 차이)**:

| 항목 | store | clinic | 사유 |
|------|-------|--------|------|
| 반환 타입 | `string` | `string \| null` | STORE_TYPES에 `"other"` 포함, CLINIC_TYPES에 미포함 |
| 폴백값 | `"other"` | `null` | 위와 동일. Q-14 스키마 정합성 |
| 인터페이스 | `StoreTypeClassifier` | `ClinicTypeClassifier` | 독립 도메인 (G-11) |

**`classifyPlace` (place-mapper.ts)와의 역할 구분**:

| 분류기 | 단계 | 입력 | 출력 | 목적 |
|--------|------|------|------|------|
| `classifyPlace()` | Stage 1 fetch | `RawPlace` (카카오 원본) | `"store" \| "clinic"` | 1차 이진 분류 |
| `ClinicTypeClassifier` | Stage 2 enrich | `RawRecord.data` | `CLINIC_TYPES \| null` | 2차 세부 분류 |

→ 중복 아님. 단계·입력·출력 모두 상이.

---

### 1-2. 수정: `scripts/seed/lib/enrich-service.ts` — FIELD_MAPPINGS clinic 추가

**변경 위치**: 215-227행 `FIELD_MAPPINGS` 상수

**추가 내용**:
```typescript
clinic: {
  clinic_type: (data) => defaultClinicTypeClassifier.classify(data),
  district: (data) => extractDistrictFromAddress(data),
  english_support: (data) => data.english_support ?? "none",
},
```

**import 추가** (40행 근처):
```typescript
import { defaultClinicTypeClassifier } from "./classifiers/clinic-type-classifier";
```

**규칙 준수 근거**:

| 규칙 | 준수 | 근거 |
|------|------|------|
| P-7 | ✅ | enrich-service.ts 1파일 내 1곳(FIELD_MAPPINGS) + 1곳(import) 수정 |
| P-8 | ✅ | enrich-service → clinic-type-classifier 단방향. 역참조 없음 |
| G-2 | ✅ | `extractDistrictFromAddress()` (204행) 재사용. 신규 함수 생성 없음 |
| G-5 | ✅ | store 매핑과 동일 구조 `{ field: (data) => ... }` |
| Q-14 | ✅ | `clinic_type`, `district`, `english_support` → clinicCreateSchema 필드와 1:1 대응 |
| V-24 | ✅ | FIELD_MAPPINGS → `applyFieldMapping()` (229행)에서만 참조. clinic 키 추가로 기존 store/ingredient 동작 무영향 |

**`extractDistrictFromAddress()` clinic 호환성 확인**:
- place-mapper.ts:47-49 → clinic data.address = `{ ko: "서울 강남구 ..." }` 형태
- `extractDistrictFromAddress()` (208행) → `address?.ko` 추출 → 정규식 `([가-힣]+구)` 매칭 ✅

**`english_support` 중복 기본값**:
- FIELD_MAPPINGS: `data.english_support ?? "none"` → 카카오 데이터에 없으므로 항상 `"none"`
- clinicCreateSchema: `englishSupportEnum.default("none")` → zod default
- 양쪽 모두 `"none"` → 기능적 충돌 없음. store와 동일 패턴 (G-5)

---

### 1-3. 수정: `scripts/seed/lib/review-exporter.ts` — clinic 검수 컬럼 추가

**변경 위치**: 116-119행 `ENTITY_REVIEW_COLUMNS.clinic`

**현재**:
```typescript
clinic: [
  { header: "description_ko", source: "data", path: "description.ko", format: "string", editable: true },
  { header: "description_en", source: "data", path: "description.en", format: "string", editable: true },
],
```

**변경 후**:
```typescript
clinic: [
  { header: "clinic_type", source: "data", path: "clinic_type", format: "string", editable: true },
  { header: "district", source: "data", path: "district", format: "string", editable: true },
  { header: "address_ko", source: "data", path: "address.ko", format: "string", editable: false },
  { header: "phone", source: "data", path: "phone", format: "string", editable: false },
  { header: "english_support", source: "data", path: "english_support", format: "string", editable: true },
  { header: "description_ko", source: "data", path: "description.ko", format: "string", editable: true },
  { header: "description_en", source: "data", path: "description.en", format: "string", editable: true },
],
```

**컬럼별 검증**:

| 컬럼 | path | editable | clinicCreateSchema 대응 | import 시 동작 |
|------|------|----------|----------------------|---------------|
| clinic_type | `clinic_type` | true | `z.enum(CLINIC_TYPES).nullable().optional()` ✅ | `applyOverride` 1레벨 → 직접 대입 |
| district | `district` | true | `z.string().nullable().optional()` ✅ | 1레벨 → 직접 대입 |
| address_ko | `address.ko` | false | `localizedTextOptional` ✅ | 무시 (editable=false) |
| phone | `phone` | false | ❌ 스키마에 없음 | 무시 (editable=false). 검수 맥락용 |
| english_support | `english_support` | true | `englishSupportEnum.default("none")` ✅ | 1레벨 → 직접 대입 |
| description_ko | `description.ko` | true | `localizedTextOptional` ✅ | 2레벨 → 중첩 대입 |
| description_en | `description.en` | true | `localizedTextOptional` ✅ | 2레벨 → 중첩 대입 |

**phone 컬럼 — DB 미적재 확인**:
- clinicCreateSchema에 `phone` 없음 → zod `.strip()` 기본 동작으로 적재 시 제거
- editable: false → import 시 무시
- store도 동일하게 phone 포함 (110행) → G-5 패턴 일관성

**규칙 준수 근거**:

| 규칙 | 준수 | 근거 |
|------|------|------|
| P-7 | ✅ | review-exporter.ts 1파일 내 1곳 수정 |
| G-5 | ✅ | store 컬럼 구조와 동일 패턴 |
| Q-14 | ✅ | editable 컬럼 모두 clinicCreateSchema 필드에 대응 |
| V-24 | ✅ | `buildValidatedRecord()` (325행) → `ENTITY_REVIEW_COLUMNS[original.entityType]` → clinic 컬럼 사용. 기존 store/product 무영향 |

---

## §2. 신규 테스트: `scripts/seed/lib/classifiers/clinic-type-classifier.test.ts`

**목적**: store-type-classifier.test.ts와 동일 패턴 (G-5). 분류 정확성 + 인터페이스 계약 검증.

**테스트 케이스**:

```
RegexClinicTypeClassifier:
  ✅ "서울 피부과" → "dermatology"
  ✅ "강남 성형외과" → "plastic_surgery"
  ✅ "메드스파 청담" → "med_spa"
  ✅ "에스테틱 강남" → "aesthetic"
  ✅ "dermatology clinic" → "dermatology"
  ✅ "plastic surgery center" → "plastic_surgery"
  ✅ "피부클리닉" → "dermatology"
  ✅ "피부관리실" → "aesthetic"
  ✅ 미매칭 "서울 클리닉" → null (폴백)
  ✅ 빈 데이터 → null
  ✅ category_name으로 매칭 (name 미매칭 시)
  ✅ name 우선 매칭

ClinicTypeClassifier interface:
  ✅ defaultClinicTypeClassifier는 인터페이스 구현체
  ✅ classify는 항상 string|null 반환
```

---

## §3. 수정하지 않는 파일 (영향 분석)

| 파일 | 수정 여부 | 사유 |
|------|----------|------|
| `place-mapper.ts` | ❌ | CLINIC_PATTERN은 1차 이진 분류. P2-62 범위 밖. 수정 시 기존 store fetch에 영향 |
| `loader.ts` | ❌ | clinic ENTITY_CONFIG 이미 존재 (68행). LOAD_PHASES Phase 1에 clinic 포함 (93행) |
| `entity-schemas.ts` | ❌ | `clinic: clinicCreateSchema` 이미 등록 (24행) |
| `fetch-service.ts` | ❌ | classifyPlace → clinic 분류 이미 지원 |
| `id-generator.ts` | ❌ | clinic namespace 이미 등록 (19행) |
| `types.ts` | ❌ | EntityType에 "clinic" 이미 포함 (23행) |
| `shared/validation/clinic.ts` | ❌ | clinicCreateSchema 이미 완성 |
| `shared/constants/domains.ts` | ❌ | CLINIC_TYPES 이미 정의 |
| core/ 전체 | ❌ | P-2, L-4 준수. 비즈니스 변경으로 core 수정 불필요 |

---

## §4. 데이터 파일 (파이프라인 실행 시)

| 파일 | 구분 | 설명 |
|------|------|------|
| `scripts/seed/data/clinic-queries.json` | 신규 | 카카오 검색 쿼리 10개 |
| `scripts/seed/data/clinics-raw.json` | 신규 (실행 출력) | fetch 결과 |
| `scripts/seed/data/clinics-enriched.json` | 신규 (실행 출력) | enrich 결과 |
| `scripts/seed/data/clinics-validated.json` | 신규 (실행 출력) | 검수 완료 결과 |

---

## §5. 실행 순서

```
① clinic-type-classifier.ts + test 작성 → 테스트 통과 확인
② enrich-service.ts FIELD_MAPPINGS 추가 + import 추가
③ review-exporter.ts clinic 컬럼 추가
④ npx tsc --noEmit → 타입 검증
⑤ vitest run → 기존 테스트 회귀 없음 확인
```

파이프라인 실행 (코드 수정 완료 후):
```
⑥ clinic-queries.json 작성
⑦ fetch.ts → clinics-raw.json
⑧ enrich.ts --entity-types=clinic → clinics-enriched.json
⑨ export-review.ts → CSV 검수
⑩ 수동 검수 (clinic_type, english_support 등)
⑪ import-review.ts → clinics-validated.json
⑫ load.ts → DB UPSERT
```

---

## §6. 검증 체크리스트

```
□ V-1  의존성 방향: clinic-type-classifier → (없음). enrich-service → classifier (단방향)
□ V-2  core 불변: core/ 미수정
□ V-4  features 독립: features/ 미수정
□ V-5  콜 스택 ≤ 4: enrich-service → classifier (2단계) ✅
□ V-6  바인딩 체인 ≤ 4: enrich-service → classifier (1단계) ✅
□ V-9  중복: extractDistrictFromAddress 재사용. 신규 중복 없음
□ V-10 패스스루 없음: classifier는 자체 로직 수행
□ V-12 any 없음: Record<string, unknown> 사용
□ V-17 제거 안전성: classifier 삭제 시 enrich-service만 영향
□ V-18 scripts/ 의존 방향: scripts/ → shared/ (허용 방향)만
□ V-22 스키마 정합성: FIELD_MAPPINGS 3필드 ↔ clinicCreateSchema 일치
□ V-26 API 레이어: API 미수정
```
