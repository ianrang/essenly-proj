# P2-21: get_external_links Tool Handler 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM tool handler `get_external_links` 구현. 엔티티 ID+type으로 외부 링크(구매/지도/예약/웹사이트) 조회.

**Architecture:** `features/chat/tools/links-handler.ts`에 구현. R-6에 따라 repositories/ 직접 import 대신 Supabase client 직접 조회 (단일 컬럼 select — repository 메서드에 링크 전용 함수 없음). entity_type별 분기. DB 컬럼 미존재 시 빈 배열 반환 (tool-spec.md §4.2 + P2-16 D-5 패턴).

**Tech Stack:** TypeScript, Supabase, Vitest

---

## 선행 확인

- [x] shared/types/domain.ts: ExternalLink, PurchaseLink 인터페이스 정의
- [x] shared/types/api.ts: GetExternalLinksParams, GetExternalLinksResult 정의 (stale — entity_id 포함이 tool-spec.md §2와 불일치. 미사용)
- [ ] shared/types/domain.ts: LinkType에 'purchase', 'booking' 추가 필요 (tool-spec.md §2 link types와 정합)
- [x] DB clinics.external_links JSONB + clinics.booking_url TEXT 존재 (001:206-207)
- [x] DB products.purchase_links 미존재 (P2-16 D-5: schema.dbml에만, migration 미반영 → null)
- [x] DB stores.external_links 미존재 (001:163-189에 없음, schema.dbml에만 → null)
- [x] DB treatments: 링크 컬럼 없음 → clinic_treatments junction 경유 clinics.booking_url

## 설계 근거

| 결정 | 근거 | 원문 위치 |
|------|------|----------|
| 파일: `chat/tools/links-handler.ts` | search-handler.ts와 동일 계층 | search-engine.md §1.3 |
| R-6: Supabase client 직접 조회 | repository에 링크 전용 메서드 없음. tool handler에서 단순 select 허용 | CLAUDE.md R-6 |
| DB 컬럼 미존재 → null → 빈 배열 | Supabase select 미존재 컬럼 → null 반환 | P2-16 D-5, tool-spec.md §4.2 |
| treatment → clinic_treatments junction | treatments에 링크 컬럼 없음 | 001_initial_schema.sql:220-244 |
| client: execute context로 수신 | P-4 Composition Root, search-handler 패턴 동일 | CLAUDE.md P-4 |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `src/server/features/chat/tools/links-handler.ts` | 신규 | get_external_links execute 함수 |
| `src/server/features/chat/tools/links-handler.test.ts` | 신규 | 단위 테스트 7개 |

**수정 없는 기존 파일**: repositories/*, shared/types — 모두 그대로.

## 의존성 방향 검증

```
chat/tools/links-handler.ts
  ├──→ shared/types/domain (type: ExternalLink — type import)
  └──→ @supabase/supabase-js (type: SupabaseClient — type import)

  ✗ repositories/ import 없음 (단순 select이므로 repository 메서드 불필요)
  ✗ beauty/ import 없음 (판단 로직 없음)
  ✗ core/ import 없음 (임베딩 불필요)
  ✗ chat/service.ts import 없음 (R-10)
  순환 참조 없음
```

**콜 스택 (P-5 ≤ 4)**:
```
route(①) → chatService(②) → links-handler(③) → Supabase select(④) ✓
```

## DB 컬럼 현황 (코드베이스 검증)

| 엔티티 | 컬럼 | 001 migration | schema.dbml | 조회 결과 |
|--------|------|--------------|-------------|----------|
| products | purchase_links | ❌ 미존재 | ✅ 정의 | null → [] |
| stores | external_links | ❌ 미존재 | ✅ 정의 | null → [] |
| clinics | external_links + booking_url | ✅ line 206-207 | ✅ 정의 | ExternalLink[] + booking URL |
| treatments | 없음 | ❌ | ❌ | junction → clinics.booking_url |

---

## Task 1: links-handler.ts 구현 + 테스트

**Files:**
- Create: `src/server/features/chat/tools/links-handler.ts`
- Create: `src/server/features/chat/tools/links-handler.test.ts`

- [ ] **Step 0: shared/types/domain.ts LinkType 확장**

tool-spec.md §2 link types 정합. LinkType은 현재 어디서도 import되지 않으므로 (Grep 확인) 안전.

```typescript
// domain.ts:72-80 수정
export type LinkType =
  | "naver_map"
  | "kakao_map"
  | "map"          // ← 추가: tool-spec.md §2 (store, clinic)
  | "website"
  | "instagram"
  | "purchase"     // ← 추가: tool-spec.md §2 (product)
  | "booking"      // ← 추가: tool-spec.md §2 (clinic, treatment)
  | "naver_booking"
  | "coupang"
  | "amazon"
  | "other";
```

- [ ] **Step 1: links-handler.ts 작성**

```typescript
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExternalLink, LinkType } from '@/shared/types/domain';

// ============================================================
// get_external_links Tool Handler — tool-spec.md §2
// R-6: tool handler. Supabase client 직접 조회 (단순 select).
// R-10: service 역호출 금지.
// tool-spec.md §4.2: 링크 조회 실패 → 빈 배열 반환.
// ============================================================

/** tool execute에 전달되는 context */
export interface LinksToolContext {
  client: SupabaseClient;
}

/** tool-spec.md §2 입력 */
interface LinksArgs {
  entity_id: string;
  entity_type: 'product' | 'store' | 'clinic' | 'treatment';
}

/**
 * get_external_links tool execute 함수.
 * tool-spec.md §2: entity_type별 외부 링크 조회.
 * tool-spec.md §4.2: 실패 → { links: [] }.
 */
export async function executeGetExternalLinks(
  args: LinksArgs,
  context: LinksToolContext,
): Promise<{ links: ExternalLink[] }> {
  const { client } = context;
  const { entity_id, entity_type } = args;

  try {
    switch (entity_type) {
      case 'product':
        return await getProductLinks(client, entity_id);
      case 'store':
        return await getStoreLinks(client, entity_id);
      case 'clinic':
        return await getClinicLinks(client, entity_id);
      case 'treatment':
        return await getTreatmentLinks(client, entity_id);
      default:
        return { links: [] };
    }
  } catch {
    // tool-spec.md §4.2: 링크 조회 실패 → 빈 배열
    return { links: [] };
  }
}

/**
 * products.purchase_links → ExternalLink[] 변환.
 * DB 컬럼 미존재 시 null → 빈 배열 (P2-16 D-5).
 */
async function getProductLinks(
  client: SupabaseClient,
  id: string,
): Promise<{ links: ExternalLink[] }> {
  const { data } = await client
    .from('products')
    .select('purchase_links')
    .eq('id', id)
    .maybeSingle();

  const raw = (data?.purchase_links ?? []) as Array<{ platform: string; url: string }>;
  const links: ExternalLink[] = raw.map(link => ({
    type: 'purchase' as LinkType,
    url: link.url,
    label: link.platform,
  }));

  return { links };
}

/**
 * stores.external_links 조회.
 * DB 컬럼 미존재 시 null → 빈 배열.
 */
async function getStoreLinks(
  client: SupabaseClient,
  id: string,
): Promise<{ links: ExternalLink[] }> {
  const { data } = await client
    .from('stores')
    .select('external_links')
    .eq('id', id)
    .maybeSingle();

  const links = (data?.external_links ?? []) as ExternalLink[];
  return { links };
}

/**
 * clinics.external_links + booking_url 조합.
 * clinics는 실제 DB에 external_links JSONB + booking_url TEXT 존재 (001:206-207).
 */
async function getClinicLinks(
  client: SupabaseClient,
  id: string,
): Promise<{ links: ExternalLink[] }> {
  const { data } = await client
    .from('clinics')
    .select('external_links, booking_url')
    .eq('id', id)
    .maybeSingle();

  const links = [...((data?.external_links ?? []) as ExternalLink[])];

  if (data?.booking_url) {
    links.push({
      type: 'booking' as LinkType,
      url: data.booking_url as string,
      label: 'Book appointment',
    });
  }

  return { links };
}

/**
 * treatments → clinic_treatments junction → clinics.booking_url.
 * treatments에 링크 컬럼 없음. 연결된 clinics의 booking_url을 수집.
 */
async function getTreatmentLinks(
  client: SupabaseClient,
  id: string,
): Promise<{ links: ExternalLink[] }> {
  const { data: junctions } = await client
    .from('clinic_treatments')
    .select('clinic:clinics(booking_url, name)')
    .eq('treatment_id', id);

  const links: ExternalLink[] = [];
  for (const row of junctions ?? []) {
    const clinic = (row as { clinic: { booking_url: string | null; name: unknown } | null }).clinic;
    if (clinic?.booking_url) {
      links.push({
        type: 'booking' as LinkType,
        url: clinic.booking_url,
      });
    }
  }

  return { links };
}
```

- [ ] **Step 2: 테스트 파일 작성**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

function createMockClient(resolvedValue: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
  };
  const thenableChain = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolvedValue);
      }
      return target[prop as keyof typeof target];
    },
  });

  return {
    from: vi.fn(() => thenableChain),
  };
}

describe('links-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeGetExternalLinks', () => {
    it('clinic: external_links + booking_url 조합', async () => {
      const client = createMockClient({
        data: {
          external_links: [{ type: 'website', url: 'https://clinic.com', label: 'Site' }],
          booking_url: 'https://book.com',
        },
        error: null,
      });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 'c1', entity_type: 'clinic' },
        { client: client as never },
      );

      expect(result.links).toHaveLength(2);
      expect(result.links[0]).toEqual({ type: 'website', url: 'https://clinic.com', label: 'Site' });
      expect(result.links[1]).toEqual({ type: 'booking', url: 'https://book.com', label: 'Book appointment' });
    });

    it('clinic: booking_url 없음 → external_links만', async () => {
      const client = createMockClient({
        data: { external_links: [{ type: 'map', url: 'https://map.com' }], booking_url: null },
        error: null,
      });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 'c1', entity_type: 'clinic' },
        { client: client as never },
      );

      expect(result.links).toHaveLength(1);
    });

    it('product: purchase_links null (컬럼 미존재) → 빈 배열', async () => {
      const client = createMockClient({ data: { purchase_links: null }, error: null });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 'p1', entity_type: 'product' },
        { client: client as never },
      );

      expect(result.links).toEqual([]);
    });

    it('store: external_links null (컬럼 미존재) → 빈 배열', async () => {
      const client = createMockClient({ data: { external_links: null }, error: null });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 's1', entity_type: 'store' },
        { client: client as never },
      );

      expect(result.links).toEqual([]);
    });

    it('treatment: junction → clinics booking_url', async () => {
      const client = createMockClient({
        data: [{ clinic: { booking_url: 'https://book.clinic.com', name: { en: 'A' } } }],
        error: null,
      });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 't1', entity_type: 'treatment' },
        { client: client as never },
      );

      expect(result.links).toHaveLength(1);
      expect(result.links[0].type).toBe('booking');
    });

    it('미존재 엔티티 → 빈 배열', async () => {
      const client = createMockClient({ data: null, error: null });

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 'nonexistent', entity_type: 'clinic' },
        { client: client as never },
      );

      expect(result.links).toEqual([]);
    });

    it('DB 에러 → 빈 배열 (tool-spec §4.2)', async () => {
      const client = {
        from: vi.fn(() => { throw new Error('DB error'); }),
      };

      const { executeGetExternalLinks } = await import(
        '@/server/features/chat/tools/links-handler'
      );
      const result = await executeGetExternalLinks(
        { entity_id: 'c1', entity_type: 'clinic' },
        { client: client as never },
      );

      expect(result.links).toEqual([]);
    });
  });
});
```

- [ ] **Step 3: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/server/features/chat/tools/links-handler.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 4: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 + 7개 모두 PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/features/chat/tools/links-handler.ts src/server/features/chat/tools/links-handler.test.ts
git commit -m "feat(P2-21): get_external_links tool handler — entity_type별 링크 조회

clinic: external_links + booking_url 조합. product/store: 컬럼 미존재 시
null→빈 배열 (P2-16 D-5). treatment: clinic_treatments junction 경유.
tool-spec.md §2 입출력, §4.2 에러 처리. 테스트 7개.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: links-handler → shared/types(type) + @supabase(type) ONLY
[ ] V-2  core/ 수정 없음
[ ] V-4  features 독립: service 역호출 없음 (R-10)
[ ] V-5  콜 스택 ≤ 4: route → chatService → links-handler → Supabase ✓
[ ] V-8  순환 없음
[ ] V-17 제거 안전성: links-handler 삭제 시 빌드 무영향
```

### 품질

```
[ ] R-6  tool handler import 범위 준수
[ ] R-10 service 역호출 없음
[ ] Q-3  VP-3: null-safe (컬럼 미존재 → null → [])
[ ] Q-7  에러 불삼킴: catch에서 빈 배열 반환 (tool-spec §4.2)
[ ] G-4  미사용 import 없음
[ ] G-9  export: executeGetExternalLinks + LinksToolContext (2개)
[ ] Q-14 entity_type별 조회가 DB 스키마와 일치
```

## export 범위 (G-9)

| export | 소비자 |
|--------|--------|
| `executeGetExternalLinks()` | chatService (P2-19) |
| `LinksToolContext` | chatService (P2-19) |

2개 export. LinksArgs는 내부 (L-14).
