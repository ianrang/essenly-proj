import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Playwright mock (web-scraper.test.ts 패턴 재사용) ──

const { mockPage, mockBrowser } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
    textContent: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
  };
  return { mockPage, mockBrowser };
});

vi.mock("playwright", () => ({
  chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) },
}));

vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
  fn();
  return 0;
}) as unknown as typeof setTimeout);

import { parseUsdPrice, fetchProductPrice, USD_TO_KRW } from "./oy-parser";
import type { Browser } from "playwright";

describe("parseUsdPrice", () => {
  it("US$28.90 → KRW 변환", () => {
    expect(parseUsdPrice("US$28.90")).toBe(Math.round(28.9 * USD_TO_KRW));
  });

  it("U$12.50 → KRW 변환 (U + $ 형식)", () => {
    expect(parseUsdPrice("U$12.50")).toBe(Math.round(12.5 * USD_TO_KRW));
  });

  it("US$1,234.56 → 콤마 포함 KRW 변환", () => {
    expect(parseUsdPrice("US$1,234.56")).toBe(
      Math.round(1234.56 * USD_TO_KRW),
    );
  });

  it("빈 문자열 → null", () => {
    expect(parseUsdPrice("")).toBeNull();
  });

  it("가격 없는 텍스트 → null", () => {
    expect(parseUsdPrice("가격 없음")).toBeNull();
  });

  it("US$0 → null (0 이하 거부)", () => {
    expect(parseUsdPrice("US$0")).toBeNull();
  });

  it("US$-5 → null (음수 거부)", () => {
    expect(parseUsdPrice("US$-5")).toBeNull();
  });
});

describe("fetchProductPrice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPage.goto.mockResolvedValue(undefined);
    mockPage.close.mockResolvedValue(undefined);
  });

  it("정상 HTML → { price, priceOriginal } 반환", async () => {
    const saleEl = { textContent: vi.fn().mockResolvedValue("US$28.90") };
    const origEl = { textContent: vi.fn().mockResolvedValue("US$35.00") };
    mockPage.$.mockImplementation((sel: string) => {
      if (sel === ".price-info strong") return Promise.resolve(saleEl);
      if (sel === ".price-info > span") return Promise.resolve(origEl);
      return Promise.resolve(null);
    });

    const result = await fetchProductPrice(mockBrowser as unknown as Browser, "https://example.com");

    expect(result).toEqual({
      price: Math.round(28.9 * USD_TO_KRW),
      priceOriginal: Math.round(35.0 * USD_TO_KRW),
    });
    expect(mockPage.close).toHaveBeenCalled();
  });

  it("가격 요소 없는 HTML → null", async () => {
    mockPage.$.mockResolvedValue(null);

    const result = await fetchProductPrice(mockBrowser as unknown as Browser, "https://example.com");

    expect(result).toBeNull();
    expect(mockPage.close).toHaveBeenCalled();
  });

  it("HTTP 에러 → null", async () => {
    mockPage.goto.mockRejectedValue(new Error("net::ERR_CONNECTION_REFUSED"));

    const result = await fetchProductPrice(mockBrowser as unknown as Browser, "https://example.com");

    expect(result).toBeNull();
    expect(mockPage.close).toHaveBeenCalled();
  });
});
