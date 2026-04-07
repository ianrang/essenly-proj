// ============================================================
// 식약처 화장품 원료성분정보 API (S3) — data-collection.md §3.4
// ingredients 1순위 소스. 전체 풀 다운로드 → RawRecord[].
// P-9: scripts/ 내부 import만. server/ import 금지.
// Q-8: process.env 직접 접근 금지 — pipelineEnv 경유.
// ============================================================

import { pipelineEnv } from "../../config";
import { fetchWithRetry } from "../utils/retry";
import type { RawRecord } from "../types";

// ── 상수 (G-10 매직넘버 금지) ──────────────────────────────

/** 페이지당 요청 건수 */
const PAGE_SIZE = 100;

/** S3 API 엔드포인트 (P2-V2 검증 완료 2026-03-25) */
const MFDS_INGREDIENT_ENDPOINT =
  "https://apis.data.go.kr/1471000/CsmtcsIngdCpntInfoService01/getCsmtcsIngdCpntInfoService01";

// ── API 응답 → RawRecord 변환 ─────────────────────────────

/** S3 API item 1건을 RawRecord로 변환 */
export function mapItemToRawRecord(
  item: Record<string, unknown>,
): RawRecord {
  return {
    source: "mfds-ingredient",
    sourceId: String(item.INGR_KOR_NAME ?? ""),
    entityType: "ingredient",
    data: item,
    fetchedAt: new Date().toISOString(),
  };
}

// ── 전체 풀 다운로드 ──────────────────────────────────────

/** S3 전체 원료성분 다운로드 → RawRecord[] */
export async function fetchAllMfdsIngredients(): Promise<RawRecord[]> {
  const serviceKey = pipelineEnv.MFDS_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("MFDS_SERVICE_KEY is not configured");
  }

  const seen = new Map<string, RawRecord>();
  let fetched = 0;

  for (let pageNo = 1; ; pageNo++) {
    const params = new URLSearchParams({
      serviceKey,
      type: "json",
      numOfRows: String(PAGE_SIZE),
      pageNo: String(pageNo),
    });

    const response = await fetchWithRetry(
      `${MFDS_INGREDIENT_ENDPOINT}?${params}`,
      {},
    );

    if (!response.ok) {
      throw new Error(
        `MFDS S3 API error ${response.status}: ${await response.text()}`,
      );
    }

    const data: unknown = await response.json();
    const body = (data as Record<string, unknown>).body as
      | { totalCount?: number; items?: unknown }
      | undefined;

    // items 구조 방어: { item: [...] } 또는 직접 배열
    const rawItems = body?.items;
    const items: Record<string, unknown>[] = Array.isArray(rawItems)
      ? rawItems
      : Array.isArray((rawItems as Record<string, unknown> | undefined)?.item)
        ? ((rawItems as Record<string, unknown>).item as Record<string, unknown>[])
        : [];

    for (const item of items) {
      const record = mapItemToRawRecord(item);
      if (record.sourceId && !seen.has(record.sourceId)) {
        seen.set(record.sourceId, record);
      }
    }

    fetched += items.length;

    // 종료: totalCount 도달 또는 빈 페이지
    const totalCount = body?.totalCount ?? 0;
    if (items.length === 0 || fetched >= totalCount) {
      break;
    }
  }

  return [...seen.values()];
}
