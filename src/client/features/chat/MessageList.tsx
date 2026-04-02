"use client";

import "client-only";

import { useEffect, useRef } from "react";
import type { ChatMessagePart } from "./card-mapper";
import MessageBubble from "./MessageBubble";
import MessageGroup from "./MessageGroup";
import StreamingIndicator from "./StreamingIndicator";
import ProductCard from "@/client/features/cards/ProductCard";
import TreatmentCard from "@/client/features/cards/TreatmentCard";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: ChatMessagePart[];
};

type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  locale: string;
};

export default function MessageList({ messages, isStreaming, locale }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastPartsLength = messages[messages.length - 1]?.parts.length ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming, lastPartsLength]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
      <div className="flex flex-col gap-3">
        {messages.map((msg) => (
          <MessageGroup key={msg.id} role={msg.role}>
            {msg.parts.map((part, idx) => (
              <MessagePart key={`${msg.id}-${idx}`} part={part} role={msg.role} locale={locale} />
            ))}
          </MessageGroup>
        ))}
        {isStreaming && <StreamingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/** 파트 타입별 렌더링 분기 */
function MessagePart({
  part,
  role,
  locale,
}: {
  part: ChatMessagePart;
  role: "user" | "assistant";
  locale: string;
}) {
  switch (part.type) {
    case "text":
      return <MessageBubble role={role}>{part.text}</MessageBubble>;
    case "product-card":
      return (
        <div className="w-full max-w-[85%]">
          <ProductCard
            product={part.product}
            brand={part.brand}
            store={part.store}
            whyRecommended={part.whyRecommended}
            locale={locale}
          />
        </div>
      );
    case "treatment-card":
      return (
        <div className="w-full max-w-[85%]">
          <TreatmentCard
            treatment={part.treatment}
            clinic={part.clinic}
            whyRecommended={part.whyRecommended}
            stayDays={null}
            locale={locale}
          />
        </div>
      );
  }
}
