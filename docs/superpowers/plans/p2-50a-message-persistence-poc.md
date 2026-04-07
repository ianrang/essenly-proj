# P2-50a: AI SDK 메시지 저장/복원 기술 검증

> 작성: 2026-04-04. 목적: P2-50b/c 구현 전 저장 전략 결정.

---

## 1. 목적

AI SDK v6의 `UIMessage[]` 구조와 현재 DB 스키마 간 차이를 분석하고, 메시지 저장/복원 전략을 결정한다.

**산출물**: 저장/복원 전략 문서 (`docs/05-design-detail/message-persistence-strategy.md`)

## 2. 분석 범위

### 2.1 확인 완료 사항 (AI SDK 공식 문서 기반)

**Q1. 스트리밍 완료 후 UIMessage[] 획득 방법**
- `toUIMessageStreamResponse({ originalMessages, onFinish })` 콜백
- `onFinish({ messages })` — UIMessage[] 전체(tool parts 포함) 수신
- `consumeStream()` — 클라이언트 연결 끊겨도 onFinish 보장

**Q2. 히스토리 로드 + 카드 복원 방법**
- `useChat({ messages: UIMessage[] })` — tool parts 포함 UIMessage[] 전달 시 카드 자동 복원
- card-mapper.ts의 `UIPartLike`가 UIMessagePart와 호환 (type, text, state, input, output 필드 일치)

### 2.2 분석 필요 사항 — 현재 아키텍처와의 차이

**현재 messages 테이블 (schema.dbml)**:
```
messages { id, conversation_id, role, content, card_data, tool_calls, created_at }
```

**AI SDK UIMessage 구조**:
```
UIMessage { id, role, metadata?, parts: UIMessagePart[] }
  └─ parts: TextUIPart | ToolUIPart | ReasoningUIPart | FileUIPart | ...
     └─ ToolUIPart: { type: 'tool-${name}', toolCallId, state, input?, output? }
```

**핵심 차이**: 현재 DB는 flat 구조(role+content+card_data). AI SDK는 parts 배열 구조. card-mapper가 의존하는 tool parts(type, state, input, output)는 현재 DB 스키마에 매핑되지 않음.

### 2.3 저장 전략 옵션 분석

| 옵션 | 설명 | 장점 | 단점 |
|------|------|------|------|
| A. UIMessage[] 통째 저장 | conversations 테이블에 `ui_messages jsonb` 컬럼 추가. onFinish → 전체 저장 | AI SDK 공식 패턴. 카드 완전 복원. 단순 | 스키마 변경. messages 테이블과 이중 저장 |
| B. 기존 messages 테이블 활용 | UIMessage.parts → role+content+card_data 변환 저장. 로드 시 역변환 | 스키마 변경 없음 | 변환/역변환 복잡. tool part 구조 손실 가능. 역변환 시 card-mapper 호환 보장 어려움 |
| C. 이중 목적 분리 | messages 테이블: LLM 컨텍스트용 (role+content). ui_messages: 클라이언트 복원용 (UIMessage[]) | 각 소비자에 최적화 | 이중 저장. 동기화 필요 |

## 3. 작업 내용

### Step 1: UIMessage[] 구조 상세 매핑 (분석)

**대상**: AI SDK 타입 정의 + 현재 card-mapper.ts의 UIPartLike

| 분석 항목 | 확인 내용 |
|----------|----------|
| UIMessage.parts에 tool parts 포함 여부 | onFinish 콜백에서 tool-search_beauty_data, tool-extract_user_profile parts가 포함되는지 |
| UIPartLike ↔ UIMessagePart 호환성 | card-mapper의 UIPartLike(type, text, state, input, output)가 UIMessagePart에서 직접 접근 가능한지 |
| useChat initialMessages → parts 복원 | UIMessage[]를 그대로 전달했을 때 messages.parts가 card-mapper에 전달되는 흐름이 동일한지 |

**방법**: 타입 정의 정적 분석. 코드 수정 없음.

### Step 2: 현재 아키텍처 소비자 매핑 (분석)

| 소비자 | 현재 사용 데이터 | 파일 |
|--------|----------------|------|
| LLM 컨텍스트 | `{ role, content }` | service.ts:109 |
| History API 응답 | `{ role, content, card_data, created_at }` | chat.ts:107-114 |
| card-mapper | `UIMessage.parts` (UIPartLike[]) | card-mapper.ts:91 |
| ChatInterface | `useChat → messages → mapUIMessageToParts` | ChatInterface.tsx:45 |

### Step 3: 전략 결정 + 문서 작성

옵션 A/B/C 중 선택. 결정 기준:
1. card-mapper 호환성 (카드 완전 복원 가능한가?)
2. 기존 코드 영향 최소화 (core/ 수정 여부)
3. 구현 복잡도
4. 데이터 무결성

## 4. 규칙 준수 검증

| 규칙 | 준수 방법 |
|------|----------|
| P-2 (Core 불변) | core/ 파일 수정 없음. 분석만 수행 |
| P-9 (scripts/ 독립성) | 검증 코드가 필요하면 scripts/에 배치 |
| P-10 (제거 안전성) | 산출물은 docs/ 문서. 삭제해도 빌드 무영향 |
| G-1 (기존 코드 분석 필수) | 관련 파일 모두 사전 분석 완료 |
| G-6 (core/ 수정 금지) | 수정 없음 |
| L-4 (core/ 승인 필수) | 해당 없음 (수정 없음) |

## 5. 수정 파일 목록

| 파일 | 변경 유형 |
|------|----------|
| `docs/05-design-detail/message-persistence-strategy.md` | **신규 생성** — 전략 문서 |

**기존 파일 수정: 0개**

## 6. 완료 기준

- [ ] UIMessage[] 구조에서 tool parts 포함 여부 확정
- [ ] UIPartLike ↔ UIMessagePart 호환성 확인
- [ ] 저장 전략 A/B/C 중 1개 선택 + 근거 문서화
- [ ] P2-50b/c 구현 범위에 필요한 스키마 변경 사항 명시
- [ ] 기존 코드(core/, features/, client/) 수정 0건 확인
