// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Config mock ────────────────────────────────────────────

const { mockPipelineEnv } = vi.hoisted(() => ({
  mockPipelineEnv: {
    KAKAO_API_KEY: "test-kakao-key",
    MFDS_SERVICE_KEY: "test-mfds-key",
    COSING_CSV_PATH: "./data/cosing.csv",
    PIPELINE_BATCH_SIZE: 100,
    AI_PROVIDER: "google",
    NODE_ENV: "test",
  } as Record<string, unknown>,
}));

vi.mock("../config", () => ({
  pipelineEnv: mockPipelineEnv,
}));

// ── fs mock ────────────────────────────────────────────────

const { mockWriteFileSync } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  writeFileSync: mockWriteFileSync,
  readFileSync: vi.fn(),
}));

// ── Provider mocks ─────────────────────────────────────────

const { mockKakaoSearch, mockKakaoIsAvailable } = vi.hoisted(() => ({
  mockKakaoSearch: vi.fn(),
  mockKakaoIsAvailable: vi.fn().mockReturnValue(true),
}));

vi.mock("./providers/kakao-local", () => ({
  kakaoLocalProvider: {
    name: "kakao",
    isAvailable: mockKakaoIsAvailable,
    search: mockKakaoSearch,
  },
}));

const { mockFetchIngredients } = vi.hoisted(() => ({
  mockFetchIngredients: vi.fn(),
}));

vi.mock("./providers/mfds-ingredient", () => ({
  fetchAllMfdsIngredients: mockFetchIngredients,
}));

const { mockFetchRestricted } = vi.hoisted(() => ({
  mockFetchRestricted: vi.fn(),
}));

vi.mock("./providers/mfds-restricted", () => ({
  fetchAllMfdsRestricted: mockFetchRestricted,
}));

const { mockLoadCosIng } = vi.hoisted(() => ({
  mockLoadCosIng: vi.fn().mockReturnValue([]),
}));

vi.mock("./providers/cosing-csv", () => ({
  loadCosIngIngredients: mockLoadCosIng,
}));

const { mockScrapeProducts } = vi.hoisted(() => ({
  mockScrapeProducts: vi.fn().mockResolvedValue([]),
}));

vi.mock("./providers/web-scraper", () => ({
  scrapeProducts: mockScrapeProducts,
}));

const { mockLoadCsv } = vi.hoisted(() => ({
  mockLoadCsv: vi.fn().mockReturnValue([]),
}));

vi.mock("./providers/csv-loader", () => ({
  loadCsvAsRawRecords: mockLoadCsv,
}));

// ── place-mapper는 실제 사용 (순수 함수) ────────────────────

// ── imports ────────────────────────────────────────────────

import { fetchAllRecords } from "./fetch-service";
import type { RawPlace, RawRecord } from "./types";

// ── 헬퍼 ──────────────────────────────────────────────────

function makeRawPlace(overrides: Partial<RawPlace> = {}): RawPlace {
  return {
    source: "kakao",
    sourceId: "12345",
    name: "올리브영 강남점",
    category: "가정,생활 > 화장품",
    address: "서울 강남구 역삼동",
    lat: 37.4979,
    lng: 127.0276,
    ...overrides,
  };
}

function makeRawRecord(overrides: Partial<RawRecord> = {}): RawRecord {
  return {
    source: "test",
    sourceId: "test-001",
    entityType: "ingredient",
    data: {},
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── fetchAllRecords ────────────────────────────────────────

describe("fetchAllRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKakaoIsAvailable.mockReturnValue(true);
    mockFetchIngredients.mockResolvedValue([]);
    mockFetchRestricted.mockResolvedValue([]);
    mockLoadCosIng.mockReturnValue([]);
    mockScrapeProducts.mockResolvedValue([]);
    mockLoadCsv.mockReturnValue([]);
    mockPipelineEnv.KAKAO_API_KEY = "test-kakao-key";
    mockPipelineEnv.MFDS_SERVICE_KEY = "test-mfds-key";
  });

  // ── places ──

  it("places 수집: 카카오 → classifyPlace 적용 → RawRecord", async () => {
    mockKakaoSearch.mockResolvedValue([
      makeRawPlace({ name: "올리브영 강남", sourceId: "1" }),
    ]);

    const { records } = await fetchAllRecords({
      targets: ["places"],
      placeQueries: [{ query: "강남 뷰티" }],
      logDir: "/tmp",
    });

    expect(records).toHaveLength(1);
    expect(records[0].entityType).toBe("store");
    expect(records[0].source).toBe("kakao");
  });

  it("places 수집: 피부과 → clinic 분류", async () => {
    mockKakaoSearch.mockResolvedValue([
      makeRawPlace({ name: "강남 피부과", sourceId: "2", category: "의료" }),
    ]);

    const { records } = await fetchAllRecords({
      targets: ["places"],
      placeQueries: [{ query: "강남 피부과" }],
      logDir: "/tmp",
    });

    expect(records[0].entityType).toBe("clinic");
  });

  it("kakao isAvailable=false → places 스킵", async () => {
    mockKakaoIsAvailable.mockReturnValue(false);

    const { records } = await fetchAllRecords({
      targets: ["places"],
      placeQueries: [{ query: "test" }],
      logDir: "/tmp",
    });

    expect(records).toHaveLength(0);
    expect(mockKakaoSearch).not.toHaveBeenCalled();
  });

  it("placeQueries 미지정 → places 스킵", async () => {
    const { records } = await fetchAllRecords({
      targets: ["places"],
      logDir: "/tmp",
    });

    expect(records).toHaveLength(0);
  });

  // ── ingredients ──

  it("ingredients 수집: S3 + S6 + S4 합병", async () => {
    mockFetchIngredients.mockResolvedValue([
      makeRawRecord({
        source: "mfds-ingredient",
        sourceId: "나이아신아마이드",
        entityType: "ingredient",
        data: { INGR_KOR_NAME: "나이아신아마이드", INGR_ENG_NAME: "Niacinamide" },
      }),
    ]);

    mockLoadCosIng.mockReturnValue([
      makeRawRecord({
        source: "cosing",
        sourceId: "Niacinamide",
        entityType: "ingredient",
        data: { "INCI name": "Niacinamide", Function: "SKIN CONDITIONING" },
      }),
    ]);

    mockFetchRestricted.mockResolvedValue([
      makeRawRecord({
        source: "mfds-restricted",
        sourceId: "Niacinamide:Korea",
        entityType: "ingredient",
        data: { INGR_ENG_NAME: "Niacinamide", COUNTRY_NAME: "Korea", REGULATE_TYPE: "RESTRICTED" },
      }),
    ]);

    const { records } = await fetchAllRecords({
      targets: ["ingredients"],
      logDir: "/tmp",
    });

    expect(records).toHaveLength(1);
    const data = records[0].data as Record<string, unknown>;
    expect(data._cosing).toBeDefined();
    expect((data._cosing as Record<string, unknown>).function).toBe("SKIN CONDITIONING");
    expect(data._restricted).toBeDefined();
    expect((data._restricted as Record<string, unknown>[])[0].REGULATE_TYPE).toBe("RESTRICTED");
  });

  it("S3↔S6 매칭 실패(영어명 불일치) → S3 단독 보존", async () => {
    mockFetchIngredients.mockResolvedValue([
      makeRawRecord({
        source: "mfds-ingredient",
        sourceId: "특수원료",
        entityType: "ingredient",
        data: { INGR_KOR_NAME: "특수원료", INGR_ENG_NAME: "SpecialIngredient" },
      }),
    ]);
    mockLoadCosIng.mockReturnValue([
      makeRawRecord({
        source: "cosing",
        sourceId: "DifferentName",
        entityType: "ingredient",
        data: { "INCI name": "DifferentName", Function: "MOISTURIZING" },
      }),
    ]);

    const { records } = await fetchAllRecords({
      targets: ["ingredients"],
      logDir: "/tmp",
    });

    expect(records).toHaveLength(1);
    expect((records[0].data as Record<string, unknown>)._cosing).toBeUndefined();
  });

  // ── products ──

  it("products 수집: scrapeProducts 호출", async () => {
    mockScrapeProducts.mockResolvedValue([
      makeRawRecord({ source: "scraper-brand", entityType: "product" }),
    ]);

    const { records } = await fetchAllRecords({
      targets: ["products"],
      logDir: "/tmp",
    });

    expect(records).toHaveLength(1);
    expect(records[0].source).toBe("scraper-brand");
  });

  // ── CSV ──

  it("CSV 수집: loadCsvAsRawRecords 호출", async () => {
    mockLoadCsv.mockReturnValue([
      makeRawRecord({ source: "csv", entityType: "product" }),
    ]);

    const { records } = await fetchAllRecords({
      csvFiles: [{ path: "/tmp/test.csv", entityType: "product" }],
      logDir: "/tmp",
    });

    expect(mockLoadCsv).toHaveBeenCalledWith("/tmp/test.csv", "product");
    expect(records).toHaveLength(1);
  });

  // ── 에러 격리 ──

  it("Promise.allSettled: 카카오 에러 → PipelineError 기록 + 나머지 정상", async () => {
    mockKakaoSearch.mockRejectedValue(new Error("API timeout"));

    const { records, result } = await fetchAllRecords({
      targets: ["places"],
      placeQueries: [{ query: "test" }],
      logDir: "/tmp",
    });

    expect(records).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("kakao");
  });

  it("S3 에러 → S6/S4 정상 수집 + PipelineError", async () => {
    mockFetchIngredients.mockRejectedValue(new Error("S3 timeout"));
    mockLoadCosIng.mockReturnValue([
      makeRawRecord({ source: "cosing", entityType: "ingredient" }),
    ]);

    const { result } = await fetchAllRecords({
      targets: ["ingredients"],
      logDir: "/tmp",
    });

    expect(result.errors.some((e) => e.message.includes("S3"))).toBe(true);
  });

  it("web scraper 에러 → PipelineError 기록", async () => {
    mockScrapeProducts.mockRejectedValue(new Error("browser crash"));

    const { records, result } = await fetchAllRecords({
      targets: ["products"],
      logDir: "/tmp",
    });

    expect(records).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("web scraper");
  });

  it("CSV 에러 → 해당 파일 스킵 + PipelineError", async () => {
    mockLoadCsv.mockImplementation(() => {
      throw new Error("file not found");
    });

    const { records, result } = await fetchAllRecords({
      csvFiles: [{ path: "/tmp/missing.csv", entityType: "product" }],
      logDir: "/tmp",
    });

    expect(records).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("CSV");
  });

  // ── targets 필터 ──

  it("targets: ingredients만 → places/products 미호출", async () => {
    const { records } = await fetchAllRecords({
      targets: ["ingredients"],
      logDir: "/tmp",
    });

    expect(mockKakaoSearch).not.toHaveBeenCalled();
    expect(mockScrapeProducts).not.toHaveBeenCalled();
    expect(records).toHaveLength(0); // mock 빈 배열
  });

  // ── 로그 ──

  it("결과 JSON 로그 저장", async () => {
    await fetchAllRecords({ logDir: "/tmp/logs" });

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [path] = mockWriteFileSync.mock.calls[0];
    expect(path).toContain("/tmp/logs/fetch-");
  });
});
