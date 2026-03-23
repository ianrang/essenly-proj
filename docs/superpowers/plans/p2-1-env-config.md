# P2-1: 환경변수 + 설정 모듈 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 서버 코드의 기반이 되는 환경변수 Zod 검증 + 설정 접근 모듈 구축

**Architecture:** server/core/config.ts가 process.env를 Zod로 검증하여 타입-안전한 env 객체를 export. shared/constants/ai.ts가 LLM/토큰 상수를 정의. 다른 모든 서버 파일은 env 객체와 상수만 import (Q-8: process.env 직접 접근 금지).

**Tech Stack:** Zod 4.x, Vercel AI SDK 6.x (@ai-sdk/anthropic, @ai-sdk/google), Vitest

---

## 설계 근거

- 환경변수 스키마: `security-infra.md` §1.3
- getModel 팩토리: `llm-resilience.md` §1.1
- LLM_CONFIG 상수: `llm-resilience.md` §2.3
- TOKEN_CONFIG 상수: `token-management.md` §1.2
- 코드 규칙: CLAUDE.md Q-8 (env 런타임 검증), L-5 (core에 비즈니스 용어 금지), L-0a (server-only), L-14 (모듈 내부 전용 타입은 해당 모듈에 선언), G-10 (매직 넘버 금지)

## 파일 구조

```
src/
├── shared/
│   ├── types/
│   │   └── ai.ts              ← CREATE: TokenConfig 타입 (다른 모듈에서 참조)
│   ├── constants/
│   │   └── ai.ts              ← CREATE: LLM_CONFIG + TOKEN_CONFIG
│   └── types/index.ts         ← MODIFY: ai.ts re-export 추가
│
├── server/
│   └── core/
│       └── config.ts          ← MODIFY: 스켈레톤 → Zod 검증 + getModel + env export
│
├── .env.example               ← MODIFY: 신규 환경변수 추가
│
└── (tests: vitest include = src/**/*.test.{ts,tsx})
    src/shared/constants/ai.test.ts        ← CREATE: 상수 테스트
    src/server/core/config.test.ts         ← CREATE: config 테스트
```

## 의존성 방향 (순환 없음)

```
shared/types/ai.ts → (없음)
shared/constants/ai.ts → shared/types/ai.ts (type import만)
server/core/config.ts → 외부 SDK만 (@ai-sdk/*, zod). shared/ import 없음
```

- config.ts 내부 전용 타입(AIProvider)은 L-14에 따라 config.ts 내부에 인라인 정의. shared/ 미참조.
- shared/constants/ai.ts는 server/ import 없음 (L-0c 준수)
- 순환 참조 없음 (P-8)

## MVP 프로바이더 범위

TDD §2.4에 따라 MVP 설치 패키지는 `@ai-sdk/anthropic` + `@ai-sdk/google`만. `@ai-sdk/openai`는 미설치.
따라서 getModel()에서 openai case는 구현하지 않고, AIProvider 타입에서 openai 제외.
envSchema의 AI_PROVIDER enum도 `['anthropic', 'google']`로 제한. openai는 v0.2에서 패키지 설치와 함께 추가.

---

### Task 1: shared/types/ai.ts — TokenConfig 타입 정의

**Files:**
- Create: `src/shared/types/ai.ts`
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: 타입 파일 생성**

```typescript
// src/shared/types/ai.ts
// ============================================================
// AI Configuration Types — token-management.md §1.2
// L-0c: server-only, client-only import 금지
// ============================================================

/** 임베딩 프로바이더 식별자 */
export type EmbeddingProvider = 'google' | 'voyage' | 'openai';

/** 모델별 토큰 설정 (token-management.md §1.2) */
export interface TokenConfig {
  /** LLM 응답 최대 토큰. streamText({ maxOutputTokens }) 에 사용 (AI SDK 6.x) */
  maxTokens: number;
  /** 히스토리 로드 최대 턴 수 (1턴 = user 메시지 기준, token-management.md §1.3) */
  historyLimit: number;
}
```

> 참고: AIProvider 타입은 config.ts 내부에 인라인 정의 (L-14). shared/types/ai.ts에서는 서버 전용이 아닌 타입만 export.

- [ ] **Step 2: index.ts에 re-export 추가**

`src/shared/types/index.ts`에 추가:
```typescript
export * from "./ai";
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/shared/types/ai.ts src/shared/types/index.ts
git commit -m "P2-1: shared/types/ai.ts — TokenConfig, EmbeddingProvider 타입 정의"
```

---

### Task 2: shared/constants/ai.ts — LLM_CONFIG + TOKEN_CONFIG 상수

**Files:**
- Create: `src/shared/constants/ai.ts`
- Create: `src/shared/constants/ai.test.ts`
- Modify: `src/shared/constants/index.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/shared/constants/ai.test.ts
import { describe, it, expect } from 'vitest';
import { LLM_CONFIG, TOKEN_CONFIG } from '@/shared/constants/ai';

describe('LLM_CONFIG', () => {
  it('FALLBACK_TRIGGER_CODES에 서버 에러 코드 포함', () => {
    expect(LLM_CONFIG.FALLBACK_TRIGGER_CODES).toContain(500);
    expect(LLM_CONFIG.FALLBACK_TRIGGER_CODES).toContain(429);
    expect(LLM_CONFIG.FALLBACK_TRIGGER_CODES).toContain(503);
  });

  it('NO_FALLBACK_CODES에 클라이언트 에러 코드 포함', () => {
    expect(LLM_CONFIG.NO_FALLBACK_CODES).toContain(400);
    expect(LLM_CONFIG.NO_FALLBACK_CODES).toContain(401);
    expect(LLM_CONFIG.NO_FALLBACK_CODES).toContain(422);
  });

  it('FALLBACK_TRIGGER_CODES와 NO_FALLBACK_CODES 겹치지 않음', () => {
    const overlap = LLM_CONFIG.FALLBACK_TRIGGER_CODES.filter(
      (code) => (LLM_CONFIG.NO_FALLBACK_CODES as readonly number[]).includes(code)
    );
    expect(overlap).toHaveLength(0);
  });

  it('MAX_ATTEMPTS는 2 (주 1회 + 폴백 1회)', () => {
    expect(LLM_CONFIG.MAX_ATTEMPTS).toBe(2);
  });

  it('FALLBACK_DELAY_MS는 양수', () => {
    expect(LLM_CONFIG.FALLBACK_DELAY_MS).toBeGreaterThan(0);
  });
});

describe('TOKEN_CONFIG', () => {
  it('default 설정이 존재', () => {
    expect(TOKEN_CONFIG['default']).toBeDefined();
  });

  it('default.maxTokens는 1024', () => {
    expect(TOKEN_CONFIG['default'].maxTokens).toBe(1024);
  });

  it('default.historyLimit는 20', () => {
    expect(TOKEN_CONFIG['default'].historyLimit).toBe(20);
  });

  it('모든 설정의 maxTokens가 양수', () => {
    for (const config of Object.values(TOKEN_CONFIG)) {
      expect(config.maxTokens).toBeGreaterThan(0);
    }
  });

  it('모든 설정의 historyLimit가 양수', () => {
    for (const config of Object.values(TOKEN_CONFIG)) {
      expect(config.historyLimit).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/shared/constants/ai.test.ts`
Expected: FAIL (모듈 미존재)

- [ ] **Step 3: 상수 파일 구현**

```typescript
// src/shared/constants/ai.ts
// ============================================================
// AI Constants — llm-resilience.md §2.3 + token-management.md §1.2
// L-13: 순수 상수만. 런타임 부작용 금지.
// L-0c: server-only, client-only import 금지.
// ============================================================

import type { TokenConfig } from '../types/ai';

/**
 * LLM 폴백 설정 (llm-resilience.md §2.3)
 * G-10: 매직 넘버 금지 — 명명된 상수로 선언
 */
export const LLM_CONFIG = {
  /** 이 HTTP 상태 코드에서 폴백 시도 */
  FALLBACK_TRIGGER_CODES: [408, 429, 500, 502, 503, 504] as const,

  /** 이 HTTP 상태 코드에서 폴백 안 함 (즉시 에러 반환) */
  NO_FALLBACK_CODES: [400, 401, 403, 404, 422] as const,

  /** 최대 시도 횟수 (주 1회 + 폴백 1회) */
  MAX_ATTEMPTS: 2,

  /** 폴백 전 대기 시간 (ms) */
  FALLBACK_DELAY_MS: 100,
} as const;

/**
 * 모델별 토큰 설정 (token-management.md §1.2)
 * MVP는 default만 사용. v0.2에서 모델별 설정 추가 가능.
 */
export const TOKEN_CONFIG: Record<string, TokenConfig> = {
  default: {
    maxTokens: 1024,
    historyLimit: 20,
  },
};
```

- [ ] **Step 4: index.ts에 re-export 추가**

`src/shared/constants/index.ts`에 추가:
```typescript
export * from "./ai";
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/shared/constants/ai.test.ts`
Expected: PASS (전체)

- [ ] **Step 6: 커밋**

```bash
git add src/shared/constants/ai.ts src/shared/constants/ai.test.ts src/shared/constants/index.ts
git commit -m "P2-1: shared/constants/ai.ts — LLM_CONFIG, TOKEN_CONFIG 상수 + 테스트"
```

---

### Task 3: server/core/config.ts — Zod 환경변수 검증 + getModel 팩토리

**Files:**
- Modify: `src/server/core/config.ts`
- Create: `src/server/core/config.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/server/core/config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

/** 유효한 환경변수 기본값. 개별 테스트에서 overrides로 변경. */
function stubValidEnv(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    AI_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    ADMIN_JWT_SECRET: 'a'.repeat(32),
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
    CRON_SECRET: 'test-cron-secret',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

describe('envSchema', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('유효한 환경변수로 파싱 성공', async () => {
    stubValidEnv();

    const { env } = await import('@/server/core/config');

    expect(env.AI_PROVIDER).toBe('anthropic');
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co');
    expect(env.LLM_TIMEOUT_MS).toBe(30000);
    expect(env.EMBEDDING_PROVIDER).toBe('google');
    expect(env.EMBEDDING_DIMENSION).toBe(1024);
  });

  it('AI_PROVIDER가 없으면 파싱 실패', async () => {
    stubValidEnv();
    vi.stubEnv('AI_PROVIDER', '');

    await expect(import('@/server/core/config')).rejects.toThrow();
  });

  it('ADMIN_JWT_SECRET가 32자 미만이면 파싱 실패', async () => {
    stubValidEnv({ ADMIN_JWT_SECRET: 'short' });

    await expect(import('@/server/core/config')).rejects.toThrow();
  });

  it('LLM_TIMEOUT_MS 문자열이 숫자로 변환됨', async () => {
    stubValidEnv({ LLM_TIMEOUT_MS: '60000' });

    const { env } = await import('@/server/core/config');

    expect(env.LLM_TIMEOUT_MS).toBe(60000);
    expect(typeof env.LLM_TIMEOUT_MS).toBe('number');
  });

  it('AI_PROVIDER=anthropic인데 ANTHROPIC_API_KEY 없으면 실패', async () => {
    stubValidEnv();
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    await expect(import('@/server/core/config')).rejects.toThrow();
  });

  it('AI_PROVIDER=google인데 GOOGLE_GENERATIVE_AI_API_KEY 없으면 실패', async () => {
    stubValidEnv({
      AI_PROVIDER: 'google',
      GOOGLE_GENERATIVE_AI_API_KEY: '',
    });
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    await expect(import('@/server/core/config')).rejects.toThrow();
  });

  it('Rate limit 기본값 적용', async () => {
    stubValidEnv();

    const { env } = await import('@/server/core/config');

    expect(env.RATE_LIMIT_CHAT_PER_MIN).toBe(5);
    expect(env.RATE_LIMIT_CHAT_PER_DAY).toBe(100);
    expect(env.RATE_LIMIT_PUBLIC_PER_MIN).toBe(60);
    expect(env.RATE_LIMIT_ANON_CREATE_PER_MIN).toBe(3);
    expect(env.RATE_LIMIT_ADMIN_PER_MIN).toBe(60);
  });
});

describe('getModel', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('anthropic 프로바이더로 모델 반환', async () => {
    stubValidEnv();

    const { getModel } = await import('@/server/core/config');
    const model = await getModel('anthropic');

    expect(model).toBeDefined();
    expect(model.modelId).toContain('claude');
  });

  it('google 프로바이더로 모델 반환', async () => {
    stubValidEnv({
      AI_PROVIDER: 'google',
      GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key',
    });

    const { getModel } = await import('@/server/core/config');
    const model = await getModel('google');

    expect(model).toBeDefined();
    expect(model.modelId).toContain('gemini');
  });

  it('모델명 오버라이드 적용', async () => {
    stubValidEnv();

    const { getModel } = await import('@/server/core/config');
    const model = await getModel('anthropic', 'claude-haiku-3-5-20241022');

    expect(model).toBeDefined();
    expect(model.modelId).toContain('haiku');
  });

  it('provider 생략 시 env.AI_PROVIDER 사용', async () => {
    stubValidEnv();

    const { getModel } = await import('@/server/core/config');
    const model = await getModel();

    expect(model).toBeDefined();
    expect(model.modelId).toContain('claude');
  });

  it('지원하지 않는 프로바이더에 에러', async () => {
    stubValidEnv();

    const { getModel } = await import('@/server/core/config');

    await expect(getModel('mistral' as any)).rejects.toThrow('Unsupported AI provider');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/server/core/config.test.ts`
Expected: FAIL

- [ ] **Step 3: Zod 4.x 호환성 확인**

Run: `node -e "const z = require('zod'); console.log(typeof z.coerce?.number, typeof z.object({}).superRefine)"`
Expected: "function function" — Zod 4.x에서 coerce와 superRefine 사용 가능 확인. 문제 시 Zod 4.x 공식 문서 참조하여 대체 API 사용.

- [ ] **Step 4: config.ts 구현**

```typescript
// src/server/core/config.ts
import 'server-only';
import { z } from 'zod';

// ============================================================
// 환경변수 Zod 검증 — security-infra.md §1.3
// Q-8: process.env 직접 접근은 이 파일에서만.
// L-5: K-뷰티 비즈니스 용어 없음.
// L-14: AIProvider 타입은 이 모듈 내부에서만 사용.
// ============================================================

/** MVP 지원 프로바이더 (TDD §2.4: anthropic + google만 설치) */
type AIProvider = 'anthropic' | 'google';

const envSchema = z.object({
  // DB
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // AI
  AI_PROVIDER: z.enum(['anthropic', 'google']),
  AI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  // 임베딩은 LLM과 별도 — openai 임베딩은 REST API 직접 호출 가능 (embedding-strategy.md)
  EMBEDDING_PROVIDER: z.enum(['google', 'voyage', 'openai']).default('google'),
  EMBEDDING_DIMENSION: z.coerce.number().default(1024),

  // Admin Auth
  ADMIN_JWT_SECRET: z.string().min(32),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),

  // LLM Resilience (llm-resilience.md §1.2)
  AI_FALLBACK_PROVIDER: z.enum(['anthropic', 'google']).optional(),
  AI_FALLBACK_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().default(30000),

  // Rate Limit
  RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().default(5),
  RATE_LIMIT_CHAT_PER_DAY: z.coerce.number().default(100),
  RATE_LIMIT_PUBLIC_PER_MIN: z.coerce.number().default(60),
  RATE_LIMIT_ANON_CREATE_PER_MIN: z.coerce.number().default(3),
  RATE_LIMIT_ADMIN_PER_MIN: z.coerce.number().default(60),

  // Cron
  CRON_SECRET: z.string().min(1),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
}).superRefine((data, ctx) => {
  // AI_PROVIDER별 API 키 조건부 필수 (security-infra.md §1.3)
  if (data.AI_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ANTHROPIC_API_KEY is required when AI_PROVIDER is anthropic',
      path: ['ANTHROPIC_API_KEY'],
    });
  }
  if (data.AI_PROVIDER === 'google' && !data.GOOGLE_GENERATIVE_AI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'GOOGLE_GENERATIVE_AI_API_KEY is required when AI_PROVIDER is google',
      path: ['GOOGLE_GENERATIVE_AI_API_KEY'],
    });
  }
});

/** 검증된 환경변수. 다른 파일은 이 객체만 import (Q-8). */
export const env = envSchema.parse(process.env);

// ============================================================
// LLM 모델 팩토리 — llm-resilience.md §1.1
// P-2: 비즈니스 무관 팩토리. 프로바이더 추가 = case 1줄 추가.
// ============================================================

/** 프로바이더별 기본 모델명 */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  google: 'gemini-2.0-flash',
};

/**
 * LLM 모델 인스턴스 반환.
 * @param provider - 프로바이더. 생략 시 env.AI_PROVIDER
 * @param model - 모델명 오버라이드. 생략 시 프로바이더별 기본값 또는 env.AI_MODEL(주 프로바이더)
 */
export async function getModel(provider?: AIProvider, model?: string) {
  const p = provider ?? env.AI_PROVIDER;
  const isDefault = !provider || provider === env.AI_PROVIDER;
  const modelName = model
    ?? (isDefault ? env.AI_MODEL : env.AI_FALLBACK_MODEL)
    ?? DEFAULT_MODELS[p];

  switch (p) {
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic(modelName);
    }
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      return google(modelName);
    }
    default:
      throw new Error(`Unsupported AI provider: ${p}`);
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/server/core/config.test.ts`
Expected: PASS (전체)

- [ ] **Step 6: 커밋**

```bash
git add src/server/core/config.ts src/server/core/config.test.ts
git commit -m "P2-1: server/core/config.ts — Zod 환경변수 검증 + getModel 팩토리 + 테스트"
```

---

### Task 4: .env.example 업데이트 + 전체 검증

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: .env.example 업데이트**

```bash
# ============================================================
# Essenly K-Beauty AI Agent — Environment Variables
# Copy this file to .env.local and fill in the values
# ============================================================

# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# --- AI Provider (MVP: anthropic or google) ---
AI_PROVIDER=anthropic
# AI_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-xxx
# GOOGLE_GENERATIVE_AI_API_KEY=xxx

# --- AI Fallback (llm-resilience.md) ---
# AI_FALLBACK_PROVIDER=google
# AI_FALLBACK_MODEL=gemini-2.0-flash
# LLM_TIMEOUT_MS=30000

# --- Embedding ---
# EMBEDDING_PROVIDER=google
# EMBEDDING_DIMENSION=1024

# --- Admin Auth ---
ADMIN_JWT_SECRET=your-32-char-minimum-secret-key-here
GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-client-secret

# --- Rate Limit (defaults in parentheses) ---
# RATE_LIMIT_CHAT_PER_MIN=5
# RATE_LIMIT_CHAT_PER_DAY=100
# RATE_LIMIT_PUBLIC_PER_MIN=60
# RATE_LIMIT_ANON_CREATE_PER_MIN=3
# RATE_LIMIT_ADMIN_PER_MIN=60

# --- Cron ---
CRON_SECRET=your-cron-secret

# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 전체 테스트 확인**

Run: `npx vitest run`
Expected: 기존 테스트 + 신규 테스트 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add .env.example
git commit -m "P2-1: .env.example — 신규 환경변수 추가 (AI Fallback, Admin Auth, Rate Limit, Cron)"
```

---

## 완료 후 검증 체크리스트

```
□ V-1  의존성 방향: shared/types/ai.ts → 없음, shared/constants/ai.ts → shared/types, server/core/config.ts → 외부 SDK만
□ V-2  core 수정: config.ts 기존 스켈레톤 수정 (L-4 승인 필요)
□ V-9  중복 없음: LLM_CONFIG/TOKEN_CONFIG 정의가 1곳
□ V-10 미사용 export 없음: 모든 export가 후속 태스크에서 사용 예정
□ V-12 any 타입 없음
□ V-13 하드코딩 없음: 매직 넘버는 상수로 선언 (G-10)
□ Q-8  process.env 접근은 config.ts에서만
□ L-0a server/core/config.ts에 import 'server-only' 첫 줄
□ L-0c shared/ 파일에 server-only/client-only import 없음
□ L-5  config.ts에 K-뷰티 용어 없음
□ L-14 AIProvider 타입은 config.ts 내부에만 정의 (shared 미참조)
□ P-8  순환 의존 없음
□ I-2  superRefine: AI_PROVIDER별 API 키 조건부 검증 구현됨
□ C-3  getModel model 파라미터: 폴백 시 AI_FALLBACK_MODEL 또는 DEFAULT_MODELS 사용
```

## D-6 후속 반영 사항

구현 완료 후 설계 문서 동기화 필요:
- `llm-resilience.md` §1.1: getModel 시그니처에 model 파라미터 추가 + provider 타입 string → AIProvider 변경 + DEFAULT_MODELS 상수 + isDefault 분기 로직 반영
- `llm-resilience.md` §1.1: 에러 메시지 "Unknown" → "Unsupported" 통일
- `security-infra.md` §1.1: 환경변수 테이블 AI_PROVIDER enum에서 'openai' 제거, OPENAI_API_KEY 행 MVP 제외 주석, AI_FALLBACK_PROVIDER enum에서 'openai' 제거
- `security-infra.md` §1.3: envSchema AI_PROVIDER/AI_FALLBACK_PROVIDER enum에서 'openai' 제거 (MVP) + v0.2 확장 주석
