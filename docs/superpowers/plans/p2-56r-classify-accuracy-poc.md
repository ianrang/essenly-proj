# P2-56r: AI 분류 정확도 PoC (U-1)

## Context

M1 스켈레톤 제품 10건에 대해 classifier.ts의 실제 AI 분류 정확도를 검증.
80% 미달 시 프롬프트/모델 개선 후 재실행. 반복 실패 시 수동 전환 결정.

**선행 완료**: P2-56l (classifier ✅), P2-58 (M1 스켈레톤 ✅)

---

## 설계

### 구조

```
scripts/seed/poc/
  classify-accuracy.ts      ← CLI + 비교 로직 + 결과 출력
  classify-accuracy.test.ts ← 비교 로직 단위 테스트
```

### 실행 흐름

```
1. M1 YAML 로드 → products 10건 추출
2. 각 제품에서 정답(skin_types, concerns) 분리
3. 정답 제외한 입력 데이터로 classifyFields() 호출 (실제 AI API)
4. AI 결과 vs 정답 Jaccard 유사도 비교
5. 제품별 상세 + 전체 정확도 + PASS/FAIL 출력
6. 결과 JSON 파일 저장 (이력 추적)
```

### PocConfig — 회차별 변경 가능

```typescript
interface PocRunConfig {
  fieldSpecs: FieldSpec[];   // 프롬프트 변경 → 여기만 수정
  threshold: number;         // 기본 0.8
  similarityThreshold: number; // Jaccard 기준, 기본 0.5
}
```

단일 수정 보장:
- 프롬프트 개선 → fieldSpecs.promptHint만 수정
- 모델 변경 → .env AI_PROVIDER/AI_MODEL만 수정
- 기준 변경 → threshold/similarityThreshold만 수정

### 비교 로직 — Jaccard 유사도

```typescript
function jaccardSimilarity(predicted: string[], expected: string[]): number
```
- 교집합/합집합 비율. 0.0~1.0.
- 제품 정확 = skin_types Jaccard ≥ 0.5 AND concerns Jaccard ≥ 0.5
- 전체 정확도 = 정확 제품 수 / 10

### 결과 타입

```typescript
interface PocResult {
  config: { provider: string; model: string; threshold: number; timestamp: string };
  products: ProductResult[];
  accuracy: { skinTypes: number; concerns: number; overall: number };
  passed: boolean;
}
```

---

## 의존 방향

```
poc/classify-accuracy.ts → lib/enrichment/classifier.ts (classifyFields)
                         → shared/constants/beauty.ts   (SKIN_TYPES, SKIN_CONCERNS)
                         → scripts/seed/config.ts       (pipelineEnv)
                         → scripts/seed/data/*.yaml     (파일 읽기)
```

역방향 없음. 순환 없음. server/ import 없음. P-10: poc/ 삭제 → 빌드 에러 0건.

---

## 파일 목록

### 신규 (2개)

| 파일 | 역할 |
|------|------|
| `scripts/seed/poc/classify-accuracy.ts` | PoC CLI + 비교 로직 |
| `scripts/seed/poc/classify-accuracy.test.ts` | 비교 로직 단위 테스트 |

### 수정 (0개)

---

## 테스트 계획 (비교 로직 — 순수 함수)

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | jaccardSimilarity — 완전 일치 | [a,b] vs [a,b] → 1.0 |
| 2 | jaccardSimilarity — 부분 일치 | [a,b,c] vs [a,b] → 0.67 |
| 3 | jaccardSimilarity — 불일치 | [a] vs [b] → 0.0 |
| 4 | jaccardSimilarity — 양쪽 빈 배열 | [] vs [] → 1.0 |
| 5 | jaccardSimilarity — 한쪽만 빈 배열 | [a] vs [] → 0.0 |
| 6 | evaluateProduct — 양 필드 통과 | skin+concerns ≥ 0.5 → accurate: true |
| 7 | evaluateProduct — skin 실패 | skin < 0.5 → accurate: false |
| 8 | evaluateProduct — concerns 실패 | concerns < 0.5 → accurate: false |
| 9 | calculateOverallAccuracy — 8/10 → 0.8 PASS | threshold 0.8 |
| 10 | calculateOverallAccuracy — 7/10 → 0.7 FAIL | threshold 0.8 |
| 11 | extractInputData — 정답 필드 제외 검증 | skin_types, concerns 미포함 |
