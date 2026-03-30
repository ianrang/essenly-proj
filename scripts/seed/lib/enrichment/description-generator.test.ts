// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Config mock ─────────────────────────────────────────────

const { mockPipelineEnv } = vi.hoisted(() => ({
  mockPipelineEnv: {
    AI_PROVIDER: "anthropic",
    AI_MODEL: undefined,
  } as Record<string, unknown>,
}));

vi.mock("../../config", () => ({
  pipelineEnv: mockPipelineEnv,
}));

// ── AI SDK mock ─────────────────────────────────────────────

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

// ── @ai-sdk provider mocks ─────────────────────────────────

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn().mockReturnValue("anthropic-model-instance"),
}));

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn().mockReturnValue("google-model-instance"),
}));

import {
  generateDescriptions,
  type GenerationFieldSpec,
  type GenerateResult,
} from "./description-generator";

// ── Fixture ─────────────────────────────────────────────────

const SPEC_DESCRIPTION: GenerationFieldSpec = {
  fieldName: "description",
  promptHint: "Product features, benefits, and key ingredients",
};

const SPEC_REVIEW_SUMMARY: GenerationFieldSpec = {
  fieldName: "review_summary",
  promptHint: "AI-generated review summary highlighting user experience",
  maxLength: 200,
};

const SAMPLE_INPUT = {
  name: "이니스프리 그린티 씨드 세럼",
  category: "skincare",
  brand: "Innisfree",
};

/** 정상 AI 응답 — 단일 필드 */
function createSingleFieldResponse() {
  return {
    text: JSON.stringify({
      description: {
        ko: "이니스프리 그린티 씨드 세럼은 제주 녹차에서 추출한 성분으로 피부에 수분을 공급합니다.",
        en: "Innisfree Green Tea Seed Serum delivers deep hydration with Jeju green tea extract.",
      },
    }),
    usage: { inputTokens: 150, outputTokens: 100 },
  };
}

/** 정상 AI 응답 — 복수 필드 */
function createMultiFieldResponse() {
  return {
    text: JSON.stringify({
      description: {
        ko: "이니스프리 그린티 씨드 세럼은 수분 공급 세럼입니다.",
        en: "Innisfree Green Tea Seed Serum is a hydrating serum.",
      },
      review_summary: {
        ko: "사용자들이 가벼운 텍스처와 빠른 흡수력을 높이 평가합니다.",
        en: "Users praise its lightweight texture and fast absorption.",
      },
    }),
    usage: { inputTokens: 200, outputTokens: 150 },
  };
}

// ── generateDescriptions 테스트 ─────────────────────────────

describe("generateDescriptions", () => {
  beforeEach(() => {
    mockPipelineEnv.AI_PROVIDER = "anthropic";
    mockPipelineEnv.AI_MODEL = undefined;
    mockGenerateText.mockReset();
  });

  it("정상 생성 — 단일 필드 (description)", async () => {
    mockGenerateText.mockResolvedValueOnce(createSingleFieldResponse());

    const result = await generateDescriptions(SAMPLE_INPUT, [
      SPEC_DESCRIPTION,
    ]);

    expect(result.generated.description.ko).toContain("이니스프리");
    expect(result.generated.description.en).toContain("Innisfree");
    expect(result.generatedFields).toEqual(["description"]);
  });

  it("정상 생성 — 복수 필드 (description + review_summary)", async () => {
    mockGenerateText.mockResolvedValueOnce(createMultiFieldResponse());

    const result = await generateDescriptions(SAMPLE_INPUT, [
      SPEC_DESCRIPTION,
      SPEC_REVIEW_SUMMARY,
    ]);

    expect(result.generated.description.ko).toBeTruthy();
    expect(result.generated.description.en).toBeTruthy();
    expect(result.generated.review_summary.ko).toBeTruthy();
    expect(result.generated.review_summary.en).toBeTruthy();
    expect(result.generatedFields).toHaveLength(2);
    expect(result.generatedFields).toContain("description");
    expect(result.generatedFields).toContain("review_summary");
  });

  it("빈 fieldSpecs → 빈 결과, AI 호출 없음", async () => {
    const result = await generateDescriptions(SAMPLE_INPUT, []);

    expect(result.generated).toEqual({});
    expect(result.generatedFields).toEqual([]);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("AI 호출 실패 → 빈 결과", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await generateDescriptions(SAMPLE_INPUT, [
      SPEC_DESCRIPTION,
    ]);

    expect(result.generated.description.ko).toBe("");
    expect(result.generated.description.en).toBe("");
    expect(result.generatedFields).toEqual([]);
  });

  it("AI 응답에 브레이스 없음 → 빈 결과 (jsonMatch null)", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "I cannot generate a description for this product.",
      usage: { inputTokens: 100, outputTokens: 10 },
    });

    const result = await generateDescriptions(SAMPLE_INPUT, [
      SPEC_DESCRIPTION,
    ]);

    expect(result.generated.description.ko).toBe("");
    expect(result.generated.description.en).toBe("");
    expect(result.generatedFields).toEqual([]);
  });

  it("유효하지 않은 JSON → 빈 결과 (JSON.parse catch)", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "{description: not valid json}",
      usage: { inputTokens: 100, outputTokens: 10 },
    });

    const result = await generateDescriptions(SAMPLE_INPUT, [
      SPEC_DESCRIPTION,
    ]);

    expect(result.generated.description.ko).toBe("");
    expect(result.generatedFields).toEqual([]);
  });

  it("AI 응답에 일부 필드 누락 → 해당 필드만 빈 결과", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        description: {
          ko: "설명 텍스트",
          en: "Description text",
        },
        // review_summary 누락
      }),
      usage: { inputTokens: 200, outputTokens: 80 },
    });

    const result = await generateDescriptions(SAMPLE_INPUT, [
      SPEC_DESCRIPTION,
      SPEC_REVIEW_SUMMARY,
    ]);

    expect(result.generated.description.ko).toBe("설명 텍스트");
    expect(result.generated.description.en).toBe("Description text");
    expect(result.generated.review_summary.ko).toBe("");
    expect(result.generated.review_summary.en).toBe("");
    expect(result.generatedFields).toEqual(["description"]);
  });

  it("ko 누락 → ko 빈 문자열 폴백", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        description: {
          en: "English only description",
        },
      }),
      usage: { inputTokens: 100, outputTokens: 40 },
    });

    const result = await generateDescriptions(SAMPLE_INPUT, [
      SPEC_DESCRIPTION,
    ]);

    expect(result.generated.description.ko).toBe("");
    expect(result.generated.description.en).toBe("English only description");
    // en이 있으므로 generatedFields에 포함
    expect(result.generatedFields).toEqual(["description"]);
  });

  it("en 누락 → en 빈 문자열 폴백", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        description: {
          ko: "한국어만 있는 설명",
        },
      }),
      usage: { inputTokens: 100, outputTokens: 40 },
    });

    const result = await generateDescriptions(SAMPLE_INPUT, [
      SPEC_DESCRIPTION,
    ]);

    expect(result.generated.description.ko).toBe("한국어만 있는 설명");
    expect(result.generated.description.en).toBe("");
    expect(result.generatedFields).toEqual(["description"]);
  });

  it("마크다운 코드 펜스 포함 → 정상 파싱", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '```json\n{"description": {"ko": "세럼 설명", "en": "Serum desc"}}\n```',
      usage: { inputTokens: 100, outputTokens: 40 },
    });

    const result = await generateDescriptions(SAMPLE_INPUT, [
      SPEC_DESCRIPTION,
    ]);

    expect(result.generated.description.ko).toBe("세럼 설명");
    expect(result.generated.description.en).toBe("Serum desc");
  });

  it("promptHint가 프롬프트에 포함 검증", async () => {
    mockGenerateText.mockResolvedValueOnce(createSingleFieldResponse());

    await generateDescriptions(SAMPLE_INPUT, [
      {
        fieldName: "review_summary",
        promptHint: "Summarize user reviews highlighting texture and scent",
      },
    ]);

    const calledPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(calledPrompt).toContain(
      "Summarize user reviews highlighting texture and scent",
    );
    expect(calledPrompt).toContain('"review_summary"');
  });

  it("maxLength가 프롬프트에 포함 검증", async () => {
    mockGenerateText.mockResolvedValueOnce(createSingleFieldResponse());

    await generateDescriptions(SAMPLE_INPUT, [
      {
        fieldName: "description",
        promptHint: "Product description",
        maxLength: 300,
      },
    ]);

    const calledPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(calledPrompt).toContain("approximately 300 characters");
  });

  it("inputData 직렬화 — 문자열/배열/숫자/null 처리", async () => {
    mockGenerateText.mockResolvedValueOnce(createSingleFieldResponse());

    await generateDescriptions(
      {
        name: "테스트 세럼",
        ingredients: ["niacinamide", "green tea"],
        price: 25000,
        notes: null,
        extra: undefined,
      },
      [SPEC_DESCRIPTION],
    );

    const calledPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(calledPrompt).toContain("- name: 테스트 세럼");
    expect(calledPrompt).toContain("- ingredients: niacinamide, green tea");
    expect(calledPrompt).toContain("- price: 25000");
    expect(calledPrompt).not.toContain("notes");
    expect(calledPrompt).not.toContain("extra");
  });

  it("ko/en 값이 비문자열 → 빈 문자열 폴백", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        description: { ko: 12345, en: ["not", "a", "string"] },
      }),
      usage: { inputTokens: 100, outputTokens: 40 },
    });

    const result = await generateDescriptions(SAMPLE_INPUT, [
      SPEC_DESCRIPTION,
    ]);

    expect(result.generated.description.ko).toBe("");
    expect(result.generated.description.en).toBe("");
  });
});
