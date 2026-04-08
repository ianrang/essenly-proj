# P2-90~95 + NEW-1~6: 채팅 품질 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채팅 파이프라인의 버그 수정(P2-95, P2-90) + 프롬프트 품질 개선(P2-91~93) + 구조적 품질 향상(NEW-1~2, NEW-4)을 통해 AI 서비스 품질을 경쟁 서비스 수준으로 끌어올린다.

**Architecture:** 모든 수정은 features/chat/ 범위 내에서 완결. core/ 수정 0건. 외부 features/ 영향 0건. 의존 방향은 기존 DAG(app/ → server/, client/ → shared/) 유지. beauty/ 모듈 순수성 보존.

**Tech Stack:** AI SDK 6.x, Vitest, prompts.ts 순수 함수, shared/constants/ai.ts

---

> 버전: 1.0
> 작성일: 2026-04-08
> 선행: P2-79 (인증-채팅 연결 ✅), P2-50b (서버 권위적 히스토리 ✅), P2-50c (채팅 UI ✅)
> 정본: system-prompt-spec.md (프롬프트 구조), tool-spec.md (tool 인터페이스), search-engine.md (검색/판단), llm-resilience.md (LLM 호출)

## 0. 범위 선언

### 이 계획이 다루는 것

| ID | 작업 | 수정 파일 | 분류 |
|----|------|----------|------|
| P2-95 | 채팅 히스토리 미표시 디버깅 | `ChatContent.tsx` | 버그 |
| P2-90 | 인사 반복 제거 (isFirstTurn) | `prompts.ts`, `service.ts` | 버그 |
| P2-91 | 반복 응답 방지 | `prompts.ts` | 프롬프트 |
| P2-92 | 선제적 추천 유도 | `prompts.ts` | 프롬프트 |
| P2-93 | Chat-First 온보딩 강화 | `prompts.ts` | 프롬프트 |
| NEW-1 | LLM temperature/maxTokens 설정 | `shared/constants/ai.ts`, `llm-client.ts` | 구조 |
| NEW-2 | 프로필 자동 필터 merge | `search-handler.ts` | 구조 |
| NEW-4 | 히스토리 트리밍 (토큰 관리) | `service.ts` | 구조 |

### 이 계획이 다루지 않는 것

| ID | 사유 |
|----|------|
| P2-94 | UI 작업 — 별도 태스크 |
| NEW-3 | shared/constants/ 신규 파일 — 별도 태스크 (reasons 구조화) |
| NEW-5 | 이전 추천 제외 — 별도 태스크 (tool 스키마 변경 포함) |
| NEW-6 | 쿼리 완화 재시도 — 별도 태스크 |

### 파일 변경 맵

```
수정 파일 (8개):
  src/client/features/chat/ChatContent.tsx        ← P2-95
  src/server/features/chat/prompts.ts             ← P2-90, P2-91, P2-92, P2-93
  src/server/features/chat/service.ts             ← P2-90, NEW-4
  src/server/features/chat/llm-client.ts          ← NEW-1
  src/server/features/chat/tools/search-handler.ts ← NEW-2
  src/shared/constants/ai.ts                      ← NEW-1
  src/server/features/chat/prompts.test.ts        ← P2-90 테스트
  src/server/features/chat/service.test.ts        ← P2-90, NEW-4 테스트

신규 파일: 없음
core/ 수정: 0건
외부 features/ 수정: 0건
shared/types/ 수정: 1건 (ai.ts — TokenConfig에 temperature 추가. import 경로: shared/constants/ai.ts 1곳뿐. 외부 영향 없음)
```

### 의존 방향 검증 (변경 전후 동일)

```
routes/chat.ts ──→ chat/service.ts ──→ chat/prompts.ts
                                    ──→ chat/llm-client.ts ──→ core/config
                                    │                        ──→ shared/constants/ai  ← NEW-1
                                    ──→ chat/tools/search-handler.ts                  ← NEW-2
                                         ──→ beauty/shopping.ts ──→ beauty/judgment.ts
                                         ──→ beauty/treatment.ts ──→ beauty/judgment.ts
                                         ──→ beauty/derived.ts (독립)
                                         ──→ repositories/*
                                         ──→ core/knowledge.ts

역방향·순환: 없음 (변경 후에도 동일)
새 import 추가: service.ts → shared/constants/ai (NEW-4, R-5 허용: shared/ import ✓)
```

---

## Phase 1: 기반 안정화

### Task 1: P2-95 — 채팅 히스토리 미표시 디버깅

**Files:**
- Modify: `src/client/features/chat/ChatContent.tsx:93`
- Test: 수동 검증 (브라우저 새로고침 후 히스토리 표시 확인)

**원인 분석:**
`ChatContent.tsx:93`에서 `chatMessages.length === 0`일 때 정적 greeting을 렌더하고, `chatMessages.length > 0`일 때 MessageList를 렌더한다. 그런데 `initialMessages`가 정상 로드되어도, `card-mapper.ts:101-102`의 `part.state !== "output-available"` 필터가 tool part를 제거할 수 있다. 또한 `mapUIMessageToParts`가 `type: "tool-invocation"` 같은 AI SDK 내부 파트 타입을 무시하므로, assistant 메시지가 tool 호출만 포함한 경우 빈 parts가 반환될 수 있다.

핵심 문제: `ChatContent.tsx:84-88`에서 `mapUIMessageToParts`를 거친 결과가 빈 배열이면 해당 메시지가 사실상 사라진다. 하지만 이것은 card-mapper의 정상 동작(tool 중간 상태 필터링)이므로 card-mapper를 수정하는 것이 아니라, **빈 parts를 가진 메시지를 chatMessages에서 제외**하여 greeting 조건과 충돌하지 않도록 해야 한다.

- [ ] **Step 1: 현재 DB의 ui_messages 구조 확인**

개발 서버 실행 후 채팅 1회 → 새로고침 → 브라우저 DevTools Network 탭에서 `/api/chat/history` 응답을 확인한다. 응답의 `data.messages` 배열에서 각 메시지의 `parts` 구조를 확인:
- `type: "text"` 파트가 존재하는지
- `type: "tool-invocation"` 파트의 `state` 값이 `"output-available"`인지

Run: 브라우저 DevTools에서 수동 확인

- [ ] **Step 2: chatMessages 필터링 수정**

`ChatContent.tsx:84-88`에서 빈 parts를 가진 메시지를 제거한다:

```typescript
  // UIMessage.parts → ChatMessagePart[] 변환
  const chatMessages = messages
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: mapUIMessageToParts(m.parts as UIPartLike[]),
    }))
    .filter((m) => m.parts.length > 0);
```

이렇게 하면:
- tool-only assistant 메시지(text 없음)는 제거되어 UI에 빈 버블이 나타나지 않음
- 히스토리에 text 메시지가 있으면 정상 렌더
- `chatMessages.length === 0` 조건은 "표시할 메시지가 진짜 없을 때"만 true

- [ ] **Step 3: 검증 — 개발 서버에서 수동 테스트**

Run: `npm run dev`
1. 채팅 메시지 1개 전송
2. AI 응답 수신 확인
3. 브라우저 새로고침
4. 이전 대화가 MessageList에 표시되는지 확인
5. AI가 인사를 반복하지 않는지 확인 (P2-90 전에도 히스토리가 로드되면 개선됨)

- [ ] **Step 4: 커밋**

```bash
git add src/client/features/chat/ChatContent.tsx
git commit -m "fix(P2-95): 빈 parts 메시지 필터링으로 히스토리 표시 복구"
```

---

### Task 2: P2-90 — 인사 반복 제거 (isFirstTurn 도입)

**Files:**
- Modify: `src/server/features/chat/prompts.ts:19` (SystemPromptContext), `:417` (buildNoProfileSection)
- Modify: `src/server/features/chat/service.ts:58` (buildSystemPrompt 호출)
- Test: `src/server/features/chat/prompts.test.ts`

**설계:**
- `SystemPromptContext`에 `isFirstTurn: boolean` 필드 추가
- `buildNoProfileSection()`에서 `isFirstTurn`이 true일 때만 "First response" 블록 포함
- `service.ts`에서 `history.length === 0`으로 isFirstTurn 판단
- `buildUserProfileSection()`에는 "First response" 블록이 없으므로 수정 불필요

**아키텍처 검증:**
- `SystemPromptContext`는 `prompts.ts` 내부 정의. import하는 곳은 `service.ts` 1곳뿐 → 외부 영향 없음
- `service.ts`는 이미 `history` 파라미터를 보유 → 새 데이터 조회 불필요
- prompts.ts 순수 함수 유지: boolean → string 분기만 추가

- [ ] **Step 1: 테스트 작성 — isFirstTurn 분기 검증**

`prompts.test.ts`에 테스트 추가:

```typescript
  it('경로B 첫 턴: "First response" 블록 포함', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ isFirstTurn: true });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).toContain('## No Profile Mode');
    expect(result).toContain('### First response');
  });

  it('경로B 후속 턴: "First response" 블록 미포함', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ isFirstTurn: false });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).toContain('## No Profile Mode');
    expect(result).not.toContain('### First response');
  });

  it('경로A 프로필 있음: isFirstTurn 무관하게 §8 포함, First response 미포함', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ profile: fullProfile, journey: fullJourney, isFirstTurn: true });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).toContain('## User Profile');
    expect(result).not.toContain('### First response');
  });
```

`makeContext` 팩토리에 `isFirstTurn` 기본값 추가:

```typescript
function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    profile: null,
    journey: null,
    realtime: {
      location: null,
      timezone: 'Asia/Seoul',
      current_time: '2026-03-24T14:30:00+09:00',
    },
    derived: null,
    learnedPreferences: [],
    isFirstTurn: false,
    ...overrides,
  };
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/server/features/chat/prompts.test.ts`
Expected: 새 테스트 3건 FAIL (isFirstTurn 필드가 SystemPromptContext에 없음)

- [ ] **Step 3: SystemPromptContext에 isFirstTurn 추가**

`prompts.ts:19-25` 수정:

```typescript
/** buildSystemPrompt 입력 컨텍스트. chatService에서 조립하여 전달. */
export interface SystemPromptContext {
  profile: UserProfile | null;
  journey: Journey | null;
  realtime: RealtimeContext;
  derived: DerivedVariables | null;
  learnedPreferences: LearnedPreference[];
  isFirstTurn: boolean;
}
```

- [ ] **Step 4: buildNoProfileSection에 isFirstTurn 분기 구현**

`prompts.ts:417` — 함수 시그니처 변경 + 조건 분기:

```typescript
function buildNoProfileSection(realtime: RealtimeContext, isFirstTurn: boolean): string {
  const continuingTurnGuidance = `### Continuing conversation

You are in a follow-up turn. Do NOT greet or introduce yourself again.
Continue naturally from the previous message. Focus on being helpful and progressing the conversation.`;

  const firstResponseGuidance = `### First response (Route B)

Your opening message should:
- Greet warmly and introduce yourself briefly (1 sentence)
- Invite the user to ask anything about K-beauty (1 sentence)
- Mention that you can give better recommendations if you learn about them (1 sentence)

Example: "Hi! I'm Essenly, your K-beauty guide in Seoul. Ask me anything about skincare
products, treatments, or where to shop — and if you tell me a bit about your skin,
I can make my picks even more personal!"

Do NOT list profile questions. The UI displays suggested question bubbles separately.`;

  return `## No Profile Mode

The user has not set up a profile yet. They chose to start chatting directly.

**Your approach:**
- ${isFirstTurn ? 'Welcome them warmly and offer to help with K-beauty questions' : 'Continue the conversation naturally — do NOT re-introduce yourself or repeat greetings'}
- Answer their questions with broadly applicable recommendations
- As you learn about them through conversation (e.g., they mention oily skin, or a
  budget, or travel dates), naturally incorporate this into your recommendations
- Do NOT ask multiple profile questions at once — gather information one piece at a time
  through natural conversation

**Real-time context:**
- Current time: ${realtime.current_time} (KST)

${isFirstTurn ? firstResponseGuidance : continuingTurnGuidance}

### Information gathering

**Core principle:** Always answer the user's question first. Gather information only
when it fits naturally into the conversation. Never delay a recommendation to collect
profile data.

**Extraction targets and priority:**

Tier 1 — Profile save trigger (UP-1 + JC-1 >= 1 unlocks personalized recommendations):
- UP-1 (skin type): Often revealed when asking about products. "For oily skin, I'd
  recommend..." — if they haven't mentioned it, it naturally comes up.
- JC-1 (skin concerns): Usually the reason they're asking. "What are you hoping to
  improve?" fits naturally after a broad recommendation.

Tier 2 — Recommendation quality:
- JC-3 (stay duration): Important for treatment downtime filtering. Ask only when
  treatments are discussed: "How long are you in Seoul? Some treatments need recovery."
- JC-4 (budget): Infer from context ("affordable", "luxury") or ask when presenting
  options across price ranges.

Tier 3 — Supplementary:
- UP-4 (age range): Do NOT ask directly. Infer only if clearly stated.
- BH-4 (preferences): Accumulate from likes/dislikes expressed in conversation.

**What NOT to do:**
- Never ask more than one profile question per response
- Never ask "What's your skin type?" as a standalone question — always pair with value
- Never ask age, budget, or stay duration unprompted

### Profile save suggestion

When you've learned the user's skin type (UP-1) AND at least one skin concern (JC-1)
through conversation, naturally suggest saving their profile:

"I noticed you have [skin type] skin and are concerned about [concerns]. Want me to
save this as your profile? That way I can give you even more tailored recommendations
next time!"

Timing: Suggest after delivering a recommendation that used the extracted information,
not mid-conversation. The suggestion should feel like a natural follow-up, not an
interruption.

Only suggest once per conversation. If the user declines, do not ask again.`;
}
```

- [ ] **Step 5: buildSystemPrompt 조립 호출 수정**

`prompts.ts:520-534` — `buildNoProfileSection` 호출에 isFirstTurn 전달:

```typescript
export function buildSystemPrompt(context: SystemPromptContext): string {
  return [
    ROLE_SECTION,
    DOMAINS_SECTION,
    RULES_SECTION,
    GUARDRAILS_SECTION,
    TOOLS_SECTION,
    CARD_FORMAT_SECTION,
    context.profile
      ? buildUserProfileSection(context)
      : buildNoProfileSection(context.realtime, context.isFirstTurn),
    context.derived
      ? buildBeautyProfileSection(context.derived)
      : null,
  ].filter(Boolean).join('\n\n');
}
```

- [ ] **Step 6: service.ts에서 isFirstTurn 전달**

`service.ts:58-68` — buildSystemPrompt 호출에 isFirstTurn 추가:

```typescript
  // step 6: 시스템 프롬프트 구성
  const system = buildSystemPrompt({
    profile,
    journey,
    realtime: {
      location: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      current_time: new Date().toISOString(),
    },
    derived,
    learnedPreferences: preferences,
    isFirstTurn: params.history.length === 0,
  });
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npx vitest run src/server/features/chat/prompts.test.ts`
Expected: 모든 테스트 PASS (기존 + 신규 3건)

기존 테스트 영향 분석:
- `makeContext()`에 `isFirstTurn: false` 기본값 추가 → 기존 테스트는 "후속 턴" 동작 검증
- 기존 `경로B (프로필 없음)` 테스트: `## No Profile Mode` 포함 확인 → 변경 없이 통과
- 기존 `§8/§9 상호 배제` 테스트: 변경 없이 통과

service.test.ts 영향:
- `mockBuildSystemPrompt`로 mock되어 있으므로 `isFirstTurn` 필드 추가는 service.test.ts에 영향 없음
- 다만 `expect.objectContaining({ profile: null })` 테스트에 `isFirstTurn: true` 추가 필요

`service.test.ts:237-239` 수정:

```typescript
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ profile: null, journey: null, derived: null, isFirstTurn: true }),
    );
```

- [ ] **Step 8: service.test.ts 테스트 통과 확인**

Run: `npx vitest run src/server/features/chat/service.test.ts`
Expected: 모든 테스트 PASS

- [ ] **Step 9: 커밋**

```bash
git add src/server/features/chat/prompts.ts src/server/features/chat/service.ts \
        src/server/features/chat/prompts.test.ts src/server/features/chat/service.test.ts
git commit -m "fix(P2-90): isFirstTurn 도입으로 인사 반복 제거

buildNoProfileSection에 isFirstTurn 분기 추가. 첫 턴에서만 인사/자기소개.
후속 턴은 Continuing conversation 지시로 자연스러운 대화 진행."
```

---

## Phase 2: 프롬프트 품질 개선

### Task 3: P2-91 — 반복 응답 방지

**Files:**
- Modify: `src/server/features/chat/prompts.ts` (RULES_SECTION)

**설계:** RULES_SECTION에 규칙 5번 추가. 기존 규칙 1~4 번호 불변.

- [ ] **Step 1: RULES_SECTION에 반복 방지 규칙 추가**

`prompts.ts:70-87` — RULES_SECTION 끝에 규칙 5번 추가:

```typescript
const RULES_SECTION = `## Rules

1. **Non-interventional judgment (VP-1)**: Some items have a highlight badge — this is
   a visual marker only. It does NOT mean they are better or more recommended. Never
   mention highlight status as a reason for recommending something. Treat highlighted
   and non-highlighted items identically in your reasoning.

2. **Progressive personalization (VP-3)**: Work with whatever information you have.
   If the user's profile is incomplete, give the best recommendation possible with
   available data. Never refuse to help because of missing information. If knowing
   something specific (like skin type) would significantly improve your recommendation,
   ask naturally within the conversation — never as a form or checklist.

3. **Conversation continuity**: Reference previous messages to maintain coherent dialogue.
   Do not re-introduce yourself or repeat information the user already knows. When the
   user asks for alternatives, provide results that differ from previous recommendations.

4. **Price display**: All prices in KRW (₩). Do not convert to other currencies.

5. **Response variety**: Never repeat the same phrases, openers, or sentence patterns
   across turns. Vary your greetings, transitions, and follow-up offers. If you recommended
   something in a previous turn, do not restate it — build on it or offer alternatives.
   Each response should feel fresh and advance the conversation forward.`;
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `npx vitest run src/server/features/chat/prompts.test.ts`
Expected: 모든 테스트 PASS (기존 테스트는 `## Rules` 포함만 확인, 내용 변경은 영향 없음)

- [ ] **Step 3: 커밋**

```bash
git add src/server/features/chat/prompts.ts
git commit -m "fix(P2-91): Rules에 반복 응답 방지 규칙 추가

Rule 5: Response variety — 동일 문구/패턴 반복 금지, 대화 진전 유도."
```

---

### Task 4: P2-92 — 선제적 추천 유도

**Files:**
- Modify: `src/server/features/chat/prompts.ts` (TOOLS_SECTION)

**설계:** search_beauty_data의 "When to call" 조건에 의도 감지 기반 호출 추가.

- [ ] **Step 1: TOOLS_SECTION search_beauty_data "When to call" 확장**

`prompts.ts:221-231` — "When to call" 블록 교체:

```typescript
**When to call:**
- User asks for product recommendations ("recommend a serum for oily skin")
- User asks about treatments ("what laser treatments are good for acne scars?")
- User asks to compare options ("what's better for dry skin, this or that?")
- User mentions skin concerns, skin type, or beauty goals — even without explicitly
  asking for recommendations. If they say "I have oily skin and breakouts", proactively
  search for relevant products and present them: "Since you mentioned oily skin with
  breakouts, here are some targeted options I found:"
- User mentions travel plans or schedule that affect treatment choices — search for
  treatments that fit their timeline
```

"When NOT to call" 블록에 보완 추가 (`prompts.ts:232-235`):

```typescript
**When NOT to call:**
- Pure greetings or small talk with no beauty context ("hi", "thanks", "bye")
- Questions you can answer from the conversation context or your knowledge
- You already have relevant results from a previous tool call in this conversation
  that directly address the current question
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `npx vitest run src/server/features/chat/prompts.test.ts`
Expected: 모든 테스트 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/server/features/chat/prompts.ts
git commit -m "fix(P2-92): search_beauty_data 호출 조건에 의도 감지 기반 선제 추천 추가

피부 고민/타입 언급 시 명시적 요청 없이도 tool 호출하여 추천 제공."
```

---

### Task 5: P2-93 — Chat-First 온보딩 강화

**Files:**
- Modify: `src/server/features/chat/prompts.ts` (buildNoProfileSection 내 Information gathering)

**설계:** Task 2에서 이미 buildNoProfileSection을 재작성했으므로, Information gathering 섹션의 수집 전략을 보강한다. Task 2 코드 기준으로 수정.

- [ ] **Step 1: Information gathering 섹션 보강**

Task 2에서 작성한 `buildNoProfileSection` 내 Information gathering 섹션을 다음으로 교체:

```typescript
### Information gathering

**Core principle:** Answer first, then gather. Every recommendation is an opportunity
to learn one thing about the user.

**Pattern: Recommend → Ask One Thing**
After delivering a recommendation, naturally ask ONE profile question that would improve
the NEXT recommendation. Examples:

- After recommending a serum: "By the way, would you say your skin is more on the oily
  or dry side? That helps me pick even better products for you."
- After recommending a treatment: "How many days are you in Seoul? Some treatments need
  a day or two for recovery, so I want to make sure my suggestions fit your schedule."
- After recommending a store: "Are you looking for more budget-friendly options, or are
  you open to splurging a bit? I can adjust my picks."

**Extraction targets and priority:**

Tier 1 — Profile save trigger (most impactful for personalization):
- UP-1 (skin type): Ask after your first product recommendation.
  "What's your skin type — oily, dry, combination, sensitive, or normal?"
  Frame it as enhancing recommendations, not as a form.
- JC-1 (skin concerns): Ask after learning skin type OR when the user mentions a general
  beauty goal. "What's your biggest skin concern right now — acne, wrinkles, dryness,
  something else?"

Tier 2 — Recommendation quality:
- JC-3 (stay duration): Ask ONLY when treatments are discussed.
- JC-4 (budget): Infer from context ("affordable", "luxury") or ask when presenting
  options across price ranges.

Tier 3 — Supplementary:
- UP-4 (age range): Do NOT ask directly. Infer only if clearly stated.
- BH-4 (preferences): Accumulate from likes/dislikes expressed in conversation.

**What NOT to do:**
- Never ask more than one profile question per response
- Never ask profile questions before giving a recommendation first
- Never ask age, budget, or stay duration unprompted
- Never present questions as a checklist or form
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `npx vitest run src/server/features/chat/prompts.test.ts`
Expected: 모든 테스트 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/server/features/chat/prompts.ts
git commit -m "fix(P2-93): Chat-First 온보딩 Recommend→Ask One Thing 패턴 강화

추천 제공 후 프로필 질문 1개를 자연스럽게 유도하는 패턴 명시."
```

---

## Phase 3: 구조적 품질 향상

### Task 6: NEW-1 — LLM temperature/maxTokens 설정

**Files:**
- Modify: `src/shared/constants/ai.ts:31-36` (TOKEN_CONFIG)
- Modify: `src/server/features/chat/llm-client.ts:30-33` (streamText 호출)

**설계:**
- `TOKEN_CONFIG.default`에 `temperature`, `maxTokens` 추가 (G-10: 매직 넘버 금지)
- `llm-client.ts`에서 `streamText` 호출 시 해당 상수 참조
- `shared/types/ai.ts`의 `TokenConfig` 타입에 필드 추가 필요 여부 확인

- [ ] **Step 1: shared/types/ai.ts 확인**

```bash
cat src/shared/types/ai.ts
```

TokenConfig 타입에 temperature, maxTokens 필드가 있는지 확인.

- [ ] **Step 2: TokenConfig 타입 확장 (필요 시)**

`shared/types/ai.ts`에 필드 추가:

```typescript
export interface TokenConfig {
  maxTokens: number;
  historyLimit: number;
  temperature: number;
}
```

**의존 방향 검증:**
- `shared/types/ai.ts` → 다른 shared/types/ 내부만 (현재 독립) ✓
- `shared/constants/ai.ts` → `shared/types/ai.ts` (constants/ → types/ 정방향) ✓
- 역방향 없음 ✓

- [ ] **Step 3: TOKEN_CONFIG에 temperature 추가**

`shared/constants/ai.ts:31-36`:

```typescript
export const TOKEN_CONFIG: Record<string, TokenConfig> = {
  default: {
    maxTokens: 1024,
    historyLimit: 20,
    temperature: 0.4,
  },
};
```

temperature 0.4 근거:
- 추천 서비스는 일관성이 중요 → 0.3~0.5 범위
- 0.3은 너무 결정론적 (대화가 딱딱함), 0.5는 약간 산만
- 벤치마킹: PROVEN Skincare ~0.3, Sephora AI ~0.5, 일반 챗봇 0.7

- [ ] **Step 4: llm-client.ts에서 상수 참조**

`llm-client.ts` 상단 import 수정 (line 5):

```typescript
import { LLM_CONFIG, TOKEN_CONFIG } from '@/shared/constants/ai';
```

`streamText` 호출 2곳 (line 30-33, line 47-50) 모두에 적용:

```typescript
    return await streamText({
      model,
      ...options,
      temperature: TOKEN_CONFIG.default.temperature,
      maxTokens: TOKEN_CONFIG.default.maxTokens,
      abortSignal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
    });
```

**주의:** `...options` 뒤에 temperature/maxTokens를 배치하여, options에 같은 키가 있으면 오버라이드되도록 한다.

- [ ] **Step 5: 기존 테스트 통과 확인**

Run: `npx vitest run src/server/features/chat/llm-client.test.ts`

기존 테스트는 `mockStreamText`로 mock되어 있으므로 새 파라미터가 전달되는지만 확인하면 됨.
streamText mock이 호출 시 temperature/maxTokens가 포함되는지 기존 테스트에서 자동 확인 안 됨 (mock이 인자 무시). 기존 테스트 PASS 예상.

Run: `npx vitest run src/shared/constants/ai.test.ts`
Expected: TOKEN_CONFIG 구조 검증 테스트가 있다면 temperature 필드 추가 반영 필요.

- [ ] **Step 6: 커밋**

```bash
git add src/shared/types/ai.ts src/shared/constants/ai.ts src/server/features/chat/llm-client.ts
git commit -m "feat(NEW-1): LLM temperature 0.4 + maxTokens 1024 설정

TOKEN_CONFIG에 temperature 추가. streamText 호출에 적용.
추천 서비스 일관성 보장 (벤치마킹: 0.3~0.5 범위)."
```

---

### Task 7: NEW-2 — 프로필 자동 필터 merge

**Files:**
- Modify: `src/server/features/chat/tools/search-handler.ts:78-98` (searchShopping), `:134-154` (searchTreatment)

**설계:**
- LLM이 tool 호출 시 filters에 프로필 정보를 반영하지 않아도, 서버에서 context.profile/journey를 자동 merge
- merge 규칙: LLM이 명시적으로 보낸 필터가 우선. 비어있을 때만 프로필에서 보충
- beauty/ 모듈, repository 수정 없음

**아키텍처 검증:**
- `context.profile`은 이미 `SearchToolContext`로 전달받고 있음 (service.ts에서 구성)
- 새 import 없음
- repository 시그니처 변경 없음 (기존 필터 파라미터에 값만 추가)

- [ ] **Step 1: searchShopping에 프로필 자동 merge**

`search-handler.ts:86-92` 교체:

```typescript
  const productFilters = {
    skin_types: filters?.skin_types ?? (profile?.skin_type ? [profile.skin_type] : undefined),
    concerns: filters?.concerns,
    category: filters?.category,
    budget_max: filters?.budget_max_krw,
    search: undefined as string | undefined,
  };
```

변경점: `skin_types`에서 LLM이 비워두면 프로필의 skin_type을 자동 적용.
concerns는 journey에 있지만 자동 merge하지 않음 — concerns는 검색 의도에 따라 다를 수 있으므로 LLM 판단에 맡김.

- [ ] **Step 2: searchTreatment에 journey 자동 merge**

`search-handler.ts:141-147` 교체:

```typescript
  const treatmentFilters = {
    skin_types: filters?.skin_types,
    concerns: filters?.concerns,
    category: filters?.category,
    budget_max: filters?.budget_max_krw,
    max_downtime: filters?.max_downtime,
  };
```

Treatment은 skin_types 자동 merge 불필요 (시술은 피부타입보다 고민 기반).
max_downtime은 journey.stay_days에서 자동 계산 가능하지만, 이미 `scoreTreatments`에서 다운타임 필터링을 수행하므로 SQL 필터에서 중복하지 않음.

→ **searchTreatment는 변경 없음.**

- [ ] **Step 3: 기존 테스트 통과 확인**

Run: `npx vitest run src/server/features/chat/tools/search-handler.test.ts`
Expected: 기존 테스트 PASS (mock으로 인해 내부 필터 변경은 영향 없음)

- [ ] **Step 4: 커밋**

```bash
git add src/server/features/chat/tools/search-handler.ts
git commit -m "feat(NEW-2): searchShopping에 프로필 skin_type 자동 필터 merge

LLM이 skin_types 필터를 생략해도 프로필 데이터에서 자동 보충.
검색 정밀도 개선. repository/beauty 수정 없음."
```

---

### Task 8: NEW-4 — 히스토리 트리밍 (토큰 관리)

**Files:**
- Modify: `src/server/features/chat/service.ts:1-6` (import), `:104-108` (messages 조립)
- Test: `src/server/features/chat/service.test.ts`

**설계:**
- `TOKEN_CONFIG.default.historyLimit`를 사용하여 히스토리 메시지를 최신 N개로 트리밍
- messages 배열에서 최신 historyLimit개만 유지 → 이전 메시지는 LLM 컨텍스트에서 제외
- 시스템 프롬프트에 프로필이 이미 포함되므로 핵심 개인화 정보는 유실되지 않음

**아키텍처 검증:**
- `service.ts` → `shared/constants/ai` 신규 import (R-5 허용: shared/ import ✓)
- 역방향 없음
- 기존 `callWithFallback` 시그니처 변경 없음

- [ ] **Step 1: 테스트 작성 — 히스토리 트리밍 검증**

`service.test.ts`에 테스트 추가:

```typescript
  it('히스토리가 historyLimit 초과 시 최신 N개만 LLM에 전달', async () => {
    // historyLimit = 20 (TOKEN_CONFIG.default)
    // 25개 히스토리 + 1개 새 메시지 = 26개 → 최신 20개 히스토리 + 1개 새 메시지 = 21개
    const longHistory: ModelMessage[] = Array.from({ length: 25 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }));

    const client = makeMockClient({ selectData: { id: 'conv-123' } });

    const { streamChat } = await import('./service');
    await streamChat({
      client: client as unknown as Parameters<typeof streamChat>[0]['client'],
      userId: 'user-1',
      conversationId: 'conv-123',
      message: 'New message',
      history: longHistory,
      profile: mockProfile,
      journey: mockJourney,
      preferences: [],
      derived: mockDerived,
    });

    const callArgs = mockCallWithFallback.mock.calls[0][0];
    // 최신 20개 히스토리 + 1개 새 메시지 = 21개
    expect(callArgs.messages).toHaveLength(21);
    // 첫 메시지는 히스토리의 index 5 (25-20=5)
    expect(callArgs.messages[0]).toEqual({ role: 'assistant', content: 'Message 5' });
    // 마지막 메시지는 새 메시지
    expect(callArgs.messages[20]).toEqual({ role: 'user', content: 'New message' });
  });

  it('히스토리가 historyLimit 이하면 트리밍 없이 전체 전달', async () => {
    const shortHistory: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];

    const client = makeMockClient({ selectData: { id: 'conv-123' } });

    const { streamChat } = await import('./service');
    await streamChat({
      client: client as unknown as Parameters<typeof streamChat>[0]['client'],
      userId: 'user-1',
      conversationId: 'conv-123',
      message: 'How are you?',
      history: shortHistory,
      profile: mockProfile,
      journey: mockJourney,
      preferences: [],
      derived: mockDerived,
    });

    const callArgs = mockCallWithFallback.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(3); // 2 history + 1 current
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/server/features/chat/service.test.ts`
Expected: 히스토리 트리밍 테스트 FAIL (현재 트리밍 미구현)

**주의:** service.test.ts에서 `shared/constants/ai`를 mock해야 함. 기존 mock에 추가:

```typescript
vi.mock('@/shared/constants/ai', () => ({
  TOKEN_CONFIG: {
    default: {
      maxTokens: 1024,
      historyLimit: 20,
      temperature: 0.4,
    },
  },
}));
```

- [ ] **Step 3: service.ts에 import 추가 + 트리밍 구현**

`service.ts` 상단 import 추가:

```typescript
import { TOKEN_CONFIG } from '@/shared/constants/ai';
```

`service.ts:104-108` 수정:

```typescript
  // step 4: 히스토리 트리밍 (NEW-4: 토큰 관리) + 새 메시지 조합
  const trimmedHistory = params.history.length > TOKEN_CONFIG.default.historyLimit
    ? params.history.slice(-TOKEN_CONFIG.default.historyLimit)
    : params.history;

  const messages: ModelMessage[] = [
    ...trimmedHistory,
    { role: 'user' as const, content: message },
  ];
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/server/features/chat/service.test.ts`
Expected: 모든 테스트 PASS (기존 + 신규 2건)

- [ ] **Step 5: 커밋**

```bash
git add src/server/features/chat/service.ts src/server/features/chat/service.test.ts
git commit -m "feat(NEW-4): 히스토리 트리밍 — TOKEN_CONFIG.historyLimit 적용

대화 길이 증가 시 최신 20개 히스토리만 LLM에 전달.
토큰 비용 절감 + 컨텍스트 윈도우 초과 방지."
```

---

## Phase 4: 최종 검증

### Task 9: 전체 테스트 + 타입 체크 + 빌드 검증

- [ ] **Step 1: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 모든 테스트 PASS

- [ ] **Step 2: TypeScript 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0건

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 4: TODO.md 갱신**

P2-90~95, NEW-1, NEW-2, NEW-4 상태를 ✅로 변경.

---

## 자기 검증 체크리스트

### 아키텍처 (CLAUDE.md §1~§3)

```
✅ V-1  의존성 방향: 모든 수정이 app/ → server/, client/ → shared/ DAG 준수
✅ V-2  core 불변: core/ 파일 수정 0건
✅ V-3  Composition Root: cross-domain 데이터는 route handler에서 전달 (기존 유지)
✅ V-4  features 독립: service 간 직접 호출/import 없음
✅ V-5  콜 스택 ≤ 4: 기존 스택에 레이어 추가 없음
✅ V-7  beauty/ 순수 함수: beauty/ 모듈 수정 0건
✅ V-8  beauty/ 단방향: beauty/ 모듈 수정 0건
✅ V-16 shared/ 단방향: constants/ → types/ 정방향만 (NEW-1)
✅ V-17 제거 안전성: 모든 수정은 기존 모듈 내부. 삭제 시 외부 영향 없음
```

### 코드 품질 (CLAUDE.md §4, §6)

```
✅ G-1  기존 코드 분석 완료 (전체 파이프라인 Read)
✅ G-2  중복 없음 (TOKEN_CONFIG 기존 상수 재사용)
✅ G-5  기존 패턴 (service.test.ts mock 패턴, prompts.ts 섹션 패턴)
✅ G-6  core/ 수정 없음
✅ G-8  any 타입 없음
✅ G-10 매직 넘버 없음 (temperature, historyLimit 모두 상수)
✅ Q-4  strict TypeScript
✅ Q-9  exact versions (패키지 변경 없음)
```

### 프롬프트 설계 (system-prompt-spec.md)

```
✅ §9 First response: isFirstTurn 분기로 첫 턴에서만 인사
✅ §6 Tools: "When to call" 의도 감지 추가
✅ §4 Rules: 반복 방지 Rule 5 추가
✅ §9 Information gathering: Recommend→Ask One Thing 패턴
```
