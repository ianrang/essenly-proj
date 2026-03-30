# P2-32: Landing 페이지

> 작성일: 2026-03-30
> 근거: PRD §3.2, user-screens.md §3, sitemap.md §1, landing-preview.html v5
> 선행: P2-29 (shadcn), P2-31 (LanguageSelector)

---

## 1. 목적

풀 너비 마케팅 랜딩 페이지(4섹션 + ConsentBanner + ReturnVisitBanner)를 구현한다. (app)/ 라우트 그룹을 생성하여 랜딩(풀 너비)과 앱 페이지(640px)를 분리한다.

---

## 2. 산출물

### 2.1 신규 파일

| # | 파일 | 설명 |
|---|------|------|
| 1 | `src/client/features/landing/LandingHeader.tsx` | 풀 너비 헤더 (로고 + LanguageSelector 공유) |
| 2 | `src/client/features/landing/HeroSection.tsx` | 그래디언트 배경 + 타이틀 + CTA 2개 |
| 3 | `src/client/features/landing/HowItWorksSection.tsx` | 3단계 설명 |
| 4 | `src/client/features/landing/BenefitsSection.tsx` | 4카드 혜택 그리드 |
| 5 | `src/client/features/landing/TrustSection.tsx` | 프라이버시 카드 3항목 |
| 6 | `src/client/features/landing/ConsentBanner.tsx` | 하단 고정 동의 배너 ("use client") |
| 7 | `src/client/features/landing/ReturnVisitBanner.tsx` | 재방문 오버레이 ("use client") |
| 8 | `src/app/(user)/[locale]/(app)/layout.tsx` | 앱 레이아웃 (640px + Header) |

### 2.2 수정 파일

| # | 파일 | 변경 |
|---|------|------|
| 1 | `src/app/(user)/[locale]/page.tsx` | 스텁 → 랜딩 조합 |

### 2.3 이동 파일 (라우트 그룹 분리)

| 현재 | 이동 후 |
|------|---------|
| `[locale]/chat/page.tsx` | `[locale]/(app)/chat/page.tsx` |
| `[locale]/onboarding/page.tsx` | `[locale]/(app)/onboarding/page.tsx` |
| `[locale]/profile/page.tsx` | `[locale]/(app)/profile/page.tsx` |

> URL 변경 없음. (app)는 라우트 그룹 — URL에 미포함.

---

## 3. 수정하지 않는 파일

| 파일 | 이유 |
|------|------|
| `src/server/**` | P-2 core 불변 |
| `src/client/features/layout/Header.tsx` | 앱용 Header. Landing은 자체 LandingHeader |
| `src/client/features/layout/LanguageSelector.tsx` | import만 (수정 불필요) |
| `src/client/ui/**` | shadcn 수정 불필요 |
| `src/app/(user)/[locale]/layout.tsx` | locale 레이아웃 (i18n + LanguageProvider). 변경 불필요 |

---

## 4. 구현 상세

### 4.1 page.tsx (Server Component)

```
SSG 호환. setRequestLocale 호출.
정적 섹션은 서버 렌더, 동적 컴포넌트(ConsentBanner, ReturnVisitBanner)는 "use client".
```

### 4.2 LandingHeader

```
풀 너비. 로고 + LanguageSelector.
LanguageSelector는 features/layout/에서 import (공유).
max-width: 960px 내부 정렬.
```

### 4.3 HeroSection

```
그래디언트 배경 (--primary-light ↔ --warm). animation + prefers-reduced-motion.
타이틀 + 설명 + CTA 2개 (shadcn Button).
CTA 활성/비활성: hasSession prop으로 제어.
모바일: 세로 버튼, 데스크톱(lg:): 가로 배치.
```

### 4.4 HowItWorksSection, BenefitsSection, TrustSection

```
정적 콘텐츠. useTranslations("landing")로 텍스트.
모바일: 세로 스택. 데스크톱(lg:): 가로 배치.
Benefits: 2×2 → lg: 4×1.
```

### 4.5 ConsentBanner ("use client")

```
상태: hasSession (Supabase auth check)
표시 조건: !hasSession
"Continue" 클릭 → POST /api/auth/anonymous → 세션 생성 → 숨김 + CTA 활성화
하단 고정 (sticky bottom).
```

### 4.6 ReturnVisitBanner ("use client")

```
표시 조건: hasSession && profileExists (GET /api/profile → 200)
오버레이: "Welcome back" + 2 버튼 (Profile, Just chat)
```

### 4.7 (app)/layout.tsx

```
앱 페이지용 레이아웃.
<Header showLanguageSelector> + max-width 640px 중앙 정렬.
```

---

## 5. 의존성 방향

```
page.tsx (app/) → LandingPage 섹션 컴포넌트 배치
  features/landing/* → features/layout/LanguageSelector (공유)
                    → client/ui/primitives/button (shadcn)
                    → shared/types + shared/constants (언어 등)
                    → client/core/supabase-browser (ConsentBanner)

방향: app/ → features/ → ui/ + shared/ + core/ (단방향)
순환: 없음
```

---

## 6. 검증 체크리스트

```
□ V-1  의존성 방향 단방향
□ V-2  core 불변: server/ 수정 0건
□ V-4  features 독립: landing/ → layout/ 단방향. 역방향 없음
□ V-17 제거 안전성: landing/ 삭제 시 core, 다른 features 무영향
□ S-2  디자인 토큰 단일 진실
□ S-5  하드코딩 금지
□ L-2  page.tsx 조합만
□ L-12 모바일 퍼스트
□ P-3  Last Leaf: landing/ 교체 시 core 무영향
□ P-10 제거 안전성
□ 디자인 시스템: shadcn Button 재사용
□ 접근성: 시맨틱 HTML, 터치 44px
□ URL 불변: (app)/ 이동 후 기존 URL 유지
```
