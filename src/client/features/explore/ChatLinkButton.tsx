"use client";

import "client-only";

import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Button } from "@/client/ui/primitives/button";

type ChatLinkButtonProps = {
  locale: string;
};

export default function ChatLinkButton({ locale }: ChatLinkButtonProps) {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => router.push(`/${locale}/chat`)}
      aria-label="Chat with AI"
    >
      <MessageCircle className="size-5" />
    </Button>
  );
}
