import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// auth mock
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
}));

// db mock
const mockInsert = vi.fn();
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: () => ({
    from: () => ({ insert: mockInsert }),
  }),
}));

// rate-limit mock
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

function createRequest(body: unknown) {
  return new Request('http://localhost/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const TEST_ENTITY_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const TEST_CONV_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const validCardClickBody = {
  events: [
    {
      event_type: 'card_click',
      target_id: TEST_ENTITY_ID,
      target_type: 'product',
      metadata: {
        card_id: `product_${TEST_ENTITY_ID}`,
        domain: 'shopping',
        conversation_id: TEST_CONV_ID,
      },
    },
  ],
};

describe('POST /api/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateUser.mockResolvedValue({ id: 'user-123', token: 'valid-token' });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 });
    mockInsert.mockResolvedValue({ error: null });
  });

  it('인증 실패 → 401', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const { POST } = await import('@/app/api/events/route');
    const res = await POST(createRequest(validCardClickBody));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  it('rate limit 초과 → 429 + Retry-After', async () => {
    const resetAt = Date.now() + 30000;
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt });

    const { POST } = await import('@/app/api/events/route');
    const res = await POST(createRequest(validCardClickBody));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.headers.get('Retry-After')).toBeDefined();
  });

  it('빈 events 배열 → 400 VALIDATION_FAILED', async () => {
    const { POST } = await import('@/app/api/events/route');
    const res = await POST(createRequest({ events: [] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('정상 card_click 이벤트 → 200 { recorded: 1 }', async () => {
    const { POST } = await import('@/app/api/events/route');
    const res = await POST(createRequest(validCardClickBody));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'user-123',
          event_type: 'card_click',
        }),
      ]),
    );
  });

  it('잘못된 event_type → 400 VALIDATION_FAILED', async () => {
    const { POST } = await import('@/app/api/events/route');
    const res = await POST(createRequest({ events: [{ event_type: 'kit_cta_submit' }] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('잘못된 metadata → 해당 이벤트 스킵, 나머지 기록', async () => {
    const body = {
      events: [
        // 유효하지 않은 metadata (domain 누락)
        {
          event_type: 'card_click',
          target_id: TEST_ENTITY_ID,
          target_type: 'product',
          metadata: {
            card_id: 'product_001',
            // domain 필드 누락
            conversation_id: TEST_CONV_ID,
          },
        },
        // 유효한 이벤트
        {
          event_type: 'path_a_entry',
          metadata: { source: 'landing' },
        },
      ],
    };

    const { POST } = await import('@/app/api/events/route');
    const res = await POST(createRequest(body));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(1);
  });

  it('DB INSERT 에러 → 200 { recorded: 0 } (Q-15)', async () => {
    mockInsert.mockResolvedValue({ error: { code: '42P01', message: 'table not found' } });

    const { POST } = await import('@/app/api/events/route');
    const res = await POST(createRequest(validCardClickBody));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(0);
  });
});
