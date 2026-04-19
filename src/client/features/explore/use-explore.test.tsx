import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('client-only', () => ({}));

const mockAuthFetch = vi.fn();
vi.mock('@/client/core/auth-fetch', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

import { useExplore } from './use-explore';

function createMockResponse(data: unknown[], total: number) {
  return {
    ok: true,
    json: () => Promise.resolve({
      data,
      meta: { total, limit: 10, offset: 0, domain: 'products', scored: false },
    }),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}

describe('useExplore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('초기 로드 시 데이터를 가져온다', async () => {
    const mockData = [{ id: 'p1', name: { en: 'Serum' } }];
    mockAuthFetch.mockResolvedValue(createMockResponse(mockData, 1));

    const { result } = renderHook(() =>
      useExplore('products', {}, 'rating'),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe('p1');
    expect(result.current.total).toBe(1);
  });

  it('hasMore는 items.length < total 일 때 true', async () => {
    const mockData = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}` }));
    mockAuthFetch.mockResolvedValue(createMockResponse(mockData, 25));

    const { result } = renderHook(() =>
      useExplore('products', {}, 'rating'),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.items.length).toBeGreaterThan(0);
    });

    expect(result.current.total).toBe(25);
    expect(result.current.hasMore).toBe(true);
  });

  it('모든 데이터 로드 시 hasMore=false', async () => {
    const mockData = [{ id: 'p1' }];
    mockAuthFetch.mockResolvedValue(createMockResponse(mockData, 1));

    const { result } = renderHook(() =>
      useExplore('products', {}, 'rating'),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.items.length).toBeGreaterThan(0);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it('authFetch에 올바른 URL 전달', async () => {
    mockAuthFetch.mockResolvedValue(createMockResponse([], 0));

    renderHook(() =>
      useExplore('products', { category: 'skincare' }, 'rating'),
      { wrapper },
    );

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalled();
    });

    const calledUrl = mockAuthFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/explore');
    expect(calledUrl).toContain('domain=products');
    expect(calledUrl).toContain('category=skincare');
    expect(calledUrl).toContain('sort=rating');
  });
});
