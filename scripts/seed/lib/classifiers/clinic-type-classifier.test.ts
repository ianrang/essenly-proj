// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  RegexClinicTypeClassifier,
  defaultClinicTypeClassifier,
  type ClinicTypeClassifier,
} from "./clinic-type-classifier";

// ── Fixture ──────────────────────────────────────────────

function makeData(
  nameKo: string,
  categoryName = "",
): Record<string, unknown> {
  return {
    name: { ko: nameKo, en: "" },
    raw: { category_name: categoryName },
  };
}

// ── RegexClinicTypeClassifier 테스트 ──────────────────────

describe("RegexClinicTypeClassifier", () => {
  const classifier = new RegexClinicTypeClassifier();

  it("피부과 → dermatology", () => {
    expect(classifier.classify(makeData("서울 피부과"))).toBe("dermatology");
  });

  it("dermatology (영문) → dermatology", () => {
    expect(classifier.classify(makeData("Gangnam Dermatology Clinic"))).toBe("dermatology");
  });

  it("피부클리닉 → dermatology", () => {
    expect(classifier.classify(makeData("청담 피부클리닉"))).toBe("dermatology");
  });

  it("성형외과 → plastic_surgery", () => {
    expect(classifier.classify(makeData("강남 성형외과"))).toBe("plastic_surgery");
  });

  it("plastic (영문) → plastic_surgery", () => {
    expect(classifier.classify(makeData("Seoul Plastic Surgery"))).toBe("plastic_surgery");
  });

  it("메드스파 → med_spa", () => {
    expect(classifier.classify(makeData("청담 메드스파"))).toBe("med_spa");
  });

  it("med spa (영문, 공백) → med_spa", () => {
    expect(classifier.classify(makeData("Gangnam Med Spa"))).toBe("med_spa");
  });

  it("에스테틱 → aesthetic", () => {
    expect(classifier.classify(makeData("강남 에스테틱"))).toBe("aesthetic");
  });

  it("피부관리 → aesthetic", () => {
    expect(classifier.classify(makeData("피부관리실 명동점"))).toBe("aesthetic");
  });

  it("미매칭 → null (폴백)", () => {
    expect(classifier.classify(makeData("서울 클리닉"))).toBeNull();
  });

  it("빈 데이터 → null", () => {
    expect(classifier.classify(makeData(""))).toBeNull();
  });

  it("category_name으로 매칭 (name 미매칭 시)", () => {
    const data = makeData("서울 클리닉", "의료,건강 > 피부과");
    expect(classifier.classify(data)).toBe("dermatology");
  });

  it("name 우선 매칭 (category보다 name+category 결합 텍스트)", () => {
    const data = makeData("강남 성형외과", "의료,건강 > 피부과");
    // 결합 텍스트: "강남 성형외과 의료,건강 > 피부과"
    // 피부과 패턴이 dermatology에서 먼저 매칭 (규칙 순서)
    expect(classifier.classify(data)).toBe("dermatology");
  });

  it("name이 문자열인 경우도 처리", () => {
    const data = { name: "강남 피부과", raw: {} };
    expect(classifier.classify(data)).toBe("dermatology");
  });
});

// ── 인터페이스 계약 테스트 ────────────────────────────────

describe("ClinicTypeClassifier interface", () => {
  it("defaultClinicTypeClassifier는 인터페이스 구현체", () => {
    const classifier: ClinicTypeClassifier = defaultClinicTypeClassifier;
    expect(typeof classifier.classify).toBe("function");
  });

  it("classify는 항상 string|null 반환", () => {
    const result = defaultClinicTypeClassifier.classify({});
    expect(result === null || typeof result === "string").toBe(true);
  });
});
