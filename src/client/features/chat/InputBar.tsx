"use client";

import "client-only";

import { useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/client/ui/primitives/button";

/** textarea 최대 높이 (px) — auto-grow 상한 */
const TEXTAREA_MAX_HEIGHT = 120;

type InputBarProps = {
  onSend: (text: string) => void;
  disabled: boolean;
};

export default function InputBar({ onSend, disabled }: InputBarProps) {
  const t = useTranslations("chat");
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // visualViewport 키보드 감지: 키보드 열림 시 InputBar를 뷰포트에 고정
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function handleResize() {
      const vv = window.visualViewport;
      if (!vv) return;
      // 키보드 높이만큼 하단 오프셋 적용
      const offset = window.innerHeight - vv.height;
      document.documentElement.style.setProperty("--keyboard-offset", `${offset}px`);
    }

    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  }

  return (
    <div
      className="border-t border-border bg-card px-4 py-3"
      style={{ paddingBottom: "max(12px, var(--keyboard-offset, 0px))" }}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            // Auto-grow: overflow hidden으로 리플로우 시 레이아웃 시프트 방지
            const el = e.target;
            el.style.overflow = "hidden";
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
            el.style.overflow = "";
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          disabled={disabled}
          rows={1}
          className="scrollbar-thin flex-1 resize-none rounded-md border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
          style={{ maxHeight: `${TEXTAREA_MAX_HEIGHT}px` }}
        />
        <Button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="shrink-0 self-end px-4 py-2.5"
        >
          {t("send")}
        </Button>
      </div>
    </div>
  );
}
