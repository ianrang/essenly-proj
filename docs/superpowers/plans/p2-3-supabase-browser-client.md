# P2-3: Supabase 브라우저 클라이언트 구현 계획

> **Goal:** 브라우저에서 Supabase Auth 세션 관리 단일 접점. DB 직접 접근 없음 (Auth 전용).

**Architecture:** client/core/config.ts(환경변수 캡슐화) + client/core/supabase-browser.ts(Auth 클라이언트 팩토리)

---

## 설계 근거

- auth-matrix.md §1.1: 브라우저 → fetch('/api/*') → 서버 → DB. 브라우저는 DB 직접 접근 안 함
- api-spec.md §2.1: signInAnonymously() → 세션 토큰 반환. SDK 세션 자동 복구
- CLAUDE.md: L-0b(client-only), L-10(서버 상태=API만), R-1(server import 금지), Q-8(env 캡슐화)

## 파일 구조

```
src/client/core/
  ├── config.ts              ← CREATE: 클라이언트 환경변수 캡슐화 (Q-8 일관성)
  ├── config.test.ts         ← CREATE: 환경변수 검증 테스트
  ├── supabase-browser.ts    ← MODIFY: Auth 클라이언트 팩토리
  └── supabase-browser.test.ts ← CREATE: 팩토리 테스트
```

---

### Task 1: client/core/config.ts — 클라이언트 환경변수 캡슐화

- [ ] **Step 1:** 테스트 작성 (config.test.ts)
- [ ] **Step 2:** 테스트 실패 확인
- [ ] **Step 3:** config.ts 구현 — NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY zod 검증
- [ ] **Step 4:** 테스트 통과

### Task 2: client/core/supabase-browser.ts — Auth 클라이언트 팩토리

- [ ] **Step 5:** 테스트 작성 (supabase-browser.test.ts)
- [ ] **Step 6:** 테스트 실패 확인
- [ ] **Step 7:** supabase-browser.ts 구현 — createBrowserClient + config.ts 경유
- [ ] **Step 8:** 테스트 통과
- [ ] **Step 9:** 전체 테스트 확인
- [ ] **Step 10:** 커밋
