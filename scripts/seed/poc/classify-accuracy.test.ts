// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// ── Config mock (pipelineEnv parse 방지) ────────────────────

vi.mock("../config", () => ({
  pipelineEnv: {
    AI_PROVIDER: "anthropic",
    AI_MODEL: undefined,
  },
}));

vi.mock("../lib/enrichment/ai-client", () => ({
  getPipelineModel: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(),
}));

import {
  jaccardSimilarity,
  evaluateProduct,
  calculateOverallAccuracy,
  extractInputData,
  type ProductResult,
} from "./classify-accuracy";

// ── jaccardSimilarity ───────────────────────────────────────

describe("jaccardSimilarity", () => {
  it("완전 일치 → 1.0", () => {
    expect(jaccardSimilarity(["dry", "oily"], ["dry", "oily"])).toBe(1.0);
  });

  it("부분 일치 → 교집합/합집합", () => {
    // intersection=2, union=3 → 0.667
    const result = jaccardSimilarity(
      ["dry", "oily", "normal"],
      ["dry", "oily"],
    );
    expect(result).toBeCloseTo(2 / 3, 5);
  });

  it("완전 불일치 → 0.0", () => {
    expect(jaccardSimilarity(["dry"], ["oily"])).toBe(0.0);
  });

  it("양쪽 빈 배열 → 1.0", () => {
    expect(jaccardSimilarity([], [])).toBe(1.0);
  });

  it("한쪽만 빈 배열 → 0.0", () => {
    expect(jaccardSimilarity(["dry"], [])).toBe(0.0);
    expect(jaccardSimilarity([], ["oily"])).toBe(0.0);
  });

  it("순서 무관 — 동일 집합", () => {
    expect(
      jaccardSimilarity(["oily", "dry"], ["dry", "oily"]),
    ).toBe(1.0);
  });

  it("중복 원소 — Set으로 처리", () => {
    // predicted에 중복 있어도 Set 변환 후 비교
    expect(
      jaccardSimilarity(["dry", "dry", "oily"], ["dry", "oily"]),
    ).toBe(1.0);
  });
});

// ── evaluateProduct ─────────────────────────────────────────

describe("evaluateProduct", () => {
  it("양 필드 통과 → accurate: true", () => {
    const result = evaluateProduct(
      { skinTypes: ["dry", "oily"], concerns: ["acne", "dryness"] },
      { skinTypes: ["dry", "oily"], concerns: ["acne", "dryness"] },
      0.5,
    );
    expect(result.accurate).toBe(true);
    expect(result.skinTypes.accurate).toBe(true);
    expect(result.concerns.accurate).toBe(true);
  });

  it("skin_types 실패 → accurate: false", () => {
    const result = evaluateProduct(
      { skinTypes: ["sensitive"], concerns: ["acne"] },
      { skinTypes: ["dry", "oily"], concerns: ["acne"] },
      0.5,
    );
    expect(result.skinTypes.accurate).toBe(false);
    expect(result.concerns.accurate).toBe(true);
    expect(result.accurate).toBe(false);
  });

  it("concerns 실패 → accurate: false", () => {
    const result = evaluateProduct(
      { skinTypes: ["dry"], concerns: ["wrinkles"] },
      { skinTypes: ["dry"], concerns: ["acne", "dryness"] },
      0.5,
    );
    expect(result.skinTypes.accurate).toBe(true);
    expect(result.concerns.accurate).toBe(false);
    expect(result.accurate).toBe(false);
  });

  it("높은 similarityThreshold — 부분 일치도 실패", () => {
    const result = evaluateProduct(
      { skinTypes: ["dry", "oily", "normal"], concerns: ["acne"] },
      { skinTypes: ["dry", "oily"], concerns: ["acne"] },
      0.8, // 2/3 = 0.67 < 0.8
    );
    expect(result.skinTypes.accurate).toBe(false);
  });
});

// ── calculateOverallAccuracy ────────────────────────────────

describe("calculateOverallAccuracy", () => {
  function makeResult(accurate: boolean, skinOk = true, concernsOk = true): ProductResult {
    return {
      id: "test",
      name: "test",
      skinTypes: { predicted: [], expected: [], similarity: 0, accurate: skinOk },
      concerns: { predicted: [], expected: [], similarity: 0, accurate: concernsOk },
      accurate,
    };
  }

  it("8/10 정확 → 0.8 PASS (threshold 0.8)", () => {
    const results = [
      ...Array.from({ length: 8 }, () => makeResult(true)),
      ...Array.from({ length: 2 }, () => makeResult(false)),
    ];
    const acc = calculateOverallAccuracy(results, 0.8);
    expect(acc.overall).toBe(0.8);
    expect(acc.passed).toBe(true);
  });

  it("7/10 정확 → 0.7 FAIL (threshold 0.8)", () => {
    const results = [
      ...Array.from({ length: 7 }, () => makeResult(true)),
      ...Array.from({ length: 3 }, () => makeResult(false)),
    ];
    const acc = calculateOverallAccuracy(results, 0.8);
    expect(acc.overall).toBe(0.7);
    expect(acc.passed).toBe(false);
  });

  it("빈 결과 → 0, passed: false", () => {
    const acc = calculateOverallAccuracy([], 0.8);
    expect(acc.overall).toBe(0);
    expect(acc.passed).toBe(false);
  });

  it("skinTypes/concerns 개별 정확도 계산", () => {
    const results = [
      makeResult(false, true, false),  // skin OK, concerns FAIL
      makeResult(false, true, false),  // skin OK, concerns FAIL
      makeResult(true, true, true),    // both OK
    ];
    const acc = calculateOverallAccuracy(results, 0.5);
    expect(acc.skinTypes).toBeCloseTo(3 / 3);
    expect(acc.concerns).toBeCloseTo(1 / 3);
    expect(acc.overall).toBeCloseTo(1 / 3);
  });
});

// ── extractInputData ────────────────────────────────────────

describe("extractInputData", () => {
  it("정답 필드(skin_types, concerns) 제외", () => {
    const product = {
      id: "p001",
      name: { ko: "그린티 세럼", en: "Green Tea Serum" },
      brand_id: "b001",
      category: "skincare",
      subcategory: "serum",
      skin_types: ["dry", "oily"],
      concerns: ["dryness"],
      key_ingredients: ["green tea"],
    };

    const input = extractInputData(product);

    // 정답 필드 미포함
    expect(input).not.toHaveProperty("skin_types");
    expect(input).not.toHaveProperty("concerns");

    // 입력 필드 포함
    expect(input.name_ko).toBe("그린티 세럼");
    expect(input.name_en).toBe("Green Tea Serum");
    expect(input.brand_id).toBe("b001");
    expect(input.category).toBe("skincare");
    expect(input.subcategory).toBe("serum");
    expect(input.key_ingredients).toEqual(["green tea"]);
  });
});
