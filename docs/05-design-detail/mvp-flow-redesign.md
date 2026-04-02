# MVP 흐름 재설계 — Chat-First 단일 경로

> 정본: 본 문서. PRD §3.2~3.4, user-screens §3, §6과 교차 참조.
> 작성: 2026-04-02. 근거: 사용자 논의 기반 UX 개선 결정.

---

## 1. 배경 및 결정 사유

### 기존 설계 (변경 전)
```
경로A: Landing → "Start with my profile" → 온보딩 폼(4단계) → Profile → Chat
경로B: Landing → "Just ask" → Chat (프로필 없이, VP-3)
```

### 문제점
1. **두 경로의 인터페이스 불일치**: 폼 UI(온보딩) → 대화 UI(채팅). 사용자 혼란
2. **가치 도달까지 4단계**: 경로A는 추천 결과를 보기 전에 4단계 폼을 거쳐야 함
3. **경로B가 이미 완전한 흐름**: VP-3 + extract_user_profile로 대화 중 프로필 수집 가능
4. **프로필 생성과 이메일 로그인 분리**: MVP는 anonymous만. 프로필 페이지는 이메일 로그인(v0.2) 후 의미 있음

### 결정
- **MVP: Chat-First 단일 경로**. 온보딩을 채팅 내 AI 대화로 수행
- **v0.2: 이메일 로그인 + 프로필 페이지 + 온보딩 폼(편집용)**

---

## 2. MVP 흐름 (확정)

### 2.1 주력 흐름 (유일한 경로)

```
Landing → "Start chatting" (단일 CTA) → 동의(인라인) → /chat 이동
→ AI 인사 + 제안 질문 3개
→ AI가 대화로 자연스럽게 정보 수집 (= 채팅 내 온보딩)
   "What's your skin type?" → "Any concerns?" → "How long in Seoul?"
→ extract_user_profile tool 자동 실행 → DB 저장
→ 충분한 정보 수집 시:
   AI: "프로필이 준비됐어요! 궁금한 게 있으면 질문하세요"
       [Show my recommendations]  ← 액션 버튼
→ 사용자 선택:
   a. 버튼 클릭 → AI가 즉시 카드 추천
   b. 직접 질문 → AI가 질문에 맞는 카드 추천
   c. 대화 중 "결과 알려줘" → AI가 그 시점에 카드 추천
→ 카드(ProductCard/TreatmentCard) 인라인 삽입
→ 에센리 제품 포함 시 KitCtaCard 자동 삽입
→ "Claim" 클릭 → KitCtaSheet (Bottom sheet)
```

### 2.2 재방문 흐름

```
Landing → 세션 감지 → ReturnVisitBanner
→ "Continue chatting" (단일 버튼) → /chat 이동
→ 기존 대화 히스토리 로드 → 이어서 대화
```

### 2.3 동의 흐름

```
시점: Landing CTA 클릭 시 (신규 사용자만)
방식: Hero 영역 내 인라인 동의 확인 → "Continue" → 세션 생성
재방문: 이미 동의 완료 → 동의 건너뜀, 바로 /chat 이동
향후 검토: 동의 시점을 Chat 첫 메시지 전으로 이동 (P2-45)
```

---

## 3. v0.2 범위 (MVP 제외)

| 기능 | 설명 | 선행 |
|------|------|------|
| 이메일 로그인 | 계정 생성 + 로그인 시스템 | 인증 시스템 |
| "Set up my profile" CTA | Landing 두 번째 버튼 (로그인 후 프로필) | 이메일 로그인 |
| 프로필 페이지 | 프로필 조회/편집 (이메일 계정 연결) | 이메일 로그인 |
| 온보딩 폼 (편집용) | 기존 4단계 위자드를 프로필 편집 UI로 재사용 | 프로필 페이지 |
| 채팅 이력 목록 | 과거 대화 목록 + 선택하여 이어가기 | 이메일 로그인 |
| 5영역 탭 필터 | 카드 수 증가 시 도메인별 필터 재검토 | 카드 통합(P3) |

---

## 4. Landing 페이지 변경

### 4.1 Hero 섹션

```
변경 전:
  [Start chatting]        ← primary
  [Set up my profile]     ← outline
  "Chat with AI now, or set up your profile first"

변경 후:
  [Start chatting]        ← 단일 CTA
  "Chat with our AI guide — no signup needed"
```

### 4.2 ReturnVisitBanner

```
변경 전:
  [Continue chatting]     ← primary
  [View my profile]       ← outline

변경 후:
  [Continue chatting]     ← 단일 버튼
```

### 4.3 How it works

```
① Chat with our AI guide    (변경 완료)
② Get AI-matched picks       (유지)
③ Shop & book instantly       (유지)
```

---

## 5. Chat 페이지 변경

### 5.1 TabBar
MVP에서 제거. (변경 완료. PRD §3.4 보류 참조)

### 5.2 초기 상태 (빈 대화)
```
AI 인사 메시지 + SuggestedQuestions (제안 질문 3개)
→ hasProfile 분기 불필요 (MVP에서 항상 프로필 없음)
→ SuggestedQuestions 항상 표시
```

### 5.3 "Show my recommendations" 버튼
온보딩 완료 후 AI 메시지에 액션 버튼 표시. 클릭 시 추천 요청 자동 전송.
→ 카드 통합(P3) 시점에 구현. SuggestedQuestions와 동일 패턴.

---

## 6. 기존 코드 영향 분석

### 건들지 않는 코드
- server/ 전체 (core, features, api)
- shared/ 전체
- client/features/onboarding/ 전체 (v0.2 재사용)
- client/features/profile/ 전체 (v0.2 재사용)
- /onboarding, /profile 라우트 (v0.2에서 활성화)
- DB, 마이그레이션, package.json

### 변경하는 코드
- HeroSection.tsx: 보조 CTA 제거 → 단일 CTA
- ReturnVisitBanner.tsx: 프로필 버튼 제거 → 단일 버튼
- ChatInterface.tsx: hasProfile 분기 제거 (항상 SuggestedQuestions 표시)
- messages/en.json: CTA 설명 텍스트 조정
- LandingClient.tsx: 변경 없음 (handleConsent 로직 유지)

---

## 7. 참조 문서

| 문서 | 관련 섹션 |
|------|----------|
| PRD §3.2 | Landing 화면 — CTA, 분기 로직 |
| PRD §3.3 | Onboarding — v0.2 범위 명시 필요 |
| PRD §3.4 | Results — 탭 보류, 카드 인라인 |
| PRD §3.6 | Kit CTA — 에센리 하이라이트 카드 트리거 |
| PRD VP-3 | 점진적 개인화 — 채팅 내 온보딩 근거 |
| PRD VP-4 | 대화 + 카드 하이브리드 |
| user-screens §3 | Landing 컴포넌트/상태/인터랙션 |
| user-screens §6 | Chat 컴포넌트/상태 |
| data-privacy §1.2 | 동의 흐름 |
| system-prompt-spec §9 | No Profile Mode (채팅 내 온보딩) |
| tool-spec | extract_user_profile, search_beauty_data |
