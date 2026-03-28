# P2-22: extract_user_profile Tool Handler 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM 동기 tool `extract_user_profile` 구현. LLM이 추출한 프로필 데이터를 tool-result로 반환. DB 저장 없음 (저장은 P2-19 chatService onFinish).

**Architecture:** `features/chat/tools/extraction-handler.ts`에 구현. execute 함수는 LLM이 전달한 추출 결과를 검증 후 반환. DB 호출/repository/beauty import 없음. zod 스키마가 핵심 — tool-spec.md §3 정본.

**Tech Stack:** TypeScript, Zod, Vitest

---

## 선행 확인

- [x] PoC p0-17-extraction.ts: 93% 정확도 검증 (P0-17)
- [x] tool-spec.md §3: 출력 스키마 + 변수 매핑 + 에러 처리 정의
- [x] system-prompt-spec.md §6: LLM tool 호출 가이드 정의
- [x] P1-33 확정: 동기 tool 방식

## 설계 근거

| 결정 | 근거 | 원문 위치 |
|------|------|----------|
| execute: args 반환 (DB 없음) | tool-spec.md §3: "입력 없음. LLM이 추출하여 출력 스키마에 맞게 반환" | tool-spec.md:259-261 |
| DB 저장은 P2-19 범위 | api-spec.md §3.4 step 11: "비동기 조건부 저장" | api-spec.md:461-463, tool-spec.md:316-319 |
| zod 스키마: tool-spec.md §3 정본 | PoC의 budget_level 'mid' → 프로덕션 'moderate' | tool-spec.md:283 |
| 에러: extraction_skipped 반환 | tool-spec.md §4.2: "graceful degradation, 대화 중단 없음" | tool-spec.md:358 |
| direction 변환 (prefer→like) 미포함 | P2-19 chatService onFinish에서 처리 | tool-spec.md:319 |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `src/server/features/chat/tools/extraction-handler.ts` | 신규 | extract_user_profile execute 함수 + zod 스키마 |
| `src/server/features/chat/tools/extraction-handler.test.ts` | 신규 | 단위 테스트 5개 |

## 의존성 방향 검증

```
chat/tools/extraction-handler.ts
  └──→ zod (외부 라이브러리 — 스키마 정의)

  ✗ repositories/ import 없음 (DB 조회 없음)
  ✗ beauty/ import 없음
  ✗ core/ import 없음
  ✗ shared/ import 없음 (스키마 타입은 zod에서 추론)
  ✗ chat/service.ts import 없음 (R-10)
  순환 참조 없음
```

**콜 스택 (P-5 ≤ 4)**: route(①) → chatService(②) → extraction-handler(③) — DB 호출 없으므로 3단계. ✓

## G-3 패스스루 래퍼 규칙 검토

G-3: "인자를 그대로 전달만 하는 함수/컴포넌트 생성 금지"

**적용 안 됨**: AI SDK tool 계약상 execute 함수가 필수. LLM tool_use 결과를 수신하여 구조화된 반환으로 변환하는 것은 SDK 인터페이스 요구사항이며, 단순 패스스루가 아님:
1. args 수신 (LLM 추출 결과)
2. 타입 안전 반환 (`ExtractionResult` 인터페이스로 구조화)
3. 에러 발생 시 graceful degradation (`extraction_skipped`)

---

## Task 1: extraction-handler.ts 구현 + 테스트

**Files:**
- Create: `src/server/features/chat/tools/extraction-handler.ts`
- Create: `src/server/features/chat/tools/extraction-handler.test.ts`

- [ ] **Step 1: extraction-handler.ts 작성**

```typescript
import 'server-only';
import { z } from 'zod';

// ============================================================
// extract_user_profile Tool Handler — tool-spec.md §3
// 동기 tool (P1-33 확정). LLM이 대화에서 프로필 정보를 추출.
// execute: 추출 결과 반환. DB 저장 없음 (P2-19 chatService onFinish에서 처리).
// tool-spec.md §4.2: 실패 → extraction_skipped. 대화 중단 없음.
// ============================================================

/** tool-spec.md §3 출력 스키마 — PoC p0-17 계승 (93% 정확도 검증) */
export const extractUserProfileSchema = z.object({
  skin_type: z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal'])
    .nullable()
    .describe('Skin type if explicitly mentioned. null if not mentioned.'),

  skin_concerns: z.array(
    z.enum([
      'acne', 'wrinkles', 'dark_spots', 'redness', 'dryness',
      'pores', 'dullness', 'dark_circles', 'uneven_tone', 'sun_damage', 'eczema',
    ])
  ).nullable()
    .describe('Skin concerns if mentioned. null if not mentioned.'),

  stay_days: z.number()
    .nullable()
    .describe('Number of days staying in Korea, if mentioned. null if not.'),

  budget_level: z.enum(['budget', 'moderate', 'premium', 'luxury'])
    .nullable()
    .describe('Budget level. <30K=budget, 30-80K=moderate, 80-200K=premium, >200K=luxury. null if not mentioned.'),

  age_range: z.enum(['18-24', '25-29', '30-34', '35-39', '40-49', '50+'])
    .nullable()
    .describe('Age range if mentioned or clearly inferable. null if not.'),

  learned_preferences: z.array(
    z.object({
      item: z.string().describe('Ingredient or product type'),
      direction: z.enum(['prefer', 'avoid']),
    })
  ).nullable()
    .describe('Explicit ingredient/product preferences. null if not mentioned.'),
});

/** 추출 성공 결과 */
export type ExtractionResult = z.infer<typeof extractUserProfileSchema>;

/** 추출 실패 결과 (tool-spec.md §4.2) */
interface ExtractionSkipped {
  status: 'extraction_skipped';
  reason: string;
}

/**
 * extract_user_profile tool execute 함수.
 * tool-spec.md §3: LLM이 추출한 프로필 데이터를 tool-result로 반환.
 * DB 저장 없음 — chatService(P2-19) onFinish에서 조건부 저장.
 * tool-spec.md §4.2: 실패 → extraction_skipped. 대화 중단 없음.
 */
export async function executeExtractUserProfile(
  args: unknown,
): Promise<ExtractionResult | ExtractionSkipped> {
  try {
    const parsed = extractUserProfileSchema.parse(args);
    return parsed;
  } catch (error) {
    // tool-spec.md §4.2: graceful degradation + 서버 로그 (Q-7). 대화 중단 없음.
    console.error('[extract_user_profile] parse failed', String(error));
    return { status: 'extraction_skipped', reason: 'parse_error' };
  }
}
```

- [ ] **Step 2: 테스트 파일 작성**

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('extraction-handler', () => {
  describe('executeExtractUserProfile', () => {
    it('정상 추출 → 프로필 반환', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_type: 'oily',
        skin_concerns: ['acne', 'pores'],
        stay_days: 5,
        budget_level: 'moderate',
        age_range: '25-29',
        learned_preferences: [{ item: 'niacinamide', direction: 'prefer' }],
      });

      expect(result).toEqual({
        skin_type: 'oily',
        skin_concerns: ['acne', 'pores'],
        stay_days: 5,
        budget_level: 'moderate',
        age_range: '25-29',
        learned_preferences: [{ item: 'niacinamide', direction: 'prefer' }],
      });
    });

    it('전부 null → 정상 동작 (VP-3)', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_type: null,
        skin_concerns: null,
        stay_days: null,
        budget_level: null,
        age_range: null,
        learned_preferences: null,
      });

      expect(result).toEqual({
        skin_type: null,
        skin_concerns: null,
        stay_days: null,
        budget_level: null,
        age_range: null,
        learned_preferences: null,
      });
    });

    it('부분 추출 → null 필드 유지', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_type: 'dry',
        skin_concerns: null,
        stay_days: 7,
        budget_level: null,
        age_range: null,
        learned_preferences: null,
      });

      expect((result as { skin_type: string }).skin_type).toBe('dry');
      expect((result as { stay_days: number }).stay_days).toBe(7);
      expect((result as { budget_level: null }).budget_level).toBeNull();
    });

    it('잘못된 입력 → extraction_skipped', async () => {
      const { executeExtractUserProfile } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );
      const result = await executeExtractUserProfile({
        skin_type: 'invalid_value',
      });

      expect(result).toEqual({
        status: 'extraction_skipped',
        reason: 'parse_error',
      });
    });

    it('zod 스키마: budget_level moderate (not mid)', async () => {
      const { extractUserProfileSchema } = await import(
        '@/server/features/chat/tools/extraction-handler'
      );

      expect(() => extractUserProfileSchema.parse({
        skin_type: null, skin_concerns: null, stay_days: null,
        budget_level: 'mid', age_range: null, learned_preferences: null,
      })).toThrow();

      const result = extractUserProfileSchema.parse({
        skin_type: null, skin_concerns: null, stay_days: null,
        budget_level: 'moderate', age_range: null, learned_preferences: null,
      });
      expect(result.budget_level).toBe('moderate');
    });
  });
});
```

- [ ] **Step 3: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/server/features/chat/tools/extraction-handler.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 4: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 + 5개 모두 PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/features/chat/tools/extraction-handler.ts src/server/features/chat/tools/extraction-handler.test.ts
git commit -m "feat(P2-22): extract_user_profile tool handler — 동기 프로필 추출

zod 스키마 (tool-spec.md §3 정본, PoC p0-17 계승). 6개 변수 추출.
execute: args parse → 반환. DB 저장 없음 (P2-19 onFinish 담당).
에러 → extraction_skipped (§4.2). budget_level 'moderate' (PoC 'mid' 수정).
테스트 5개.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: extraction-handler → zod(외부 라이브러리) ONLY. shared/repositories/beauty/core 미import
[ ] V-2  core/ 수정 없음
[ ] V-5  콜 스택 ≤ 4: route → chatService → extraction-handler (3단계)
[ ] V-8  순환 없음
[ ] V-17 제거 안전성
```

### 품질

```
[ ] R-6  tool handler import 범위 준수
[ ] R-10 service 역호출 없음
[ ] Q-1  zod 스키마 검증 (tool_use 파라미터)
[ ] Q-7  에러 불삼킴: catch에서 extraction_skipped 반환
[ ] Q-14 스키마: tool-spec.md §3 budget_level 'moderate' (not 'mid')
[ ] G-4  미사용 import 없음
[ ] G-9  export: executeExtractUserProfile + extractUserProfileSchema + ExtractionResult (3개)
[ ] VP-3 null-safe: 전 필드 nullable
```

## export 범위 (G-9)

| export | 소비자 |
|--------|--------|
| `executeExtractUserProfile()` | chatService (P2-19) — tool execute |
| `extractUserProfileSchema` | chatService (P2-19) — AI SDK tool 정의 시 inputSchema |
| `ExtractionResult` (type) | chatService (P2-19) — 추출 결과 타입 |

3개 export. LinksArgs, ExtractionSkipped는 내부 (L-14).
