import 'server-only';
import { z } from 'zod';
import { authenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';

// ============================================================
// POST /api/events — api-spec.md §2.7
// L-1: thin route (인증 → 검증 → INSERT → 응답).
// ANALYTICS.md §3.2: 4개 클라이언트 이벤트 타입.
// Q-15: DB INSERT 실패 시 응답에 영향 없음 (fire-and-forget).
// ============================================================

/** 이벤트별 metadata 스키마 — ANALYTICS.md §3.2 */
const metadataSchemas: Record<string, z.ZodType> = {
  path_a_entry: z.object({
    source: z.literal('landing'),
  }),
  card_exposure: z.object({
    card_id: z.string().min(1),
    domain: z.enum(['shopping', 'treatment']),
    position: z.number().int().nonnegative(),
    conversation_id: z.string().uuid(),
  }),
  card_click: z.object({
    card_id: z.string().min(1),
    domain: z.enum(['shopping', 'treatment']),
    conversation_id: z.string().uuid(),
  }),
  external_link_click: z.object({
    card_id: z.string().min(1),
    link_type: z.enum(['naver_map', 'kakao_map', 'website', 'purchase', 'booking', 'phone']),
    url: z.string().url(),
    conversation_id: z.string().uuid(),
  }),
  // kit_cta_submit: 서버 전용 (api-spec.md §2.7 line 400). POST /api/kit/claim에서 직접 기록.
};

const VALID_EVENT_TYPES = Object.keys(metadataSchemas);

const VALID_TARGET_TYPES = ['product', 'store', 'clinic', 'treatment', 'card', 'link'] as const;

/** Q-1: 단일 이벤트 스키마 */
const eventSchema = z.object({
  event_type: z.string().refine(t => VALID_EVENT_TYPES.includes(t), { message: 'Invalid event_type' }),
  target_id: z.string().uuid().nullable().optional(),
  target_type: z.enum(VALID_TARGET_TYPES).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Q-1: 요청 전체 스키마 */
const eventsRequestSchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

const RATE_LIMIT_CONFIG = { limit: 60, windowMs: 60 * 1000, window: 'minute' } as const;

export async function POST(req: Request) {
  // 1. 인증
  let user;
  try {
    user = await authenticateUser(req);
  } catch {
    return Response.json(
      { error: { code: 'AUTH_REQUIRED', message: 'Authentication is required', details: null } },
      { status: 401 },
    );
  }

  // 2. Rate limit — api-spec.md §4.1: 60/분 (public 공유)
  const rateResult = checkRateLimit(user.id, 'public', RATE_LIMIT_CONFIG);
  if (!rateResult.allowed) {
    const retryAfter = Math.ceil((rateResult.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: `Too many requests. Try again in ${retryAfter}s.`, details: { retryAfter } } },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
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

  const parsed = eventsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? 'Validation failed', details: null } },
      { status: 400 },
    );
  }

  // 4. 이벤트별 metadata 검증
  const validEvents: Array<{
    user_id: string;
    event_type: string;
    target_id: string | null;
    target_type: string | null;
    metadata: unknown;
  }> = [];

  for (const event of parsed.data.events) {
    const metaSchema = metadataSchemas[event.event_type];
    if (metaSchema) {
      // ANALYTICS.md §3.1: 모든 이벤트는 metadata 필수
      if (!event.metadata) continue; // metadata 없음 → 스킵
      const metaResult = metaSchema.safeParse(event.metadata);
      if (!metaResult.success) continue; // 잘못된 metadata → 스킵
    }

    validEvents.push({
      user_id: user.id,
      event_type: event.event_type,
      target_id: event.target_id ?? null,
      target_type: event.target_type ?? null,
      metadata: event.metadata ?? null,
    });
  }

  if (validEvents.length === 0) {
    return Response.json(
      { data: { recorded: 0 } },
      { status: 200 },
    );
  }

  // 5. bulk INSERT — Q-15: fire-and-forget (부분 실패 허용)
  const client = createAuthenticatedClient(user.token);

  try {
    const { error } = await client
      .from('behavior_logs')
      .insert(validEvents);

    if (error) {
      console.error('[events] bulk insert failed', String(error));
      // Q-15: 실패해도 응답은 정상 반환 (fire-and-forget 정신)
      return Response.json(
        { data: { recorded: 0 } },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error('[events] unexpected error', String(error));
    return Response.json(
      { data: { recorded: 0 } },
      { status: 200 },
    );
  }

  // 6. 응답 — api-spec.md §2.7
  return Response.json(
    { data: { recorded: validEvents.length } },
    { status: 200 },
  );
}
