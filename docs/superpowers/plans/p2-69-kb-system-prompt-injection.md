# P2-69: KB 시스템 프롬프트 주입 (Tool 기반 + 빌드 생성)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM이 대화 중 성분/시술 지식이 필요할 때 `lookup_beauty_knowledge` tool로 KB 문서를 조회하여 답변에 활용할 수 있도록 한다.

**Architecture:** docs/knowledge-base/*.md → 빌드 스크립트 → shared/constants/kb.generated.ts (런타임 상수). knowledge-handler가 상수에서 topic별 조회. service.ts가 4번째 tool로 등록. 시스템 프롬프트 §6에 사용 지침 추가.

**Tech Stack:** TypeScript, Zod, Vercel AI SDK 6.x

---

> 버전: 2.0
> 작성일: 2026-04-05
> 정본: embedding-strategy.md §2.4 ("MVP는 시스템 프롬프트 인라인 또는 파일 기반")
> 상위: TDD §3.2 ("Knowledge Base = 제품 DB + 장소 DB + 뷰티 지식 KB")
> 선행: P2-57 (KB 37종 작성 완료), P2-7 (core/knowledge.ts 완료), tool 스키마 co-location 리팩토링 완료

## 1. 방식: Tool 기반 조회 + 빌드 타임 생성

| 항목 | 결정 |
|------|------|
| LLM 조회 방식 | `lookup_beauty_knowledge` tool (필요 시 1~2개만, 토큰 ~500/건) |
| 데이터 소스 | docs/knowledge-base/*.md (단일 진실 공급원) |
| 런타임 데이터 | shared/constants/kb.generated.ts (빌드 스크립트 자동 생성) |
| P-7 보장 | KB 수정 = .md 1파일만 편집. .ts는 prebuild로 자동 생성 |

## 2. 파일 구조

```
scripts/
  └── generate-kb.ts                         ← CREATE: .md → .ts 변환 스크립트

src/shared/constants/
  ├── kb.generated.ts                        ← GENERATED: 빌드 시 자동 생성 (수동 편집 금지)
  └── index.ts                               ← MODIFY: kb.generated re-export 추가

src/server/features/chat/
  ├── service.ts                             ← MODIFY: 4번째 tool 등록
  ├── prompts.ts                             ← MODIFY: §6 TOOLS_SECTION에 설명 추가
  └── tools/
      ├── knowledge-handler.ts               ← CREATE: KB 조회 handler
      └── knowledge-handler.test.ts          ← CREATE: handler 테스트

package.json                                  ← MODIFY: prebuild 스크립트 추가

docs/knowledge-base/                          ← 변경 없음 (원본 유지)
```

**수정하지 않는 파일:** core/ 전부, 기존 handler 3개, beauty/, repositories/

## 3. 아키텍처 검증

### 3.1 의존성 방향

```
scripts/generate-kb.ts
  ├──→ node:fs, node:path (표준 라이브러리)
  └──→ (프로젝트 코드 import 없음. P-9 준수)

shared/constants/kb.generated.ts
  └──→ (import 없음. 순수 데이터 상수. L-13, L-16 준수)

knowledge-handler.ts
  ├──→ shared/constants/kb.generated (데이터 조회)
  ├──→ zod (스키마 정의)
  └──→ (core/, 다른 features/ import 없음)

역방향 없음:
  core/ → knowledge-handler         ✗ (R-3)
  shared/ → knowledge-handler       ✗ (R-4)
  다른 handler → knowledge-handler  ✗ (peer 독립)
  knowledge-handler → service.ts    ✗ (R-10)
```

### 3.2 규칙 전수 검증

| 규칙 | 검증 |
|------|------|
| P-1 (4계층 DAG) | ✅ app/ → server/features/ → shared/ 단방향 |
| P-2 (Core 불변) | ✅ core/ 수정 없음 |
| P-3 (Last Leaf) | ✅ knowledge-handler 제거 시 다른 features/ 무영향 |
| P-4 (Composition Root) | ✅ service.ts가 tool 등록 |
| P-5 (콜 스택 ≤ 4) | ✅ route → service → knowledge-handler (3단계) |
| P-7 (단일 변경점) | ✅ KB 추가 = .md 1파일 → prebuild 자동 반영 |
| P-8 (순환 금지) | ✅ 단방향만 |
| P-9 (scripts/ 자격) | ✅ generate-kb.ts → shared/ 출력 허용 |
| P-10 (제거 안전성) | ✅ knowledge-handler + kb.generated 삭제해도 다른 코드 무영향 |
| R-6 (tool handler) | ✅ shared/ import 허용 |
| R-10 (역호출 금지) | ✅ handler → service import 없음 |
| L-0a (server-only) | ✅ handler 첫 줄 |
| L-13 (shared/ 순수) | ✅ kb.generated.ts는 순수 상수, 부작용 없음 |
| L-16 (shared/ 단방향) | ✅ kb.generated.ts에 import 없음 |
| G-2 (중복 금지) | ✅ 단일 원본(.md), 자동 생성(.ts) |
| G-5 (기존 패턴) | ✅ 리팩토링된 handler 패턴(스키마 co-location) 따름 |
| G-8 (any 금지) | ✅ |

---

### Task 1: 빌드 스크립트 (generate-kb.ts)

**Files:**
- Create: `scripts/generate-kb.ts`

- [ ] **Step 1: 스크립트 작성**

```typescript
// scripts/generate-kb.ts
// docs/knowledge-base/*.md → src/shared/constants/kb.generated.ts
// P-9: scripts/ → shared/ 출력 허용. 프로젝트 코드 import 없음.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const KB_DIR = join(process.cwd(), 'docs', 'knowledge-base');
const OUTPUT = join(process.cwd(), 'src', 'shared', 'constants', 'kb.generated.ts');

interface KbEntry {
  topic: string;
  category: 'ingredient' | 'treatment';
  content: string;
}

function readKbFiles(subDir: string, category: 'ingredient' | 'treatment'): KbEntry[] {
  const dir = join(KB_DIR, subDir);
  const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  return files.map(file => ({
    topic: basename(file, '.md'),
    category,
    content: readFileSync(join(dir, file), 'utf-8'),
  }));
}

const ingredients = readKbFiles('ingredients', 'ingredient');
const treatments = readKbFiles('treatments', 'treatment');
const all = [...ingredients, ...treatments];

const ingredientTopics = ingredients.map(e => e.topic);
const treatmentTopics = treatments.map(e => e.topic);

// 이스케이프: 백틱과 ${} 처리
function escapeTemplate(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const lines = [
  '// ============================================================',
  '// KB 데이터 — 자동 생성 파일. 수동 편집 금지.',
  '// 원본: docs/knowledge-base/*.md',
  '// 생성: scripts/generate-kb.ts (npm run generate:kb)',
  '// ============================================================',
  '',
  `export const KB_INGREDIENT_TOPICS = [`,
  ...ingredientTopics.map(t => `  '${t}',`),
  `] as const;`,
  '',
  `export const KB_TREATMENT_TOPICS = [`,
  ...treatmentTopics.map(t => `  '${t}',`),
  `] as const;`,
  '',
  `export type KbIngredientTopic = typeof KB_INGREDIENT_TOPICS[number];`,
  `export type KbTreatmentTopic = typeof KB_TREATMENT_TOPICS[number];`,
  `export type KbTopic = KbIngredientTopic | KbTreatmentTopic;`,
  '',
  `export interface KbDocument {`,
  `  topic: KbTopic;`,
  `  category: 'ingredient' | 'treatment';`,
  `  content: string;`,
  `}`,
  '',
  `export const KB_DOCUMENTS: Record<KbTopic, KbDocument> = {`,
  ...all.map(e => [
    `  '${e.topic}': {`,
    `    topic: '${e.topic}',`,
    `    category: '${e.category}',`,
    `    content: \`${escapeTemplate(e.content)}\`,`,
    `  },`,
  ].join('\n')),
  `};`,
  '',
];

writeFileSync(OUTPUT, lines.join('\n'));
console.log(`[generate-kb] ${all.length} documents → ${OUTPUT}`);
```

- [ ] **Step 2: 실행 테스트**

Run: `npx tsx scripts/generate-kb.ts`
Expected: `[generate-kb] 37 documents → src/shared/constants/kb.generated.ts`

- [ ] **Step 3: 생성된 파일 확인**

Run: `head -30 src/shared/constants/kb.generated.ts && echo "..." && wc -l src/shared/constants/kb.generated.ts`
Expected: 헤더 주석 + topic 배열 + KB_DOCUMENTS Record 구조

---

### Task 2: package.json prebuild + shared/constants/index.ts

**Files:**
- Modify: `package.json:4-12` (scripts 섹션)
- Modify: `src/shared/constants/index.ts`

- [ ] **Step 1: package.json에 generate:kb + prebuild 추가**

```json
"scripts": {
  "dev": "next dev",
  "build": "npm run generate:kb && next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "generate:kb": "tsx scripts/generate-kb.ts"
}
```

- [ ] **Step 2: shared/constants/index.ts에 re-export 추가**

```typescript
export * from "./beauty";
export * from "./domains";
export * from "./ai";
export * from "./legal";
export * from "./kb.generated";
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit 2>&1 | grep kb.generated`
Expected: 에러 없음

---

### Task 3: knowledge-handler.ts (스키마 + execute)

**Files:**
- Create: `src/server/features/chat/tools/knowledge-handler.ts`

- [ ] **Step 1: handler 작성**

```typescript
import 'server-only';
import { z } from 'zod';
import {
  KB_DOCUMENTS,
  KB_INGREDIENT_TOPICS,
  KB_TREATMENT_TOPICS,
  type KbDocument,
} from '@/shared/constants/kb.generated';

// ============================================================
// lookup_beauty_knowledge Tool Handler
// R-6: tool handler. shared/constants에서 KB 데이터 조회.
// R-10: service 역호출 금지.
// P-3: 제거 시 다른 features/ 무영향.
// ============================================================

/** tool 입력 스키마 — service.ts에서 tool() inputSchema로 사용 */
export const lookupBeautyKnowledgeSchema = z.object({
  topic: z.string().describe(
    'Topic to look up. Use kebab-case. Examples: "retinol", "botox", "hyaluronic-acid"'
  ),
});

type KnowledgeArgs = z.infer<typeof lookupBeautyKnowledgeSchema>;

interface KnowledgeResult {
  found: boolean;
  topic: string;
  category: 'ingredient' | 'treatment' | null;
  content: string | null;
}

/**
 * lookup_beauty_knowledge tool execute 함수.
 * topic → KB_DOCUMENTS 조회 → 내용 반환.
 * 미존재 topic → { found: false }.
 */
export async function executeLookupBeautyKnowledge(
  args: KnowledgeArgs,
): Promise<KnowledgeResult> {
  const normalized = args.topic.toLowerCase().trim();
  const doc = KB_DOCUMENTS[normalized as keyof typeof KB_DOCUMENTS] as KbDocument | undefined;

  if (!doc) {
    return { found: false, topic: normalized, category: null, content: null };
  }

  return { found: true, topic: doc.topic, category: doc.category, content: doc.content };
}

/** 시스템 프롬프트에서 사용할 topic 목록 */
export const AVAILABLE_TOPICS = {
  ingredients: KB_INGREDIENT_TOPICS,
  treatments: KB_TREATMENT_TOPICS,
} as const;
```

---

### Task 4: knowledge-handler.test.ts

**Files:**
- Create: `src/server/features/chat/tools/knowledge-handler.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// kb.generated mock — 실제 파일 의존 없이 테스트
vi.mock('@/shared/constants/kb.generated', () => ({
  KB_DOCUMENTS: {
    retinol: {
      topic: 'retinol',
      category: 'ingredient',
      content: '# 레티놀 (Retinol)\n\nTest content for retinol.',
    },
    botox: {
      topic: 'botox',
      category: 'treatment',
      content: '# 보톡스 (Botox)\n\nTest content for botox.',
    },
  },
  KB_INGREDIENT_TOPICS: ['retinol'],
  KB_TREATMENT_TOPICS: ['botox'],
}));

import {
  executeLookupBeautyKnowledge,
  lookupBeautyKnowledgeSchema,
  AVAILABLE_TOPICS,
} from './knowledge-handler';

describe('knowledge-handler', () => {
  describe('executeLookupBeautyKnowledge', () => {
    it('존재하는 ingredient topic → found: true + content 반환', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: 'retinol' });
      expect(result.found).toBe(true);
      expect(result.category).toBe('ingredient');
      expect(result.content).toContain('레티놀');
    });

    it('존재하는 treatment topic → found: true + content 반환', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: 'botox' });
      expect(result.found).toBe(true);
      expect(result.category).toBe('treatment');
      expect(result.content).toContain('보톡스');
    });

    it('미존재 topic → found: false', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: 'unknown-topic' });
      expect(result.found).toBe(false);
      expect(result.category).toBeNull();
      expect(result.content).toBeNull();
    });

    it('대소문자 정규화: "RETINOL" → "retinol" 매칭', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: 'RETINOL' });
      expect(result.found).toBe(true);
      expect(result.topic).toBe('retinol');
    });

    it('공백 트림: " retinol " → "retinol" 매칭', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: ' retinol ' });
      expect(result.found).toBe(true);
      expect(result.topic).toBe('retinol');
    });

    it('빈 문자열 → found: false', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: '' });
      expect(result.found).toBe(false);
    });
  });

  describe('lookupBeautyKnowledgeSchema', () => {
    it('유효 입력 파싱 성공', () => {
      const result = lookupBeautyKnowledgeSchema.safeParse({ topic: 'retinol' });
      expect(result.success).toBe(true);
    });

    it('topic 누락 → 파싱 실패', () => {
      const result = lookupBeautyKnowledgeSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('AVAILABLE_TOPICS', () => {
    it('ingredients와 treatments 배열이 존재', () => {
      expect(AVAILABLE_TOPICS.ingredients).toEqual(['retinol']);
      expect(AVAILABLE_TOPICS.treatments).toEqual(['botox']);
    });
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run src/server/features/chat/tools/knowledge-handler.test.ts`
Expected: 전체 PASS (8개)

---

### Task 5: service.ts에 4번째 tool 등록

**Files:**
- Modify: `src/server/features/chat/service.ts`

- [ ] **Step 1: import 추가**

service.ts 상단 import에 추가:
```typescript
import { executeLookupBeautyKnowledge, lookupBeautyKnowledgeSchema } from './tools/knowledge-handler';
```

- [ ] **Step 2: buildTools에 tool 등록**

```typescript
function buildTools(...) {
  return {
    search_beauty_data: tool({ ... }),
    get_external_links: tool({ ... }),
    extract_user_profile: tool({ ... }),
    lookup_beauty_knowledge: tool({
      description: 'Look up detailed K-beauty knowledge about a specific ingredient or treatment.',
      inputSchema: lookupBeautyKnowledgeSchema,
      execute: async (args) => executeLookupBeautyKnowledge(args),
    }),
  };
}
```

- [ ] **Step 3: MAX_TOOL_STEPS 확인**

현재 `MAX_TOOL_STEPS = 3`. 4개 tool이지만 한 턴에 최대 3번 호출 제한은 유지. KB 조회 + 검색 + 추출 = 3번이면 충분.

---

### Task 6: prompts.ts §6 TOOLS_SECTION에 설명 추가

**Files:**
- Modify: `src/server/features/chat/prompts.ts`

- [ ] **Step 1: TOOLS_SECTION 끝(extract_user_profile 뒤)에 추가**

`This tool runs as part of your response, not as a separate action` 뒤에:

```

### lookup_beauty_knowledge
Look up detailed knowledge about a specific K-beauty ingredient or treatment.
Returns expert-level information including skin type suitability, precautions, and K-beauty tips.

**When to call:**
- User asks about a specific ingredient ("What is retinol?", "Is niacinamide good for oily skin?")
- User asks about a specific treatment ("Tell me about botox", "What's the downtime for microneedling?")
- User asks about ingredient interactions or precautions
- You need expert context to give accurate advice about an ingredient or treatment

**When NOT to call:**
- User asks for product/treatment recommendations (use search_beauty_data instead)
- You already looked up the same topic earlier in this conversation
- General skincare questions you can answer without specific ingredient/treatment data

**Available topics:**
Ingredients: adenosine, arbutin, ascorbic-acid, azelaic-acid, centella-asiatica-extract, ceramide-np, ginseng-extract, glycolic-acid, green-tea-extract, hyaluronic-acid, mugwort-extract, niacinamide, panthenol, propolis-extract, retinol, rice-extract, salicylic-acid, snail-secretion-filtrate, squalane, tocopherol
Treatments: aqua-peel, body-contouring, botox, chemical-peel, co2-laser, filler, fractional-laser, hydrafacial, ipl, laser-toning, led-therapy, microneedling, pico-laser, scalp-treatment, skin-booster, thread-lift, vitamin-drip

**If topic not found:** Tell the user you don't have detailed information on that specific topic, but offer general advice based on your knowledge.
```

---

### Task 7: service.test.ts mock 업데이트 + 전체 검증

**Files:**
- Modify: `src/server/features/chat/service.test.ts`

- [ ] **Step 1: knowledge-handler mock 추가**

```typescript
const mockExecuteLookupBeautyKnowledge = vi.fn();
vi.mock('./tools/knowledge-handler', () => ({
  executeLookupBeautyKnowledge: (...args: unknown[]) => mockExecuteLookupBeautyKnowledge(...args),
  lookupBeautyKnowledgeSchema: {},
}));
```

- [ ] **Step 2: tool 키 검증 테스트 수정**

기존 "3개 tool 키가 등록된다" → "4개 tool 키가 등록된다"로 업데이트.

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run src/server/features/chat/`
Expected: 전체 PASS

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit 2>&1 | grep -E "knowledge|kb.generated|service.ts"`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add scripts/generate-kb.ts src/shared/constants/kb.generated.ts src/shared/constants/index.ts \
  src/server/features/chat/tools/knowledge-handler.ts src/server/features/chat/tools/knowledge-handler.test.ts \
  src/server/features/chat/service.ts src/server/features/chat/service.test.ts \
  src/server/features/chat/prompts.ts package.json
git commit -m "feat(P2-69): KB 시스템 프롬프트 주입 — lookup_beauty_knowledge tool

- generate-kb.ts: docs/knowledge-base/*.md → shared/constants/kb.generated.ts 빌드 생성
- knowledge-handler: KB_DOCUMENTS 조회 + zod 스키마 co-location
- service.ts: 4번째 tool 등록
- prompts.ts: §6 TOOLS_SECTION에 사용 지침 추가
- package.json: build에 generate:kb 통합
- 37종 KB (성분 20 + 시술 17) 활성화"
```

---

## 검증 체크리스트

```
□ V-1  의존성 방향: knowledge-handler → shared/constants/kb.generated만. 역방향 없음
□ V-2  core 불변: core/ 파일 수정 없음
□ V-3  Composition Root: service.ts가 tool 등록 (P-4)
□ V-4  features 독립: knowledge-handler ↔ 기존 handler 간 import 없음
□ V-5  콜 스택 ≤ 4: route → service → knowledge-handler (3단계)
□ V-9  중복: 기존 handler와 동일 기능 없음
□ V-17 제거 안전성: knowledge-handler + kb.generated 삭제 → service.ts/prompts.ts/index.ts 수정만
□ V-18 scripts/ 의존 방향: generate-kb.ts → shared/ 출력만. 역방향 없음
□ G-5  기존 패턴: 리팩토링된 handler 패턴(스키마 co-location) 따름
□ G-8  any 타입 없음
□ L-0a server-only 첫 줄 (knowledge-handler.ts)
□ L-13 shared/constants/kb.generated.ts: 순수 상수, 런타임 부작용 없음
□ L-16 kb.generated.ts: import 없음 (단방향 위반 불가)
□ P-7  KB 추가 = .md 1파일 → prebuild 자동 반영 (단일 변경점)
□ N-2  파일명 kebab-case
□ N-4  함수명 camelCase 동사 시작
□ Q-7  미존재 topic → { found: false } 반환 (에러 불삼킴)
```
