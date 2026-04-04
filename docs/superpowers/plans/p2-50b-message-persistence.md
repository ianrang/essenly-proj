# P2-50b: 메시지 저장 + LLM 컨텍스트 연속성 + Rate Limit 조정

> 작성: 2026-04-04. 개정: 2026-04-04 (코드 리뷰 C-1~3, I-4~9 반영).
> 전략 정본: `message-persistence-strategy.md` (§4 service.ts 항목 갱신 필요 — 본 계획에서 service.ts 변경 포함)

---

## 1. 목적

1. 스트리밍 완료 후 UIMessage[]를 DB에 저장 → 재방문 시 대화+카드 복원 가능
2. 서버 권위적 히스토리 → LLM 컨텍스트 연속성 보장
3. Chat rate limit 5→15회/분 조정
4. 기존 afterWork 레이스 컨디션 수정 (afterWork는 스트리밍 완료 전 실행 → onFinish로 이동하여 tool 실행 완료 후 실행 보장)

## 2. 전제 (논의 완료)

| 결정 | 내용 | 근거 |
|------|------|------|
| 저장 형식 | UIMessage[] 통째 저장 (conversations.ui_messages jsonb) | P2-50a 전략 |
| 히스토리 소스 | 서버 권위적 — DB에서 로드. 클라이언트 전송 데이터 신뢰 안 함 | 보안 + 업계 표준 |
| 새 메시지 수신 | UIMessage 객체 (마지막 메시지 추출). parts는 `[{ type: 'text', text }]`만 허용 (G-8, Q-1) | AI SDK 공식 패턴 |
| conversationId 전달 | `messageMetadata`로 스트리밍 시작 시 conversationId 포함. 클라이언트 `onFinish`에서 `message.metadata.conversationId` 추출 | AI SDK 공식 패턴. DefaultChatTransport에 onResponse 없으므로 헤더 방식 불가 |
| afterWork 통합 | afterWork → onFinish 내부로 이동 | C-2 해결 |
| Rate limit | 15회/분 (기존 5), 100회/일 (유지) | UX 개선. 일일 총량이 비용 제어 |

## 3. 파일별 변경 상세

### 3.1 마이그레이션 (신규)

**파일**: `supabase/migrations/009_add_ui_messages.sql`

```sql
ALTER TABLE conversations ADD COLUMN ui_messages jsonb;
COMMENT ON COLUMN conversations.ui_messages IS 'UIMessage[] snapshot from AI SDK onFinish. Overwritten each turn.';
```

### 3.2 schema.dbml (수정)

**파일**: `docs/03-design/schema.dbml`

conversations 테이블에 추가:
```
ui_messages jsonb [note: 'UIMessage[] snapshot from AI SDK onFinish. Overwritten each turn. P2-50b.']
```

### 3.3 chat.ts POST /api/chat (수정 — 가장 큰 변경)

**현재 흐름**:
```
요청 파싱 (message: string) → cross-domain 조회 → streamChat({ message })
→ void afterWork() → return stream.toUIMessageStreamResponse()
```

**변경 후 흐름**:
```
요청 파싱 (message: UIMessage, conversation_id) 
→ DB에서 conversations.ui_messages 로드 → convertToModelMessages()
→ cross-domain 조회 
→ streamChat({ history: ModelMessage[], message: string, ... })
→ result.consumeStream()
→ return result.toUIMessageStreamResponse({
    originalMessages: [...storedUIMessages, clientMessage],
    onFinish: ({ messages }) => {
      conversations.ui_messages = messages   // 저장
      프로필 추출 결과 저장                    // 기존 afterWork 로직
    }
  })
→ 응답 헤더: X-Conversation-Id 추가
```

**구체적 변경**:

(a) 요청 파싱 변경:
```typescript
// 변경 전
const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversation_id: z.string().uuid().nullable().optional(),
});

// 변경 후 — AI SDK prepareSendMessagesRequest에서 보내는 형식
// Q-1: zod 검증. G-8: any 금지. user message parts는 text만 허용.
const chatRequestSchema = z.object({
  message: z.object({
    id: z.string(),
    role: z.literal('user'),
    parts: z.array(z.object({
      type: z.literal('text'),
      text: z.string().min(1).max(4000),
    })).min(1),
  }),
  conversation_id: z.string().uuid().nullable().optional(),
});
```

(b) 히스토리 로드 + 변환 (composition root 역할, L-21):
```typescript
// DB에서 신뢰할 수 있는 히스토리 로드
let storedUIMessages: UIMessage[] = [];
if (conversationId) {
  const { data: conv } = await client
    .from('conversations')
    .select('ui_messages')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();
  storedUIMessages = (conv?.ui_messages as UIMessage[]) ?? [];
}

// LLM용 ModelMessage[] 변환
const history = await convertToModelMessages(storedUIMessages);
```

(c) streamChat 호출 변경:
```typescript
const result = await streamChat({
  client, userId,
  conversationId: parsed.data.conversation_id ?? null,
  message: userMessageText,   // UIMessage에서 텍스트 추출
  history,                     // ModelMessage[] — 새 파라미터
  profile, journey, preferences,
  derived: null,
});
```

(d) afterWork → onFinish 통합:
```typescript
const stream = result.stream as StreamTextResult<ToolSet>;
stream.consumeStream(); // 클라이언트 끊김 대비. no await.

const originalMessages = [...storedUIMessages, parsed.data.message];

return stream.toUIMessageStreamResponse({
  originalMessages,
  onFinish: async ({ messages: finalMessages }) => {
    try {
      const serviceClient = createServiceClient();

      // ① UIMessage[] 저장
      await serviceClient
        .from('conversations')
        .update({ ui_messages: finalMessages })
        .eq('id', result.conversationId);

      // ② 추출 결과 저장 (기존 afterWork 로직 그대로 이동)
      if (result.extractionResults.length > 0) {
        // ... 기존 코드 동일 ...
      }
    } catch (error) {
      console.error('[chat/onFinish] post-processing failed', String(error));
    }
  },
});
```

(e) conversationId 전달 — messageMetadata로 스트리밍에 포함:
```typescript
// DefaultChatTransport에 onResponse 콜백이 없어 헤더 방식 불가.
// AI SDK 공식 패턴: messageMetadata로 서버→클라이언트 데이터 전달.
return stream.toUIMessageStreamResponse({
  originalMessages,
  messageMetadata: ({ part }) => {
    if (part.type === 'start') {
      return { conversationId: result.conversationId };
    }
  },
  onFinish: async ({ messages: finalMessages }) => { ... },
});
```

(f) rate limit 변경:
```typescript
// 변경 전
app.use('/api/chat', rateLimit('chat', 5, 60_000));
// 변경 후
app.use('/api/chat', rateLimit('chat', 15, 60_000));
```

### 3.4 chat.ts GET /api/chat/history (수정)

**현재**: messages 테이블 → loadRecentMessages → { role, content, card_data }
**변경 후**: conversations.ui_messages → UIMessage[] 직접 반환

```typescript
// 변경 후
const { data: conv } = await client
  .from('conversations')
  .select('id, ui_messages')
  .eq('id', conversationId)
  .single();

return c.json({
  data: {
    messages: conv?.ui_messages ?? [],
    conversation_id: conversationId,
  },
}, 200);
```

- historyResponseSchema 유지 (messages: z.array(z.any()) — 이미 유연)
- loadRecentMessages import 제거 (chat.ts에서 더 이상 사용 안 함)
- TOKEN_CONFIG import 제거 (chat.ts에서 더 이상 사용 안 함)

### 3.5 service.ts (수정 — 최소)

**변경 내용**: `history: ModelMessage[]` 파라미터 추가 + DB 히스토리 로드 제거

```typescript
// StreamChatParams 변경
export interface StreamChatParams {
  // ... 기존 필드 유지 ...
  message: string;
  history: ModelMessage[];    // 추가
}

// streamChat 내부 변경
// 삭제: const history = await loadRecentMessages(...);
// 삭제: import { loadRecentMessages } from '@/server/core/memory';
// 삭제: import { TOKEN_CONFIG } from '@/shared/constants/ai';

const messages = [
  ...params.history,                            // route handler가 변환한 ModelMessage[]
  { role: 'user' as const, content: message },
];
```

### 3.6 ChatInterface.tsx (수정 — 최소)

**변경 내용**: prepareSendMessagesRequest + conversationId 상태 관리

```typescript
const [conversationId, setConversationId] = useState<string | null>(null);

const transport = useMemo(
  () => new DefaultChatTransport({
    api: '/api/chat',
    credentials: 'include',
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        message: messages[messages.length - 1],   // 마지막 UIMessage만
        conversation_id: conversationId,
      },
    }),
  }),
  [conversationId]
);

const { messages, status, error, sendMessage } = useChat({
  transport,
  onFinish: ({ message }) => {
    // messageMetadata에서 conversationId 추출
    const meta = message.metadata as { conversationId?: string } | undefined;
    if (meta?.conversationId) {
      setConversationId(meta.conversationId);
    }
  },
});
```

### 3.7 api-spec.md (수정)

**파일**: `docs/05-design-detail/api-spec.md` §4.1

```
변경 전: POST /api/chat | 5회 | 분당
변경 후: POST /api/chat | 15회 | 분당
```

## 4. 수정하지 않는 파일

| 파일 | 이유 |
|------|------|
| `core/memory.ts` | loadRecentMessages 유지. service.ts에서 제거하더라도 다른 소비자(GET history 이전 버전)가 사용했을 수 있으므로 core는 건드리지 않음 (P-2) |
| `card-mapper.ts` | UIPartLike ↔ UIMessagePart 완전 호환. 변경 불필요 |
| `MessageList.tsx` | 기존 렌더링 로직 그대로 |
| `llm-client.ts` | ModelMessage[] 인터페이스 동일 |
| `prompts.ts` | 변경 없음 |
| tool handlers | 변경 없음 |

## 5. 테스트 변경

### 5.1 service.test.ts

| 변경 | 상세 |
|------|------|
| `mockLoadRecentMessages` 제거 | service.ts가 더 이상 호출 안 함 |
| `TOKEN_CONFIG` mock 제거 | service.ts가 더 이상 사용 안 함 |
| streamChat 호출 시 `history: ModelMessage[]` 추가 | 기존 테스트의 mockHistory를 params.history로 전달 |
| 히스토리 로드 테스트 | 삭제 (route handler 책임으로 이동) |
| 나머지 테스트 (tools, extraction, VP-3) | 파라미터 형태만 변경. 검증 로직 유지 |

### 5.2 chat.test.ts

| 변경 | 상세 |
|------|------|
| 요청 body 형식 | `{ message: "hello" }` → `{ message: UIMessage, conversation_id }` |
| `mockStreamChat` 반환값 | `stream.toUIMessageStreamResponse` → onFinish 포함 가능한 mock |
| `loadRecentMessages` mock | 제거 (더 이상 chat.ts에서 사용 안 함) |
| 신규: ui_messages 로드 테스트 | DB에서 conversations.ui_messages 조회 검증 |
| 신규: onFinish 저장 테스트 | ui_messages 저장 + 추출 결과 저장 검증 |
| 신규: messageMetadata conversationId 테스트 | 스트리밍 응답에 conversationId 메타데이터 포함 검증 |
| 신규: rate limit 15회/분 테스트 | 기존 rate limit 테스트 값 조정 |
| 신규: 첫 턴 (conversation_id null, ui_messages 없음) | storedUIMessages=[] → LLM에 새 메시지만 → onFinish 저장 검증 |
| 신규: 손상된 ui_messages 방어 | ui_messages가 null/배열 아닌 경우 빈 배열로 폴백 검증 |
| History API 테스트 | conversations.ui_messages 직접 조회로 변경 |

### 5.3 신규 테스트 불필요한 항목

| 항목 | 이유 |
|------|------|
| `convertToModelMessages` | AI SDK 내부 함수. 단위 테스트 불필요 |
| `consumeStream` | AI SDK 내부 메서드. 통합 테스트에서 확인 |

## 6. 규칙 준수 검증

| 규칙 | 준수 | 비고 |
|------|------|------|
| P-2 (Core 불변) | ✅ | core/ 수정 0건 |
| P-4 (Composition Root) | ✅ | chat.ts가 히스토리 로드+변환+조합 수행 |
| P-5 (콜 스택 ≤ 4) | ✅ | route → service → callWithFallback → streamText |
| P-7 (단일 변경점) | ✅ | 히스토리 소스 변경 = chat.ts만. LLM 로직 = service.ts만 |
| R-5 (service import) | ✅ 개선 | core/memory, shared/constants/ai import 제거 |
| L-1 (route thin) | ✅ | 입력 변환 + 조합 = Composition Root 역할 |
| L-21 (API routes = Composition Root) | ✅ | DB 조회 + 변환 + service 조합 |
| Q-1 (zod 검증) | ✅ | chatRequestSchema 변경 |
| Q-14 (스키마 정합성) | ✅ | schema.dbml + migration 동시 수정 |
| Q-15 (비동기 쓰기 격리) | ✅ | onFinish 내부. 실패해도 응답 무영향 |
| G-4 (미사용 코드 금지) | ✅ | service.ts에서 loadRecentMessages 제거 |
| G-15 (수정 전 영향 분석) | ✅ | service.test.ts, chat.test.ts 영향 분석 완료 |
| 보안 | ✅ | 서버 권위적 히스토리. 클라이언트 데이터 신뢰 안 함 |

## 7. 실행 순서

```
① schema.dbml 수정 (ui_messages 컬럼 추가)
② 마이그레이션 작성 (009_add_ui_messages.sql)
③ service.ts 수정 (history 파라미터 추가 + DB 로드 제거)
④ service.test.ts 수정 (파라미터 변경 반영)
⑤ chat.ts POST + GET 동시 수정 (import 제거 원자성 보장. POST: 요청 파싱 + 히스토리 로드 + onFinish + 헤더. GET: ui_messages 직접 조회)
⑥ chat.test.ts 수정 (신규 테스트 추가 + 기존 테스트 변경)
⑦ ChatInterface.tsx 수정 (prepareSendMessagesRequest + conversationId)
⑧ message-persistence-strategy.md §4 갱신 (service.ts 변경 반영)
⑨ api-spec.md rate limit 동기화
⑩ npx tsc --noEmit 확인
⑪ 테스트 실행
```

> POST/GET 동시 수정 이유: `loadRecentMessages`와 `TOKEN_CONFIG` import를 POST에서 제거하면 GET에서 컴파일 에러. 같은 단계에서 GET도 수정하여 원자성 보장.

## 8. 완료 기준

- [ ] conversations.ui_messages 컬럼 존재 (migration + schema.dbml)
- [ ] POST /api/chat: UIMessage 파싱 → DB 히스토리 로드 → convertToModelMessages → streamChat
- [ ] onFinish: UIMessage[] 저장 + 추출 결과 저장 (기존 afterWork 통합)
- [ ] messageMetadata로 conversationId 클라이언트 전달
- [ ] GET /api/chat/history: conversations.ui_messages 직접 반환
- [ ] service.ts: history 파라미터 수신 + DB 로드 제거
- [ ] ChatInterface.tsx: prepareSendMessagesRequest + conversationId 상태 관리
- [ ] rate limit 15회/분 적용 + api-spec.md 동기화
- [ ] 기존 테스트 통과 + 신규 테스트 추가
- [ ] npx tsc --noEmit 통과
- [ ] core/ 수정 0건 확인
