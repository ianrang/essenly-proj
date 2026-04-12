# NEW-23 Eval Harness Execution + Judge Calibration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eval harness의 locale 버그를 수정하고, 20개 시나리오 전체를 실행하여 judge calibration을 완료한다.

**Architecture:** eval-chat-quality.ts의 sendChatMessage에 locale 파라미터를 추가하여 M4(ko) 시나리오가 정확한 한국어 시스템 프롬프트를 받도록 수정. 이후 dev 서버 기동 → 20 시나리오 실행 → 수동 검토 → rubric 보정 → 3회 안정성 확인 → calibration-notes.md 기록.

**Tech Stack:** TypeScript, tsx, Gemini 2.0 Flash (judge), Supabase (auth/DB)

**Constraints:**
- chat API는 `locale: z.enum(['en', 'ko']).default('en')` — ja/zh/th는 전달 불가 (설계 의도: LLM이 입력 언어 감지하여 전환)
- Rate limit: 15/min + 100/day — 20 시나리오 순차 실행에 문제 없음
- Judge: Gemini 2.0 Flash, temperature=0, structured output

---

## File Structure

| File | 역할 | 변경 유형 |
|------|------|----------|
| `scripts/eval-chat-quality.ts` | Eval harness 메인 스크립트 | 수정 (locale 전달 버그 수정) |
| `scripts/fixtures/eval-scenarios.json` | 20개 테스트 시나리오 | 수정 가능 (rubric 보정 시) |
| `scripts/fixtures/calibration-notes.md` | Judge 보정 기록 | 수정 (실행 결과 기록) |

---

## Task 1: Eval harness locale 버그 수정

**Files:**
- Modify: `scripts/eval-chat-quality.ts:217-237` (sendChatMessage), `scripts/eval-chat-quality.ts:370-395` (runScenario)

### 배경

`sendChatMessage()`가 request body에 `locale` 필드를 포함하지 않아, chat API가 항상 `default('en')`을 적용한다.
이로 인해 M4(ko) 시나리오에서 `buildRulesSection('en')` 이 호출되어 시스템 프롬프트에 `"Your session language is set to en"` 이 주입된다.

chat API는 `locale: z.enum(['en', 'ko'])` 만 허용하므로, scenario.profile.language가 'ko'이면 'ko', 그 외는 모두 'en'으로 매핑한다.
M1(ja)/M2(zh)/M3(th) 시나리오는 locale='en' 상태에서 LLM이 입력 언어를 감지하여 전환하는 방식으로 설계되어 있다 (prompts.ts:105-106 규칙).

- [ ] **Step 1: sendChatMessage에 locale 파라미터 추가**

`scripts/eval-chat-quality.ts`의 `sendChatMessage` 함수 시그니처와 body를 수정한다:

```typescript
// 변경 전 (line 217-237)
async function sendChatMessage(
  session: EvalSession,
  messageText: string,
  conversationId: string | null,
): Promise<ChatResponse> {
  const messageId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const res = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        id: messageId,
        role: 'user',
        parts: [{ type: 'text', text: messageText }],
      },
      conversation_id: conversationId,
    }),
  });

// 변경 후
async function sendChatMessage(
  session: EvalSession,
  messageText: string,
  conversationId: string | null,
  locale: 'en' | 'ko' = 'en',
): Promise<ChatResponse> {
  const messageId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const res = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        id: messageId,
        role: 'user',
        parts: [{ type: 'text', text: messageText }],
      },
      conversation_id: conversationId,
      locale,
    }),
  });
```

- [ ] **Step 2: runScenario에서 locale 도출 및 전달**

`scripts/eval-chat-quality.ts`의 `runScenario` 함수에서 scenario.profile.language를 locale로 변환하여 sendChatMessage에 전달한다:

```typescript
// 변경 전 (line 382-395)
    // 2. Send messages (multi-turn support)
    let conversationId: string | null = null;
    let lastResponse: ChatResponse = { text: '', toolCalls: [], conversationId: null };
    const conversationLog: string[] = [];

    for (const msg of scenario.messages) {
      conversationLog.push(`USER: ${msg.text}`);
      lastResponse = await sendChatMessage(session, msg.text, conversationId);
      conversationId = lastResponse.conversationId;

// 변경 후
    // 2. Send messages (multi-turn support)
    // chat API는 locale: 'en' | 'ko'만 허용. 그 외 언어는 LLM이 입력 감지로 전환.
    const locale: 'en' | 'ko' = scenario.profile?.language === 'ko' ? 'ko' : 'en';
    let conversationId: string | null = null;
    let lastResponse: ChatResponse = { text: '', toolCalls: [], conversationId: null };
    const conversationLog: string[] = [];

    for (const msg of scenario.messages) {
      conversationLog.push(`USER: ${msg.text}`);
      lastResponse = await sendChatMessage(session, msg.text, conversationId, locale);
      conversationId = lastResponse.conversationId;
```

- [ ] **Step 3: 타입 체크 통과 확인**

Run: `npx tsc --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext scripts/eval-chat-quality.ts 2>&1 || echo "tsc issues (expected for scripts — verify only locale changes)"`

eval-chat-quality.ts는 scripts/ 스크립트이므로 tsconfig 범위 밖일 수 있다.
핵심 확인: locale 파라미터 타입이 sendChatMessage 시그니처와 호출부에서 일치하는지 수동 확인.

- [ ] **Step 4: M4(ko) 단일 시나리오로 locale 전달 검증**

dev 서버가 기동된 상태에서:

Run: `npx tsx scripts/eval-chat-quality.ts --scenario M4`

Expected:
- 실행 성공 (connection 에러 없음)
- M4 시나리오가 PASS 또는 FAIL (ERROR가 아닌 정상 실행)
- 응답이 한국어로 작성됨 (responsePreview에서 확인)

이 단계에서 FAIL이 나와도 정상 — judge calibration은 Task 3에서 수행.
ERROR가 나오면 locale 전달에 문제가 있는 것이므로 디버그.

- [ ] **Step 5: JSON 결과 파일 저장 기능 추가**

calibration 시 전체 응답 텍스트가 필요하므로, 실행 결과를 JSON 파일로 저장한다.

`scripts/eval-chat-quality.ts`의 `main()` 함수에서 `printResults(results)` 직후에 추가:

```typescript
// printResults(results) 직후, cleanup 직전에 추가
import { writeFileSync } from 'node:fs';  // 파일 상단 import에 추가 (readFileSync 옆)

// main() 함수 내, printResults(results) 다음 줄:
const runTimestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
const detailPath = resolve(__dirname, 'fixtures', `eval-run-${runTimestamp}-detail.json`);
const detailData = results.map((r) => ({
  id: r.id,
  category: r.category,
  name: r.name,
  pass: r.pass,
  criteria: r.criteria,
  responseFull: r.responsePreview,  // 아래에서 전체 텍스트로 변경
  toolCalls: r.toolCalls,
  error: r.error,
  durationMs: r.durationMs,
}));
writeFileSync(detailPath, JSON.stringify(detailData, null, 2));
console.log(`\nDetailed results saved to: ${detailPath}`);
```

**중요:** `responsePreview`가 200자 제한이므로, `ScenarioResult`에 `responseFull` 필드를 추가해야 한다:

```typescript
// ScenarioResult 인터페이스에 추가 (line 56-66)
interface ScenarioResult {
  // ... 기존 필드 ...
  responseFull: string;  // 전체 응답 텍스트 (calibration용)
}

// runScenario 함수의 return에 추가 (line 402-412)
return {
  // ... 기존 필드 ...
  responseFull: lastResponse.text,  // 전체 텍스트
};

// catch 블록에도 추가 (line 414-424)
return {
  // ... 기존 필드 ...
  responseFull: '',
};
```

JSON 파일 저장에서는 `r.responseFull`을 사용:
```typescript
responseFull: r.responseFull,  // 전체 텍스트
```

- [ ] **Step 6: 커밋**

```bash
git add scripts/eval-chat-quality.ts
git commit -m "fix: eval harness locale 전달 누락 수정 + JSON 결과 파일 저장 추가"
```

---

## Task 2: 1차 Eval 전체 실행

**Files:**
- 없음 (실행만)

**선행:** Task 1 완료, dev 서버 기동 (`npm run dev`)

**통과 기준:** 전체 18/20 이상 PASS. 미달 시 FAIL 시나리오를 분석하여 (1) rubric 보정 또는 (2) 채팅 품질 이슈로 분류. 채팅 품질 이슈는 별도 태스크로 분리.

- [ ] **Step 1: dev 서버 기동 확인**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/chat`

Expected: `405` (GET not allowed) 또는 다른 HTTP 응답 — 연결 자체가 성공하면 OK.
실패 시: `npm run dev` 실행 후 서버 준비까지 대기.

- [ ] **Step 2: 20개 시나리오 전체 실행**

Run: `npx tsx scripts/eval-chat-quality.ts --provider google 2>&1 | tee scripts/fixtures/eval-run-1.log`

Expected:
- 20개 시나리오 순차 실행 (2-3분 소요)
- 결과 테이블 출력 (카테고리별 PASS/FAIL/ERROR)
- SUMMARY 라인에 total 20

**중요:** 출력 전체를 `eval-run-1.log`에 저장하여 Task 3에서 참조.

- [ ] **Step 3: 결과 확인 및 분류**

실행 결과를 다음 3개 그룹으로 분류:

| 그룹 | 의미 | 다음 액션 |
|------|------|----------|
| PASS | Judge가 통과 판정 | Task 3에서 사람이 동의하는지 검증 |
| FAIL | Judge가 실패 판정 | Task 3에서 (1) 실제로 나쁜 응답인지 (2) rubric이 과도한지 구분 |
| ERROR | 실행 오류 (네트워크, rate limit 등) | 즉시 원인 파악 후 재실행 |

ERROR가 있으면 원인을 파악하고 해결한 후 Step 2를 재실행한다.

---

## Task 3: Judge Calibration (수동 검토 + rubric 보정)

**Files:**
- Modify (가능): `scripts/fixtures/eval-scenarios.json` (rubric 보정 시)
- Modify: `scripts/fixtures/calibration-notes.md` (결과 기록)

**선행:** Task 2 완료 (eval-run-1.log 존재)

- [ ] **Step 1: 전체 결과 수동 검토**

eval-run-1.log의 각 시나리오별로 다음을 확인:

**PASS 시나리오 검증 (false positive 탐지):**
- responsePreview를 읽고, 실제로 좋은 응답인가?
- rubric 기준에 진정으로 부합하는가?
- Judge가 너무 관대하지 않은가?

**FAIL 시나리오 검증 (false negative 탐지):**
- 실제로 나쁜 응답인가? → 진짜 FAIL이면 OK
- 응답은 괜찮은데 rubric이 과도하게 엄격한가? → rubric 수정 필요
- Judge의 reason이 합리적인가?

**검토 기록 형식:**
```
[시나리오 ID] Judge: PASS/FAIL → Human: AGREE/DISAGREE
  - Response quality: good/acceptable/poor
  - Judge reason: (reason 요약)
  - Action: none / tighten rubric / loosen rubric
```

- [ ] **Step 2: Mismatch 식별 및 rubric 수정**

Step 1에서 DISAGREE로 판정된 시나리오의 rubric을 수정한다.

**Rubric 수정 원칙 (설계 문서 기준):**
- Judge PASS + Human FAIL (너무 관대) → rubric criterion을 더 구체적으로 수정
  - 예: `"relevant_products"` → `"recommends_moisturizers_not_oil_control"`
- Judge FAIL + Human PASS (너무 엄격) → rubric description을 완화
  - 예: `"must list exactly 3 products"` → `"recommends specific products or categories"`

수정은 `scripts/fixtures/eval-scenarios.json`의 해당 시나리오 rubric 배열에서 수행.

**수정 예시:**
```json
// 변경 전
{ "criterion": "relevant_content", "description": "Recommends moisturizers suitable for dry skin" }

// 변경 후 (더 구체적으로)
{ "criterion": "relevant_content", "description": "Recommends hydrating/moisturizing products. Must NOT recommend mattifying or oil-control products for dry skin." }
```

- [ ] **Step 3: 보정 후 재실행 (rubric 수정 시에만)**

rubric 수정이 있었다면:

Run: `npx tsx scripts/eval-chat-quality.ts --provider google 2>&1 | tee scripts/fixtures/eval-run-1b.log`

수정한 시나리오가 의도대로 PASS/FAIL로 바뀌었는지 확인.
새로운 mismatch가 발생하면 Step 2로 돌아간다 (최대 2회 반복).

---

## Task 4: 안정성 검증 (3회 실행)

**Files:**
- 없음 (실행만)

**선행:** Task 3 완료 (rubric 확정)

- [ ] **Step 1: 2차 실행**

Run: `npx tsx scripts/eval-chat-quality.ts --provider google 2>&1 | tee scripts/fixtures/eval-run-2.log`

- [ ] **Step 2: 3차 실행**

Run: `npx tsx scripts/eval-chat-quality.ts --provider google 2>&1 | tee scripts/fixtures/eval-run-3.log`

- [ ] **Step 3: 안정성 분석**

3회 실행 결과를 비교하여 각 시나리오의 일관성을 확인:

```
시나리오 | Run 1 | Run 2 | Run 3 | 일관성
P1       | PASS  | PASS  | PASS  | OK
P2       | PASS  | FAIL  | PASS  | FLAKY ← 주의
...
```

**성공 기준:** >90% 일관성 (20개 중 18개+ 동일 결과)

**FLAKY 시나리오 대응:**
- Judge temperature=0이므로 judge 자체 변동은 최소
- FLAKY의 원인은 대부분 chat LLM의 비결정적 응답
- 대응: rubric criterion을 행동 수준(behavioral)으로 강화하여 응답 변동에 내성 확보
  - 예: "mentions specific product" → "recommends products relevant to skin type" (더 넓은 조건)

- [ ] **Step 4: FLAKY 시나리오 rubric 보정 (해당 시에만)**

FLAKY 시나리오가 있으면 rubric을 조정하고 추가 1회 실행하여 안정성 재확인:

Run: `npx tsx scripts/eval-chat-quality.ts --scenario [FLAKY_ID] 2>&1`

---

## Task 5: Calibration 기록 및 최종 커밋

**Files:**
- Modify: `scripts/fixtures/calibration-notes.md`
- Modify (가능): `scripts/fixtures/eval-scenarios.json` (Task 3-4에서 수정된 경우)

- [ ] **Step 1: calibration-notes.md 작성**

`scripts/fixtures/calibration-notes.md`의 `## Run History` 섹션에 실제 결과를 기록:

```markdown
## Run History

### Run 1 (2026-04-11)

Date: 2026-04-11
Run #: 1
Provider: google (gemini-2.0-flash)
Scenarios: 20

Results: XX/20 passed, Y failed, Z errors

Mismatches:
- [x] [시나리오 ID] — Judge said [PASS/FAIL] but human says [FAIL/PASS]
  Reason: [구체적 이유]
  Rubric fix: [수정 내역 또는 "none"]

(mismatch 없으면)
Mismatches: None

### Stability (Runs 1-3)

Stability: XX/20 consistent across 3 runs
Flaky scenarios: [ID 목록 또는 "none"]
Flaky fix: [rubric 수정 내역 또는 N/A]
```

- [ ] **Step 2: 로그 파일 정리**

eval-run-*.log 파일은 .gitignore에 추가하거나 삭제 (CI 아티팩트가 아닌 일회성 로그):

```bash
echo "scripts/fixtures/eval-run-*.log" >> .gitignore
```

- [ ] **Step 3: 최종 커밋**

```bash
git add scripts/eval-chat-quality.ts scripts/fixtures/eval-scenarios.json scripts/fixtures/calibration-notes.md .gitignore
git commit -m "test: NEW-23 eval harness 실행 + judge calibration 완료 — 20 시나리오 3회 안정성 검증"
```

커밋 메시지는 실제 결과에 따라 조정:
- 전체 PASS: `"test: NEW-23 eval 20/20 PASS + judge calibration 완료"`
- 부분 FAIL: `"test: NEW-23 eval XX/20 PASS + judge calibration — [FAIL 사유 요약]"`

---

## 범위 외 (NOT IN SCOPE)

- 시나리오 추가/삭제 (기존 20건 유지)
- 채팅 서비스 코드 수정 (이미 완료된 NEW-14~19, NEW-24~25)
- eval 결과에 따른 프롬프트 튜닝 (별도 태스크)
- CI 자동화 통합 (별도 태스크)
- eval-run-*.log의 장기 보관 전략

## 의존성 매트릭스

```
Task 1 (locale 수정)
  └→ Task 2 (1차 실행) — Task 1 완료 + dev 서버 필요
       └→ Task 3 (calibration) — Task 2 결과 기반
            └→ Task 4 (안정성) — Task 3 rubric 확정 후
                 └→ Task 5 (기록 + 커밋) — Task 4 완료 후
```

모든 태스크가 순차 의존이므로 병렬화 불가.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 2 | issues_found | Outside voice: 2 accepted (JSON results, pass criteria) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 1 issue (P1 JSON results, resolved), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG CLEARED — ready to implement.
