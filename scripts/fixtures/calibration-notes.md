# Judge Calibration Notes

> WS2 eval harness — Judge 보정 기록.
> 첫 실행 후 사람이 PASS/FAIL 결과를 검토하고, 불일치 발견 시 rubric 수정 내역을 기록.

---

## Run 1 (2026-04-12)

Date: 2026-04-12
Run #: 1 (calibration run, after SSE parser fix)
Provider: google (gemini-2.0-flash)
Scenarios: 20

Results: 14/20 passed, 6 failed, 0 errors

Mismatches (Judge vs Human):
- [x] P4 — Judge said FAIL but human says PASS
  Reason: rubric `k_beauty_specific`가 "actual K-beauty brands" 명시 요구. 응답에 "K-beauty products" 언급했으나 브랜드명 없어 FAIL.
  Rubric fix: "Recommends K-beauty products or categories (mentioning specific brands is ideal but not required)"
- [x] R3 — Judge said FAIL but human says PASS
  Reason: rubric `comparison_format`가 "table format, or side-by-side" 요구. 텍스트로 2개 제품 비교했으나 table 아니라 FAIL.
  Rubric fix: "Compares products by describing distinguishing characteristics of each. Table format is not required."
- [x] E3 — Judge said FAIL but human says PASS
  Reason: rubric `seoul_context`가 "Mentions Seoul clinics, areas" 명시 요구. 클리닉 시술 추천했으나 서울 명시 안 해서 FAIL.
  Rubric fix: "Response is relevant to someone visiting Seoul. Recommending treatments available in Korean clinics is sufficient."

## Run 1b — Post-Calibration (2026-04-12)

Date: 2026-04-12
Run #: 1b (after rubric fixes)
Provider: google (gemini-2.0-flash)
Scenarios: 20

Results: 16/20 passed, 4 failed, 0 errors

Calibrated scenarios fixed:
- P4: FAIL → PASS (k_beauty_specific fix)
- R3: FAIL → PASS (comparison_format fix)
- E3: FAIL → PASS (seoul_context fix)

Remaining FAILs (real quality issues, not rubric problems):
- P5: LLM asks questions instead of giving generic recs
- R1: LLM asks questions instead of recommending products
- R2: PASS → FAIL (flaky — LLM sometimes asks instead of recommending)
- R4: LLM asks budget instead of answering follow-up

## Stability (Runs 1b, 2, 3)

```
시나리오 | Run 1b | Run 2 | Run 3 | 일관성
---------|--------|-------|-------|-------
P1       | PASS   | PASS  | PASS  | STABLE
P2       | PASS   | PASS  | PASS  | STABLE
P3       | PASS   | PASS  | PASS  | STABLE
P4       | PASS   | FAIL  | FAIL  | FLAKY (LLM 비결정적)
P5       | FAIL   | PASS  | FAIL  | FLAKY (LLM 비결정적)
G1-G4    | PASS   | PASS  | PASS  | STABLE (4/4)
R1       | FAIL   | FAIL  | FAIL  | STABLE FAIL
R2       | FAIL   | PASS  | PASS  | FLAKY
R3       | PASS   | PASS  | PASS  | STABLE
R4       | FAIL   | FAIL  | FAIL  | STABLE FAIL
M1-M4    | PASS   | PASS  | PASS  | STABLE (4/4)
E1-E3    | PASS   | PASS  | PASS  | STABLE (3/3)
```

Stability: 17/20 consistent across 3 runs (85%)
Flaky scenarios: P4, P5, R2
Stable FAIL: R1, R4

## Root Cause Analysis

FLAKY + Stable FAIL 시나리오의 공통 패턴:
- LLM이 추천 대신 질문을 함 ("What kind of products?", "Could you give me a budget?")
- Tool call 없이 텍스트만 반환 (search tool 미호출)
- 이것은 LLM의 "정보 수집 우선" 성향에 의한 채팅 품질 이슈
- 프롬프트에 "provide at least one recommendation even without complete information" 규칙 추가 필요

## Action Items

- [ ] 프롬프트 튜닝: 불완전한 정보에도 최소 1개 추천 제공하도록 규칙 추가 (별도 태스크)
- [x] Rubric 보정 3건 완료 (P4, R3, E3)
- [x] SSE 파서 교체 (Data Stream → UI Message Stream)
- [x] Rate limit 딜레이 4초 추가

---

## Run 4-6 — Post Chat Quality Tuning (2026-04-12)

### 적용된 변경
- `config.ts`: DEFAULT_MODELS.google `gemini-2.0-flash` → `gemini-2.5-flash`
- `llm-client.ts`: streamText에 `toolChoice: 'auto'` 추가 (주 + 폴백)
- `prompts.ts`: TOOLS_SECTION에 "MUST call search_beauty_data before recommending" 강화
- `eval-chat-quality.ts`: SSE 파서를 `tool-call` → `tool-input-start/tool-input-available`로 수정

### 결과
- Run 4: 17/20 PASS
- Run 5: 19/20 PASS
- Run 6: 16/20 PASS
- 평균: 17.3/20 (86.5%)

### 주요 개선
| 지표 | 튜닝 전 | 튜닝 후 |
|------|--------|--------|
| Tool 호출율 | 0/20 (0%) | 11~16/20 (55-80%) |
| R2, R4 (이전 stable FAIL) | 2건 FAIL | 모두 STABLE PASS |
| P5 | 2/3 FAIL | 3/3 PASS |
| 실제 DB 제품 추천 | 없음 (할루시네이션) | 실제 제품명 포함 |

### 남은 이슈 (v0.2 범위)
- P1: Gemini 2.5 Flash가 empty response 반환 (outputTokens: 0). 재현 조건 불명확.
- R1: "recommend some K-beauty products" 너무 일반적 → LLM이 clarification 선호. rubric 보정 고려.
- E1: 매우 긴 입력에서 tool 28회 호출 루프. stopWhen 제한 검토 필요.
