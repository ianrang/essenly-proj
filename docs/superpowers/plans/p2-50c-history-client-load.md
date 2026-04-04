# P2-50c: Chat 히스토리 클라이언트 로드 + P2-50b 테스트 보강

> 작성: 2026-04-04. 선행: P2-50b 완료.

---

## 1. 목적

1. 재방문/새로고침 시 이전 대화(텍스트 + 카드) 복원 + 대화 이어가기
2. P2-50b 테스트 보강 4건 (onFinish/messageMetadata/손상방어/convertToModelMessages 폴백)

## 2. 전제

| 결정 | 내용 | 근거 |
|------|------|------|
| 로드 방식 | 클라이언트 useEffect fetch (방식 b) | 인증 쿠키 자동 포함. page.tsx 수정 불필요. P-7 |
| 로드 실패 시 | 빈 상태로 새 대화 시작. 에러 미표시 | 자연스러운 폴백 |
| useChat 초기화 | fetch 완료 전 조건부 렌더링으로 useChat 마운트 지연 | initialMessages가 최초 마운트 시에만 유효 |
| 대화방 선택 | MVP 최신 1개만. 목록/전환은 v0.2 | TODO 명시 |

## 3. 파일별 변경

### 3.1 ChatInterface.tsx (수정)

**구조 변경**: 로딩 상태 분리 → fetch 완료 후 채팅 UI 렌더링

```typescript
export default function ChatInterface({ locale }: ChatInterfaceProps) {
  const [loaded, setLoaded] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // 마운트 시 히스토리 로드
  useEffect(() => {
    fetch('/api/chat/history', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (json?.data?.messages?.length) {
          setInitialMessages(json.data.messages);
          setConversationId(json.data.conversation_id);
        }
      })
      .catch(() => {}) // 실패 → 새 대화로 시작
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <ChatSkeleton />; // 로딩 중

  return <ChatContent
    locale={locale}
    initialMessages={initialMessages}
    initialConversationId={conversationId}
  />;
}
```

**ChatContent**: 기존 ChatInterface 로직을 내부 컴포넌트로 추출. useChat 초기화를 fetch 완료 이후로 보장.

```typescript
function ChatContent({ locale, initialMessages, initialConversationId }: {
  locale: string;
  initialMessages: UIMessage[];
  initialConversationId: string | null;
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  // ... 기존 useChat + transport + handleSend 로직 동일
  // useChat({ messages: initialMessages, transport, onFinish })
}
```

**ChatSkeleton**: 간단한 로딩 상태 (메시지 버블 스켈레톤).

### 3.2 chat.test.ts 테스트 보강 (4건)

| # | 테스트 | 검증 내용 |
|---|--------|----------|
| 1 | onFinish 콜백 — UIMessage[] 저장 | mock에서 `opts.onFinish({ messages })` 직접 호출 → DB update 검증 |
| 2 | messageMetadata conversationId | mock에서 `opts.messageMetadata({ part: { type: 'start' } })` 호출 → conversationId 포함 검증 |
| 3 | 손상된 ui_messages 방어 | conversations.ui_messages = "not-array" → 빈 히스토리로 폴백 검증 |
| 4 | convertToModelMessages 실패 폴백 | convertToModelMessages mock throw → 빈 히스토리로 폴백 검증 |

## 4. 수정하지 않는 파일

| 파일 | 이유 |
|------|------|
| chat.ts (서버) | GET/POST 변경 없음. P2-50b에서 완료 |
| service.ts | 변경 없음 |
| card-mapper.ts | 호환 확인 완료. 변경 불필요 |
| MessageList.tsx | 기존 렌더링 로직 그대로 |
| page.tsx | ChatInterface 내부에서 완결. page 수정 불필요 |
| core/ | 수정 0건 |

## 5. 규칙 준수 검증

| 규칙 | 준수 | 비고 |
|------|------|------|
| P-2 (Core 불변) | ✅ | core/ 수정 0건 |
| P-7 (단일 변경점) | ✅ | ChatInterface.tsx만 수정 |
| L-0b (client-only) | ✅ | client-only 유지 |
| L-10 (서버 상태 = API 호출) | ✅ | fetch('/api/chat/history') |
| L-12 (모바일 퍼스트) | ✅ | 스켈레톤도 모바일 레이아웃 |
| Q-5 (컴포넌트 ≤ 200줄) | ✅ | ChatContent 분리로 각각 200줄 이내 |
| G-4 (미사용 코드 금지) | ✅ | |
| R-2 (server → client import 금지) | ✅ | 해당 없음 |

## 6. 실행 순서

```
① ChatInterface.tsx 수정 (로딩 분리 + fetch + ChatContent 추출)
② chat.test.ts 테스트 보강 4건
③ npx tsc --noEmit 확인
④ 테스트 실행
```

## 7. 완료 기준

- [ ] 마운트 시 GET /api/chat/history 호출
- [ ] 히스토리 있으면 useChat({ messages }) → 카드 포함 대화 복원
- [ ] conversationId 초기화 → 이후 메시지에 포함
- [ ] 로드 실패 → 빈 상태로 새 대화 시작
- [ ] 로딩 중 스켈레톤 표시
- [ ] P2-50b 테스트 보강 4건 통과
- [ ] npx tsc --noEmit 통과
- [ ] 전체 테스트 통과
- [ ] core/ 수정 0건
