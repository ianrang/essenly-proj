# P2-33: 온보딩 페이지 + 4단계 컴포넌트

## 목표

4단계 폼으로 개인화 변수 수집 → `POST /api/profile/onboarding` 호출 → 프로필 생성.

## 정본

- PRD §3.3 (와이어프레임, 변수, 제약)
- user-screens.md §4 (컴포넌트 트리, 상태 매트릭스)
- schema.dbml (DB 제약)
- beauty.ts + domain.ts + profile.ts (타입/상수)

## 범위

| 포함 | 제외 |
|------|------|
| 4단계 폼 UI | ProfileTransition 로딩 애니메이션 (P2-34) |
| react-hook-form 통합 | 프로필 확인 화면 (P2-34) |
| localStorage 단계별 백업 | 프로필 수정 모드 (재방문 흐름, 별도 태스크) |
| `POST /api/profile/onboarding` 호출 | |
| API 성공 시 `/profile`로 이동 | |

## 파일 계획

| 파일 | 작업 | 계층 |
|------|------|------|
| `app/(user)/[locale]/(app)/onboarding/page.tsx` | 스텁 → OnboardingWizard 렌더링 | app/ (L-2) |
| `features/onboarding/OnboardingWizard.tsx` | **신규** — 4단계 상태 관리 | client/features/ |
| `features/onboarding/ProgressBar.tsx` | **신규** — Step N/4 + 진행 바 | client/features/ |
| `features/onboarding/OptionGroup.tsx` | **신규** — 단일/다중 선택 버튼 그룹 | client/features/ |
| `features/onboarding/StepSkinHair.tsx` | 스텁 → 구현 | client/features/ |
| `features/onboarding/StepConcerns.tsx` | 스텁 → 구현 | client/features/ |
| `features/onboarding/StepTravel.tsx` | 스텁 → 구현 | client/features/ |
| `features/onboarding/StepInterests.tsx` | 스텁 → 구현 | client/features/ |
| `messages/en.json` | 번역 키 추가 | — |

## 의존성 방향 (V-1)

```
app/onboarding/page.tsx
  → client/features/onboarding/OnboardingWizard.tsx
      → client/features/onboarding/Step*.tsx
      → client/features/onboarding/ProgressBar.tsx
      → client/features/onboarding/OptionGroup.tsx
          → client/ui/primitives/button.tsx
      → client/ui/primitives/select.tsx
      → client/ui/primitives/typography.tsx
      → shared/constants/beauty.ts
      → shared/types/profile.ts
```

역방향 없음. core/ 수정 없음. 타 features/ import 없음.

## 컴포넌트 설계

### OnboardingWizard

- react-hook-form `useForm<OnboardingFormData>` — 전체 폼 상태 관리
- `useState<1|2|3|4>` — 현재 단계
- localStorage 백업: 단계 전환 시 `localStorage.setItem("onboarding_draft", JSON.stringify(values))`
- 마운트 시 `localStorage.getItem("onboarding_draft")` → `reset(parsed)` + 마지막 단계 복원
- Step 4 제출: `POST /api/profile/onboarding` → 성공 시 localStorage 정리 + `/profile` 이동

### OptionGroup

```tsx
type OptionGroupProps = {
  options: readonly { value: string; label: string }[];
  value: string | string[];           // 단일: string, 다중: string[]
  onChange: (value: string | string[]) => void;
  mode: "single" | "multiple";
  max?: number;                       // 다중 선택 최대 개수 (skin_concerns: 3)
};
```

- `mode="single"`: 하나만 선택, 다시 클릭하면 해제
- `mode="multiple"`: 토글, max 도달 시 추가 선택 disabled
- Button variant="outline" (미선택) / variant="default" (선택)

### 단계별 변수 배치 (PRD §3.3 정본)

| Step | 변수 | 컴포넌트 | 필수 |
|------|------|---------|------|
| 1 | skin_type (단일, 5개) | OptionGroup single | 필수 |
| 1 | hair_type (단일, 4개) | OptionGroup single | 선택 |
| 2 | skin_concerns (다중, 7개, max 3) | OptionGroup multiple max=3 | 필수 (1개 이상) |
| 2 | hair_concerns (다중, 6개) | OptionGroup multiple | 선택 |
| 3 | country (단일, ISO) | Select | 필수 |
| 3 | age_range (단일, 6개) | Select | 선택 |
| 3 | stay_days (단일, 1-30) | Select | 필수 |
| 3 | budget_level (단일, 4개) | Select | 필수 |
| 3 | travel_style (다중, 5개 UI) | OptionGroup multiple | 선택 |
| 4 | interest_activities (다중, 5개) | OptionGroup multiple | 선택 |

### 단계별 Next 버튼 활성 조건

| Step | 조건 |
|------|------|
| 1 | skin_type 선택됨 |
| 2 | skin_concerns 1개 이상 |
| 3 | country + stay_days + budget_level 선택됨 |
| 4 | 항상 활성 (모두 선택) |

### 네비게이션

- Step 1: Next만 표시
- Step 2~3: Back + Next
- Step 4: Back + "Generate my profile"
- Back: `setStep(step - 1)`, 이전 입력값 유지 (react-hook-form 자동)

## 디자인 일관성

| 요소 | 프리미티브 | 사양 |
|------|-----------|------|
| Next/Generate 버튼 | `<Button size="cta">` | h-11, primary, font-semibold |
| Back 버튼 | `<Button variant="outline" size="cta">` | h-11, outline |
| 선택 버튼 (미선택) | `<Button variant="outline" size="sm">` | outline, 토글 |
| 선택 버튼 (선택됨) | `<Button size="sm">` | primary, 토글 |
| 질문 텍스트 | `<SectionTitle>` or `<CardTitle>` | typography.tsx |
| 보조 텍스트 | `<BodyText>` or 인라인 `text-sm text-muted-foreground` | |
| 드롭다운 | `<Select>` | primitives/select.tsx |
| 진행 바 | 커스텀 `<ProgressBar>` | bg-primary, rounded-full |

## 레이아웃

- 640px max-width 중앙 정렬 ((app)/ 라우트 그룹 → Header + max-w-[640px])
- 모바일 퍼스트 (L-12)
- 세로 스크롤 (Step 2/3은 내용이 많으므로 스크롤 가능)
- 하단 네비게이션 버튼은 sticky가 아닌 콘텐츠 흐름 내 배치

## 번역 키 추가 (부족분)

```json
"onboarding": {
  ...existing keys...,
  "stepProgress": "Step {current} of {total}",
  "skinConcernsCount": "{count}/3 selected",
  "optional": "Optional"
}
```

## 검증 체크리스트

- [ ] V-1: import 방향 DAG 준수 (app → features → ui/primitives → shared)
- [ ] V-2: core/ 수정 없음
- [ ] V-4: features 간 직접 호출 없음 (onboarding → landing 등 없음)
- [ ] V-9: 중복 없음 (OptionGroup으로 7곳 토글 패턴 통합)
- [ ] V-13: 디자인 토큰만 사용 (hex 하드코딩 없음)
- [ ] V-15: ui/ 파일에 비즈니스 용어 없음
- [ ] V-17: features/onboarding/ 전체 삭제 시 core/, 기존 features/ 빌드 에러 없음
- [ ] L-0b: 모든 client/ 파일에 "use client" + "client-only"
- [ ] L-12: 모바일 퍼스트
- [ ] Q-1: zod 검증 (서버 측은 이미 구현됨, 클라이언트는 react-hook-form validation)
- [ ] G-5: 기존 패턴 따르기 (랜딩 페이지 Button/typography 패턴 참조)
- [ ] S-5: Button 프리미티브 사용 (인라인 버튼 금지)
