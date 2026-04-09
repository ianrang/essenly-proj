import { describe, it, expect, vi } from "vitest";

vi.mock("client-only", () => ({}));

import { groupParts } from "./group-parts";
import type { ChatMessagePart } from "./card-mapper";

// --- Test fixtures ---

const textPart = { type: "text" as const, text: "Hello" };
const textPart2 = { type: "text" as const, text: "World" };

const productPart = {
  type: "product-card" as const,
  product: { id: "p1" },
  brand: null,
  store: null,
  whyRecommended: undefined,
} as unknown as ChatMessagePart;

const productPart2 = {
  type: "product-card" as const,
  product: { id: "p2" },
  brand: null,
  store: null,
  whyRecommended: undefined,
} as unknown as ChatMessagePart;

const treatmentPart = {
  type: "treatment-card" as const,
  treatment: { id: "t1" },
  clinic: null,
  whyRecommended: undefined,
} as unknown as ChatMessagePart;

const kitCtaPart = {
  type: "kit-cta-card" as const,
  productName: { en: "Kit" },
  highlightBadge: { en: "Special" },
} as unknown as ChatMessagePart;

// --- Tests ---

describe("groupParts", () => {
  it("빈 배열 → 빈 groups", () => {
    expect(groupParts([])).toEqual([]);
  });

  it("text만 → 각각 개별 text group", () => {
    const result = groupParts([textPart, textPart2]);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("text");
    expect(result[1].type).toBe("text");
  });

  it("연속 카드 → 1개 cards group", () => {
    const result = groupParts([productPart, productPart2, treatmentPart]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("cards");
    if (result[0].type === "cards") {
      expect(result[0].cards).toHaveLength(3);
    }
  });

  it("text → cards → text 경계 정확", () => {
    const result = groupParts([textPart, productPart, productPart2, textPart2]);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("text");
    expect(result[1].type).toBe("cards");
    expect(result[2].type).toBe("text");
    if (result[1].type === "cards") {
      expect(result[1].cards).toHaveLength(2);
    }
  });

  it("kit-cta는 standalone으로 분리", () => {
    const result = groupParts([kitCtaPart]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("standalone");
  });

  it("card → kit-cta → card 인터리빙", () => {
    const result = groupParts([productPart, kitCtaPart, treatmentPart]);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("cards");
    expect(result[1].type).toBe("standalone");
    expect(result[2].type).toBe("cards");
    if (result[0].type === "cards") expect(result[0].cards).toHaveLength(1);
    if (result[2].type === "cards") expect(result[2].cards).toHaveLength(1);
  });

  it("text → product → kit-cta → treatment → text 복합 시나리오", () => {
    const result = groupParts([textPart, productPart, kitCtaPart, treatmentPart, textPart2]);
    expect(result).toHaveLength(5);
    expect(result.map((g) => g.type)).toEqual(["text", "cards", "standalone", "cards", "text"]);
  });
});
