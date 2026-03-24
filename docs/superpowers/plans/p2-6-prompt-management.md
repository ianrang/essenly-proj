# P2-6: 프롬프트 관리 모듈 구현 계획

**Goal:** system-prompt-spec.md §2~§10의 프롬프트 텍스트를 코드 상수로 구현. `buildSystemPrompt(context)` 순수 함수가 컨텍스트에 따라 섹션 조립.

**Architecture:** `features/chat/prompts.ts` 단일 파일. 비즈니스 코드 (K-뷰티 용어 포함). core/ 무관.

---

## 설계 근거

- system-prompt-spec.md §1: 파이프라인 아키텍처 (buildSystemPrompt 시그니처, 조립 순서)
- system-prompt-spec.md §2~§10: 각 섹션 프롬프트 텍스트 원문
- system-prompt-spec.md §0: 프롬프트 관리 전략 (MVP=코드 상수)
- CLAUDE.md: L-0a(server-only), P-7(단일 변경점), G-9(export 최소화), L-14(내부 타입)

## 파일 구조

```
src/server/features/chat/
  ├── prompts.ts       ← MODIFY: 스켈레톤 → 전체 구현
  └── prompts.test.ts  ← CREATE: 조립 함수 테스트
```

## 의존성 방향

```
prompts.ts → shared/types/profile.ts (UserProfile, Journey, RealtimeContext, DerivedVariables)
prompts.ts → (없음 — core/ import 없음, DB/API 호출 없음)

역방향 없음:
shared/ → prompts.ts  ✗ (R-4)
core/   → prompts.ts  ✗ (R-3)
```

## 구현 구조

```typescript
// --- 컨텍스트 타입 (chatService에서도 사용 → export) ---
export interface SystemPromptContext {
  profile: UserProfile | null;
  journey: Journey | null;
  realtime: RealtimeContext;
  derived: DerivedVariables | null;
  learnedPreferences: LearnedPreference[];
}

// --- 고정 섹션 상수 6개 (§2~§7) ---
const ROLE_SECTION = `...`;           // §2 — system-prompt-spec.md line 168-189
const DOMAINS_SECTION = `...`;        // §3 — line 198-215
const RULES_SECTION = `...`;          // §4 — line 224-242
const GUARDRAILS_SECTION = `...`;     // §5 — line 252-488
const TOOLS_SECTION = `...`;          // §6 — line 429-488
const CARD_FORMAT_SECTION = `...`;    // §7 — line 501-551

// --- 동적 섹션 함수 3개 (§8, §9, §10) ---
function buildUserProfileSection(ctx: SystemPromptContext): string    // §8
function buildNoProfileSection(realtime: RealtimeContext): string     // §9
function buildBeautyProfileSection(derived: DerivedVariables): string // §10

// --- 조립 함수 (유일한 export) ---
export function buildSystemPrompt(context: SystemPromptContext): string
```

---

### Task 1: 테스트 작성

- [ ] **Step 1:** prompts.test.ts 작성

테스트 케이스:
1. **경로A (완전 프로필)**: profile + journey + derived → §2~§8+§10 포함, §9 미포함
2. **경로B (프로필 없음)**: profile=null → §2~§7+§9 포함, §8/§10 미포함
3. **부분 프로필 (VP-3)**: profile 존재 + 일부 null → §8 포함, null 필드 "not specified"
4. **DV 없음**: profile 존재 + derived=null → §8 포함, §10 미포함
5. **고정 섹션 포함 확인**: 모든 경우에 Role/Domains/Rules/Guardrails/Tools/CardFormat 포함
6. **§8/§9 상호 배제**: 동시에 둘 다 포함되지 않음

### Task 2: 구현

- [ ] **Step 2:** 테스트 실패 확인
- [ ] **Step 3:** prompts.ts 구현 — 고정 섹션 6개 상수 + 동적 함수 3개 + buildSystemPrompt
- [ ] **Step 4:** 테스트 통과 확인
- [ ] **Step 5:** 전체 테스트 확인
- [ ] **Step 6:** 커밋

---

## 프롬프트 텍스트 원본 출처

| 섹션 | system-prompt-spec.md 참조 | 포함 조건 |
|------|--------------------------|----------|
| §2 Role | §2 코드 블록 (168-189) | 항상 |
| §3 Domains | §3 코드 블록 (198-215) | 항상 |
| §4 Rules | §4 코드 블록 (224-242) | 항상 |
| §5 Guardrails | §5 기본(252-276) + §5.1 Medical(293-310) + §5.2 Off-topic(333-355) + §5.3 Adversarial(378-408) + 템플릿들 | 항상 |
| §6 Tools | §6 코드 블록 (429-489) | 항상 |
| §7 Card Format | §7 코드 블록 (501-551) | 항상 |
| §8 User Profile | §8 템플릿 (567-592, 동적 주입) | profile 존재 시 |
| §9 No Profile | §9 기본(614-641) + §9.1 첫 응답(654-666) + §9.2 추출(675-703) + §9.3 저장 제안(710-724) | profile 미존재 시 |
| §10 Beauty Profile | §10 코드 블록 (742-753, DV-1/2/4 주입) | derived 존재 시 |

## 완료 후 검증 체크리스트

```
□ L-0a   import 'server-only' 첫 줄
□ P-7    프롬프트 변경 = prompts.ts 1파일만 수정
□ G-9    export 최소화 (buildSystemPrompt + SystemPromptContext)
□ L-14   내부 헬퍼 함수/상수 export 안 함 (buildUserProfileSection 등 비공개)
□ G-8    any 타입 없음
□ 순수 함수  DB/API/await 호출 없음
□ R-5    import: shared/types/ 만 (core/ import 없음)
□ P-8    순환 참조 없음
□ §8/§9  상호 배제 (동시 포함 불가)
□ VP-3   null 필드 → "not specified" (거부 아닌 범용 추천)
□ 설계 1:1 원문에서 프롬프트 텍스트 복사 (수정/의역 금지)
```
