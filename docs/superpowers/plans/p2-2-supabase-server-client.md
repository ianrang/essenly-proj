# P2-2: Supabase 서버 클라이언트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 서버 API의 DB 접근 단일 접점 — RLS 적용(사용자) + RLS 우회(관리자/비동기) 클라이언트 팩토리

**Architecture:** server/core/db.ts가 SupabaseClient 팩토리 2개를 export. 다른 서버 파일은 이 모듈만으로 DB에 접근 (Q-8: env 직접 접근 금지 → config.ts 경유).

**Tech Stack:** @supabase/supabase-js 2.99.2, Vitest

---

## 설계 근거

- DB 클라이언트 전략: `auth-matrix.md` §1.4
- core/ 모듈 구조: `auth-matrix.md` §1.5 (`db.ts` = createAuthenticatedClient + createServiceClient)
- API Route 코드 패턴: `auth-matrix.md` §3.3 (line 264-265)
- Chat 플로우 step 2: `api-spec.md` §3.4 (line 451)
- 코드 규칙: CLAUDE.md L-0a (server-only), L-5 (비즈니스 용어 금지), Q-8 (env는 config만), P-2 (Core 불변), G-9 (export 최소화)

## 파일 구조

```
src/server/core/
  └── db.ts              ← MODIFY: 스켈레톤 → 팩토리 2개 구현

src/server/core/
  └── db.test.ts         ← CREATE: 팩토리 테스트
```

## 의존성 방향

```
server/core/db.ts → server/core/config.ts (env 참조)
server/core/db.ts → @supabase/supabase-js (외부 SDK)

역방향 없음:
config.ts → db.ts  ✗
shared/   → db.ts  ✗ (R-4)
client/   → db.ts  ✗ (R-1)
```

## MVP 패키지 선택

auth-matrix.md §1.1: 클라이언트가 `Authorization: Bearer <token>` 헤더로 API 호출.
서버는 토큰을 받아 DB 클라이언트에 주입. `@supabase/supabase-js`의 `createClient`로 충분.
`@supabase/ssr`은 P2-3 브라우저 클라이언트에서 사용 (쿠키 기반 세션 관리).

---

### Task 1: server/core/db.ts — 팩토리 2개 구현

**Files:**
- Modify: `src/server/core/db.ts`
- Create: `src/server/core/db.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/server/core/db.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// config.ts의 env를 모킹 — db.ts가 config.ts에서 env를 import하므로
vi.mock('@/server/core/config', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  },
}));

describe('createAuthenticatedClient', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('SupabaseClient를 반환한다', async () => {
    const { createAuthenticatedClient } = await import('@/server/core/db');
    const client = createAuthenticatedClient('test-jwt-token');
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  it('token이 빈 문자열이면 에러', async () => {
    const { createAuthenticatedClient } = await import('@/server/core/db');
    expect(() => createAuthenticatedClient('')).toThrow();
  });
});

describe('createServiceClient', () => {
  it('SupabaseClient를 반환한다', async () => {
    const { createServiceClient } = await import('@/server/core/db');
    const client = createServiceClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/server/core/db.test.ts`
Expected: FAIL (구현 없음)

- [ ] **Step 3: db.ts 구현**

```typescript
// src/server/core/db.ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from './config';

// ============================================================
// Supabase 클라이언트 팩토리 — auth-matrix.md §1.4
// L-5: K-뷰티 비즈니스 용어 없음.
// Q-8: env는 config.ts 경유.
// G-9: export 2개만 (createAuthenticatedClient, createServiceClient).
// ============================================================

/**
 * 사용자 API용 — RLS 적용.
 * 사용자의 Supabase JWT를 Authorization 헤더에 주입.
 * auth-matrix.md §1.4: `/api/*` (사용자, 동기)
 */
export function createAuthenticatedClient(token: string) {
  if (!token) {
    throw new Error('Supabase auth token is required');
  }
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

/**
 * 관리자 API + 비동기 후처리용 — RLS 우회.
 * service_role 키로 전체 DB 접근. 사용 시 user_id를 코드에서 검증 필수.
 * auth-matrix.md §1.4: `/api/admin/*` + 비동기 후처리
 */
export function createServiceClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/server/core/db.test.ts`
Expected: PASS (전체)

- [ ] **Step 5: 전체 테스트 확인**

Run: `npx vitest run`
Expected: 기존 + 신규 모두 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/server/core/db.ts src/server/core/db.test.ts
git commit -m "P2-2: server/core/db.ts — Supabase 클라이언트 팩토리 (RLS 적용 + 우회) + 테스트"
```

---

## 완료 후 검증 체크리스트

```
□ L-0a  import 'server-only' 첫 줄
□ L-5   K-뷰티 비즈니스 용어 없음
□ Q-8   process.env 직접 접근 없음 (config.ts의 env 사용)
□ P-2   Core 불변: 비즈니스 무관 팩토리
□ P-7   단일 변경점: Supabase URL/키 변경 = .env만 수정
□ P-8   순환 없음: db.ts → config.ts 단방향
□ P-10  제거 안전성: db.ts 삭제 시 config.ts/shared 빌드 에러 없음
□ G-3   패스스루 아님: env 캡슐화 + 헤더 구성 책임
□ G-9   export 2개만: createAuthenticatedClient, createServiceClient
□ V-16  shared/ 단방향 미영향 (shared/ 변경 없음)
```
