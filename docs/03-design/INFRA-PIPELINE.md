# 인프라 파이프라인 전략 v1.1

> 정본: 이 문서. CI/CD, 환경 분리, 배포 전략의 단일 참조점.
> 관련: [[TDD#§2.3 인프라|TDD §2.3]] (기술 선택), [[MASTER-PLAN#§4 비용|MASTER-PLAN §4]] (비용)

---

## 1. 개요

MVP(v0.1)에 필요한 최소한의 인프라 파이프라인을 정의한다.
과도한 환경 분리 없이, 논리적 일관성과 운영 안전성을 확보한다.

**구성요소**:

| 시스템 | 역할 | 수량 |
|--------|------|------|
| GitHub | 소스 코드 관리 | 1 레포 |
| GitHub Actions | CI (코드 품질 검증) | 1 워크플로우 |
| Vercel | CD (빌드 + 배포 + 호스팅) | 1 프로젝트 (3 환경 스코프 내장) |
| Supabase | DB (PostgreSQL + pgvector) | MVP: 1 프로젝트 → v0.2: 2 프로젝트 |

---

## 2. 브랜치 전략

**GitHub Flow** — 단일 메인 브랜치 + 기능 브랜치.

```
feature/* ──PR──→ main ──자동──→ Production 배포
```

| 규칙 | 설명 |
|------|------|
| `main`은 항상 배포 가능 | CI 통과 + 리뷰 승인된 코드만 머지 |
| 장기 통합 브랜치 없음 | `dev`, `staging` 브랜치를 두지 않는다 |
| 기능 브랜치는 수명이 짧다 | PR 단위로 생성 → 머지 → 삭제 |
| 워크트리 활용 | 병렬 작업 시 git worktree로 격리 |

**선택 근거**: 1인 개발 MVP. GitFlow/dev 브랜치는 머지 충돌과 환경 매핑 복잡성만 증가시킨다.

---

## 3. 환경 설계

### 3.1 환경 정의

| 환경 | 실행 위치 | 트리거 | 용도 |
|------|----------|--------|------|
| **Development** | 로컬 (`npm run dev`) | 수동 | 개발, 디버깅 |
| **Preview** | Vercel | feature 브랜치 push | PR 리뷰, 시각적 검증 |
| **Production** | Vercel | main push (PR 머지) | 실서비스 |

### 3.2 Vercel 환경 스코프

Vercel은 프로젝트 1개에 3개 환경 스코프가 **내장**되어 있다 (삭제 불가).
실제로 사용하는 스코프는 2개이며, Development 스코프는 사용하지 않는다.

| Vercel 스코프 | 사용 여부 | 이유 |
|--------------|----------|------|
| Development | **미사용** | 로컬 개발은 `.env.local`로 관리. `vercel dev`를 사용하지 않음 |
| Preview | **사용** | PR 브랜치 push 시 자동 빌드+배포 |
| Production | **사용** | main push 시 자동 빌드+배포 |

### 3.3 DB 전략

**MVP (v0.1)**: 모든 환경이 **하나의 Supabase 프로젝트(하나의 DB)**를 공유한다.

| | Development | Preview | Production |
|---|---|---|---|
| **Supabase** | 프로젝트 A | 프로젝트 A | 프로젝트 A |

**허용 근거**:
- 소프트 런칭 전까지 실사용자가 없으므로, 모든 데이터가 개발/테스트 데이터
- 유저별 데이터(대화, 프로필)는 RLS(`user_id`)로 격리
- 도메인 데이터(제품, 클리닉, 시술)는 환경별로 다를 이유가 없음 (시드 데이터 공유가 합리적)

**제약**: Preview에서 생성된 테스트 데이터가 Production DB에 남는다. 1인 개발 MVP에서는 허용.

**v0.2 (P3-26)**: Supabase 프로젝트를 **2개로 분리**.

| | Development | Preview | Production |
|---|---|---|---|
| **Supabase** | 프로젝트 A (dev) | 프로젝트 A (dev) | 프로젝트 B (prod) |

- 브랜치 전략은 변경 없음 (feature → main PR 동일)
- Vercel Production 스코프의 Supabase 환경변수만 프로젝트 B로 변경
- **코드 변경 0줄** — `config.ts`가 환경변수에서 읽으므로 값 교체만으로 DB 전환

### 3.4 환경별 설정 차이

| 구성요소 | Development | Preview | Production |
|---------|------------|---------|------------|
| **DB** | Supabase A | Supabase A | Supabase A (MVP) / B (v0.2) |
| **AI Provider** | google (저비용) | google (저비용) | anthropic (품질) |
| **APP_URL** | `http://localhost:3000` | Vercel 대시보드에 고정값 등록 | 커스텀 도메인 |
| **NODE_ENV** | development | production | production |

> `NEXT_PUBLIC_APP_URL` 주의: Vercel의 시스템 변수 `VERCEL_URL`은 프로토콜(`https://`)이 없다. `config.ts`가 `z.string().url()`로 검증하므로, Preview 스코프에 `https://` 포함한 전체 URL을 직접 등록해야 한다.

### 3.5 환경변수 관리

| 환경 | 관리 방식 |
|------|----------|
| Development | `.env.local` (gitignore, 로컬 전용) |
| Preview | Vercel 대시보드 → Preview 스코프 |
| Production | Vercel 대시보드 → Production 스코프 |

- `.env.example`은 git에 커밋하여 필요 변수 목록을 문서화한다. `config.ts`의 필수 변수가 모두 포함되어야 한다
- `.env.local`은 절대 커밋하지 않는다
- GitHub Secrets는 사용하지 않는다 — CI에 빌드가 없으므로 서버 환경변수가 불필요

---

## 4. CI/CD 파이프라인

### 4.1 전체 흐름

```
feature branch
  │
  ├─ push ─────────────────────────→ Vercel Preview 빌드+배포 (자동)
  │
  ├─ PR to main ──→ GitHub Actions
  │                  ├── lint       (병렬)
  │                  ├── type-check (병렬)
  │                  └── test       (lint+type-check 통과 후)
  │
  │                  + Vercel Preview (PR에 URL 코멘트)
  │
  │                  → CI pass + Preview 빌드 성공 + 리뷰 승인 → merge
  │
  └─ merge to main ────────────────→ Vercel Production 빌드+배포 (자동)
```

### 4.2 CI — GitHub Actions

**파일**: `.github/workflows/ci.yml`
**트리거**: `pull_request` to `main`
**동시성**: 동일 PR에 push 시 기존 실행 취소 + 새 실행 (`cancel-in-progress: true`)
**Node 버전**: `.nvmrc` 파일로 고정 (현재 24)

| Job | 내용 | 의존 |
|-----|------|------|
| **lint** | ESLint (아키텍처 의존성 규칙 포함) | 없음 |
| **type-check** | `tsc --noEmit` (strict mode) | 없음 |
| **test** | vitest (단위/통합 테스트) | lint + type-check |

- lint와 type-check는 병렬 실행 (독립적, 빠른 실패)
- test는 위 둘 통과 후 실행
- **빌드는 CI에 포함하지 않는다** — Vercel이 배포 시 빌드하므로 중복 제거

### 4.3 CD — Vercel

| 이벤트 | Vercel 동작 | 환경 스코프 |
|--------|------------|-----------|
| feature 브랜치 push | Preview 빌드 + 배포 | Preview |
| main push (PR 머지) | Production 빌드 + 배포 | Production |

- Vercel GitHub Integration이 자동으로 처리
- Preview 배포 URL은 PR에 코멘트로 표시
- 빌드 실패 시 PR 체크에 fail 표시

### 4.4 머지 조건

PR을 main에 머지하려면:

1. GitHub Actions CI 전체 통과 (lint + type-check + test)
2. Vercel Preview 빌드 성공
3. 코드 리뷰 승인 (1인 개발이므로 자기 승인 허용)

> GitHub repo Settings → Branch protection rules → `main` 브랜치에 위 조건을 설정한다.

### 4.5 역할 분담

| 역할 | 담당 | 하지 않는 것 |
|------|------|-------------|
| 코드 검증 (lint, type-check, test) | GitHub Actions | 빌드, 배포 |
| 빌드 + 배포 | Vercel | 코드 검증 |
| 환경변수 (Preview/Production) | Vercel 대시보드 | — |
| 환경변수 (Development) | `.env.local` | — |
| DB | Supabase Cloud | — |

---

## 5. 설정 가이드

### 5.1 사전 조건

- `.nvmrc` 파일이 프로젝트 루트에 존재해야 한다 (CI가 Node 버전을 이 파일에서 읽음)
- `.env.example`에 모든 환경변수가 문서화되어야 한다

### 5.2 P3-24: Vercel GitHub 연동

1. [vercel.com](https://vercel.com) → New Project → Import Git Repository
2. GitHub repo 선택
3. Framework Preset: **Next.js** (자동 감지)
4. Root Directory: `.` (기본값)
5. Production Branch: **main**
6. Build Command: `npm run build` (기본값 — `generate:kb` 포함)
7. Deploy

### 5.3 P3-25: 환경변수 설정

Vercel 대시보드 → Project Settings → Environment Variables.
각 변수를 등록할 때 적용할 환경 스코프(Preview/Production)를 선택한다.
Development 스코프는 설정하지 않는다 (로컬은 `.env.local` 사용).

**Production 스코프 전용**:

| 변수 | 값 | 비고 |
|------|---|------|
| `AI_PROVIDER` | `anthropic` | 품질 우선 |
| `ANTHROPIC_API_KEY` | (실제 키) | |
| `NEXT_PUBLIC_APP_URL` | `https://(커스텀 도메인)` | `z.string().url()` 검증 통과 필요 |

**Preview 스코프 전용**:

| 변수 | 값 | 비고 |
|------|---|------|
| `AI_PROVIDER` | `google` | 저비용 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | (실제 키) | |
| `NEXT_PUBLIC_APP_URL` | `https://(프로젝트명).vercel.app` | 고정값 직접 등록. `VERCEL_URL` 사용 불가 (프로토콜 없음) |

**Production + Preview 공통** (MVP 단일 Supabase):

| 변수 | 값 | 비고 |
|------|---|------|
| `NEXT_PUBLIC_SUPABASE_URL` | (프로젝트 URL) | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon key) | |
| `SUPABASE_SERVICE_ROLE_KEY` | (service role key) | |
| `ADMIN_JWT_SECRET` | (32자 이상) | `z.string().min(32)` |
| `GOOGLE_OAUTH_CLIENT_ID` | (OAuth ID) | |
| `GOOGLE_OAUTH_CLIENT_SECRET` | (OAuth secret) | |
| `ENCRYPTION_KEY` | (정확히 64자) | `z.string().length(64)` |
| `CRON_SECRET` | (비밀값) | |

> `NODE_ENV`는 Vercel이 자동으로 `production`을 설정한다. 수동 등록 불필요.

**optional/default 변수** (미등록 시 기본값 적용):

| 변수 | 기본값 | 비고 |
|------|--------|------|
| `AI_MODEL` | 프로바이더별 기본 모델 | 모델 오버라이드 시에만 등록 |
| `EMBEDDING_PROVIDER` | `google` | 허용값: `google`, `voyage`, `openai` |
| `EMBEDDING_DIMENSION` | `1024` | |
| `AI_FALLBACK_PROVIDER` | 미설정 | 폴백 프로바이더 사용 시에만 |
| `AI_FALLBACK_MODEL` | 미설정 | |
| `LLM_TIMEOUT_MS` | `30000` | |
| `RATE_LIMIT_CHAT_PER_MIN` | `5` | |
| `RATE_LIMIT_CHAT_PER_DAY` | `100` | |
| `RATE_LIMIT_PUBLIC_PER_MIN` | `60` | |
| `RATE_LIMIT_ANON_CREATE_PER_MIN` | `3` | |
| `RATE_LIMIT_ADMIN_PER_MIN` | `60` | |

> 정본: 환경변수의 필수/선택, 타입, 기본값은 `src/server/core/config.ts`의 `envSchema`가 정본이다.

### 5.4 Branch Protection 설정

GitHub repo → Settings → Branches → Add rule:
- Branch name pattern: `main`
- Require status checks: `Lint`, `Type Check`, `Test` (ci.yml의 `name:` 필드 기준)
- Require branches to be up to date: 선택

---

## 6. v0.2 확장 계획

| 항목 | v0.1 (MVP) | v0.2 |
|------|-----------|------|
| Supabase | 1 프로젝트 (전환경 공유) | 2 프로젝트: dev + prod (P3-26) |
| 에러 트래킹 | Vercel 기본 로그 | Sentry (P3-27) |
| 모니터링 | Vercel Analytics | + 커스텀 대시보드 (P3-28) |
| E2E 테스트 | 수동 검증 | Playwright CI 통합 |

### 6.1 P3-26 전환 절차 (Supabase 분리)

소프트 런칭 직전에 실행한다.

1. Supabase에 새 프로젝트 생성 (프로젝트 B = prod)
2. 마이그레이션 실행 (`supabase/migrations/setup-all.sql`)
3. 시드 데이터 투입 (도메인 데이터)
4. Vercel 대시보드 → **Production 스코프만** Supabase 변수 3개를 프로젝트 B로 변경:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Preview 스코프는 기존 프로젝트 A (dev) 유지

**코드 변경 0줄**. 브랜치 전략 변경 없음. 환경변수 값 교체만으로 완료.

---

## 변경 이력

| 날짜 | 버전 | 변경 |
|------|------|------|
| 2026-04-07 | v1.0 | 초안 작성 |
| 2026-04-07 | v1.1 | Vercel 스코프 명확화, DB 전략 상세화, 환경변수 완전 목록, Preview APP_URL 이슈 해결, v0.2 전환 절차 추가 |
