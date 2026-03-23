import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/server/core/config', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  },
}));

describe('createAuthenticatedClient', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('SupabaseClient를 반환한다', async () => {
    const { createAuthenticatedClient } = await import('@/server/core/db');
    const client = createAuthenticatedClient('test-jwt-token');
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  it('token이 빈 문자열이면 에러', async () => {
    const { createAuthenticatedClient } = await import('@/server/core/db');
    expect(() => createAuthenticatedClient('')).toThrow('Supabase auth token is required');
  });
});

describe('createServiceClient', () => {
  it('SupabaseClient를 반환한다', async () => {
    const { createServiceClient } = await import('@/server/core/db');
    const client = createServiceClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });
});
