import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// auth mock
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
}));

// db mock
const mockCreateAuthenticatedClient = vi.fn();
const mockCreateServiceClient = vi.fn();
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: (...args: unknown[]) => mockCreateAuthenticatedClient(...args),
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}));

// rate-limit mock
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// profile service mock
const mockGetProfile = vi.fn();
vi.mock('@/server/features/profile/service', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
}));

// journey service mock
const mockGetActiveJourney = vi.fn();
vi.mock('@/server/features/journey/service', () => ({
  getActiveJourney: (...args: unknown[]) => mockGetActiveJourney(...args),
}));

// chat service mock
const mockStreamChat = vi.fn();
vi.mock('@/server/features/chat/service', () => ({
  streamChat: (...args: unknown[]) => mockStreamChat(...args),
}));

// --- helpers ---

function createRequest(body: unknown, invalidJson = false) {
  if (invalidJson) {
    return new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    });
  }
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    body: JSON.stringify(body),
  });
}

/** SSE Response stub returned by streamChat */
function makeStreamResult(overrides: Partial<{ extractionResults: unknown[] }> = {}) {
  return {
    stream: {
      toUIMessageStreamResponse: () =>
        new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    },
    conversationId: 'conv-uuid-123',
    extractionResults: overrides.extractionResults ?? [],
  };
}

/** Supabase client stub with chained query builder */
function makeClientStub(preferencesData: unknown[] = []) {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
  // final .eq returns resolved promise with data
  queryBuilder.eq.mockResolvedValue({ data: preferencesData, error: null });

  return {
    from: vi.fn().mockReturnValue(queryBuilder),
  };
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // default: auth succeeds
    mockAuthenticateUser.mockResolvedValue({ id: 'user-123', token: 'valid-token' });

    // default: both rate limits pass
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60000 });

    // default: client stub
    mockCreateAuthenticatedClient.mockReturnValue(makeClientStub());
    mockCreateServiceClient.mockReturnValue(makeClientStub());

    // default: profile + journey null
    mockGetProfile.mockResolvedValue(null);
    mockGetActiveJourney.mockResolvedValue(null);

    // default: streamChat succeeds
    mockStreamChat.mockResolvedValue(makeStreamResult());
  });

  // 1. Auth failure → 401 AUTH_REQUIRED
  it('인증 실패 → 401 AUTH_REQUIRED', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const { POST } = await import('@/app/api/chat/route');
    const res = await POST(createRequest({ message: 'hello' }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  // 2. Rate limit exceeded → 429 CHAT_RATE_LIMITED
  it('rate limit 초과 → 429 CHAT_RATE_LIMITED + Retry-After', async () => {
    const resetAt = Date.now() + 30000;
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt });

    const { POST } = await import('@/app/api/chat/route');
    const res = await POST(createRequest({ message: 'hello' }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe('CHAT_RATE_LIMITED');
    expect(res.headers.get('Retry-After')).toBeDefined();
  });

  // 3. Invalid JSON → 400 VALIDATION_FAILED
  it('잘못된 JSON → 400 VALIDATION_FAILED', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const res = await POST(createRequest(null, true));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  // 4. Empty message → 400 VALIDATION_FAILED
  it('message 빈 문자열 → 400 VALIDATION_FAILED', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const res = await POST(createRequest({ message: '' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  // 5. Normal request → streamChat called + SSE response
  it('정상 요청 → streamChat 호출 + SSE 응답', async () => {
    const conversationId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const { POST } = await import('@/app/api/chat/route');
    const res = await POST(createRequest({ message: 'hello', conversation_id: conversationId }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(mockStreamChat).toHaveBeenCalledOnce();

    const callArgs = mockStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.userId).toBe('user-123');
    expect(callArgs.message).toBe('hello');
    expect(callArgs.conversationId).toBe(conversationId);
  });

  // 6. Null profile (VP-3) → passed to chatService as null
  it('profile null (VP-3) → chatService에 null 전달', async () => {
    mockGetProfile.mockResolvedValue(null);
    mockGetActiveJourney.mockResolvedValue(null);

    const { POST } = await import('@/app/api/chat/route');
    await POST(createRequest({ message: 'hello' }));

    const callArgs = mockStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.profile).toBeNull();
    expect(callArgs.journey).toBeNull();
  });

  // 7. chatService error → 500 CHAT_LLM_ERROR
  it('chatService 에러 → 500 CHAT_LLM_ERROR', async () => {
    mockStreamChat.mockRejectedValue(new Error('LLM timeout'));

    const { POST } = await import('@/app/api/chat/route');
    const res = await POST(createRequest({ message: 'hello' }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('CHAT_LLM_ERROR');
  });

  // 8. conversation_id null → passed through correctly
  it('conversation_id null → chatService에 null 전달', async () => {
    const { POST } = await import('@/app/api/chat/route');
    await POST(createRequest({ message: 'hello', conversation_id: null }));

    const callArgs = mockStreamChat.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.conversationId).toBeNull();
  });
});
