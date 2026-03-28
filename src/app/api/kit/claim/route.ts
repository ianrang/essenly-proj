import 'server-only';
import { z } from 'zod';
import { authenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
import { encrypt, hash } from '@/server/core/crypto';

// ============================================================
// POST /api/kit/claim — api-spec.md §2.5
// L-1: thin route. P-4: Composition Root.
// schema.dbml kit_subscribers: email_encrypted + email_hash.
// data-privacy.md §1.2: consent_records.marketing UPDATE.
// Q-12: email_hash UNIQUE → 멱등성 (중복 제출 시 409).
// ============================================================

const kitClaimSchema = z.object({
  email: z.string().email().max(320),
  marketing_consent: z.boolean(),
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

  // 2. Rate limit
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

  const parsed = kitClaimSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? 'Validation failed', details: null } },
      { status: 400 },
    );
  }

  // 4. 이메일 암호화 + 해시
  const emailEncrypted = encrypt(parsed.data.email);
  const emailHash = hash(parsed.data.email.toLowerCase().trim());

  // 5. DB 저장
  const client = createAuthenticatedClient(user.token);

  try {
    // kit_subscribers INSERT (Q-12: email_hash UNIQUE → 중복 시 에러)
    const { error: insertError } = await client
      .from('kit_subscribers')
      .insert({
        user_id: user.id,
        email_encrypted: emailEncrypted,
        email_hash: emailHash,
        marketing_consent: parsed.data.marketing_consent,
      });

    if (insertError) {
      // UNIQUE 제약 위반 = 중복 제출
      if (insertError.code === '23505') {
        return Response.json(
          { error: { code: 'KIT_ALREADY_CLAIMED', message: 'Kit already claimed with this email', details: null } },
          { status: 409 },
        );
      }
      throw insertError;
    }

    // consent_records.marketing UPDATE (data-privacy.md §1.2)
    // Q-15: consent UPDATE는 kit 등록의 부수 효과. 실패해도 kit 등록은 유효.
    if (parsed.data.marketing_consent) {
      const { error: consentError } = await client
        .from('consent_records')
        .update({ marketing: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (consentError) {
        console.error('[kit/claim] consent update failed', String(consentError));
        // Q-15: 실패 로그만. kit 등록 성공 응답은 유지.
      }
    }

    return Response.json(
      { data: { status: 'claimed' } },
      { status: 201 },
    );
  } catch (error) {
    console.error('[kit/claim] failed', String(error));
    return Response.json(
      { error: { code: 'KIT_CLAIM_FAILED', message: 'Failed to process kit claim', details: null } },
      { status: 500 },
    );
  }
}
