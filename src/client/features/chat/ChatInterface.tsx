"use client";

import "client-only";

import { useState, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useTranslations } from "next-intl";
import { mapUIMessageToParts, type UIPartLike } from "./card-mapper";
import MessageList from "./MessageList";
import MessageBubble from "./MessageBubble";
import InputBar from "./InputBar";
import SuggestedQuestions from "./SuggestedQuestions";

// ============================================================
// ChatInterface — P2-50c: 마운트 시 히스토리 로드 + 카드 복원
// L-0b: client-only guard. L-10: 서버 상태 = API 호출.
// 구조: ChatInterface(로딩) → ChatContent(채팅 UI)
//   fetch 완료 후 ChatContent 마운트 → useChat({ messages })
// ============================================================

type ChatInterfaceProps = {
  locale: string;
};

/** 히스토리 로드 응답 타입 */
interface HistoryResponse {
  data: {
    messages: UIMessage[];
    conversation_id: string | null;
  };
}

export default function ChatInterface({ locale }: ChatInterfaceProps) {
  const [loaded, setLoaded] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);

  // P2-50c: 마운트 시 히스토리 로드 (L-10: 서버 상태 = API 호출)
  useEffect(() => {
    fetch("/api/chat/history", { credentials: "include" })
      .then((res) => (res.ok ? (res.json() as Promise<HistoryResponse>) : null))
      .then((json) => {
        if (json?.data?.messages && Array.isArray(json.data.messages) && json.data.messages.length > 0) {
          setInitialMessages(json.data.messages);
          setInitialConversationId(json.data.conversation_id);
        }
      })
      .catch(() => {
        // 로드 실패 → 새 대화로 시작 (자연스러운 폴백)
      })
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) {
    return <ChatSkeleton />;
  }

  return (
    <ChatContent
      locale={locale}
      initialMessages={initialMessages}
      initialConversationId={initialConversationId}
    />
  );
}

// ── ChatSkeleton ──────────────────────────────────────────────

function ChatSkeleton() {
  return (
    <div className="-mx-5 flex h-[calc(100dvh-52px)] flex-col">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-3">
            <div className="h-16 w-3/4 animate-pulse rounded-2xl bg-muted" />
            <div className="h-10 w-1/2 animate-pulse rounded-2xl bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ChatContent ───────────────────────────────────────────────

type ChatContentProps = {
  locale: string;
  initialMessages: UIMessage[];
  initialConversationId: string | null;
};

function ChatContent({ locale, initialMessages, initialConversationId }: ChatContentProps) {
  const t = useTranslations("chat");
  const [showSuggestions, setShowSuggestions] = useState(
    initialMessages.length === 0
  );
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        credentials: "include",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            message: messages[messages.length - 1],
            conversation_id: conversationId,
          },
        }),
      }),
    [conversationId]
  );

  // AI SDK 6.x: messages prop = 초기 메시지 (최초 마운트 시에만 유효)
  const { messages, status, error, sendMessage } = useChat({
    messages: initialMessages,
    transport,
    onFinish: ({ message }) => {
      // P2-50b: messageMetadata에서 conversationId 추출
      const meta = message.metadata as
        | { conversationId?: string }
        | undefined;
      if (meta?.conversationId && !conversationId) {
        setConversationId(meta.conversationId);
      }
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";

  // 메시지가 전송되면 제안 질문 숨김
  useEffect(() => {
    if (messages.length > 0) setShowSuggestions(false);
  }, [messages.length]);

  function handleSend(text: string) {
    sendMessage({ text });
  }

  // UIMessage.parts → ChatMessagePart[] 변환
  const chatMessages = messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: mapUIMessageToParts(m.parts as UIPartLike[]),
  }));

  return (
    <div className="-mx-5 flex h-[calc(100dvh-52px)] flex-col">
      <div className="flex flex-1 flex-col overflow-hidden">
        {chatMessages.length === 0 ? (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-3">
              <MessageBubble role="assistant">
                {t("greeting")}
              </MessageBubble>
              {showSuggestions && (
                <SuggestedQuestions onSelect={handleSend} />
              )}
            </div>
          </div>
        ) : (
          <MessageList messages={chatMessages} isStreaming={isStreaming} locale={locale} />
        )}

        {error && (
          <div className="px-4 py-2">
            <p className="text-center text-xs text-destructive">
              {t("errorRetry")}
            </p>
          </div>
        )}

        <InputBar onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}
