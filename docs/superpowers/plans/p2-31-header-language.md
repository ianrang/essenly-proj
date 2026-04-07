# P2-31: Header + LanguageSelector

> 작성일: 2026-03-30
> 근거: user-screens.md §1.7/§2.4, PRD §3.2, accessibility.md §2
> 선행: P2-29 (shadcn Select 컴포넌트)

---

## 1. 목적

공유 앱 Header(Chat/Onboarding/Profile용)와 LanguageSelector(대화 언어 선택)를 구현한다. LanguageContext를 생성하여 대화 언어 상태를 관리한다. LandingHeader는 P2-32 범위.

---

## 2. 산출물

| # | 파일 | 신규/수정 | 설명 |
|---|------|----------|------|
| 1 | `src/client/features/contexts/LanguageContext.tsx` | 신규 | 대화 언어 React Context + Provider |
| 2 | `src/client/features/layout/LanguageSelector.tsx` | 수정 (스텁 → 구현) | shadcn Select 기반 6개 언어 드롭다운 |
| 3 | `src/client/features/layout/Header.tsx` | 수정 (스텁 → 구현) | 공유 헤더 (props 기반 좌측 컨텐츠 + 로고 + LanguageSelector) |
| 4 | `src/app/(user)/[locale]/layout.tsx` | 수정 | LanguageProvider 래핑 추가 |

---

## 3. 수정하지 않는 파일

| 파일 | 이유 |
|------|------|
| `src/server/**` | P-2 core 불변 |
| `src/client/ui/**` | shadcn 프리미티브 수정 불필요 |
| `src/shared/**` | 언어 코드는 컴포넌트 내부 상수 (2개 이상 모듈에서 미사용) |
| `src/app/layout.tsx` | LanguageProvider는 locale 레이아웃에 배치 |

---

## 4. 구현 상세

### 4.1 LanguageContext

```
위치: src/client/features/contexts/LanguageContext.tsx
가드: "use client" + import "client-only"
```

- 6개 대화 언어: en, ja, zh, es, fr, ko
- 기본값: "en"
- 제공: { language, setLanguage }
- MVP: UI는 영어 고정. 이 Context는 AI 대화 언어만 제어

### 4.2 LanguageSelector

```
위치: src/client/features/layout/LanguageSelector.tsx
의존: shadcn Select + LanguageContext
```

- shadcn Select 프리미티브 사용
- 옵션: 코드+원어명 (`EN English`, `JA 日本語` 등)
- 국기 아이콘 미사용 (user-screens.md §3 주석)
- 선택 시 LanguageContext 업데이트
- 터치 타겟 44px 이상

### 4.3 Header

```
위치: src/client/features/layout/Header.tsx
Props: leftContent?: ReactNode, showLanguageSelector?: boolean
```

- 중앙: "Essenly" 로고 텍스트
- 좌측: props로 전달 (각 페이지에서 결정)
  - Chat: Link "← Profile"
  - Onboarding: Button "← Back"
  - Profile: 없음
- 우측: LanguageSelector (showLanguageSelector=true일 때)
- 접근성: `<header>` + `<nav>` 시맨틱 태그

### 4.4 locale 레이아웃 수정

```typescript
// src/app/(user)/[locale]/layout.tsx
<NextIntlClientProvider>
  <LanguageProvider>
    {children}
  </LanguageProvider>
</NextIntlClientProvider>
```

---

## 5. 의존성 방향

```
app/(user)/[locale]/layout.tsx
  → LanguageProvider (features/contexts/)
    → React Context (외부)

Header (features/layout/)
  → LanguageSelector (features/layout/)
    → LanguageContext (features/contexts/)
    → shadcn Select (client/ui/primitives/)

방향: app/ → features/ → ui/ + contexts/ → shared/ (단방향)
순환: 없음
```

---

## 6. 검증 체크리스트

```
□ V-1  의존성 방향: features/ → ui/primitives/ + shared/ 단방향
□ V-2  core 불변: server/ 수정 0건
□ V-4  features 독립: Header가 다른 features service import 없음
□ V-12 any 타입 없음
□ V-15 ui/ 순수성: ui/primitives/ 수정 없음
□ V-17 제거 안전성: Header 삭제 시 core 무영향
□ S-5  하드코딩: #hex 0건
□ L-0b client-only: features/layout/, features/contexts/ 파일에 가드
□ L-11 상태 관리: React Context (Zustand 금지)
□ L-12 모바일 퍼스트: Tailwind 기본=모바일
□ G-8  any 금지
□ G-9  export 최소화: 외부 사용 함수/타입만 export
□ 접근성: header 시맨틱, 터치 44px, 포커스 링
□ P-3  Last Leaf: Header 교체/수정 시 core 및 다른 features 무영향
□ P-8  순환 의존 금지: LanguageContext ↔ LanguageSelector 단방향
```
