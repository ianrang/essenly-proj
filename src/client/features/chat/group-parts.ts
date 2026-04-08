import "client-only";

import type { ChatMessagePart } from "./card-mapper";

// ============================================================
// 카드 파트 그룹화 유틸 — P2-94
// 연속된 product/treatment 카드를 가로 스크롤 그룹으로 묶고,
// kit-cta-card는 standalone으로 분리.
// 순수 함수: 부작용 없음. DB/API 호출 없음.
// ============================================================

/** 가로 스크롤 대상 카드 타입 (kit-cta-card 제외 — CTA는 전체 폭) */
const SCROLL_CARD_TYPES = ["product-card", "treatment-card"] as const;

function isScrollCard(part: ChatMessagePart): boolean {
  return (SCROLL_CARD_TYPES as readonly string[]).includes(part.type);
}

export type PartGroup =
  | { type: "text"; part: { type: "text"; text: string } }
  | { type: "cards"; cards: ChatMessagePart[] }
  | { type: "standalone"; part: ChatMessagePart };

/** parts 배열에서 연속 product/treatment 카드를 그룹화. kit-cta는 standalone. */
export function groupParts(parts: ChatMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  let cardBuffer: ChatMessagePart[] = [];

  function flushCards() {
    if (cardBuffer.length > 0) {
      groups.push({ type: "cards", cards: [...cardBuffer] });
      cardBuffer = [];
    }
  }

  for (const part of parts) {
    if (part.type === "text") {
      flushCards();
      groups.push({ type: "text", part });
    } else if (isScrollCard(part)) {
      cardBuffer.push(part);
    } else {
      flushCards();
      groups.push({ type: "standalone", part });
    }
  }
  flushCards();

  return groups;
}

/** 카드 파트에서 안정적인 React key 추출 */
export function cardKey(part: ChatMessagePart): string {
  if (part.type === "product-card") return part.product.id;
  if (part.type === "treatment-card") return part.treatment.id;
  return part.type;
}
