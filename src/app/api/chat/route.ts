import 'server-only';
import { z } from 'zod';
import type { UserProfile, Journey } from '@/shared/types/profile';
import { authenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient, createServiceClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
// TODO(P2-24): saveMessages는 AI SDK onFinish 콜백 통합 시 사용. 현재 미import (G-4).
import { getProfile } from '@/server/features/profile/service';
import { getActiveJourney } from '@/server/features/journey/service';
import { streamChat } from '@/server/features/chat/service';

// ============================================================
// POST /api/chat — api-spec.md §3.1
// L-1: thin route (인증 → 검증 → cross-domain 조회 → service → 반환).
// P-4: Composition Root — profile + journey + chat service 조합.
// Q-15: 비동기 후처리 격리 (히스토리 저장, 추출 결과 저장).
// ============================================================

/** Q-1: zod 입력 검증 — api-spec.md §3.1 */
const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversation_id: z.string().uuid().nullable().optional(),
});

/** api-spec.md §4.1: Chat rate limit */
const RATE_LIMIT_MINUTE = { limit: 5, windowMs: 60 * 1000, window: 'minute' } as const;
const RATE_LIMIT_DAILY = { limit: 100, windowMs: 24 * 60 * 60 * 1000, window: 'daily' } as const;

function rateLimitHeaders(remaining: number, resetAt: number, limit: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  };
}

export async function POST(req: Request) {
  // 1. 인증 (auth-matrix.md §3.3: 필수)
  let user;
  try {
    user = await authenticateUser(req);
  } catch {
    return Response.json(
      { error: { code: 'AUTH_REQUIRED', message: 'Authentication is required', details: null } },
      { status: 401 },
    );
  }

  // 2. Rate limit — api-spec.md §4.1: 분당 5회 + 일일 100회
  const minuteResult = checkRateLimit(user.id, 'chat', RATE_LIMIT_MINUTE);
  if (!minuteResult.allowed) {
    const retryAfter = Math.ceil((minuteResult.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: { code: 'CHAT_RATE_LIMITED', message: `Too many requests. Try again in ${retryAfter}s.`, details: { retryAfter } } },
      { status: 429, headers: { ...rateLimitHeaders(minuteResult.remaining, minuteResult.resetAt, RATE_LIMIT_MINUTE.limit), 'Retry-After': String(retryAfter) } },
    );
  }

  const dailyResult = checkRateLimit(user.id, 'chat', RATE_LIMIT_DAILY);
  if (!dailyResult.allowed) {
    return Response.json(
      { error: { code: 'CHAT_RATE_LIMITED', message: 'Daily chat limit reached.', details: null } },
      { status: 429, headers: rateLimitHeaders(dailyResult.remaining, dailyResult.resetAt, RATE_LIMIT_DAILY.limit) },
    );
  }

  // 3. 입력 검증 (Q-1)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Invalid JSON body', details: null } },
      { status: 400 },
    );
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? 'Validation failed', details: null } },
      { status: 400 },
    );
  }

  // 4. DB 클라이언트 (RLS 적용)
  const client = createAuthenticatedClient(user.token);

  // 5. Cross-domain 데이터 조회 (L-3, P-4)
  // ProfileRow/JourneyRow → UserProfile/Journey 타입 단언
  // getProfile은 ProfileRow(내부 타입)를 반환하지만 구조적으로 UserProfile 호환. MVP 타입 단언.
  const [profile, journey] = await Promise.all([
    getProfile(client, user.id).catch(() => null) as Promise<UserProfile | null>,
    getActiveJourney(client, user.id).catch(() => null) as Promise<Journey | null>,
  ]);

  // learned_preferences 조회 (P2-26 미구현 → 직접 조회)
  const { data: preferencesData } = await client
    .from('learned_preferences')
    .select('*')
    .eq('user_id', user.id);
  const preferences = preferencesData ?? [];

  // 6. chatService 호출 (step 3~8)
  try {
    const result = await streamChat({
      client,
      userId: user.id,
      conversationId: parsed.data.conversation_id ?? null,
      message: parsed.data.message,
      profile,
      journey,
      preferences,
      derived: null, // MVP: DV-4 미구현. beauty/ DV-1/2는 search-handler 내부 계산.
    });

    // 7. 비동기 후처리 (Q-15: 격리. 실패해도 응답 무영향)
    // auth-matrix.md §5.4: service_role 사용 (토큰 만료 대비)
    const afterWork = async () => {
      try {
        const serviceClient = createServiceClient();

        // TODO(P2-24): step 9 히스토리 저장 — AI SDK onFinish 콜백에서 saveMessages 호출
        // TODO(P2-26): step 10 행동 로그 — behavior service에서 처리

        // step 11: 추출 결과 조건부 저장
        if (result.extractionResults.length > 0 && profile) {
          for (const extraction of result.extractionResults) {
            if (extraction.skin_type) {
              await serviceClient
                .from('user_profiles')
                .update({ skin_type: extraction.skin_type })
                .eq('user_id', user.id);
            }
          }
        }
      } catch (error) {
        console.error('[chat/after] async post-processing failed', String(error));
      }
    };

    // Q-15: 비동기 실행 — 응답 반환 후 처리
    void afterWork();

    // 8. SSE 스트리밍 반환 — api-spec.md §3.2
    const stream = result.stream as { toUIMessageStreamResponse: () => Response };
    return stream.toUIMessageStreamResponse();
  } catch (error) {
    // MVP: CHAT_LLM_TIMEOUT vs CHAT_LLM_ERROR 미구분.
    // callWithFallback이 timeout을 AbortError로 throw하지만 구분 없이 500 반환.
    // v0.2: AbortError 감지 → CHAT_LLM_TIMEOUT (408) 분리.
    console.error('[chat] streamChat failed', String(error));
    return Response.json(
      { error: { code: 'CHAT_LLM_ERROR', message: 'Failed to process chat request', details: null } },
      { status: 500 },
    );
  }
}
