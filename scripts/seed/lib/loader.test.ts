// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Config mock (pipelineEnv parse 방지) ────────────────────

const { mockPipelineEnv } = vi.hoisted(() => ({
  mockPipelineEnv: {
    PIPELINE_BATCH_SIZE: 100,
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
    AI_PROVIDER: "google",
    NODE_ENV: "test",
  } as Record<string, unknown>,
}));

vi.mock("../config", () => ({
  pipelineEnv: mockPipelineEnv,
}));

// ── fs mock (로그 파일 기록 검증) ──────────────────────────

const { mockWriteFileSync } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  writeFileSync: mockWriteFileSync,
  readFileSync: vi.fn(),
}));

// ── Supabase mock ──────────────────────────────────────────

function createMockClient(overrides?: {
  upsertError?: { message: string } | null;
  insertError?: { message: string } | null;
}) {
  const upsertFn = vi.fn().mockResolvedValue({
    data: null,
    error: overrides?.upsertError ?? null,
  });
  const insertFn = vi.fn().mockResolvedValue({
    data: null,
    error: overrides?.insertError ?? null,
  });

  const fromFn = vi.fn().mockReturnValue({
    upsert: upsertFn,
    insert: insertFn,
  });

  return {
    from: fromFn,
    _upsert: upsertFn,
    _insert: insertFn,
  };
}

// ── imports ────────────────────────────────────────────────

import { loadRecords, loadJunctions } from "./loader";
import { generateEntityId } from "./utils/id-generator";
import type { ValidatedRecord } from "./types";

// ── 헬퍼 ──────────────────────────────────────────────────

function makeRecord(
  entityType: string,
  data: Record<string, unknown>,
  isApproved = true,
): ValidatedRecord {
  return {
    entityType: entityType as ValidatedRecord["entityType"],
    data,
    isApproved,
  };
}

// uuid v5 생성 유효 UUID (id-generator 기반)
const BRAND_ID = "96b844c3-5fcd-5a85-9adf-cd5903e5e85d";
const PRODUCT_ID = "4be39897-d386-5cd1-ab64-7ef417acd865";
const STORE_ID = "671813ac-7107-5240-8f9e-c49e4ea1b32b";
const CLINIC_ID = "530aa74e-3093-5d5c-8f30-1082ac9062f3";
const INGREDIENT_ID = "837f5e51-b7b9-52be-9115-67e6a91fad44";
const validBrand = {
  id: BRAND_ID,
  name: { ko: "이니스프리", en: "Innisfree" },
  status: "active",
};

const validProduct = {
  id: PRODUCT_ID,
  name: { ko: "세럼", en: "Serum" },
  category: "skincare",
  brand_id: BRAND_ID,
  status: "active",
};

const validStore = {
  id: STORE_ID,
  name: { ko: "올리브영", en: "Olive Young" },
  status: "active",
};

// ── loadRecords ────────────────────────────────────────────

describe("loadRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("유효 레코드 → upsert 호출", async () => {
    const mock = createMockClient();
    const records = [makeRecord("brand", validBrand)];

    const results = await loadRecords(mock as never, records, {
      logDir: "/tmp",
    });

    expect(mock.from).toHaveBeenCalledWith("brands");
    expect(mock._upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ id: validBrand.id, name: validBrand.name })],
      { onConflict: "id" },
    );
    expect(results[0].inserted).toBe(1);
    expect(results[0].failed).toBe(0);
  });

  it("zod 검증 실패 레코드 → 스킵 + PipelineError", async () => {
    const mock = createMockClient();
    const invalidData = { name: "not-localized" }; // localizedTextRequired 위반
    const records = [makeRecord("brand", invalidData)];

    const results = await loadRecords(mock as never, records, {
      logDir: "/tmp",
    });

    expect(mock._upsert).not.toHaveBeenCalled();
    expect(results[0].failed).toBe(1);
    expect(results[0].errors.length).toBeGreaterThan(0);
    expect(results[0].errors[0].stage).toBe("load-validate");
  });

  it("isApproved=false → 적재 제외", async () => {
    const mock = createMockClient();
    const records = [makeRecord("brand", validBrand, false)];

    const results = await loadRecords(mock as never, records, {
      logDir: "/tmp",
    });

    expect(results).toHaveLength(0);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("FK 순서: Phase A(brand) → Phase B(product)", async () => {
    const mock = createMockClient();
    // product를 먼저 넣어도 loader가 brand 먼저 적재
    const records = [
      makeRecord("product", validProduct),
      makeRecord("brand", validBrand),
    ];

    await loadRecords(mock as never, records, { logDir: "/tmp" });

    const fromCalls = mock.from.mock.calls.map(
      (c: unknown[]) => c[0],
    );
    const brandIdx = fromCalls.indexOf("brands");
    const productIdx = fromCalls.indexOf("products");
    expect(brandIdx).toBeLessThan(productIdx);
  });

  it("청크 분할: 250건 → 3청크(100+100+50)", async () => {
    const mock = createMockClient();
    const records = Array.from({ length: 250 }, (_, i) => {
      return makeRecord("brand", {
        ...validBrand,
        id: generateEntityId("brand", "csv", `brand-${i}`),
      });
    });

    await loadRecords(mock as never, records, { logDir: "/tmp" });

    expect(mock._upsert).toHaveBeenCalledTimes(3);
    expect(mock._upsert.mock.calls[0][0]).toHaveLength(100);
    expect(mock._upsert.mock.calls[1][0]).toHaveLength(100);
    expect(mock._upsert.mock.calls[2][0]).toHaveLength(50);
  });

  it("청크 실패 격리: 2번째 실패 → 1,3번째 유지", async () => {
    const upsertFn = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "chunk-2 error" },
      })
      .mockResolvedValueOnce({ data: null, error: null });

    const mock = {
      from: vi.fn().mockReturnValue({ upsert: upsertFn, insert: vi.fn() }),
    };

    const records = Array.from({ length: 250 }, (_, i) =>
      makeRecord("brand", {
        ...validBrand,
        id: generateEntityId("brand", "csv", `brand-${i}`),
      }),
    );

    const results = await loadRecords(mock as never, records, {
      logDir: "/tmp",
    });

    // 1번(100) + 3번(50) 성공 = 150, 2번 실패(100)
    expect(results[0].inserted).toBe(150);
    expect(results[0].failed).toBe(100);
    expect(results[0].errors).toHaveLength(1);
    expect(results[0].errors[0].message).toBe("chunk-2 error");
  });

  it("빈 레코드 → 빈 결과, 에러 없음", async () => {
    const mock = createMockClient();
    const results = await loadRecords(mock as never, [], { logDir: "/tmp" });

    expect(results).toHaveLength(0);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("entityTypes 필터: brand만 지정 → product 제외", async () => {
    const mock = createMockClient();
    const records = [
      makeRecord("brand", validBrand),
      makeRecord("product", validProduct),
    ];

    const results = await loadRecords(mock as never, records, {
      entityTypes: ["brand"],
      logDir: "/tmp",
    });

    expect(results).toHaveLength(1);
    expect(results[0].entityType).toBe("brand");
  });

  it("dryRun: DB 호출 0건, 검증 결과만 반환", async () => {
    const mock = createMockClient();
    const records = [makeRecord("brand", validBrand)];

    const results = await loadRecords(mock as never, records, {
      dryRun: true,
      logDir: "/tmp",
    });

    expect(mock.from).not.toHaveBeenCalled();
    expect(results[0].total).toBe(1);
    expect(results[0].inserted).toBe(0);
  });

  it("insertOnly: .insert() 호출, .upsert() 미호출", async () => {
    const mock = createMockClient();
    const records = [makeRecord("brand", validBrand)];

    await loadRecords(mock as never, records, {
      insertOnly: true,
      logDir: "/tmp",
    });

    expect(mock._insert).toHaveBeenCalled();
    expect(mock._upsert).not.toHaveBeenCalled();
  });

  it("batchSize 오버라이드: 50건씩 분할", async () => {
    const mock = createMockClient();
    const records = Array.from({ length: 120 }, (_, i) =>
      makeRecord("brand", {
        ...validBrand,
        id: generateEntityId("brand", "csv", `brand-${i}`),
      }),
    );

    await loadRecords(mock as never, records, {
      batchSize: 50,
      logDir: "/tmp",
    });

    expect(mock._upsert).toHaveBeenCalledTimes(3); // 50+50+20
    expect(mock._upsert.mock.calls[0][0]).toHaveLength(50);
    expect(mock._upsert.mock.calls[2][0]).toHaveLength(20);
  });

  it("결과 JSON 로그 저장", async () => {
    const mock = createMockClient();
    const records = [makeRecord("brand", validBrand)];

    await loadRecords(mock as never, records, { logDir: "/tmp/logs" });

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [path, content] = mockWriteFileSync.mock.calls[0];
    expect(path).toContain("/tmp/logs/load-");
    const parsed = JSON.parse(content as string);
    expect(parsed.totals.inserted).toBe(1);
  });

  it("복수 entityType → 각각 LoadResult 반환", async () => {
    const mock = createMockClient();
    const records = [
      makeRecord("brand", validBrand),
      makeRecord("store", validStore),
    ];

    const results = await loadRecords(mock as never, records, {
      logDir: "/tmp",
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.entityType)).toContain("brand");
    expect(results.map((r) => r.entityType)).toContain("store");
  });
});

// ── loadJunctions ──────────────────────────────────────────

describe("loadJunctions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("product_store junction → 복합PK ON CONFLICT", async () => {
    const mock = createMockClient();
    const junctions = [
      {
        type: "product_store" as const,
        data: [
          {
            product_id: PRODUCT_ID,
            store_id: STORE_ID,
          },
        ],
      },
    ];

    await loadJunctions(mock as never, junctions, { logDir: "/tmp" });

    expect(mock.from).toHaveBeenCalledWith("product_stores");
    expect(mock._upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ product_id: expect.any(String) })],
      { onConflict: "product_id,store_id" },
    );
  });

  it("product_ingredient junction — type 필드 포함", async () => {
    const mock = createMockClient();
    const junctions = [
      {
        type: "product_ingredient" as const,
        data: [
          {
            product_id: PRODUCT_ID,
            ingredient_id: INGREDIENT_ID,
            type: "key",
          },
        ],
      },
    ];

    await loadJunctions(mock as never, junctions, { logDir: "/tmp" });

    expect(mock._upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ type: "key" })],
      { onConflict: "product_id,ingredient_id" },
    );
  });

  it("junction zod 실패 → 스킵 + 에러 기록", async () => {
    const mock = createMockClient();
    const junctions = [
      {
        type: "product_store" as const,
        data: [{ product_id: "not-uuid", store_id: "not-uuid" }],
      },
    ];

    const results = await loadJunctions(mock as never, junctions, {
      logDir: "/tmp",
    });

    expect(mock._upsert).not.toHaveBeenCalled();
    expect(results[0].failed).toBe(1);
    expect(results[0].errors[0].stage).toBe("load-validate");
  });

  it("dryRun → DB 미접근", async () => {
    const mock = createMockClient();
    const junctions = [
      {
        type: "product_store" as const,
        data: [
          {
            product_id: PRODUCT_ID,
            store_id: STORE_ID,
          },
        ],
      },
    ];

    await loadJunctions(mock as never, junctions, {
      dryRun: true,
      logDir: "/tmp",
    });

    expect(mock.from).not.toHaveBeenCalled();
  });
});
