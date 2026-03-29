// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("../../config", () => ({
  pipelineEnv: { KAKAO_API_KEY: "test-key-123" },
}));

import { mapDocumentToRawPlace, kakaoLocalProvider } from "./kakao-local";

// ── Fixture: 카카오 API 실제 응답 구조 (P0-33 검증 기반) ────

const FULL_DOCUMENT: Record<string, unknown> = {
  id: "12345678",
  place_name: "올리브영 강남점",
  category_name: "가정,생활 > 화장품",
  road_address_name: "서울특별시 강남구 역삼동 123-45",
  address_name: "서울특별시 강남구 역삼동 123",
  x: "127.0276",
  y: "37.4979",
  phone: "02-1234-5678",
  place_url: "http://place.map.kakao.com/12345678",
};

// ── mapDocumentToRawPlace 테스트 ─────────────────────────────

describe("mapDocumentToRawPlace", () => {
  it("정상 카카오 응답을 RawPlace로 변환", () => {
    const result = mapDocumentToRawPlace(FULL_DOCUMENT);

    expect(result.source).toBe("kakao");
    expect(result.sourceId).toBe("12345678");
    expect(result.name).toBe("올리브영 강남점");
    expect(result.category).toBe("가정,생활 > 화장품");
    expect(result.address).toBe("서울특별시 강남구 역삼동 123-45");
    expect(result.phone).toBe("02-1234-5678");
    expect(result.placeUrl).toBe("http://place.map.kakao.com/12345678");
  });

  it("좌표를 parseFloat로 number 변환", () => {
    const result = mapDocumentToRawPlace(FULL_DOCUMENT);

    expect(result.lat).toBe(37.4979);
    expect(result.lng).toBe(127.0276);
  });

  it("road_address_name 없으면 address_name 폴백", () => {
    const doc = { ...FULL_DOCUMENT, road_address_name: undefined };
    const result = mapDocumentToRawPlace(doc);

    expect(result.address).toBe("서울특별시 강남구 역삼동 123");
  });

  it("road_address_name과 address_name 모두 없으면 빈 문자열", () => {
    const doc = {
      ...FULL_DOCUMENT,
      road_address_name: undefined,
      address_name: undefined,
    };
    const result = mapDocumentToRawPlace(doc);

    expect(result.address).toBe("");
  });

  it("phone 없으면 undefined", () => {
    const doc = { ...FULL_DOCUMENT, phone: undefined };
    const result = mapDocumentToRawPlace(doc);

    expect(result.phone).toBeUndefined();
  });

  it("place_url 없으면 undefined", () => {
    const doc = { ...FULL_DOCUMENT, place_url: undefined };
    const result = mapDocumentToRawPlace(doc);

    expect(result.placeUrl).toBeUndefined();
  });

  it("id 없으면 빈 문자열 sourceId", () => {
    const doc = { ...FULL_DOCUMENT, id: undefined };
    const result = mapDocumentToRawPlace(doc);

    expect(result.sourceId).toBe("");
  });

  it("좌표가 string이 아니면 undefined", () => {
    const doc = { ...FULL_DOCUMENT, x: 127.0276, y: 37.4979 };
    const result = mapDocumentToRawPlace(doc);

    expect(result.lat).toBeUndefined();
    expect(result.lng).toBeUndefined();
  });

  it("raw 필드에 원본 데이터 전체 보존", () => {
    const result = mapDocumentToRawPlace(FULL_DOCUMENT);

    expect(result.raw).toBe(FULL_DOCUMENT);
  });
});

// ── kakaoLocalProvider 테스트 ──────────────────────────────

describe("kakaoLocalProvider", () => {
  it("name이 kakao", () => {
    expect(kakaoLocalProvider.name).toBe("kakao");
  });

  it("KAKAO_API_KEY 있으면 isAvailable() = true", () => {
    expect(kakaoLocalProvider.isAvailable()).toBe(true);
  });
});
