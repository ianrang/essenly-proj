# P2-36: 5영역 탭 바

## 목표

Chat/Results 화면 상단 5영역 도메인 탭. MVP: Shops+Clinic 활성, 나머지 Coming soon.

## 정본

- PRD §2.1 (5영역), §3.4 (Results 와이어프레임), §5.2 (MVP M5-M6)
- user-screens.md §6.1-6.2 (TabBar 컴포넌트, 동작)

## 파일

| 파일 | 작업 |
|------|------|
| `features/layout/TabBar.tsx` | 스텁 → Tabs 프리미티브 사용 구현 |

## 설계

- Tabs 프리미티브 재사용 (variant="line")
- 5탭: shops(DOM-1), clinic(DOM-2), salon(DOM-3), eats(DOM-4), exp(DOM-5)
- MVP 활성: shops, clinic. 나머지: disabled + "Coming soon" 표시
- props: `activeTab`, `onTabChange` — Chat 페이지에서 제어
- 번역 키: tabs.shops 등 (이미 정의됨)
