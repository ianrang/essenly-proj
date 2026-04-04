# 메시지 저장/복원 전략 — P2-50a 기술 검증 결과

> 작성: 2026-04-04. P2-50a 분석 시점 기준.
> **P2-50b/c 구현 완료 (2026-04-04)**: 본 문서의 §2 소비자 분석은 P2-50b 이전 상태. 현행: `conversations.ui_messages` (UIMessage[] JSONB)가 단일 소스. `loadRecentMessages`(messages 테이블) 미사용. TDD C-5 + §3.7 참조.
> 근거: AI SDK v6 공식 문서 (chatbot-message-persistence) + 타입 정의 정적 분석.

---

## 1. UIMessage[] 구조 분석

### 1.1 onFinish 콜백에서 받는 UIMessage[]

AI SDK `toUIMessageStreamResponse({ originalMessages, onFinish })`:

```
onFinish({ messages: UIMessage[] })
```

`UIMessage[]`에는 대화 전체가 포함된다:
- user 메시지: `{ id, role: 'user', parts: [{ type: 'text', text: '...' }] }`
- assistant 메시지: `{ id, role: 'assistant', parts: [TextUIPart, ToolUIPart, ...] }`

### 1.2 ToolUIPart 구조 (카드 복원의 핵심)

```typescript
// AI SDK 타입 정의 (node_modules/ai/dist/index.d.ts)
type ToolUIPart<TOOLS> = {
  type: `tool-${NAME}`;       // e.g. 'tool-search_beauty_data'
  toolCallId: string;
  state: 'output-available';  // 완료 상태
  input: { domain?: string }; // tool 입력
  output: unknown;            // tool 출력 (cards 배열 등)
};
```

**확인 결과**: onFinish의 UIMessage[] → assistant message → parts에 `ToolUIPart`가 포함된다.
- `type: 'tool-search_beauty_data'` — search 결과
- `type: 'tool-extract_user_profile'` — 프로필 추출 결과
- `state: 'output-available'` — 출력 완료 상태
- `output` — tool 실행 결과 (cards 배열, total 등)

### 1.3 card-mapper UIPartLike 호환성

```typescript
// card-mapper.ts 현재 정의
export type UIPartLike = {
  type: string;              // ← ToolUIPart.type ('tool-search_beauty_data') ✅
  text?: string;             // ← TextUIPart.text ✅
  state?: string;            // ← ToolUIPart.state ('output-available') ✅
  input?: { domain?: string }; // ← ToolUIPart.input ✅
  output?: unknown;          // ← ToolUIPart.output ✅
};
```

**결론: UIPartLike는 UIMessagePart의 구조적 서브타입이다. 완전 호환.**

UIMessage[]를 그대로 `useChat({ messages })` → `mapUIMessageToParts(m.parts)` 경로로 전달하면 card-mapper가 동일하게 카드를 생성한다. 별도 변환 불필요.

---

## 2. 현재 아키텍처 소비자 분석

| 소비자 | 파일 | 필요 데이터 | 현재 소스 |
|--------|------|------------|----------|
| LLM 컨텍스트 | service.ts:109 | `{ role, content }` | messages 테이블 → loadRecentMessages |
| History API | chat.ts:107 | `{ role, content, card_data }` | messages 테이블 → loadRecentMessages |
| card-mapper | card-mapper.ts:91 | `UIMessage.parts` (UIPartLike[]) | useChat 실시간 스트리밍 |
| ChatInterface | ChatInterface.tsx:45 | `UIMessage[]` | useChat hook |

**핵심**: LLM 컨텍스트는 `role+content`만 필요. 클라이언트 카드 복원은 `UIMessage.parts`(tool parts 포함) 필요. 이 두 소비자의 요구 형식이 다르다.

---

## 3. 저장 전략 결정

### 3.1 옵션 평가

| 기준 | A. UIMessage[] 통째 저장 | B. 기존 messages 테이블 변환 | C. 이중 목적 분리 |
|------|------------------------|--------------------------|----------------|
| 카드 완전 복원 | ✅ tool parts 그대로 보존 | ⚠️ 역변환 필요. 구조 손실 위험 | ✅ |
| AI SDK 공식 패턴 | ✅ 정확히 일치 | ❌ 자체 변환 로직 | 부분 일치 |
| 기존 코드 영향 | messages 테이블 용도 재검토 | 없음 | messages + 새 컬럼 |
| LLM 컨텍스트 호환 | AI SDK `convertToModelMessages()` 사용 | ✅ 기존 loadRecentMessages | 양쪽 모두 가능 |
| 구현 복잡도 | 낮음 (저장/로드 직접 전달) | 높음 (양방향 변환 + 테스트) | 중간 |
| 데이터 무결성 | ✅ 원본 보존 | ⚠️ 변환 시 정보 손실 | ✅ |

### 3.2 결정: 옵션 A — UIMessage[] 통째 저장

**근거**:

1. **AI SDK 공식 패턴**: 문서에서 UIMessage[]를 저장/복원하는 것이 표준 방식. 향후 AI SDK 업그레이드 시 호환성 보장
2. **카드 완전 복원**: tool parts의 `type`, `state`, `input`, `output`이 그대로 보존되어 card-mapper가 변경 없이 동작
3. **구현 단순성**: 변환/역변환 로직 불필요. `onFinish → JSON.stringify → DB` → `DB → JSON.parse → useChat`
4. **LLM 컨텍스트**: AI SDK의 `convertToModelMessages(UIMessage[])` 함수로 UIMessage[] → ModelMessage[] 변환 가능. 기존 loadRecentMessages의 `{ role, content }` 매핑과 동일 효과

### 3.3 구현 방향

#### 저장 (P2-50b) — 요청 파싱 변경 필요

**현재 구조의 제약 (C-1)**:
- 현재 `POST /api/chat` 요청 바디: `{ message: string, conversation_id: string }` (chat.ts:157-160)
- AI SDK `useChat` → `DefaultChatTransport`는 실제로 `UIMessage[]`를 전송
- 현재 route handler는 `message` 문자열만 파싱하고, service.ts:108-111에서 `{ role, content }[]` 직접 구성
- `toUIMessageStreamResponse({ originalMessages })` 에 전달할 `UIMessage[]`는 현재 route handler에 없음

**해결 방향**: AI SDK의 공식 패턴에 맞게 요청 파싱을 변경

```
변경 전 (현재):
  req.body: { message: string }
  → service.ts: loadRecentMessages → { role, content }[] 직접 구성

변경 후 (P2-50b):
  req.body: { message: UIMessage (마지막 메시지만) }   ← AI SDK DefaultChatTransport 기본 형식
  → route handler: DB에서 previousMessages(UIMessage[]) 로드
  → messages = [...previousMessages, message]
  → streamText + toUIMessageStreamResponse({ originalMessages: messages, onFinish, ... })
```

> 주의: AI SDK 공식 패턴은 클라이언트가 마지막 메시지만 전송 + 서버가 DB에서 이전 메시지 로드. `prepareSendMessagesRequest`로 전송 형식 커스터마이징 가능.

#### afterWork vs onFinish 타이밍 통합 (C-2)

**현재 구조**:
- `afterWork()`: `void afterWork()` 로 즉시 실행 (스트리밍 완료 전)
- 프로필 추출 저장: afterWork 내부에서 `result.extractionResults` 사용

**문제**: `onFinish`는 스트리밍 완료 후 실행. `afterWork`는 스트리밍 시작 직후 실행. 두 시점이 다름.

**해결 방향**: afterWork의 추출 저장 로직을 `onFinish` 내부로 이동
- `onFinish({ messages })`: UIMessage[] 저장 + 추출 결과 저장 모두 처리
- `extractionResults`는 onFinish 시점에 이미 수집 완료 (tool 실행은 스트리밍 중 발생)
- 기존 `afterWork` 패턴 → `onFinish` 내부의 비동기 후처리로 통합
- `consumeStream()` (StreamTextResult 메서드)으로 클라이언트 연결 끊김 시에도 `onFinish` 호출 보장

```
변경 후:
  result.consumeStream();  // no await — 스트림 소비 보장

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages }) => {
      // 1. UIMessage[] DB 저장
      // 2. 프로필 추출 결과 저장 (기존 afterWork 로직)
    },
  });
```

> `consumeSseStream` (toUIMessageStreamResponse 옵션)과 `result.consumeStream()` (StreamTextResult 메서드)은 다른 것. onFinish 보장에는 `result.consumeStream()`을 사용 (AI SDK troubleshooting/stream-abort-handling 참조).

#### 복원 (P2-50c)

```
ChatInterface.tsx:
  마운트 → GET /api/chat/history → UIMessage[] 수신
  → useChat({ messages: loadedMessages, transport })
  → card-mapper가 tool parts에서 카드 자동 복원
```

> 주의: useChat에 initialMessages를 전달한 후 새 메시지가 스트리밍되면 중복 가능성 있음. useChat 내부에서 id 기반 병합되므로 정상 동작하지만, P2-50c 구현 시 검증 필요.

### 3.4 스키마 변경 사항

**conversations 테이블에 `ui_messages jsonb` 컬럼 추가**:

```sql
ALTER TABLE conversations ADD COLUMN ui_messages jsonb;
```

- `ui_messages`: onFinish에서 받은 UIMessage[] 전체. 매 턴마다 덮어쓰기 (최신 스냅샷)
- 기존 messages 테이블: **당장 삭제하지 않음**. P2-50b에서 ui_messages 도입 후 messages 테이블 용도를 재검토 (마이그레이션은 별도 태스크)
- **schema.dbml 갱신 필수 (Q-14)**: P2-50b 마이그레이션과 동시에 schema.dbml에 ui_messages 컬럼 추가

> 버전 관리 권장: 저장 시 `{ version: 1, messages: UIMessage[] }` 형태로 래핑. AI SDK 업그레이드 시 마이그레이션 경로 확보.

### 3.5 messages 테이블과의 관계

| 항목 | messages 테이블 | conversations.ui_messages |
|------|----------------|--------------------------|
| 형식 | 행 단위 (message per row) | UIMessage[] JSON 스냅샷 |
| 용도 | LLM 컨텍스트 (service.ts) | 클라이언트 복원 (ChatInterface) |
| 현재 상태 | loadRecentMessages 구현됨, 저장 미호출 (TODO) | 미존재 |
| P2-50b 범위 | 기존 유지 (변경 없음) | 신규 추가 |

**P2-50b에서 ui_messages만 구현**. messages 테이블 저장(step 9 원안)은 ui_messages 안정화 후 재검토. 이유:

1. LLM 컨텍스트도 `convertToModelMessages(UIMessage[])` (async, `Promise<ModelMessage[]>` 반환)로 ui_messages에서 도출 가능
2. 이중 저장(messages + ui_messages)은 동기화 문제 유발
3. messages 테이블이 필요한 유일한 시나리오(턴 기반 토큰 관리)는 v0.2(V2-17)

---

## 4. P2-50b/c 영향 범위 요약

### P2-50b (메시지 저장)

| 파일 | 변경 |
|------|------|
| `supabase/migrations/` | 새 마이그레이션: conversations 테이블에 ui_messages jsonb 컬럼 추가 |
| `docs/03-design/schema.dbml` | conversations 테이블에 ui_messages 컬럼 추가 **(Q-14 필수)** |
| `chat.ts` POST /api/chat | (1) 요청 파싱 변경: AI SDK 메시지 형식 수용 (2) DB에서 이전 UIMessage[] 로드 (3) `toUIMessageStreamResponse` 호출: originalMessages + onFinish 추가 (4) `result.consumeStream()` 추가 (5) 기존 afterWork 로직 → onFinish 내부로 통합 |
| `chat.ts` GET /api/chat/history | conversations.ui_messages 조회로 변경. 응답 스키마(`historyResponseSchema`) + OpenAPI 라우트 정의(`getChatHistoryRoute`) + 매핑 로직(lines 107-114) 모두 갱신 |

> `service.ts` 변경 필요 (P2-50b 계획 반영, 2026-04-04 갱신): `history: ModelMessage[]` 파라미터 추가 + `loadRecentMessages` 제거. route handler(Composition Root)가 DB에서 UIMessage[] 로드 → `convertToModelMessages()` 변환 → service에 전달. service.ts는 히스토리 소스를 모르고 ModelMessage[]만 사용 (P-4 강화).

### P2-50c (클라이언트 로드)

| 파일 | 변경 |
|------|------|
| `ChatInterface.tsx` | 마운트 시 `GET /api/chat/history` fetch → 로딩 상태 UI → `useChat({ messages: loadedMessages })` 전달. 중복 메시지 방지 검증 포함 |

### 수정하지 않는 파일

| 파일 | 이유 |
|------|------|
| `core/memory.ts` | ui_messages 사용으로 당장 불필요. loadRecentMessages 유지 (향후 재검토) |
| `service.ts` | onFinish는 route handler 책임. streamChat 내부 변경 없음 |
| `card-mapper.ts` | UIPartLike ↔ UIMessagePart 호환. 변경 불필요. 단, 저장된 JSON에는 toolCallId, callProviderMetadata 등 추가 필드가 포함되나 UIPartLike가 접근하지 않으므로 무영향 |
| `MessageList.tsx` | 기존 파트 렌더링 로직 그대로 사용 |

---

## 5. 리스크 및 향후 검토

| 항목 | 설명 | 시점 |
|------|------|------|
| ui_messages 크기 | 20턴 대화 UIMessage[] ≈ 50-200KB (tool output이 큰 경우 증가). conversations 행 크기 증가 | 모니터링 후 분리 테이블 검토 |
| messages 테이블 폐기 | ui_messages에서 LLM 컨텍스트 도출 가능하면 messages 테이블 불필요 | P2-50b 안정화 후 |
| AI SDK 버전 호환 | UIMessage 구조 변경 시 저장된 데이터와 불일치. version 필드로 마이그레이션 경로 확보 | AI SDK 업그레이드 시 |
| useChat 중복 메시지 | initialMessages + 새 스트리밍 메시지 간 id 충돌 가능성 | P2-50c 구현 시 검증 |
