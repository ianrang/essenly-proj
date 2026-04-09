import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
}));

const mockGetModel = vi.fn();
vi.mock('@/server/core/config', () => ({
  env: {
    AI_PROVIDER: 'anthropic',
    AI_FALLBACK_PROVIDER: 'google',
    LLM_TIMEOUT_MS: 45000, // v1.1: 30000 → 45000
    LLM_TEMPERATURE: 0.6,  // v1.2: env.LLM_TEMPERATURE SSOT
  },
  getModel: (...args: unknown[]) => mockGetModel(...args),
}));

vi.mock('@/shared/constants/ai', () => ({
  LLM_CONFIG: {
    FALLBACK_TRIGGER_CODES: [408, 429, 500, 502, 503, 504] as const,
    NO_FALLBACK_CODES: [400, 401, 403, 404, 422] as const,
    MAX_ATTEMPTS: 2,
    FALLBACK_DELAY_MS: 0, // 테스트에서 대기 없음 (실제값 100ms)
  },
  TOKEN_CONFIG: {
    default: {
      maxOutputTokens: 2048, // v1.1: 1024 → 2048
      historyLimit: 20,
      maxToolSteps: 5,       // v1.1: 신규
      // v1.2: temperature 필드 제거 (env.LLM_TEMPERATURE로 이전)
    },
  },
}));

describe('callWithFallback', () => {
  beforeEach(() => {
    vi.resetModules();
    mockStreamText.mockReset();
    mockGetModel.mockReset();
  });

  it('주 모델 성공 시 결과를 반환한다', async () => {
    const mockResult = { text: 'hello' };
    mockGetModel.mockResolvedValue('anthropic-model');
    mockStreamText.mockResolvedValue(mockResult);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    const result = await callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    });

    expect(result).toBe(mockResult);
    expect(mockGetModel).toHaveBeenCalledWith('anthropic');
    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });

  it('주 모델 500 실패 → 폴백 모델 호출', async () => {
    const primaryError = Object.assign(new Error('Internal Server Error'), { status: 500 });
    const fallbackResult = { text: 'fallback' };

    mockGetModel
      .mockResolvedValueOnce('anthropic-model')
      .mockResolvedValueOnce('google-model');
    mockStreamText
      .mockRejectedValueOnce(primaryError)
      .mockResolvedValueOnce(fallbackResult);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    const result = await callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    });

    expect(result).toBe(fallbackResult);
    expect(mockGetModel).toHaveBeenCalledTimes(2);
    expect(mockGetModel).toHaveBeenNthCalledWith(2, 'google');
  });

  it('주 모델 400 실패 → 폴백 없이 즉시 throw', async () => {
    const clientError = Object.assign(new Error('Bad Request'), { status: 400 });
    mockGetModel.mockResolvedValue('anthropic-model');
    mockStreamText.mockRejectedValue(clientError);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    await expect(callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    })).rejects.toThrow('Bad Request');

    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });

  it('타임아웃(AbortError) → 폴백 시도', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const fallbackResult = { text: 'fallback' };

    mockGetModel
      .mockResolvedValueOnce('anthropic-model')
      .mockResolvedValueOnce('google-model');
    mockStreamText
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(fallbackResult);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    const result = await callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    });

    expect(result).toBe(fallbackResult);
  });

  it('양쪽 모두 실패 시 폴백 에러를 throw', async () => {
    const primaryError = Object.assign(new Error('Primary fail'), { status: 500 });
    const fallbackError = new Error('Fallback fail');

    mockGetModel
      .mockResolvedValueOnce('anthropic-model')
      .mockResolvedValueOnce('google-model');
    mockStreamText
      .mockRejectedValueOnce(primaryError)
      .mockRejectedValueOnce(fallbackError);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    await expect(callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    })).rejects.toThrow('Fallback fail');
  });

  // --- v1.1 신규: FALLBACK_DELAY_MS 적용 검증 (llm-resilience.md §2.2) ---
  // 주의: 이 테스트들은 반드시 'fallbackProvider 미설정' 테스트 앞에 위치해야 한다.
  // 'fallbackProvider 미설정' 테스트는 vi.doMock으로 AI_FALLBACK_PROVIDER=undefined를
  // 설정하며, vi.resetModules()는 doMock 레지스트리를 초기화하지 않으므로 이후 테스트가
  // 폴백 경로를 타지 못한다.

  it('폴백 진입 시 setTimeout(FALLBACK_DELAY_MS) 호출', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const primaryError = Object.assign(new Error('Server Error'), { status: 500 });
    const fallbackResult = { text: 'fallback' };

    mockGetModel
      .mockResolvedValueOnce('anthropic-model')
      .mockResolvedValueOnce('google-model');
    mockStreamText
      .mockRejectedValueOnce(primaryError)
      .mockResolvedValueOnce(fallbackResult);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    const result = await callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    });

    // FALLBACK_DELAY_MS(mock: 0)로 setTimeout 호출되었는지 검증
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
    expect(result).toBe(fallbackResult);

    setTimeoutSpy.mockRestore();
  });

  it('주 모델 성공 시 setTimeout(FALLBACK_DELAY) 호출 안 됨', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const mockResult = { text: 'primary success' };

    mockGetModel.mockResolvedValue('anthropic-model');
    mockStreamText.mockResolvedValue(mockResult);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    await callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    });

    // 폴백 경로 미진입이므로 FALLBACK_DELAY setTimeout 호출 없어야 함
    const delayCalls = setTimeoutSpy.mock.calls.filter(
      ([, delay]) => delay === 0 // mock FALLBACK_DELAY_MS 값
    );
    expect(delayCalls).toHaveLength(0);

    setTimeoutSpy.mockRestore();
  });

  // 주의: 이 테스트는 반드시 맨 마지막에 위치해야 한다.
  // vi.doMock의 AI_FALLBACK_PROVIDER=undefined가 이후 테스트에 누수되기 때문.
  it('fallbackProvider 미설정 시 폴백 없이 즉시 throw', async () => {
    vi.doMock('@/server/core/config', () => ({
      env: {
        AI_PROVIDER: 'anthropic',
        AI_FALLBACK_PROVIDER: undefined,
        LLM_TIMEOUT_MS: 45000,
        LLM_TEMPERATURE: 0.6,
      },
      getModel: (...args: unknown[]) => mockGetModel(...args),
    }));

    const serverError = Object.assign(new Error('Server Error'), { status: 500 });
    mockGetModel.mockResolvedValue('anthropic-model');
    mockStreamText.mockRejectedValue(serverError);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    await expect(callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    })).rejects.toThrow('Server Error');

    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });
});
