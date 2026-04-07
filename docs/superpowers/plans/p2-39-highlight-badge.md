# P2-39: HighlightBadge 컴포넌트

## 목표

VP-1 비개입적 판단 원칙의 UI 구현. `is_highlighted && highlight_badge`일 때만 시각적 배지 표시.

## 정본

- PRD §2.3 VP-1 (비개입적 판단)
- user-screens.md §1.5 (HighlightBadge)
- design-preview.html (스타일: teal, ★, radius-sm)
- schema.dbml (is_highlighted, highlight_badge 필드)

## 파일

| 파일 | 작업 |
|------|------|
| `client/features/cards/HighlightBadge.tsx` | **신규** |

## Props

```tsx
type HighlightBadgeProps = {
  isHighlighted: boolean;
  badge: LocalizedText | null;
  locale: string;
};
```

- `isHighlighted === false` 또는 `badge === null` → null 반환
- `badge[locale]` → 텍스트 표시. 없으면 `badge.en` 폴백

## 디자인 (design-preview.html 정본)

- bg: teal/20% → `bg-teal/20`
- text: teal → `text-teal`
- border: teal → `border-teal`
- font: 11px 600 → `text-[11px] font-semibold`
- radius: sm → `rounded-sm`
- padding: 3px 8px → `px-2 py-0.5`
- icon: ★

## 검증

- [ ] V-1: shared/types/domain.ts만 import
- [ ] V-4: 타 features import 없음
- [ ] V-11: 검색/정렬 로직 없음 (렌더링만)
- [ ] V-13: 디자인 토큰 사용 (teal은 globals.css 토큰)
- [ ] L-0b: "use client" + "client-only"
- [ ] G-8: any 없음
