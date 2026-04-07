import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockEmbed = vi.fn();
vi.mock('ai', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
}));

const mockGetEmbeddingModel = vi.fn();
const mockGetEmbeddingProviderOptions = vi.fn();
vi.mock('@/server/core/config', () => ({
  getEmbeddingModel: (...args: unknown[]) => mockGetEmbeddingModel(...args),
  getEmbeddingProviderOptions: (...args: unknown[]) => mockGetEmbeddingProviderOptions(...args),
}));

describe('embedQuery', () => {
  beforeEach(() => {
    vi.resetModules();
    mockEmbed.mockReset();
    mockGetEmbeddingModel.mockReset();
  });

  it('텍스트를 벡터로 변환한다', async () => {
    const fakeModel = { modelId: 'gemini-embedding-001' };
    const fakeEmbedding = [0.1, 0.2, 0.3];
    const fakeOptions = { google: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 1024 } };
    mockGetEmbeddingModel.mockResolvedValue(fakeModel);
    mockGetEmbeddingProviderOptions.mockReturnValue(fakeOptions);
    mockEmbed.mockResolvedValue({ embedding: fakeEmbedding });

    const { embedQuery } = await import('@/server/core/knowledge');
    const result = await embedQuery('test query');

    expect(result).toEqual(fakeEmbedding);
    expect(mockGetEmbeddingModel).toHaveBeenCalledOnce();
    expect(mockGetEmbeddingProviderOptions).toHaveBeenCalledWith('RETRIEVAL_QUERY');
    expect(mockEmbed).toHaveBeenCalledWith({
      model: fakeModel,
      value: 'test query',
      providerOptions: fakeOptions,
    });
  });

  it('빈 문자열이면 에러', async () => {
    const { embedQuery } = await import('@/server/core/knowledge');
    await expect(embedQuery('')).rejects.toThrow('Embedding text must not be empty');
  });
});

describe('embedDocument', () => {
  beforeEach(() => {
    vi.resetModules();
    mockEmbed.mockReset();
    mockGetEmbeddingModel.mockReset();
  });

  it('텍스트를 벡터로 변환한다 (RETRIEVAL_DOCUMENT)', async () => {
    const fakeModel = { modelId: 'gemini-embedding-001' };
    const fakeEmbedding = [0.4, 0.5, 0.6];
    const fakeOptions = { google: { taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: 1024 } };
    mockGetEmbeddingModel.mockResolvedValue(fakeModel);
    mockGetEmbeddingProviderOptions.mockReturnValue(fakeOptions);
    mockEmbed.mockResolvedValue({ embedding: fakeEmbedding });

    const { embedDocument } = await import('@/server/core/knowledge');
    const result = await embedDocument('test document');

    expect(result).toEqual(fakeEmbedding);
    expect(mockGetEmbeddingProviderOptions).toHaveBeenCalledWith('RETRIEVAL_DOCUMENT');
    expect(mockEmbed).toHaveBeenCalledWith({
      model: fakeModel,
      value: 'test document',
      providerOptions: fakeOptions,
    });
  });

  it('빈 문자열이면 에러', async () => {
    const { embedDocument } = await import('@/server/core/knowledge');
    await expect(embedDocument('')).rejects.toThrow('Embedding text must not be empty');
  });
});
