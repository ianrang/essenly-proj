import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

// ── Core auth mock ────────────────────────────────────────────
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
  optionalAuthenticateUser: vi.fn().mockResolvedValue(null),
}));

// ── Core db mock — chained Supabase builder ───────────────────
const mockKitInsert = vi.fn();
const mockConsentUpdate = vi.fn();
const mockConsentEq = vi.fn();

vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: vi.fn().mockReturnValue({
    from: (table: string) => {
      if (table === 'kit_subscribers') return { insert: mockKitInsert };
      if (table === 'consent_records') return { update: mockConsentUpdate };
      return {};
    },
  }),
  createServiceClient: vi.fn().mockReturnValue({}),
}));

// ── Rate limit mock ───────────────────────────────────────────
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// ── Crypto mock ───────────────────────────────────────────────
const mockEncrypt = vi.fn();
const mockHash = vi.fn();
vi.mock('@/server/core/crypto', () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  hash: (...args: unknown[]) => mockHash(...args),
}));

import { createApp } from '@/server/features/api/app';
import { registerKitRoutes } from '@/server/features/api/routes/kit';

const VALID_BODY = { email: 'test@example.com', marketing_consent: true };

describe('POST /api/kit/claim', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    registerKitRoutes(app);

    // default: auth succeeds
    mockAuthenticateUser.mockResolvedValue({ id: 'user-123', token: 'valid-token' });

    // default: rate limit allowed
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });

    // default: crypto
    mockEncrypt.mockReturnValue('encrypted-email');
    mockHash.mockReturnValue('hashed-email');

    // default: insert succeeds
    mockKitInsert.mockResolvedValue({ error: null });

    // default: consent update chain
    mockConsentUpdate.mockReturnValue({ eq: mockConsentEq });
    mockConsentEq.mockResolvedValue({ error: null });
  });

  it('인증 실패 → 401 AUTH_REQUIRED', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  it('검증 실패: 잘못된 이메일 → 400', async () => {
    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', marketing_consent: true }),
    });

    expect(res.status).toBe(400);
  });

  it('정상 요청 → 201 claimed + encrypt/hash 호출', async () => {
    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.status).toBe('claimed');
    expect(mockEncrypt).toHaveBeenCalledWith('test@example.com');
    expect(mockHash).toHaveBeenCalledWith('test@example.com');
  });

  it('중복 이메일 (23505) → 409 KIT_ALREADY_CLAIMED', async () => {
    mockKitInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe('KIT_ALREADY_CLAIMED');
  });

  it('marketing_consent true → consent_records UPDATE 호출', async () => {
    await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', marketing_consent: true }),
    });

    expect(mockConsentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ marketing: true }),
    );
    expect(mockConsentEq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  it('marketing_consent false → consent_records UPDATE 미호출', async () => {
    await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', marketing_consent: false }),
    });
    expect(mockConsentUpdate).not.toHaveBeenCalled();
  });

  it('Q-15: consent UPDATE 실패 → kit 등록 성공 (201) 유지', async () => {
    mockConsentEq.mockResolvedValue({ error: { message: 'consent update failed' } });
    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(201);
  });

  it('DB insert 에러 (비-중복) → 500 KIT_CLAIM_FAILED', async () => {
    mockKitInsert.mockResolvedValue({ error: { code: '42P01', message: 'relation does not exist' } });
    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error.code).toBe('KIT_CLAIM_FAILED');
  });

  it('이메일 hash 시 toLowerCase + trim 정규화 적용', async () => {
    await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'TEST@Example.COM', marketing_consent: true }),
    });
    expect(mockEncrypt).toHaveBeenCalledWith('TEST@Example.COM');
    expect(mockHash).toHaveBeenCalledWith('test@example.com');
  });

  it('공백 포함 이메일 → 400 (zod email 검증 거부)', async () => {
    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '  test@example.com  ', marketing_consent: true }),
    });
    expect(res.status).toBe(400);
  });

  it('marketing_consent 필드 누락 → 400', async () => {
    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    expect(res.status).toBe(400);
  });

  it('conversation_id + locale 전달 → insert에 포함', async () => {
    await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        marketing_consent: true,
        conversation_id: '550e8400-e29b-41d4-a716-446655440000',
        locale: 'en',
      }),
    });

    expect(mockKitInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: '550e8400-e29b-41d4-a716-446655440000',
        locale: 'en',
      }),
    );
  });

  it('conversation_id / locale 미전달 → null로 insert', async () => {
    await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', marketing_consent: true }),
    });

    expect(mockKitInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: null,
        locale: null,
      }),
    );
  });
});
