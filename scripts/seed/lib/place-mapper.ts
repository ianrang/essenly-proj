// ============================================================
// Place Mapper — data-collection.md §3.2
// 카카오 RawPlace → classifyPlace(store/clinic) → RawRecord 변환
// + 4단계 중복 제거 (sourceId → placeUrl → 좌표50m → 주소정규화)
// P-9: scripts/ 내부 import만. server/ import 금지.
// P-10: 삭제 시 빌드 에러 0건.
// ============================================================

import type { RawPlace, RawRecord } from "./types";

// ── 상수 (G-10) ────────────────────────────────────────────

/** 서울 위도 기준 50m 근사 (lat) */
const LAT_50M = 0.00045;
/** 서울 위도 기준 50m 근사 (lng) */
const LNG_50M = 0.00056;

// 클리닉/매장 키워드 — P0-33 PoC classifyPlace 계승
const CLINIC_PATTERN =
  /피부과|의원|병원|클리닉|clinic|dermatolog|aesthetic|laser|med.?spa|plastic/i;
const STORE_PATTERN =
  /올리브영|시코르|뷰티|beauty|cosmetic|화장품|drugstore|store|shop|pharmacy|약국/i;

// ── classifyPlace ───────────────────────────────────────────

/**
 * 카카오 카테고리+이름으로 장소 유형 분류.
 * clinic 키워드 우선 (병원이 매장으로 분류되면 안 됨).
 * 미매칭 시 store 기본값 (data-collection.md: 뷰티 매장 검색 결과이므로).
 */
export function classifyPlace(place: RawPlace): "store" | "clinic" {
  const text = `${place.category ?? ""} ${place.name}`;
  if (CLINIC_PATTERN.test(text)) return "clinic";
  if (STORE_PATTERN.test(text)) return "store";
  return "store";
}

// ── RawPlace → RawRecord ────────────────────────────────────

/** RawPlace를 classifyPlace 적용하여 RawRecord로 변환 */
export function mapPlaceToRawRecord(place: RawPlace): RawRecord {
  return {
    source: place.source,
    sourceId: place.sourceId,
    entityType: classifyPlace(place),
    data: {
      name: { ko: place.name, en: place.nameEn ?? "" },
      address: place.address ? { ko: place.address } : undefined,
      location: place.lat != null && place.lng != null
        ? { lat: place.lat, lng: place.lng }
        : undefined,
      phone: place.phone,
      placeUrl: place.placeUrl,
      operatingHours: place.operatingHours,
      rating: place.rating,
      raw: place.raw,
    },
    fetchedAt: new Date().toISOString(),
  };
}

// ── 4단계 중복 제거 ─────────────────────────────────────────

/** 주소 정규화: 공백·구두점 제거 + "서울특별시"→"서울" 등 */
function normalizeAddress(addr: string): string {
  return addr
    .replace(/특별시|광역시|특별자치시|특별자치도/g, "")
    .replace(/[\s,.-]/g, "")
    .toLowerCase();
}

/** 두 좌표가 50m 이내인지 확인 */
function isWithin50m(
  lat1: number | undefined, lng1: number | undefined,
  lat2: number | undefined, lng2: number | undefined,
): boolean {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return false;
  return Math.abs(lat1 - lat2) < LAT_50M && Math.abs(lng1 - lng2) < LNG_50M;
}

/**
 * 4단계 중복 제거 (data-collection.md §3.2).
 * 1차 sourceId는 프로바이더 내부에서 처리됨 → 여기서는 2~4차.
 */
export function deduplicatePlaces(places: RawPlace[]): RawPlace[] {
  const result: RawPlace[] = [];

  for (const place of places) {
    const isDuplicate = result.some((existing) => {
      // 2차: placeUrl 일치
      if (place.placeUrl && existing.placeUrl
        && place.placeUrl === existing.placeUrl) return true;

      // 3차: 이름 동일 + 좌표 50m 이내
      if (place.name === existing.name
        && isWithin50m(place.lat, place.lng, existing.lat, existing.lng)) return true;

      // 4차: 이름 동일 + 주소 정규화 일치
      if (place.name === existing.name
        && place.address && existing.address
        && normalizeAddress(place.address) === normalizeAddress(existing.address)) return true;

      return false;
    });

    if (!isDuplicate) result.push(place);
  }

  return result;
}
