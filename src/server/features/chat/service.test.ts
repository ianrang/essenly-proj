import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('ai', () => ({
  tool: vi.fn((config: unknown) => config),
  stepCountIs: vi.fn((n: number) => n),
}));

const mockLoadRecentMessages = vi.fn();
vi.mock('@/server/core/memory', () => ({
  loadRecentMessages: (...args: unknown[]) => mockLoadRecentMessages(...args),
}));

const mockCallWithFallback = vi.fn();
vi.mock('./llm-client', () => ({
  callWithFallback: (...args: unknown[]) => mockCallWithFallback(...args),
}));

const mockBuildSystemPrompt = vi.fn();
vi.mock('./prompts', () => ({
  buildSystemPrompt: (...args: unknown[]) => mockBuildSystemPrompt(...args),
}));

const mockExecuteSearchBeautyData = vi.fn();
vi.mock('./tools/search-handler', () => ({
  executeSearchBeautyData: (...args: unknown[]) => mockExecuteSearchBeautyData(...args),
}));

const mockExecuteGetExternalLinks = vi.fn();
vi.mock('./tools/links-handler', () => ({
  executeGetExternalLinks: (...args: unknown[]) => mockExecuteGetExternalLinks(...args),
}));

const mockExecuteExtractUserProfile = vi.fn();
vi.mock('./tools/extraction-handler', () => ({
  executeExtractUserProfile: (...args: unknown[]) => mockExecuteExtractUserProfile(...args),
  extractUserProfileSchema: {},
}));

vi.mock('@/shared/constants/ai', () => ({
  TOKEN_CONFIG: {
    default: { maxTokens: 1024, historyLimit: 20 },
  },
}));

// ---- Supabase mock builder ----

function makeMockClient(overrides?: {
  selectData?: unknown;
  selectError?: unknown;
  insertData?: unknown;
  insertError?: unknown;
}) {
  const chainBase = {
    eq: vi.fn(),
    single: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
  };

  // .from('conversations').select('id').eq(...).eq(...).single()
  chainBase.single.mockResolvedValue({
    data: overrides?.selectData ?? { id: 'conv-123' },
    error: overrides?.selectError ?? null,
  });
  chainBase.eq.mockReturnValue(chainBase);
  chainBase.select.mockReturnValue(chainBase);
  // .insert({}).select('id').single()
  chainBase.insert.mockReturnValue(chainBase);

  if (overrides?.insertData !== undefined || overrides?.insertError !== undefined) {
    // Override single for insert path — need a second call to return insert result
    let callCount = 0;
    chainBase.single.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          data: overrides?.insertData ?? { id: 'new-conv-456' },
          error: overrides?.insertError ?? null,
        });
      }
      return Promise.resolve({ data: { id: 'conv-123' }, error: null });
    });
  }

  return {
    from: vi.fn(() => chainBase),
  };
}

// ---- Common test fixtures ----

const mockProfile = {
  user_id: 'user-1',
  skin_type: 'dry' as const,
  hair_type: null,
  hair_concerns: [],
  country: 'US',
  language: 'en' as const,
  age_range: '25-29' as const,
  updated_at: '2024-01-01',
};

const mockJourney = {
  id: 'journey-1',
  user_id: 'user-1',
  skin_concerns: ['acne' as const],
  interest_activities: [],
  stay_days: 7,
  start_date: '2024-12-01',
  end_date: '2024-12-08',
  budget_level: 'moderate' as const,
  travel_style: [],
  country: 'KR',
  city: 'Seoul',
  status: 'active' as const,
  created_at: '2024-01-01',
};

const mockDerived = {
  preferred_ingredients: ['niacinamide'],
  avoided_ingredients: [],
  user_segment: 'dry-skin',
  ai_beauty_profile: null,
};

describe('streamChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildSystemPrompt.mockReturnValue('system prompt');
    mockLoadRecentMessages.mockResolvedValue([]);
    mockCallWithFallback.mockResolvedValue({ textStream: 'stream-result' });
  });

  it('기존 conversation ID 제공 시 히스토리 로드 + LLM 호출', async () => {
    const mockHistory = [
      { role: 'user', content: 'Hello', card_data: null, tool_calls: null, created_at: '2024-01-01' },
      { role: 'assistant', content: 'Hi!', card_data: null, tool_calls: null, created_at: '2024-01-01' },
    ];
    mockLoadRecentMessages.mockResolvedValue(mockHistory);

    const client = makeMockClient({ selectData: { id: 'conv-123' } });

    const { streamChat } = await import('./service');
    const result = await streamChat({
      client: client as unknown as Parameters<typeof streamChat>[0]['client'],
      userId: 'user-1',
      conversationId: 'conv-123',
      message: 'Hello',
      profile: mockProfile,
      journey: mockJourney,
      preferences: [],
      derived: mockDerived,
    });

    expect(result.conversationId).toBe('conv-123');
    expect(mockLoadRecentMessages).toHaveBeenCalledWith(
      expect.anything(),
      'conv-123',
      20,
    );
    expect(mockCallWithFallback).toHaveBeenCalledOnce();

    // history messages + current message should be passed to LLM
    const callArgs = mockCallWithFallback.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(3); // 2 history + 1 current
    expect(callArgs.messages[2]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('conversationId null 시 새 conversation 생성 후 반환', async () => {
    const chainBase = {
      eq: vi.fn(),
      single: vi.fn(),
      select: vi.fn(),
      insert: vi.fn(),
    };
    chainBase.eq.mockReturnValue(chainBase);
    chainBase.select.mockReturnValue(chainBase);
    chainBase.insert.mockReturnValue(chainBase);
    chainBase.single.mockResolvedValue({ data: { id: 'new-conv-456' }, error: null });

    const client = { from: vi.fn(() => chainBase) };

    const { streamChat } = await import('./service');
    const result = await streamChat({
      client: client as unknown as Parameters<typeof streamChat>[0]['client'],
      userId: 'user-1',
      conversationId: null,
      message: 'Hello',
      profile: mockProfile,
      journey: mockJourney,
      preferences: [],
      derived: mockDerived,
    });

    expect(result.conversationId).toBe('new-conv-456');
    // insert should have been called
    expect(chainBase.insert).toHaveBeenCalledWith({ user_id: 'user-1' });
  });

  it('profile null (VP-3) — 기본 프롬프트로 동작하며 에러 없음', async () => {
    const client = makeMockClient();

    const { streamChat } = await import('./service');
    const result = await streamChat({
      client: client as unknown as Parameters<typeof streamChat>[0]['client'],
      userId: 'user-1',
      conversationId: 'conv-123',
      message: 'Hello',
      profile: null,
      journey: null,
      preferences: [],
      derived: null,
    });

    expect(result.conversationId).toBe('conv-123');
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ profile: null, journey: null, derived: null }),
    );
    expect(mockCallWithFallback).toHaveBeenCalledOnce();
  });
});

describe('getOrCreateConversation (via streamChat)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildSystemPrompt.mockReturnValue('system prompt');
    mockLoadRecentMessages.mockResolvedValue([]);
    mockCallWithFallback.mockResolvedValue({ textStream: 'stream-result' });
  });

  it('미존재 conversationId 제공 시 throw', async () => {
    const chainBase = {
      eq: vi.fn(),
      single: vi.fn(),
      select: vi.fn(),
      insert: vi.fn(),
    };
    chainBase.eq.mockReturnValue(chainBase);
    chainBase.select.mockReturnValue(chainBase);
    chainBase.insert.mockReturnValue(chainBase);
    // .single() returns not found
    chainBase.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const client = { from: vi.fn(() => chainBase) };

    const { streamChat } = await import('./service');
    await expect(streamChat({
      client: client as unknown as Parameters<typeof streamChat>[0]['client'],
      userId: 'user-1',
      conversationId: 'nonexistent-id',
      message: 'Hello',
      profile: null,
      journey: null,
      preferences: [],
      derived: null,
    })).rejects.toThrow('Conversation not found');
  });
});

describe('buildTools (via streamChat)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildSystemPrompt.mockReturnValue('system prompt');
    mockLoadRecentMessages.mockResolvedValue([]);
  });

  it('3개 tool 키가 등록된다', async () => {
    const client = makeMockClient();
    let capturedTools: Record<string, unknown> | null = null;

    mockCallWithFallback.mockImplementation((opts: { tools: Record<string, unknown> }) => {
      capturedTools = opts.tools;
      return Promise.resolve({ textStream: 'stream' });
    });

    const { streamChat } = await import('./service');
    await streamChat({
      client: client as unknown as Parameters<typeof streamChat>[0]['client'],
      userId: 'user-1',
      conversationId: 'conv-123',
      message: 'Hello',
      profile: mockProfile,
      journey: mockJourney,
      preferences: [],
      derived: mockDerived,
    });

    expect(capturedTools).not.toBeNull();
    expect(Object.keys(capturedTools!)).toEqual(
      expect.arrayContaining(['search_beauty_data', 'get_external_links', 'extract_user_profile']),
    );
    expect(Object.keys(capturedTools!)).toHaveLength(3);
  });

  it('extract_user_profile execute 성공 시 extractionResults에 수집된다', async () => {
    const client = makeMockClient();
    const extractedData = {
      skin_type: 'dry' as const,
      skin_concerns: ['acne' as const],
      stay_days: 7,
      budget_level: 'moderate' as const,
      age_range: '25-29' as const,
      learned_preferences: null,
    };
    mockExecuteExtractUserProfile.mockResolvedValue(extractedData);

    let capturedTools: Record<string, { execute: (args: unknown) => Promise<unknown> }> | null = null;
    mockCallWithFallback.mockImplementation((opts: { tools: Record<string, { execute: (args: unknown) => Promise<unknown> }> }) => {
      capturedTools = opts.tools;
      return Promise.resolve({ textStream: 'stream' });
    });

    const { streamChat } = await import('./service');
    const result = await streamChat({
      client: client as unknown as Parameters<typeof streamChat>[0]['client'],
      userId: 'user-1',
      conversationId: 'conv-123',
      message: 'I have dry skin and acne',
      profile: null,
      journey: null,
      preferences: [],
      derived: null,
    });

    // Manually execute the tool (simulate LLM calling it)
    await capturedTools!['extract_user_profile'].execute({ skin_type: 'dry' });

    expect(result.extractionResults).toHaveLength(1);
    expect(result.extractionResults[0]).toEqual(extractedData);
  });

  it('extraction_skipped 시 extractionResults에 수집되지 않는다', async () => {
    const client = makeMockClient();
    mockExecuteExtractUserProfile.mockResolvedValue({
      status: 'extraction_skipped',
      reason: 'parse_error',
    });

    let capturedTools: Record<string, { execute: (args: unknown) => Promise<unknown> }> | null = null;
    mockCallWithFallback.mockImplementation((opts: { tools: Record<string, { execute: (args: unknown) => Promise<unknown> }> }) => {
      capturedTools = opts.tools;
      return Promise.resolve({ textStream: 'stream' });
    });

    const { streamChat } = await import('./service');
    const result = await streamChat({
      client: client as unknown as Parameters<typeof streamChat>[0]['client'],
      userId: 'user-1',
      conversationId: 'conv-123',
      message: 'Hello',
      profile: null,
      journey: null,
      preferences: [],
      derived: null,
    });

    // Manually execute the tool (simulate LLM calling it)
    await capturedTools!['extract_user_profile'].execute({});

    expect(result.extractionResults).toHaveLength(0);
  });
});
