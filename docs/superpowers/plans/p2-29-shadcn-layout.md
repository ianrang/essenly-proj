# P2-29: shadcn/ui 초기화 + 공통 레이아웃

> 작성일: 2026-03-29
> 근거: ui-framework.md, user-screens.md §2.4/§3, sitemap.md §1, TODO P2-29
> 선행: 없음 (Phase 2 UI 첫 태스크)

---

## 1. 목적

shadcn/ui 컴포넌트 라이브러리를 초기화하고, 루트/locale 레이아웃에 모바일 호환성(viewport, safe-area, dvh, touch-action)을 추가한다. 이후 모든 UI 태스크(P2-30~P2-44)의 전제.

---

## 2. 수정 파일 목록

| # | 파일 | 작업 | 신규/수정 |
|---|------|------|----------|
| 1 | `package.json` | shadcn 관련 의존성 설치 | 수정 |
| 2 | `components.json` | shadcn CLI 초기화 설정 | 신규 |
| 3 | `src/shared/utils/cn.ts` | clsx + tailwind-merge 유틸 | 신규 |
| 4 | `src/shared/utils/index.ts` | cn re-export 추가 | 수정 |
| 5 | `src/client/ui/primitives/*.tsx` | 18개 shadcn 컴포넌트 | 신규 (CLI 생성) |
| 6 | `src/app/layout.tsx` | viewport 메타태그 + Sonner Toaster | 수정 |
| 7 | `src/app/globals.css` | safe-area + dvh + touch-action CSS | 수정 |

---

## 3. 수정하지 않는 파일

| 파일 | 이유 |
|------|------|
| `src/server/**` | 클라이언트 전용 작업. server/ 무수정 (P-2 core 불변) |
| `src/app/(user)/[locale]/layout.tsx` | i18n Provider만. 레이아웃 변경은 P2-32에서 (app)/ 그룹 생성 시 |
| `src/app/(user)/[locale]/(app)/` | P2-32 범위. 이 태스크에서 생성하지 않음 |
| `tsconfig.json` | 기존 `@/*` 별칭으로 충분 |
| `src/middleware.ts` | next-intl 설정 변경 없음 |

---

## 4. 단계별 구현

### 4.1 의존성 설치

```bash
npm install clsx tailwind-merge lucide-react sonner
```

> shadcn/ui는 CLI로 컴포넌트를 복사하는 방식. `@shadcn/ui` 패키지 설치가 아니라 `npx shadcn@latest init` 실행.
> Radix UI 패키지는 각 컴포넌트 add 시 자동 설치됨.

### 4.2 cn.ts 유틸 생성

```typescript
// src/shared/utils/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- L-13: 순수 함수, 부작용 없음
- L-0c: server-only/client-only import 금지 (양쪽에서 사용)
- shared/utils/ → shared/types/ 의존 없음 (독립)

### 4.3 shadcn CLI 초기화

```bash
npx shadcn@latest init
```

설정값:
- Style: default
- Base color: Neutral (기존 토큰과 호환)
- CSS variables: Yes
- Components path: `src/client/ui/primitives`
- Utils path: `src/shared/utils` (cn.ts 위치)

### 4.4 18개 MVP 컴포넌트 설치

```bash
npx shadcn@latest add button input dialog alert-dialog dropdown-menu tabs badge card select checkbox label separator skeleton table pagination switch textarea
```

Sonner(Toast)는 별도 패키지:
```bash
npx shadcn@latest add sonner
```

설치 후 확인:
- 모든 파일이 `src/client/ui/primitives/`에 생성됨
- 각 파일이 `cn()` 을 `@/shared/utils/cn`에서 import

### 4.5 컴포넌트 client-only 가드

ui-framework.md 규칙 L-0b: `client/ui/` 파일에 `import "client-only"` 필수.

shadcn CLI가 생성하는 파일에는 이 가드가 없으므로, 생성 후 각 파일 첫 줄에 추가:

```typescript
"use client";

import "client-only";
// ... 나머지 shadcn 코드
```

> 단, Server Component에서 사용하는 컴포넌트(Skeleton 등)는 "use client" 없이 사용 가능해야 할 수 있음.
> shadcn 컴포넌트는 대부분 인터랙티브(이벤트 핸들러)이므로 "use client" 필수.
> Separator, Skeleton 등 비인터랙티브 컴포넌트도 Radix 의존이면 "use client" 필요.

### 4.6 루트 레이아웃 수정

```typescript
// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// ... 폰트 설정 (기존 유지)

export const metadata: Metadata = {
  title: "Essenly — Your AI K-Beauty Guide",
  description: "AI-powered K-beauty recommendations personalized to your skin type, concerns, and travel plans.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
```

변경점:
- `Viewport` export 추가 (viewport 메타태그)
- `viewportFit: "cover"` (safe-area 활성화)
- `Toaster` 추가 (Sonner — 에러/성공 토스트)

### 4.7 globals.css 모바일 호환성 추가

```css
/* globals.css 하단에 추가 */

/* ── Mobile Compatibility ── */

/* Safe area insets for notched devices */
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Prevent double-tap zoom on interactive elements */
button, a, [role="button"], input, textarea, select {
  touch-action: manipulation;
}

/* Prevent auto-zoom on input focus (iOS Safari) */
input, textarea, select {
  font-size: 16px;
}
```

> dvh(dynamic viewport height)는 컴포넌트 레벨에서 필요 시 적용.
> globals.css에 `min-height: 100dvh`를 body에 설정하면 모든 페이지에 영향.
> 채팅 페이지(P2-35)에서 `h-[100dvh]`로 개별 적용이 더 적절.

---

## 5. 검증 체크리스트

```
□ V-1  의존성 방향: shared/utils/cn.ts → 외부 패키지만 (clsx, tailwind-merge)
□ V-2  core 불변: server/core/ 파일 수정 0건
□ V-12 any 타입 없음: cn.ts에 any 없음 (ClassValue 타입 사용)
□ V-15 ui/ 순수성: primitives/ 파일에 비즈니스 용어, features/ import 없음
□ V-16 shared/ 단방향: utils/cn.ts → types/ 참조 없음 (독립)
□ V-17 제거 안전성: client/ui/ 삭제 시 core/, features/, shared/에 영향 없음
□ S-2  단일 진실: globals.css 토큰 변경 없음 (추가만)
□ S-5  하드코딩: #hex 직접 기입 없음
□ L-0b client-only: client/ui/primitives/ 파일에 "client-only" import 확인
□ L-0c shared 중립: cn.ts에 server-only/client-only 없음
```

---

## 6. 예상 결과

| 항목 | 수량 |
|------|------|
| 신규 파일 | ~20개 (18 컴포넌트 + cn.ts + components.json) |
| 수정 파일 | 3개 (layout.tsx, globals.css, shared/utils/index.ts) |
| 의존성 추가 | clsx, tailwind-merge, lucide-react, sonner + Radix 패키지 (자동) |
| server/ 수정 | 0건 |
| 테스트 | 빌드 성공 확인 (`npm run build`) |
