// ============================================================
// 파이프라인 공통 재시도 유틸 — data-pipeline.md §3.4.3
// 모든 프로바이더 + loader가 공유. 정책 변경 시 이 파일만 수정.
// ============================================================

// ── 재시도 상수 (data-pipeline.md §3.4.3) ──────────────────

/** 최대 재시도 횟수 */
export const MAX_RETRIES = 3;

/** 재시도 기본 대기 ms (지수 백오프: 1s → 2s → 4s) */
export const RETRY_BASE_MS = 1000;

// ── fetchWithRetry ─────────────────────────────────────────

/**
 * 지수 백오프 재시도 fetch.
 * 재시도 대상: 네트워크 에러, 5xx, 429.
 * 재시도 비대상: 4xx (403 키 무효 등).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);

      // 성공 또는 재시도 비대상 (4xx 중 429 제외)
      if (
        response.ok ||
        (response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429)
      ) {
        return response;
      }

      // 429 또는 5xx → 마지막 시도가 아니면 대기 후 재시도
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // 마지막 시도에서도 실패 → 응답 반환 (호출자가 에러 처리)
      return response;
    } catch (err) {
      // 네트워크 에러 (타임아웃, DNS 실패 등)
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }

  // 모든 재시도 실패 (네트워크 에러만 여기 도달)
  throw lastError ?? new Error("fetchWithRetry: all retries exhausted");
}
