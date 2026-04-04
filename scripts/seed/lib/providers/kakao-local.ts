// ============================================================
// 카카오 로컬 API 프로바이더 — data-collection.md §3.2, P0-33 PoC 계승
// P-9: scripts/ 내부 import만. server/ import 금지.
// Q-8: process.env 직접 접근 금지 — pipelineEnv 경유.
// ============================================================

import { pipelineEnv } from "../../config";
import { fetchWithRetry } from "../utils/retry";
import type { PlaceProvider, RawPlace, SearchOptions } from "../types";

// ── 상수 (G-10 매직넘버 금지) ──────────────────────────────

/** 카카오 API 제한: 페이지당 최대 15건 */
const PAGE_SIZE = 15;

/** 카카오 API 제한: 최대 45페이지 */
const MAX_PAGES = 45;

/** 카카오 로컬 API 엔드포인트 */
const KAKAO_ENDPOINT =
  "https://dapi.kakao.com/v2/local/search/keyword.json";

// ── 카카오 API 응답 → RawPlace 변환 ────────────────────────

/** 카카오 API document 1건을 RawPlace로 변환 */
export function mapDocumentToRawPlace(
  doc: Record<string, unknown>,
): RawPlace {
  return {
    source: "kakao",
    sourceId: String(doc.id ?? ""),
    name: String(doc.place_name ?? ""),
    category: String(doc.category_name ?? ""),
    address: String(doc.road_address_name || doc.address_name || ""),
    lat: typeof doc.y === "string" ? parseFloat(doc.y) : undefined,
    lng: typeof doc.x === "string" ? parseFloat(doc.x) : undefined,
    phone: doc.phone ? String(doc.phone) : undefined,
    placeUrl: doc.place_url ? String(doc.place_url) : undefined,
    raw: doc,
  };
}

// ── PlaceProvider 구현 ─────────────────────────────────────

export const kakaoLocalProvider: PlaceProvider = {
  name: "kakao",

  isAvailable(): boolean {
    return !!pipelineEnv.KAKAO_API_KEY;
  },

  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<RawPlace[]> {
    const apiKey = pipelineEnv.KAKAO_API_KEY;
    if (!apiKey) {
      throw new Error("KAKAO_API_KEY is not configured");
    }

    const seen = new Map<string, RawPlace>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        query,
        size: String(PAGE_SIZE),
        page: String(page),
      });

      if (options?.lat != null && options?.lng != null) {
        params.set("y", String(options.lat));
        params.set("x", String(options.lng));
        if (options.radius != null) {
          params.set("radius", String(options.radius));
        }
        params.set("sort", "distance");
      }

      const response = await fetchWithRetry(
        `${KAKAO_ENDPOINT}?${params}`,
        { headers: { Authorization: `KakaoAK ${apiKey}` } },
      );

      if (!response.ok) {
        throw new Error(
          `Kakao API error ${response.status}: ${await response.text()}`,
        );
      }

      const data: unknown = await response.json();
      const body = data as {
        documents?: Record<string, unknown>[];
        meta?: { is_end?: boolean };
      };

      const documents = body.documents ?? [];

      for (const doc of documents) {
        const place = mapDocumentToRawPlace(doc);

        // 1차 sourceId dedup (페이지네이션 중 동일 결과 방지)
        if (place.sourceId && !seen.has(place.sourceId)) {
          seen.set(place.sourceId, place);
        }
        // sourceId 없는 비정상 응답은 skip
      }

      // is_end: 마지막 페이지면 종료
      if (body.meta?.is_end !== false) {
        break;
      }
    }

    return [...seen.values()];
  },
};
