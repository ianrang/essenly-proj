# P2-71: API Route Integration Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MVP API 16개 엔드포인트를 실제 dev DB와 연동하여 route → service → DB 전체 경로를 자동 검증하는 통합 테스트 구축.

**Architecture:** 기존 단위 테스트(mock 기반, `vitest.config.ts`)와 완전 분리된 별도 vitest 설정(`vitest.integration.config.ts`)으로 node 환경에서 실행. 테스트 코드는 `src/__tests__/integration/`에 독립 배치하여 비즈니스/코어 코드에 역참조 0건. 각 테스트 파일은 자체 Supabase anonymous 세션을 생성하여 파일 간 완전 독립. Hono `app.request()`로 HTTP 수준 테스트, `service_role` 클라이언트로 DB 정합성 교차 검증.

**Tech Stack:** Vitest 4.x (node env) + Hono `app.request()` + Supabase JS v2 (`signInAnonymously`, `service_role`) + 기존 route/service/repository 코드 (수정 없이 호출만)

**제외:** POST /api/chat (LLM 의존 → P2-73 범위)

**전제:** dev Supabase DB에 P2-60~64 시드 데이터 존재 (domain-read 테스트용). 미존재 시 해당 테스트는 빈 결과로 통과하되 구조 검증은 스킵.

**CI 참고:** INFRA-PIPELINE.md §5에 따라 CI는 `npm test`(단위 테스트만) 실행. 통합 테스트는 `npm run test:integration`으로 로컬 전용 실행 (DB 시크릿이 CI에 없음).

---

## File Structure

| 구분 | 파일 | 책임 |
|------|------|------|
| Create | `vitest.integration.config.ts` | 통합 테스트 전용 vitest 설정 (node env, `.env.test` 로드) |
| Create | `.env.test.example` | 통합 테스트 환경변수 템플릿 (커밋용, 실제 키 없음) |
| Create | `src/__tests__/integration/setup.ts` | `server-only` mock (글로벌) |
| Create | `src/__tests__/integration/helpers.ts` | `createTestSession`, `createRegisteredTestUser`, `cleanupTestUser`, `createVerifyClient` |
| Create | `src/__tests__/integration/auth-routes.integration.test.ts` | POST /api/auth/anonymous 통합 테스트 |
| Create | `src/__tests__/integration/profile-routes.integration.test.ts` | POST onboarding + GET + PUT profile + RLS 격리 |
| Create | `src/__tests__/integration/events-routes.integration.test.ts` | POST /api/events 통합 테스트 |
| Create | `src/__tests__/integration/kit-routes.integration.test.ts` | POST /api/kit/claim 통합 테스트 |
| Create | `src/__tests__/integration/chat-history-routes.integration.test.ts` | GET /api/chat/history 통합 테스트 |
| Create | `src/__tests__/integration/domain-read-routes.integration.test.ts` | GET products/treatments/stores/clinics 통합 테스트 |
| Modify | `.gitignore` | `.env.test` 추가 |
| Modify | `package.json:6` | `test:integration` 스크립트 추가 |

**의존 방향 (단방향만):**
```
src/__tests__/integration/*.test.ts
  → src/server/features/api/app.ts        (createApp)
  → src/server/features/api/routes/*.ts   (registerXxxRoutes)
  → src/__tests__/integration/helpers.ts  (테스트 유틸)
  → @supabase/supabase-js                (직접 사용)

역방향 없음:
  src/server/ → src/__tests__/ ✗
  src/client/ → src/__tests__/ ✗
  src/shared/ → src/__tests__/ ✗
```

**production 코드 수정: 0건.** 모든 변경은 테스트 인프라와 설정 파일에만 한정.

---

### Task 1: Infrastructure — vitest 설정 + env 템플릿 + gitignore + script

**Files:**
- Create: `vitest.integration.config.ts`
- Create: `.env.test.example`
- Modify: `.gitignore`
- Modify: `package.json:6`

- [ ] **Step 1: `.env.test.example` 생성**

```bash
# ============================================================
# P2-71 Integration Test Environment Variables
# Copy to .env.test and fill in real Supabase dev keys.
# .env.test is gitignored — never commit real keys.
# ============================================================

# --- Real DB keys (dev Supabase — same as .env.local) ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# --- Encryption (kit/claim test needs real key) ---
# Generate: openssl rand -hex 32
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# --- Dummy values (config.ts parse 통과용, 실제 호출 안 함) ---
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-test-dummy-key-not-used-in-integration-tests
ADMIN_JWT_SECRET=test-admin-jwt-secret-for-integration-tests-minimum-32-chars
GOOGLE_OAUTH_CLIENT_ID=test-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=test-oauth-client-secret
CRON_SECRET=test-cron-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=test
```

- [ ] **Step 2: `vitest.integration.config.ts` 생성**

```typescript
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  // mode='test' (vitest 기본값) → .env + .env.local + .env.test 순서 로드
  // .env.test 값이 .env.local 값을 오버라이드
  // prefix='' → VITE_ 접두사 없이 모든 변수 로드
  const env = loadEnv(mode, process.cwd(), '');

  return {
    test: {
      env,
      environment: 'node',
      globals: true,
      setupFiles: ['./src/__tests__/integration/setup.ts'],
      include: ['src/__tests__/integration/**/*.integration.test.ts'],
      testTimeout: 30_000,
      hookTimeout: 30_000,
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
  };
});
```

- [ ] **Step 3: `.gitignore`에 `.env.test` 추가**

`.gitignore`의 `# env files` 섹션에 추가:

```
.env.test
```

기존 `.env.test.local`은 이미 gitignore에 포함. `.env.test.example`은 `!.env.example` 패턴과 별개이므로 별도 예외 불필요 (`.env.test.example`은 `.env*` 패턴에 매칭되지 않음 — gitignore에 `.env.test.example` 차단 패턴 없음).

- [ ] **Step 4: `package.json`에 `test:integration` 스크립트 추가**

`"test:e2e"` 라인 아래에 추가:

```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 5: 커밋**

```bash
git add vitest.integration.config.ts .env.test.example .gitignore package.json
git commit -m "chore(P2-71): 통합 테스트 인프라 — vitest config + env 템플릿"
```

---

### Task 2: Test Setup & Helpers

**Files:**
- Create: `src/__tests__/integration/setup.ts`
- Create: `src/__tests__/integration/helpers.ts`

- [ ] **Step 1: `src/__tests__/integration/setup.ts` 생성**

```typescript
// server/ 모듈의 첫 줄 `import 'server-only'`를 noop 처리.
// vitest setupFiles는 테스트 파일 로드 전에 실행 — mock이 먼저 등록됨.
vi.mock('server-only', () => ({}));
```

- [ ] **Step 2: `src/__tests__/integration/helpers.ts` 생성**

```typescript
/**
 * P2-71 통합 테스트 헬퍼.
 * production 코드 import 없음 — @supabase/supabase-js 직접 사용.
 * 테스트 파일에서만 import. server/client/shared에서 import 금지 (역참조 0건).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// env는 vitest.integration.config.ts의 loadEnv → test.env로 주입됨
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** 테스트 세션 — signInAnonymously()로 생성된 Supabase auth 세션 */
export interface TestSession {
  userId: string;
  token: string;
}

/**
 * Supabase anonymous 세션 생성.
 * Supabase Auth에 유저가 생성되지만, 앱 users 테이블에는 미등록 상태.
 */
export async function createTestSession(): Promise<TestSession> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(`signInAnonymously failed: ${error?.message ?? 'no session'}`);
  }
  return {
    userId: data.session.user.id,
    token: data.session.access_token,
  };
}

/**
 * 앱 users 테이블에 등록된 테스트 유저 생성.
 * signInAnonymously() + users UPSERT + consent_records UPSERT.
 * profile/events/kit/chat-history 테스트의 beforeAll에서 사용.
 *
 * service_role로 직접 DB INSERT (API 우회) — 테스트 대상이 아닌 설정 단계이므로
 * auth API 장애가 다른 테스트에 전파되지 않도록 격리.
 */
export async function createRegisteredTestUser(): Promise<TestSession> {
  const session = await createTestSession();
  const admin = createVerifyClient();

  const { error: userErr } = await admin
    .from('users')
    .upsert({ id: session.userId, auth_method: 'anonymous' }, { onConflict: 'id' });
  if (userErr) throw new Error(`users upsert failed: ${userErr.message}`);

  const { error: consentErr } = await admin
    .from('consent_records')
    .upsert({ user_id: session.userId, data_retention: true }, { onConflict: 'user_id' });
  if (consentErr) throw new Error(`consent upsert failed: ${consentErr.message}`);

  return session;
}

/**
 * 테스트 유저 데이터 완전 삭제.
 * 1. kit_subscribers 명시 삭제 (FK CASCADE 미확인 테이블 안전 처리)
 * 2. users 삭제 → FK CASCADE로 user_profiles, journeys, conversations,
 *    messages, behavior_logs, consent_records 자동 삭제
 * 3. Supabase Auth에서 유저 삭제
 */
export async function cleanupTestUser(userId: string): Promise<void> {
  const admin = createVerifyClient();

  // kit_subscribers는 후발 migration(008) — CASCADE 여부 불확실. 명시 삭제.
  await admin.from('kit_subscribers').delete().eq('user_id', userId);
  // users CASCADE → 나머지 테이블 자동 삭제
  await admin.from('users').delete().eq('id', userId);
  // Supabase Auth 삭제
  await admin.auth.admin.deleteUser(userId);
}

/**
 * service_role 클라이언트 — DB 검증 조회 + 테스트 데이터 setup/cleanup 용.
 * RLS 우회. production의 createServiceClient와 동일하지만 독립 생성.
 */
export function createVerifyClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** 인증 헤더 생성 — app.request()에 전달용 */
export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** JSON body + 인증 헤더로 app.request 옵션 생성 */
export function jsonRequest(
  method: string,
  token: string,
  body?: unknown,
): RequestInit {
  const init: RequestInit = {
    method,
    headers: authHeaders(token),
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return init;
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/__tests__/integration/setup.ts src/__tests__/integration/helpers.ts
git commit -m "chore(P2-71): 통합 테스트 setup + helpers"
```

---

### Task 3: Auth Routes Integration Test

**Files:**
- Create: `src/__tests__/integration/auth-routes.integration.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerAuthRoutes } from '@/server/features/api/routes/auth';
import {
  createTestSession,
  cleanupTestUser,
  createVerifyClient,
  jsonRequest,
  type TestSession,
} from './helpers';

describe('POST /api/auth/anonymous (integration)', () => {
  const app = createApp();
  let session: TestSession;
  const userIds: string[] = []; // cleanup 대상 추적

  beforeAll(async () => {
    registerAuthRoutes(app);
    // signInAnonymously만 — 앱 users 미등록 상태
    session = await createTestSession();
    userIds.push(session.userId);
  });

  afterAll(async () => {
    for (const id of userIds) {
      await cleanupTestUser(id);
    }
  });

  it('정상 요청 → 201 + users/consent_records DB 생성 확인', async () => {
    const res = await app.request(
      '/api/auth/anonymous',
      jsonRequest('POST', session.token, { consent: { data_retention: true } }),
    );
    const json = await res.json();

    // API 응답 검증
    expect(res.status).toBe(201);
    expect(json.data.user_id).toBe(session.userId);
    expect(json.meta.timestamp).toBeDefined();

    // DB 교차 검증 — service_role로 직접 조회
    const verify = createVerifyClient();

    const { data: userRow } = await verify
      .from('users')
      .select('id, auth_method')
      .eq('id', session.userId)
      .single();
    expect(userRow).not.toBeNull();
    expect(userRow!.auth_method).toBe('anonymous');

    const { data: consentRow } = await verify
      .from('consent_records')
      .select('user_id, data_retention')
      .eq('user_id', session.userId)
      .single();
    expect(consentRow).not.toBeNull();
    expect(consentRow!.data_retention).toBe(true);
  });

  it('멱등성 (Q-12) — 동일 요청 재전송 시 중복 미생성', async () => {
    // 위 테스트에서 이미 등록된 상태. 재전송.
    const res = await app.request(
      '/api/auth/anonymous',
      jsonRequest('POST', session.token, { consent: { data_retention: true } }),
    );
    expect(res.status).toBe(201); // UPSERT이므로 201

    // users 테이블에 중복 행 없음
    const verify = createVerifyClient();
    const { data: rows } = await verify
      .from('users')
      .select('id')
      .eq('id', session.userId);
    expect(rows).toHaveLength(1);
  });

  it('미인증 요청 → 401 AUTH_REQUIRED', async () => {
    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: { data_retention: true } }),
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  it('검증 실패 — consent 누락 → 400', async () => {
    const res = await app.request(
      '/api/auth/anonymous',
      jsonRequest('POST', session.token, {}),
    );
    expect(res.status).toBe(400);
  });

  it('검증 실패 — data_retention=false → 400', async () => {
    const res = await app.request(
      '/api/auth/anonymous',
      jsonRequest('POST', session.token, { consent: { data_retention: false } }),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: `.env.test` 준비 확인 (수동)**

`.env.test.example`을 `.env.test`로 복사하고 실제 dev Supabase 키를 입력했는지 확인.

```bash
# .env.test 존재 확인
test -f .env.test && echo "OK" || echo "MISSING: cp .env.test.example .env.test 후 실제 키 입력"
```

- [ ] **Step 3: 테스트 실행**

```bash
npx vitest run --config vitest.integration.config.ts src/__tests__/integration/auth-routes.integration.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 4: 커밋**

```bash
git add src/__tests__/integration/auth-routes.integration.test.ts
git commit -m "test(P2-71): auth routes 통합 테스트 — 실제 DB 연동"
```

---

### Task 4: Profile Routes Integration Test

**Files:**
- Create: `src/__tests__/integration/profile-routes.integration.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerProfileRoutes } from '@/server/features/api/routes/profile';
import {
  createRegisteredTestUser,
  createTestSession,
  cleanupTestUser,
  createVerifyClient,
  jsonRequest,
  type TestSession,
} from './helpers';

describe('Profile routes (integration)', () => {
  const app = createApp();
  let userA: TestSession;
  let userB: TestSession;

  beforeAll(async () => {
    registerProfileRoutes(app);
    // 두 유저 생성 — RLS 격리 테스트용
    userA = await createRegisteredTestUser();
    userB = await createRegisteredTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser(userA.userId);
    await cleanupTestUser(userB.userId);
  });

  // ── POST /api/profile/onboarding ──────────────────────────
  describe('POST /api/profile/onboarding', () => {
    it('정상 요청 → 201 + user_profiles + journeys DB 생성', async () => {
      const body = {
        skin_type: 'combination',
        hair_type: 'wavy',
        hair_concerns: ['damage'],
        country: 'US',
        language: 'en',
        age_range: '25-29',
        skin_concerns: ['acne', 'pores'],
        interest_activities: ['shopping', 'clinic'],
        stay_days: 5,
        budget_level: 'moderate',
        travel_style: ['relaxed'],
      };

      const res = await app.request(
        '/api/profile/onboarding',
        jsonRequest('POST', userA.token, body),
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.data.profile_id).toBe(userA.userId);
      expect(json.data.journey_id).toBeDefined();

      // DB 교차 검증
      const verify = createVerifyClient();

      const { data: profile } = await verify
        .from('user_profiles')
        .select('skin_type, hair_type, country, language')
        .eq('user_id', userA.userId)
        .single();
      expect(profile).not.toBeNull();
      expect(profile!.skin_type).toBe('combination');
      expect(profile!.hair_type).toBe('wavy');
      expect(profile!.country).toBe('US');

      const { data: journey } = await verify
        .from('journeys')
        .select('skin_concerns, interest_activities, stay_days, budget_level, status')
        .eq('id', json.data.journey_id)
        .single();
      expect(journey).not.toBeNull();
      expect(journey!.skin_concerns).toEqual(['acne', 'pores']);
      expect(journey!.stay_days).toBe(5);
      expect(journey!.status).toBe('active');
    });

    it('멱등성 (Q-12) — 재전송 시 기존 journey 갱신, 중복 미생성', async () => {
      const body = {
        skin_type: 'oily',
        country: 'US',
        language: 'en',
        hair_concerns: [],
        skin_concerns: ['wrinkles'],
        interest_activities: ['shopping'],
        stay_days: 3,
        budget_level: 'premium',
      };

      const res = await app.request(
        '/api/profile/onboarding',
        jsonRequest('POST', userA.token, body),
      );
      expect(res.status).toBe(201);

      // journeys는 1건만 (기존 활성 journey UPDATE)
      const verify = createVerifyClient();
      const { data: journeys } = await verify
        .from('journeys')
        .select('id')
        .eq('user_id', userA.userId)
        .eq('status', 'active');
      expect(journeys).toHaveLength(1);
    });
  });

  // ── GET /api/profile ──────────────────────────────────────
  describe('GET /api/profile', () => {
    it('정상 조회 → 200 + profile + active_journey', async () => {
      const res = await app.request('/api/profile', {
        headers: { Authorization: `Bearer ${userA.token}` },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.profile).not.toBeNull();
      expect(json.data.profile.skin_type).toBe('oily'); // 멱등성 테스트에서 갱신됨
      expect(json.data.active_journey).not.toBeNull();
      expect(json.data.active_journey.status).toBe('active');
    });

    it('RLS 격리 — User B는 자신의 프로필만 조회 (User A 프로필 미접근)', async () => {
      // User B는 프로필 미생성 상태 → 404
      const res = await app.request('/api/profile', {
        headers: { Authorization: `Bearer ${userB.token}` },
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('미인증 → 401', async () => {
      const res = await app.request('/api/profile');
      expect(res.status).toBe(401);
    });
  });

  // ── PUT /api/profile ──────────────────────────────────────
  describe('PUT /api/profile', () => {
    it('부분 업데이트 → 200 + DB 반영 확인', async () => {
      const res = await app.request(
        '/api/profile',
        jsonRequest('PUT', userA.token, { language: 'ja', age_range: '30-34' }),
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.updated).toBe(true);

      // DB 검증 — 변경된 필드만 업데이트, 나머지 유지
      const verify = createVerifyClient();
      const { data: profile } = await verify
        .from('user_profiles')
        .select('language, age_range, skin_type')
        .eq('user_id', userA.userId)
        .single();
      expect(profile!.language).toBe('ja');
      expect(profile!.age_range).toBe('30-34');
      expect(profile!.skin_type).toBe('oily'); // 이전 값 유지
    });

    it('빈 body → 400 (최소 1필드 필수)', async () => {
      const res = await app.request(
        '/api/profile',
        jsonRequest('PUT', userA.token, {}),
      );
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
npx vitest run --config vitest.integration.config.ts src/__tests__/integration/profile-routes.integration.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 3: 커밋**

```bash
git add src/__tests__/integration/profile-routes.integration.test.ts
git commit -m "test(P2-71): profile routes 통합 테스트 — onboarding/GET/PUT + RLS 격리"
```

---

### Task 5: Events Routes Integration Test

**Files:**
- Create: `src/__tests__/integration/events-routes.integration.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerEventRoutes } from '@/server/features/api/routes/events';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  jsonRequest,
  type TestSession,
} from './helpers';

describe('POST /api/events (integration)', () => {
  const app = createApp();
  let session: TestSession;

  beforeAll(async () => {
    registerEventRoutes(app);
    session = await createRegisteredTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser(session.userId);
  });

  it('정상 이벤트 → 200 + behavior_logs DB 생성', async () => {
    const conversationId = '00000000-0000-0000-0000-000000000001';
    const body = {
      events: [
        {
          event_type: 'card_click',
          target_id: conversationId,
          target_type: 'card',
          metadata: {
            card_id: 'test-card-1',
            domain: 'shopping',
            conversation_id: conversationId,
          },
        },
      ],
    };

    const res = await app.request(
      '/api/events',
      jsonRequest('POST', session.token, body),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(1);

    // DB 검증
    const verify = createVerifyClient();
    const { data: logs } = await verify
      .from('behavior_logs')
      .select('event_type, user_id, metadata')
      .eq('user_id', session.userId)
      .eq('event_type', 'card_click');
    expect(logs).not.toBeNull();
    expect(logs!.length).toBeGreaterThanOrEqual(1);
    expect(logs![0].metadata).toMatchObject({ card_id: 'test-card-1' });
  });

  it('잘못된 metadata → 스킵, recorded=0', async () => {
    const body = {
      events: [
        {
          event_type: 'card_click',
          metadata: { wrong_field: true }, // card_id, domain, conversation_id 누락
        },
      ],
    };

    const res = await app.request(
      '/api/events',
      jsonRequest('POST', session.token, body),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(0);
  });

  it('미인증 → 401', async () => {
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [] }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
npx vitest run --config vitest.integration.config.ts src/__tests__/integration/events-routes.integration.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 3: 커밋**

```bash
git add src/__tests__/integration/events-routes.integration.test.ts
git commit -m "test(P2-71): events routes 통합 테스트 — behavior_logs DB 검증"
```

---

### Task 6: Kit Routes Integration Test

**Files:**
- Create: `src/__tests__/integration/kit-routes.integration.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerKitRoutes } from '@/server/features/api/routes/kit';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  jsonRequest,
  type TestSession,
} from './helpers';

describe('POST /api/kit/claim (integration)', () => {
  const app = createApp();
  let session: TestSession;
  const testEmail = `test-${Date.now()}@integration-test.example.com`;

  beforeAll(async () => {
    registerKitRoutes(app);
    session = await createRegisteredTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser(session.userId);
  });

  it('정상 → 201 + kit_subscribers DB 생성', async () => {
    const res = await app.request(
      '/api/kit/claim',
      jsonRequest('POST', session.token, {
        email: testEmail,
        marketing_consent: true,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.status).toBe('claimed');

    // DB 검증 — kit_subscribers 행 존재, 암호화 필드 비어있지 않음
    const verify = createVerifyClient();
    const { data: row } = await verify
      .from('kit_subscribers')
      .select('user_id, email_encrypted, email_hash, marketing_consent')
      .eq('user_id', session.userId)
      .single();
    expect(row).not.toBeNull();
    expect(row!.email_encrypted).toBeTruthy(); // 비어있지 않음
    expect(row!.email_hash).toBeTruthy();
    expect(row!.marketing_consent).toBe(true);
  });

  it('멱등성 (Q-12) — 동일 이메일 재전송 → 409 KIT_ALREADY_CLAIMED', async () => {
    const res = await app.request(
      '/api/kit/claim',
      jsonRequest('POST', session.token, {
        email: testEmail,
        marketing_consent: false,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe('KIT_ALREADY_CLAIMED');
  });

  it('검증 실패 — 이메일 형식 → 400', async () => {
    const res = await app.request(
      '/api/kit/claim',
      jsonRequest('POST', session.token, {
        email: 'not-an-email',
        marketing_consent: false,
      }),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
npx vitest run --config vitest.integration.config.ts src/__tests__/integration/kit-routes.integration.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 3: 커밋**

```bash
git add src/__tests__/integration/kit-routes.integration.test.ts
git commit -m "test(P2-71): kit routes 통합 테스트 — 암호화 + 멱등성 검증"
```

---

### Task 7: Chat History Integration Test

**Files:**
- Create: `src/__tests__/integration/chat-history-routes.integration.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerChatRoutes } from '@/server/features/api/routes/chat';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  type TestSession,
} from './helpers';

describe('GET /api/chat/history (integration)', () => {

  const app = createApp();
  let session: TestSession;
  let testConversationId: string;

  beforeAll(async () => {
    registerChatRoutes(app);
    session = await createRegisteredTestUser();

    // 테스트 대화 데이터 직접 삽입 (service_role)
    const verify = createVerifyClient();
    const testMessages = [
      { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Hi there!' }] },
    ];

    const { data: conv, error } = await verify
      .from('conversations')
      .insert({
        user_id: session.userId,
        ui_messages: testMessages,
        locale: 'en',
      })
      .select('id')
      .single();
    if (error || !conv) throw new Error(`conversation insert failed: ${error?.message}`);
    testConversationId = conv.id;
  });

  afterAll(async () => {
    await cleanupTestUser(session.userId);
  });

  it('conversation_id 지정 → 200 + 저장된 ui_messages 반환', async () => {
    const res = await app.request(
      `/api/chat/history?conversation_id=${testConversationId}`,
      { headers: { Authorization: `Bearer ${session.token}` } },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.conversation_id).toBe(testConversationId);
    expect(json.data.messages).toHaveLength(2);
    expect(json.data.messages[0].role).toBe('user');
    expect(json.data.messages[1].role).toBe('assistant');
  });

  it('conversation_id 미지정 → 200 + 최신 대화 반환', async () => {
    const res = await app.request('/api/chat/history', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    // 방금 생성한 대화가 최신이므로 동일 ID
    expect(json.data.conversation_id).toBe(testConversationId);
    expect(json.data.messages).toHaveLength(2);
  });

  it('대화 없는 유저 → 200 + 빈 messages', async () => {
    // User B는 대화 없음 — top-level import 재사용
    const userB = await createRegisteredTestUser();

    const res = await app.request('/api/chat/history', {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.messages).toEqual([]);
    expect(json.data.conversation_id).toBeNull();

    await cleanupTestUser(userB.userId);
  });

  it('미인증 → 401', async () => {
    const res = await app.request('/api/chat/history');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
npx vitest run --config vitest.integration.config.ts src/__tests__/integration/chat-history-routes.integration.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 3: 커밋**

```bash
git add src/__tests__/integration/chat-history-routes.integration.test.ts
git commit -m "test(P2-71): chat history 통합 테스트 — conversations DB 검증"
```

---

### Task 8: Domain Read Routes Integration Test

**Files:**
- Create: `src/__tests__/integration/domain-read-routes.integration.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerProductRoutes } from '@/server/features/api/routes/products';
import { registerTreatmentRoutes } from '@/server/features/api/routes/treatments';
import { registerStoreRoutes } from '@/server/features/api/routes/stores';
import { registerClinicRoutes } from '@/server/features/api/routes/clinics';

/**
 * Domain read routes — optionalAuth, 시드 데이터 의존.
 * dev DB에 P2-60~64 파이프라인 데이터가 있으면 구조 검증.
 * 없으면 빈 배열 + 올바른 meta 형식만 검증.
 * 인증 불필요 (public read). cleanup 불필요 (읽기 전용).
 */
describe('Domain read routes (integration)', () => {
  const app = createApp();

  beforeAll(() => {
    registerProductRoutes(app);
    registerTreatmentRoutes(app);
    registerStoreRoutes(app);
    registerClinicRoutes(app);
  });

  // ── 공통 검증 함수 ──────────────────────────────────────────
  async function verifyListEndpoint(path: string) {
    const res = await app.request(`${path}?limit=5&offset=0`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(json.data)).toBe(true);
    expect(typeof json.meta.total).toBe('number');
    expect(json.meta.limit).toBe(5);
    expect(json.meta.offset).toBe(0);

    // 시드 데이터 있으면 구조 검증
    if (json.data.length > 0) {
      const item = json.data[0];
      expect(item.id).toBeDefined();
      // embedding 필드 제외 확인 (api-spec §2.2)
      expect(item).not.toHaveProperty('embedding');
    }

    return json;
  }

  async function verifyDetailEndpoint(listPath: string, detailPath: string) {
    // 먼저 목록에서 ID 획득
    const listRes = await app.request(`${listPath}?limit=1`);
    const listJson = await listRes.json();

    if (listJson.data.length > 0) {
      const id = listJson.data[0].id;
      const res = await app.request(`${detailPath}/${id}`);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.id).toBe(id);
      expect(json.data).not.toHaveProperty('embedding');
    }

    // 미존재 UUID → 404
    const res404 = await app.request(`${detailPath}/00000000-0000-0000-0000-000000000000`);
    expect(res404.status).toBe(404);
  }

  // ── Products ──────────────────────────────────────────────
  describe('GET /api/products', () => {
    it('목록 조회 → 200 + 올바른 구조', async () => {
      await verifyListEndpoint('/api/products');
    });

    it('상세 조회 + 404', async () => {
      await verifyDetailEndpoint('/api/products', '/api/products');
    });

    it('잘못된 UUID → 400', async () => {
      const res = await app.request('/api/products/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  // ── Treatments ────────────────────────────────────────────
  describe('GET /api/treatments', () => {
    it('목록 조회 → 200 + 올바른 구조', async () => {
      await verifyListEndpoint('/api/treatments');
    });

    it('상세 조회 + 404', async () => {
      await verifyDetailEndpoint('/api/treatments', '/api/treatments');
    });
  });

  // ── Stores ────────────────────────────────────────────────
  describe('GET /api/stores', () => {
    it('목록 조회 → 200 + 올바른 구조', async () => {
      await verifyListEndpoint('/api/stores');
    });

    it('상세 조회 + 404', async () => {
      await verifyDetailEndpoint('/api/stores', '/api/stores');
    });
  });

  // ── Clinics ───────────────────────────────────────────────
  describe('GET /api/clinics', () => {
    it('목록 조회 → 200 + 올바른 구조', async () => {
      await verifyListEndpoint('/api/clinics');
    });

    it('상세 조회 + 404', async () => {
      await verifyDetailEndpoint('/api/clinics', '/api/clinics');
    });
  });

  // ── 페이지네이션 ──────────────────────────────────────────
  describe('Pagination', () => {
    it('limit > MAX(50) → limit=50으로 클램핑', async () => {
      const res = await app.request('/api/products?limit=100');
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.meta.limit).toBeLessThanOrEqual(50);
    });

    it('offset 지정 → meta.offset 일치', async () => {
      const res = await app.request('/api/products?offset=10');
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.meta.offset).toBe(10);
    });
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
npx vitest run --config vitest.integration.config.ts src/__tests__/integration/domain-read-routes.integration.test.ts
```

Expected: 11 tests PASS. (시드 데이터 유무에 관계없이 통과)

- [ ] **Step 3: 커밋**

```bash
git add src/__tests__/integration/domain-read-routes.integration.test.ts
git commit -m "test(P2-71): domain read routes 통합 테스트 — products/treatments/stores/clinics"
```

---

### Task 9: Full Integration Test Run + 최종 검증

- [ ] **Step 1: 전체 통합 테스트 실행**

```bash
npm run test:integration
```

Expected: 6 test files, 33 tests, all PASS.

- [ ] **Step 2: 기존 단위 테스트 영향 없음 확인**

```bash
npm test
```

Expected: 기존 단위 테스트 전체 PASS (통합 테스트 추가로 인한 변경 없음).

- [ ] **Step 3: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 4: 제거 안전성 검증 (V-17)**

통합 테스트 디렉토리 삭제 시 빌드 에러 없는지 확인:

```bash
# 임시로 삭제 후 빌드 확인 (실제 삭제 아님)
git stash push -m "v17-check" -- src/__tests__/integration/
npm test && npx tsc --noEmit
git stash pop
```

Expected: 기존 코드 빌드/테스트에 영향 없음.

- [ ] **Step 5: 역참조 0건 확인 (P-10)**

```bash
# production 코드에서 integration 디렉토리 참조가 없는지 확인
grep -r "integration" src/server/ src/client/ src/shared/ src/app/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
```

Expected: 0건.

---

## 검증 체크리스트 (V-*)

```
✅ V-1  의존성 방향: tests → production (단방향). 역방향 없음.
✅ V-2  core 불변: core/ 파일 수정 0건.
✅ V-17 제거 안전성: integration/ 전체 삭제 → 빌드 에러 없음.
✅ V-18 scripts/ 의존 방향: 해당 없음 (scripts/ 수정 없음).
N/A V-3~V-16: 비즈니스 코드 수정 없음. 테스트 코드는 V 체크 대상 외.
```

## 아키텍처 규칙 준수

```
✅ P-1   4계층 DAG: __tests__/ 는 4계층 외부. DAG 미침범.
✅ P-2   Core 불변: core/ 수정 없음.
✅ P-10  제거 안전성: integration/ 삭제 → 역참조 0건.
✅ R-1~4 계층 import: 테스트 코드는 계층 규칙 적용 대상 외.
✅ G-2   중복 금지: helpers.ts로 공통 유틸 집약.
✅ G-4   미사용 코드 금지: 모든 helper 함수가 테스트에서 사용됨.
✅ G-7   위치 확인: __tests__/integration/ — 테스트 전용 디렉토리.
✅ Q-8   env 런타임 검증: config.ts 그대로 사용 (mock 안 함). .env.test 제공.
```
