# P2-49 "Show recommendations" 버튼 — 보류 결정

> 결정일: 2026-04-04. 재검토 조건: 런칭 후 K1/K2 데이터 확보 시.

---

## 1. 원래 기획 의도

`mvp-flow-redesign.md` §2.1 주력 흐름에서 설계:

```
AI가 대화로 정보 수집 (채팅 내 온보딩)
→ 충분한 정보 수집 시:
   AI: "프로필이 준비됐어요!"
       [Show my recommendations]  ← 액션 버튼
→ 클릭 시 추천 요청 자동 전송
```

**목적**: 2-경로 설계(폼→채팅)에서 Chat-First로 전환하면서 사라진 "온보딩→추천" 단계 전환점을 버튼으로 대체.

## 2. 보류 사유

### 설계 가정과 실제 동작의 불일치

| 설계 가정 | 실제 동작 |
|----------|----------|
| 정보 수집 → 추천이 순차적 | 시스템 프롬프트 §9: "Always answer the user's question first. Never delay a recommendation" — 수집과 추천이 동시 |
| "온보딩 완료" 시점이 존재 | Chat-First에서 명시적 완료 시점 없음. 그라데이션 |
| 버튼이 전환점 역할 | 전환점 자체가 없으므로 역할 불필요 |

### 클라이언트 감지 방식 (b') 검토 결과

`showRecBtn = hasExtraction && !hasSearch` 방식은:
- **타이밍 문제**: "I have oily skin" 한마디에 extraction 발생 → AI가 아직 추가 질문 중인데 버튼 표시 → 사용자 혼란 (AI 질문에 답할까? 버튼 누를까?)
- **비즈니스 판단 불가**: 클라이언트는 "무엇이 추출되었는가" 모름. UP-1 + JC-1 충족 여부 판단 불가
- **추천과 동시 발생**: extraction + search가 같은 턴에 실행되면 불필요한 버튼 표시

### 서버 신호 방식 (c) 검토 결과

정확하지만, 현재 Chat-First 흐름에서 "온보딩 완료" 개념 자체가 없으므로 서버 신호를 보낼 조건 정의가 모호.

## 3. 현재 대체 수단

| 문제 | 현재 해결 수단 |
|------|--------------|
| 첫 진입 시 행동 유도 | SuggestedQuestions 3개 버튼 (messages.length === 0) |
| 추천 가능 안내 | AI 자연어 ("I can recommend products for your skin") |
| 추천 실행 | 사용자 타이핑 → search_beauty_data tool → 카드 렌더링 (완전 구현) |

**미해결**: 타이핑에 익숙하지 않은 사용자의 전환율. 데이터로 확인 필요.

## 4. 재검토 조건

- K1(온보딩 완료율) < 60% 목표 미달 시
- K2(대화 턴 수) 데이터에서 "정보 제공 후 추천 미요청" 패턴 발견 시
- 재검토 시 P2-XX SuggestedActions (서버 기반 제안 버튼) 함께 평가

## 5. 대안 방향 (P2-XX)

서버가 AI 응답에 `suggested_actions`를 구조화 데이터로 포함 → 클라이언트가 버튼 렌더링. P2-49(1회성 추천 버튼)보다 범용적이며 업계 표준 패턴 (ChatGPT/Gemini suggested replies).
