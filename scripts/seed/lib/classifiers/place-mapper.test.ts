// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  classifyPlace,
  mapPlaceToRawRecord,
  deduplicatePlaces,
} from "./place-mapper";
import type { RawPlace } from "../types";

// ── 헬퍼 ──────────────────────────────────────────────────

function makePlace(overrides: Partial<RawPlace> = {}): RawPlace {
  return {
    source: "kakao",
    sourceId: "12345",
    name: "테스트 매장",
    ...overrides,
  };
}

// ── classifyPlace ──────────────────────────────────────────

describe("classifyPlace", () => {
  it("피부과 키워드 → clinic", () => {
    expect(classifyPlace(makePlace({ name: "강남 피부과 클리닉" }))).toBe("clinic");
  });

  it("병원 키워드 → clinic", () => {
    expect(classifyPlace(makePlace({ category: "의료 > 의원" }))).toBe("clinic");
  });

  it("dermatology 영문 → clinic", () => {
    expect(classifyPlace(makePlace({ name: "Seoul Dermatology Center" }))).toBe("clinic");
  });

  it("aesthetic/laser → clinic", () => {
    expect(classifyPlace(makePlace({ name: "Aesthetic Laser Clinic" }))).toBe("clinic");
  });

  it("올리브영 → store", () => {
    expect(classifyPlace(makePlace({ name: "올리브영 강남점" }))).toBe("store");
  });

  it("시코르 → store", () => {
    expect(classifyPlace(makePlace({ name: "시코르 코엑스점" }))).toBe("store");
  });

  it("beauty/cosmetic 영문 → store", () => {
    expect(classifyPlace(makePlace({ name: "K-Beauty Store" }))).toBe("store");
  });

  it("대소문자 무관 (OLIVE YOUNG)", () => {
    expect(classifyPlace(makePlace({ name: "OLIVE YOUNG Gangnam" }))).toBe("store");
  });

  it("모호한 이름 → store 기본값", () => {
    expect(classifyPlace(makePlace({ name: "아모레 퍼시픽 본사" }))).toBe("store");
  });

  it("clinic 키워드 우선 (병원+뷰티 동시 포함)", () => {
    expect(classifyPlace(makePlace({
      name: "뷰티 피부과 의원",
      category: "의료 > 피부과",
    }))).toBe("clinic");
  });
});

// ── mapPlaceToRawRecord ────────────────────────────────────

describe("mapPlaceToRawRecord", () => {
  it("RawPlace → RawRecord 변환 (entityType = classifyPlace 결과)", () => {
    const place = makePlace({ name: "올리브영 강남", sourceId: "99999" });
    const record = mapPlaceToRawRecord(place);

    expect(record.source).toBe("kakao");
    expect(record.sourceId).toBe("99999");
    expect(record.entityType).toBe("store");
    expect((record.data as Record<string, unknown>).name).toEqual({ ko: "올리브영 강남", en: "" });
  });

  it("좌표 포함 시 location 생성", () => {
    const place = makePlace({ lat: 37.4979, lng: 127.0276 });
    const record = mapPlaceToRawRecord(place);

    expect((record.data as Record<string, unknown>).location).toEqual({ lat: 37.4979, lng: 127.0276 });
  });

  it("좌표 미포함 시 location undefined", () => {
    const place = makePlace({});
    const record = mapPlaceToRawRecord(place);

    expect((record.data as Record<string, unknown>).location).toBeUndefined();
  });

  it("clinic 분류 → entityType: clinic", () => {
    const place = makePlace({ name: "강남 피부과" });
    const record = mapPlaceToRawRecord(place);

    expect(record.entityType).toBe("clinic");
  });
});

// ── deduplicatePlaces ──────────────────────────────────────

describe("deduplicatePlaces", () => {
  it("2차: placeUrl 동일 → 1건", () => {
    const places = [
      makePlace({ sourceId: "1", placeUrl: "https://map.kakao.com/123" }),
      makePlace({ sourceId: "2", placeUrl: "https://map.kakao.com/123" }),
    ];
    expect(deduplicatePlaces(places)).toHaveLength(1);
  });

  it("3차: 이름 동일 + 좌표 50m 이내 → 1건", () => {
    const places = [
      makePlace({ sourceId: "1", name: "올리브영", lat: 37.49790, lng: 127.02760 }),
      makePlace({ sourceId: "2", name: "올리브영", lat: 37.49810, lng: 127.02780 }), // ~25m
    ];
    expect(deduplicatePlaces(places)).toHaveLength(1);
  });

  it("3차: 이름 동일 + 좌표 100m → 별개", () => {
    const places = [
      makePlace({ sourceId: "1", name: "올리브영", lat: 37.49790, lng: 127.02760 }),
      makePlace({ sourceId: "2", name: "올리브영", lat: 37.49900, lng: 127.02900 }), // ~150m
    ];
    expect(deduplicatePlaces(places)).toHaveLength(2);
  });

  it("4차: 이름 동일 + 주소 정규화 일치 → 1건", () => {
    const places = [
      makePlace({ sourceId: "1", name: "올리브영", address: "서울특별시 강남구 역삼동" }),
      makePlace({ sourceId: "2", name: "올리브영", address: "서울 강남구 역삼동" }),
    ];
    expect(deduplicatePlaces(places)).toHaveLength(1);
  });

  it("이름이 다르면 좌표 가까워도 별개", () => {
    const places = [
      makePlace({ sourceId: "1", name: "올리브영", lat: 37.49790, lng: 127.02760 }),
      makePlace({ sourceId: "2", name: "시코르", lat: 37.49791, lng: 127.02761 }),
    ];
    expect(deduplicatePlaces(places)).toHaveLength(2);
  });

  it("빈 배열 → 빈 결과", () => {
    expect(deduplicatePlaces([])).toHaveLength(0);
  });

  it("중복 없는 3건 → 3건 유지", () => {
    const places = [
      makePlace({ sourceId: "1", name: "A", placeUrl: "url1" }),
      makePlace({ sourceId: "2", name: "B", placeUrl: "url2" }),
      makePlace({ sourceId: "3", name: "C", placeUrl: "url3" }),
    ];
    expect(deduplicatePlaces(places)).toHaveLength(3);
  });
});
