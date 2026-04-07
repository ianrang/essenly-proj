# P2-47: Landing 단일 CTA + Chat-First 적용

> Date: 2026-04-02
> Status: Plan
> 의존: P2-46 (설계 확정) ✅
> 설계 정본: `docs/05-design-detail/mvp-flow-redesign.md`

---

## 1. 변경 범위 요약

| # | 파일 | 계층 | 변경 내용 |
|---|---|---|---|
| 1 | `src/client/features/landing/HeroSection.tsx` | client/features | 보조 CTA 버튼 제거, pendingPath "profile" 분기 정리 |
| 2 | `src/client/features/landing/ReturnVisitBanner.tsx` | client/features | 프로필 버튼 제거, 닫기 버튼 추가 (onClose prop) |
| 3 | `src/client/features/landing/LandingClient.tsx` | client/features | ReturnVisitBanner에 onClose 콜백 전달 (bannerDismissed boolean) |
| 4 | `src/client/features/chat/ChatInterface.tsx` | client/features | hasProfile 상태/useEffect 제거, SuggestedQuestions 항상 표시 |
| 5 | `messages/en.json` | shared (i18n) | ctaDescription 텍스트 변경 |
| 6 | `src/server/features/profile/service.ts` | server/features | createMinimalProfile 함수 추가 (채팅 추출 시 최소 프로필 생성) |
| 7 | `src/server/features/api/routes/chat.ts` | server/features/api | afterWork: profile INSERT 분기 추가 (createMinimalProfile + updateProfile 사용) |

**건들지 않는 코드**: server/core/, shared/, client/ui/, client/features/onboarding/, client/features/profile/ (service.ts 제외), DB, 마이그레이션

---

## 2. 아키텍처 규칙 준수 검증

### 2.1 의존성 (P-1, R-*)

| 규칙 | 파일 | 검증 |
|---|---|---|
| P-1 DAG | 모든 파일 | app → server, client → shared. 역방향 없음 ✓ |
| R-1 client→server 금지 | HeroSection, ReturnVisitBanner, ChatInterface | server/ import 없음 ✓ |
| R-2 server→client 금지 | chat.ts | client/ import 없음 ✓ |
| R-5 service 범위 | chat/service.ts | 수정 없음. route(L-21)가 profile 서비스 호출 ✓ |
| R-9 cross-domain 금지 | chat/service.ts | 수정 없음. route에서 파라미터 전달 ✓ |
| R-11 ui/ import | ReturnVisitBanner | ui/primitives/button만 import ✓ |

### 2.2 계층 (L-*)

| 규칙 | 검증 |
|---|---|
| L-0a server-only | chat.ts: `import 'server-only'` 유지 ✓ |
| L-0b client-only | 3개 클라이언트 파일: `"use client"` + `import "client-only"` 유지 ✓ |
| L-10 API만 | ChatInterface: `/api/profile` fetch 제거 → API 의존 감소 ✓ |
| L-21 Composition Root | chat.ts route: upsertProfile 호출 = cross-domain 허용 ✓ |

### 2.3 품질 (Q-*, S-*, G-*)

| 규칙 | 검증 |
|---|---|
| Q-15 비동기 쓰기 격리 | afterWork: void promise, 에러 로그만, 응답 무영향 ✓ |
| Q-12 멱등성 | upsertProfile: onConflict user_id → 재전송 안전 ✓ |
| Q-14 스키마 정합성 | ExtractionResult → ProfileData 필드 매핑 검증 필요 |
| S-5 하드코딩 금지 | 닫기 버튼: ghost variant + icon-sm size (디자인 시스템) ✓ |
| G-2 중복 금지 | upsertProfile 기존 함수 재사용 ✓ |
| G-6 core 수정 금지 | core/ 파일 수정 없음 ✓ |

---

## 3. 상세 구현 계획

### 3.1 HeroSection.tsx — 보조 CTA 제거

**변경**:
- `pendingPath` 타입에서 `"profile"` 제거: `useState<"chat" | null>(null)`
- `handleCtaClick` 함수: `path` 파라미터 제거, 항상 chat 경로
- 보조 CTA `<Button variant="outline">` (line 96-104) 삭제
- `handleConsentConfirm`: profile 분기 제거, 항상 `/${locale}/chat`

**유지**:
- `pathB` 키는 en.json에 유지 (v0.2 재사용)
- 동의 흐름 (pendingPath → consent → navigate) 구조 유지

**영향**: 없음. LandingClient는 state/onConsent/isConsenting/locale만 전달, 버튼 수와 무관

### 3.2 ReturnVisitBanner.tsx — 프로필 버튼 제거 + 닫기 버튼

**변경**:
- props 타입 확장: `onClose: () => void` 추가
- 프로필 Link (line 31-36) 삭제
- 닫기 버튼 추가: 카드 우측 상단 `<Button size="icon-sm" variant="ghost" aria-label="Close">`
- X 아이콘: shadcn `lucide-react`의 `X` 사용 (이미 설치됨)

**디자인**: 기존 shadcn 패턴 — 모달 카드 우측 상단 닫기 아이콘

### 3.3 LandingClient.tsx — onClose 콜백 전달

**변경**:
- ReturnVisitBanner에 `onClose={() => setState("consented")}` 전달
- 닫기 시 `"consented"` 상태로 전환 → Hero CTA 버튼 활성화 → Landing 콘텐츠 표시

**영향**: 1줄 변경. 기존 state 타입 변경 없음 (`"consented"`는 이미 존재하는 상태)

### 3.4 ChatInterface.tsx — hasProfile 제거

**변경**:
- `const [hasProfile, setHasProfile] = useState<boolean | null>(null)` 삭제
- `useEffect (checkProfile)` 전체 삭제 (line 33-49)
- 렌더 조건: `{showSuggestions && hasProfile === false && ...}` → `{showSuggestions && ...}`
- 주석 `경로A vs 경로B 분기` 제거

**유지**:
- `showSuggestions` 상태 + messages.length 기반 숨김 로직
- useChat, transport, sendMessage 등 모든 채팅 로직

**영향**: 없음. hasProfile은 ChatInterface 내부 상태, 외부 참조 없음

### 3.5 messages/en.json — 텍스트 변경

**변경**:
- `ctaDescription`: `"Chat with AI now, or set up your profile first"` → `"Chat with our AI guide — no signup needed"`
- `pathADescription`/`pathBDescription`: 미사용이지만 유지 (v0.2)

### 3.6 chat.ts — afterWork 프로필 INSERT

**변경**:
- `profile/service.ts`의 `upsertProfile()` import 추가 (L-21 Composition Root 허용)
- afterWork 내부: `profile === null` 분기 추가
- ExtractionResult → ProfileData 필드 매핑:

```
ExtractionResult          →  ProfileData (upsertProfile)
─────────────────────────────────────────────────────
skin_type                 →  skin_type
skin_concerns             →  (별도 처리: user_profiles.skin_concerns 미존재 → journey_contexts.concerns 매핑 필요 여부 확인)
stay_days                 →  (journey_contexts 소관 → 여기서 미처리)
budget_level              →  (journey_contexts 소관 → 여기서 미처리)
age_range                 →  age_range
learned_preferences       →  (user_preferences 테이블 → 별도 처리)
```

**⚠️ 스키마 교차 검증 필요**: ExtractionResult의 6개 필드가 어떤 테이블에 매핑되는지 확인 후 구현

**유지**:
- Q-15 패턴: `void afterWork()` fire-and-forget
- 에러 로깅: `console.error('[chat/after]...')`
- createServiceClient() 사용 (RLS 우회)

---

## 4. 필드 매핑 교차 검증 (Q-14) — 완료

> ExtractionResult 필드 → DB 테이블 매핑 코드 기반 검증 완료.

| ExtractionResult 필드 | DB 테이블 | 컬럼 | upsertProfile 지원 | 기존 afterWork 저장 | P2-47 범위 |
|---|---|---|---|---|---|
| skin_type | user_profiles | skin_type | ✓ | ✓ (UPDATE만) | ✓ UPSERT로 교체 |
| age_range | user_profiles | age_range | ✓ | ✗ | ✓ UPSERT에 포함 |
| skin_concerns | journeys | skin_concerns | ✗ (별도 테이블) | ✗ | ✗ P2-47 범위 외 |
| stay_days | journeys | stay_days | ✗ (별도 테이블) | ✗ | ✗ P2-47 범위 외 |
| budget_level | journeys | budget_level | ✗ (별도 테이블) | ✗ | ✗ P2-47 범위 외 |
| learned_preferences | learned_preferences | 다중 행 | ✗ (별도 테이블) | ✗ | ✗ P2-47 범위 외 |

### P2-47 afterWork 수정 범위 (최소 범위 원칙)

**저장 대상**: `skin_type`, `age_range` — user_profiles 테이블, `updateProfile()` 사용
- `upsertProfile()`은 country, language 등 필수 필드를 요구 → 채팅 추출에서 제공 불가
- `updateProfile(client, userId, { skin_type, age_range })` 사용이 적합 (부분 업데이트)
- **profile === null 시**: 프로필 INSERT 필요하나, 필수 필드(country, language) 부재
  → anonymous auth 시 생성되는 최소 프로필이 이미 존재하는지 확인 필요

**저장 제외**: skin_concerns, stay_days, budget_level, learned_preferences
- 이 필드들은 journeys/learned_preferences 테이블 소관
- journey upsert, preferences insert 로직은 별도 태스크 (afterWork TODO 참조)
- P2-47에서는 user_profiles 범위만 처리, journey/preferences는 기존 TODO 유지

### 프로필 존재 여부 재확인

현재 afterWork 조건: `result.extractionResults.length > 0 && profile`
- **profile !== null**: anonymous auth → `/api/auth/anonymous` → 세션 생성. 하지만 user_profiles 레코드는 온보딩 완료 시 생성.
- **MVP Chat-First (수정 전)**: 온보딩 스킵 → profile === null → afterWork 스킵 → 추출 데이터 폐기
- **MVP Chat-First (수정 후)**: 온보딩 스킵 → profile === null → createMinimalProfile → updateProfile → 추출 데이터 자동 저장

**해결**: 기존 서비스 함수를 재사용하여 레이어 우회 방지 (G-2, G-5).

1. `profile/service.ts`에 `createMinimalProfile(client, userId, language)` 추가 — 채팅 추출 전 최소 프로필 생성 (features/ 범위, core 수정 없음)
2. afterWork 로직:
   - `profile === null` + 추출 결과 있음 → `createMinimalProfile()` → `updateProfile()` 순차 호출
   - `profile !== null` + 추출 결과 있음 → `updateProfile()` 만 호출
   - 조건을 `result.extractionResults.length > 0`로 변경 (`&& profile` 제거)

3. `createMinimalProfile` 시그니처:
```typescript
export async function createMinimalProfile(
  client: SupabaseClient, userId: string, language: string
): Promise<void> {
  await client.from('user_profiles').insert({
    user_id: userId,
    language,
    updated_at: new Date().toISOString(),
  });
}
```
- skin_type, hair_type 등 nullable → INSERT 시 DB default null
- onConflict 없음 — profile 미존재 확인 후에만 호출
- Q-12 멱등: 같은 user_id로 재호출 시 PK 충돌 → 에러 → afterWork catch에서 로그

4. ReturnVisitBanner 닫기 — `setState("consented")` 대신 **별도 boolean** `bannerDismissed` 사용:
```tsx
const [bannerDismissed, setBannerDismissed] = useState(false);
{state === "returning" && !bannerDismissed && (
  <ReturnVisitBanner locale={locale} onClose={() => setBannerDismissed(true)} />
)}
```
- 상태 의미 오염 방지. `state` 머신은 세션 상태 전용, UI 표시는 별도 boolean.

---

## 5. 검증 체크리스트 (V-*)

```
□ V-1  의존성 방향: 6개 파일 모두 DAG 준수
□ V-2  core 불변: core/ 파일 수정 없음
□ V-3  Composition Root: chat.ts route에서 upsertProfile 호출 (L-21)
□ V-4  features 독립: service 간 직접 호출 없음
□ V-5  콜 스택 ≤ 4: route → upsertProfile (2단계)
□ V-6  바인딩 체인 ≤ 4
□ V-9  중복: upsertProfile 기존 함수 재사용
□ V-10 불필요 코드: hasProfile 상태/useEffect 완전 제거, 잔여 참조 없음
□ V-13 디자인 토큰: 닫기 버튼 ghost + icon-sm (하드코딩 없음)
□ V-15 ui/ 순수성: ui/ 파일 수정 없음
□ V-17 제거 안전성: hasProfile 제거 후 빌드 에러 없음
□ V-19 복합 쓰기: upsertProfile 단일 테이블 단일 쿼리
□ V-22 스키마 정합성: ExtractionResult → ProfileData 필드 매핑 검증
□ V-24 수정 영향 분석: 6개 파일 호출/참조 추적 완료
```

---

## 6. 실행 순서

1. **스키마 교차 검증** (§4) — ExtractionResult 필드 매핑 확인
2. **HeroSection.tsx** — 보조 CTA 제거
3. **ReturnVisitBanner.tsx** — 프로필 버튼 제거 + 닫기 버튼
4. **LandingClient.tsx** — onClose 콜백 전달
5. **ChatInterface.tsx** — hasProfile 제거
6. **messages/en.json** — 텍스트 변경
7. **chat.ts** — afterWork 프로필 INSERT
8. **TypeScript 검증**: `npx tsc --noEmit`
9. **기존 테스트 실행**: `npx vitest run`
