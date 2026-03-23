import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from './config';

// ============================================================
// Supabase 클라이언트 팩토리 — auth-matrix.md §1.4
// L-5: K-뷰티 비즈니스 용어 없음.
// Q-8: env는 config.ts 경유.
// G-9: export 2개만 (createAuthenticatedClient, createServiceClient).
// ============================================================

/**
 * 사용자 API용 — RLS 적용.
 * 사용자의 Supabase JWT를 Authorization 헤더에 주입.
 * auth-matrix.md §1.4: `/api/*` (사용자, 동기)
 */
export function createAuthenticatedClient(token: string) {
  if (!token) {
    throw new Error('Supabase auth token is required');
  }
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

/**
 * 관리자 API + 비동기 후처리용 — RLS 우회.
 * service_role 키로 전체 DB 접근. 사용 시 user_id를 코드에서 검증 필수.
 * auth-matrix.md §1.4: `/api/admin/*` + 비동기 후처리
 */
export function createServiceClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
