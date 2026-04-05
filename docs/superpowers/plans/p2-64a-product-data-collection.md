# P2-64a: Products 200건 데이터 수집 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DOM-1 쇼핑 도메인의 K-뷰티 제품 200건을 CSV 수집 → AI 분류/번역/생성 → 전수 검수(D-7) → DB 적재로 파이프라인에 투입한다.

**Architecture:** Phase A(stores/clinics/treatments)에서 검증된 Channel B(CSV import) 패턴을 따른다. 매니페스트 YAML 정규화 → CSV 변환 → enrich(6언어 번역 + skin_types/concerns AI 분류 + description/review_summary 생성) → review CSV export(D-7 전수 검수) → import-review → DB 적재. 신규: slug.ts(자연키 sourceId), csv-loader source 옵션, FIELD_MAPPINGS.product(brand_id 룩업 + _expected 보존), review-exporter product 컬럼 확장.

**Tech Stack:** TypeScript, scripts/seed 파이프라인, Claude API (AI 보강), Supabase (DB 적재)

**주요 결정사항:**
- sourceId = `prod-{slugify(name_en)}` (treatments `treat-` 패턴 동일. 크롤링 전환 시 UUID 호환)
- source = `"product"` 고정 (csv/scraper 무관 UUID 동일)
- AI 분류와 매니페스트 expected 값을 독립 병렬 제공 → D-7에서 인간이 최종 판단 (옵션 3)
- price = null (budget_level을 tags에 보존), key_ingredients = null (P2-64c junction과 동시 처리)
- 니치 브랜드 3건(Scrub Buddy, Cleansing Nature, Face Factory) 제거 → 기존 브랜드 대체
- Daiso 브랜드 추가 + Daiso 매장 추가 (기존 stores 파이프라인 그대로)

---

## 파일 구조

| 파일 | 변경 | 책임 |
|------|------|------|
| `scripts/seed/lib/utils/slug.ts` | **신규** | 결정론적 슬러그 생성 (sourceId용) |
| `scripts/seed/lib/utils/slug.test.ts` | **신규** | 슬러그 함수 단위 테스트 |
| `scripts/seed/lib/providers/csv-loader.ts` | 수정 (L28-29) | source optional 파라미터 추가 |
| `scripts/seed/lib/providers/csv-loader.test.ts` | 수정 | source override 테스트 추가 |
| `scripts/seed/lib/enrich-service.ts` | 수정 (L230-261) | FIELD_MAPPINGS.product 추가 |
| `scripts/seed/lib/enrich-service.test.ts` | 수정 | product FIELD_MAPPINGS 테스트 추가 |
| `scripts/seed/lib/review-exporter.ts` | 수정 (L81-89) | product 리뷰 컬럼에 _expected 참조 추가 |
| `scripts/seed/lib/review-exporter.test.ts` | 수정 | product 리뷰 컬럼 테스트 추가 |
| `scripts/seed/manifests/products-skincare.yaml` | 수정 | 브랜드명 정규화 (4건) |
| `scripts/seed/manifests/products-other.yaml` | 수정 | 브랜드명 정규화 (21건) + 니치 3건 제거 + 대체 3건 추가 |
| `scripts/seed/data/brands-raw.json` | 수정 | Daiso 브랜드 1건 추가 |
| `scripts/seed/data/daiso-queries.json` | **신규** | 다이소 매장 카카오 검색 쿼리 |
| `scripts/seed/data/products-raw.csv` | **신규** (생성물) | YAML→CSV 변환 결과 |
| `scripts/seed/data/products-raw.json` | **신규** (생성물) | CSV→RawRecord 변환 결과 |
| `scripts/seed/data/products-enriched.json` | **신규** (생성물) | AI 보강 결과 |
| `scripts/seed/data/products-validated.json` | **신규** (생성물) | D-7 검수 후 최종 데이터 |

---

## 의존성 방향 검증

```
slug.ts → (없음. 순수 함수)
csv-loader.ts → csv-parser.ts, types.ts (기존 동일)
enrich-service.ts → enrichment/*, classifiers/*, utils/*, types.ts (기존 동일)
review-exporter.ts → csv-parser.ts, types.ts (기존 동일)

외부 의존: @/shared/constants/beauty (SKIN_TYPES, SKIN_CONCERNS) — 읽기 전용
역방향: src/ → scripts/seed/ = 0건 (P-10 준수)
```

---

### Task 0: 선행 정비 — 매니페스트 정규화 + Daiso 브랜드/매장

**Files:**
- Modify: `scripts/seed/manifests/products-skincare.yaml`
- Modify: `scripts/seed/manifests/products-other.yaml`
- Modify: `scripts/seed/data/brands-raw.json`
- Create: `scripts/seed/data/daiso-queries.json`

- [ ] **Step 0-1: products-skincare.yaml 브랜드명 정규화**

brands-validated.json의 name.en과 일치하도록 수정. skincare에서 불일치 건은 없음 (CLIO, ETUDE, HERA, MISSHA, TONYMOLY 모두 대문자로 일치). OHUI만 수정:

```yaml
# Line 363-364: OHUI → O HUI
  brand: O HUI
```

- [ ] **Step 0-2: products-other.yaml 브랜드명 정규화 (21건)**

아래 brand 값을 brands-validated.json의 name.en과 일치하도록 수정:

| Line | 현재 | 수정 |
|------|------|------|
| 63, 232, 388, 434, 479, 586 | `Clio` | `CLIO` |
| 77, 293, 418, 600, 1229, 1274, 1297 | `Etude` | `ETUDE` |
| 93, 276, 525, 807 | `Hera` | `HERA` |
| 246, 356 | `Missha` | `MISSHA` |
| 655, 724, 779, 834 | `Mise en Scene` | `Mise en Scène` |
| 1115-1116 | `Tony Moly` | `TONYMOLY` |

- [ ] **Step 0-3: 니치 브랜드 3건 제거 + 대체 제품 추가**

products-other.yaml에서 제거:
- Line ~935: Scrub Buddy Coconut Body Scrub (bodycare/body_scrub)
- Line ~1201: Cleansing Nature Silicone Face Brush (tools/cleansing_brush)
- Line ~1214: Face Factory Deep Clean Dual Pore Brush (tools/cleansing_brush)

대체 제품 추가 (기존 brands DB에 존재하는 브랜드):

```yaml
# bodycare +1 (body_scrub 대체)
- name_ko: 스킨푸드 블랙 슈가 퍼펙트 에센셜 스크럽 2X
  name_en: Skinfood Black Sugar Perfect Essential Scrub 2X
  brand: Skinfood
  category: bodycare
  subcategory: body_scrub
  budget_level: budget
  expected_skin_types:
  - oily
  - combination
  - normal
  expected_concerns:
  - dullness
  - pores
  available_at:
  - olive_young

# tools +1 (cleansing_brush 대체)
- name_ko: 이니스프리 에코 뷰티 툴 실리콘 클렌저
  name_en: Innisfree Eco Beauty Tool Silicone Cleanser
  brand: Innisfree
  category: tools
  subcategory: cleansing_brush
  budget_level: budget
  expected_skin_types:
  - all
  expected_concerns:
  - pores
  available_at:
  - olive_young
  - innisfree_store

# tools +1 (cleansing_brush 대체)
- name_ko: 미샤 슈퍼 아쿠아 소프트 클렌징 퍼프
  name_en: MISSHA Super Aqua Soft Cleansing Puff
  brand: MISSHA
  category: tools
  subcategory: cleansing_brush
  budget_level: budget
  expected_skin_types:
  - all
  expected_concerns:
  - pores
  - acne
  available_at:
  - olive_young
```

- [ ] **Step 0-4: Daiso 브랜드 추가**

`scripts/seed/data/brands-raw.json` 배열에 추가:

```json
{
  "source": "manual",
  "sourceId": "daiso",
  "entityType": "brand",
  "data": {
    "name_ko": "다이소",
    "name_en": "Daiso",
    "origin": "KR",
    "tier": "budget",
    "is_essenly": false,
    "specialties": ["beauty tools", "basic skincare", "budget cosmetics"]
  },
  "fetchedAt": "2026-04-05T00:00:00Z"
}
```

주의: `name_en` 필수. enrich에서 translateKeys가 `name_ko`를 번역하여 `name.en`을 생성하지만, Task 5 brand_id 룩업이 `data.name.en`으로 매칭하므로 원본에 `name_en: "Daiso"`를 명시하여 번역 불일치 리스크 제거.

- [ ] **Step 0-5: Daiso 브랜드 enrich + load**

```bash
npx tsx scripts/seed/enrich.ts --input data/brands-raw.json --output data/brands-enriched.json
npx tsx scripts/seed/load.ts --input data/brands-validated.json --types brand
```

주의: 기존 73건은 UPSERT on conflict이므로 중복 생성 없음 (Q-12 멱등성).

- [ ] **Step 0-6: Daiso 매장 쿼리 파일 작성**

`scripts/seed/data/daiso-queries.json` 신규:

```json
[
  {"query": "다이소 명동"},
  {"query": "다이소 홍대"},
  {"query": "다이소 강남"},
  {"query": "다이소 이태원"},
  {"query": "다이소 성수"},
  {"query": "다이소 동대문"},
  {"query": "다이소 건대"},
  {"query": "다이소 신촌"},
  {"query": "다이소 압구정"},
  {"query": "다이소 잠실"}
]
```

- [ ] **Step 0-7: Daiso 매장 fetch + enrich + review + load**

```bash
# fetch
npx tsx scripts/seed/fetch.ts --targets places --place-queries data/daiso-queries.json --output data/daiso-raw.json

# enrich (stores 타입 자동 분류)
npx tsx scripts/seed/enrich.ts --input data/daiso-raw.json --output data/daiso-enriched.json

# review export
npx tsx scripts/seed/export-review.ts --input data/daiso-enriched.json

# [수동 검수: english_support를 "basic"으로 설정]

# review import
npx tsx scripts/seed/import-review.ts --enriched data/daiso-enriched.json --csv review-data/review-store-*.csv --output data/daiso-validated.json

# load (기존 stores와 merge → UPSERT)
npx tsx scripts/seed/load.ts --input data/daiso-validated.json --types store
```

- [ ] **Step 0-8: 커밋**

```bash
git add scripts/seed/manifests/ scripts/seed/data/brands-raw.json scripts/seed/data/daiso-queries.json
git commit -m "chore(P2-64a): 매니페스트 정규화 + Daiso 브랜드/매장 추가"
```

---

### Task 1: slug.ts — 결정론적 슬러그 생성 함수

**Files:**
- Create: `scripts/seed/lib/utils/slug.ts`
- Create: `scripts/seed/lib/utils/slug.test.ts`

- [ ] **Step 1-1: 테스트 작성 (slug.test.ts)**

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generateProductSlug } from "./slug";

describe("generateProductSlug", () => {
  it("기본 영문 이름 → kebab-case 슬러그", () => {
    expect(generateProductSlug("Innisfree Green Tea Seed Hyaluronic Cream"))
      .toBe("prod-innisfree-green-tea-seed-hyaluronic-cream");
  });

  it("특수문자 & 제거", () => {
    expect(generateProductSlug("rom&nd Juicy Lasting Tint"))
      .toBe("prod-romnd-juicy-lasting-tint");
  });

  it("특수문자 . 제거", () => {
    expect(generateProductSlug("Dr.G Red Blemish Clear Soothing Cream"))
      .toBe("prod-drg-red-blemish-clear-soothing-cream");
  });

  it("특수문자 ' 제거", () => {
    expect(generateProductSlug("d'Alba White Truffle Return Oil Cream"))
      .toBe("prod-dalba-white-truffle-return-oil-cream");
  });

  it("특수문자 : + 제거", () => {
    expect(generateProductSlug("Beauty of Joseon Glow Serum: Rice + Alpha-Arbutin"))
      .toBe("prod-beauty-of-joseon-glow-serum-rice-alpha-arbutin");
  });

  it("% 제거, 숫자 보존", () => {
    expect(generateProductSlug("Anua Heartleaf 77% Soothing Toner"))
      .toBe("prod-anua-heartleaf-77-soothing-toner");
  });

  it("기존 하이픈 보존", () => {
    expect(generateProductSlug("Torriden DIVE-IN Low Molecular Hyaluronic Acid Serum"))
      .toBe("prod-torriden-dive-in-low-molecular-hyaluronic-acid-serum");
  });

  it("대소문자 통일 (toLowerCase)", () => {
    expect(generateProductSlug("COSRX Advanced Snail 92 All in One Cream"))
      .toBe("prod-cosrx-advanced-snail-92-all-in-one-cream");
  });

  it("숫자로 시작하는 브랜드", () => {
    expect(generateProductSlug("3CE Velvet Lip Tint"))
      .toBe("prod-3ce-velvet-lip-tint");
  });

  it("SPF 숫자 보존", () => {
    expect(generateProductSlug("MISSHA M Perfect Cover BB Cream SPF42"))
      .toBe("prod-missha-m-perfect-cover-bb-cream-spf42");
  });

  it("연속 특수문자 → 단일 하이픈", () => {
    expect(generateProductSlug("Test & More: Product + Extra"))
      .toBe("prod-test-more-product-extra");
  });

  it("결정론적: 동일 입력 → 동일 출력", () => {
    const a = generateProductSlug("COSRX Snail Cream");
    const b = generateProductSlug("COSRX Snail Cream");
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 1-2: 테스트 실패 확인**

```bash
npx vitest run scripts/seed/lib/utils/slug.test.ts
```

Expected: FAIL — `generateProductSlug` 미존재

- [ ] **Step 1-3: 구현 (slug.ts)**

```typescript
// ============================================================
// 제품 슬러그 생성 — P2-64a sourceId용
// 결정론적: 동일 name_en → 동일 슬러그 → 동일 UUID (Q-12).
// 크롤링 전환 시에도 동일 함수 사용 → UUID 호환 보장.
// P-9: scripts/ 내부. server/ import 금지.
// P-10: 삭제 시 빌드 에러 0건.
// ============================================================

/** 접두사 (treatments "treat-" 패턴과 동일 컨벤션) */
const PRODUCT_SLUG_PREFIX = "prod-";

/**
 * name_en → 결정론적 product sourceId 생성.
 * CSV, 크롤링, 브랜드 제출 모두 이 함수를 통해 동일 sourceId 보장.
 */
export function generateProductSlug(nameEn: string): string {
  const slug = nameEn
    .toLowerCase()
    .replace(/[&'.,:+%()\/\\@#$!?*=~`"<>{}[\]|^]/g, "") // 특수문자 제거
    .replace(/\s+/g, "-")       // 공백 → 하이픈
    .replace(/-{2,}/g, "-")     // 연속 하이픈 → 단일
    .replace(/^-|-$/g, "");     // 선행/후행 하이픈 제거

  return `${PRODUCT_SLUG_PREFIX}${slug}`;
}
```

- [ ] **Step 1-4: 테스트 통과 확인**

```bash
npx vitest run scripts/seed/lib/utils/slug.test.ts
```

Expected: PASS (12/12)

- [ ] **Step 1-5: 커밋**

```bash
git add scripts/seed/lib/utils/slug.ts scripts/seed/lib/utils/slug.test.ts
git commit -m "feat(P2-64a): slug.ts — 제품 sourceId 슬러그 생성 함수"
```

---

### Task 2: csv-loader source 옵션 추가

**Files:**
- Modify: `scripts/seed/lib/providers/csv-loader.ts` (L19-34)
- Modify: `scripts/seed/lib/providers/csv-loader.test.ts`

- [ ] **Step 2-1: 테스트 추가 (csv-loader.test.ts)**

기존 테스트 파일에 추가:

```typescript
it("source 옵션 지정 시 해당 값 사용", () => {
  const records = loadCsvAsRawRecords(fixturePath, "product", { source: "product" });
  expect(records[0].source).toBe("product");
});

it("source 옵션 미지정 시 기본값 'csv' 사용", () => {
  const records = loadCsvAsRawRecords(fixturePath, "product");
  expect(records[0].source).toBe("csv");
});
```

- [ ] **Step 2-2: 테스트 실패 확인**

```bash
npx vitest run scripts/seed/lib/providers/csv-loader.test.ts
```

Expected: source override 테스트 FAIL

- [ ] **Step 2-3: csv-loader.ts 수정**

```typescript
/** CSV 파일 → RawRecord[] 변환 */
export function loadCsvAsRawRecords(
  filePath: string,
  entityType: EntityType,
  options?: CsvParseOptions & { idColumn?: string; source?: string },
): RawRecord[] {
  const rows = parseCsvFile(filePath, options);
  const idColumn = options?.idColumn ?? DEFAULT_ID_COLUMN;
  const source = options?.source ?? "csv";
  const fetchedAt = new Date().toISOString();

  return rows.map((row, index) => ({
    source,
    sourceId: String(row[idColumn] ?? `csv-${index}`),
    entityType,
    data: row,
    fetchedAt,
  }));
}
```

변경: L29의 `source: "csv"` → `source` 변수 참조. optional `source` 파라미터 추가.
기존 호출 코드 영향: 0건 (기본값 `"csv"` 유지).

- [ ] **Step 2-4: 테스트 통과 확인**

```bash
npx vitest run scripts/seed/lib/providers/csv-loader.test.ts
```

Expected: ALL PASS

- [ ] **Step 2-5: 커밋**

```bash
git add scripts/seed/lib/providers/csv-loader.ts scripts/seed/lib/providers/csv-loader.test.ts
git commit -m "feat(P2-64a): csv-loader source 옵션 추가 — product UUID 호환"
```

---

### Task 3: FIELD_MAPPINGS.product + review-exporter 확장

**Files:**
- Modify: `scripts/seed/lib/enrich-service.ts` (L230-261 사이에 product 블록 추가)
- Modify: `scripts/seed/lib/enrich-service.test.ts`
- Modify: `scripts/seed/lib/review-exporter.ts` (L81-89 product 컬럼 확장)
- Modify: `scripts/seed/lib/review-exporter.test.ts`

- [ ] **Step 3-1: enrich-service 테스트 추가**

기존 `enrich-service.test.ts`에 product FIELD_MAPPINGS 테스트 추가:

```typescript
describe("FIELD_MAPPINGS.product", () => {
  it("_expected_skin_types를 매니페스트 값에서 보존", async () => {
    const records: RawRecord[] = [{
      source: "product",
      sourceId: "prod-test-cream",
      entityType: "product",
      data: {
        name_ko: "테스트 크림",
        name_en: "Test Cream",
        brand: "TestBrand",
        category: "skincare",
        subcategory: "moisturizer",
        expected_skin_types: "dry|oily",
        expected_concerns: "acne|dryness",
        budget_level: "moderate",
        available_at: "olive_young",
      },
      fetchedAt: "2026-04-05T00:00:00Z",
    }];

    // enrichRecords (public API, 복수형) 호출
    const results = await enrichRecords(records);
    const result = results[0];

    // _expected 필드가 보존됨
    expect(result.data._expected_skin_types).toEqual(["dry", "oily"]);
    expect(result.data._expected_concerns).toEqual(["acne", "dryness"]);
    // budget_level이 tags에 저장됨
    expect(result.data.tags).toContain("budget:moderate");
    // available_at이 _available_at으로 보존됨
    expect(result.data._available_at).toEqual(["olive_young"]);
  });
});
```

주의: `enrichRecord`(단수)는 private 함수. 반드시 `enrichRecords`(복수, public export)를 사용.

- [ ] **Step 3-2: 테스트 실패 확인**

```bash
npx vitest run scripts/seed/lib/enrich-service.test.ts
```

Expected: FAIL — _expected_skin_types 관련 assertion 실패

- [ ] **Step 3-3: FIELD_MAPPINGS.product 구현**

`enrich-service.ts` L230-261 사이, treatment 다음에 product 블록 추가:

```typescript
  product: {
    _expected_skin_types: (data) => {
      const raw = data.expected_skin_types;
      if (typeof raw === "string") return raw.split("|").filter(Boolean);
      if (Array.isArray(raw)) return raw;
      return [];
    },
    _expected_concerns: (data) => {
      const raw = data.expected_concerns;
      if (typeof raw === "string") return raw.split("|").filter(Boolean);
      if (Array.isArray(raw)) return raw;
      return [];
    },
    _available_at: (data) => {
      const raw = data.available_at;
      if (typeof raw === "string") return raw.split("|").filter(Boolean);
      if (Array.isArray(raw)) return raw;
      return [];
    },
    tags: (data) => {
      const level = data.budget_level;
      return level ? [`budget:${level}`] : [];
    },
  },
```

- [ ] **Step 3-4: review-exporter.ts product 컬럼 확장**

`review-exporter.ts` L81-89 기존 product 배열에 `_expected` 참조 컬럼 4건을 **추가 삽입** (기존 8개 컬럼 유지):

기존 `skin_types_confidence` 뒤에 `_expected_skin_types` 추가, `concerns_confidence` 뒤에 `_expected_concerns` 추가, `review_summary_en` 뒤에 `_available_at`과 `tags` 추가:

```typescript
  product: [
    { header: "skin_types", source: "data", path: "skin_types", format: "array", editable: true },
    { header: "skin_types_confidence", source: "enrichments", path: "confidence.skin_types", format: "number", editable: false },
    { header: "_expected_skin_types", source: "data", path: "_expected_skin_types", format: "array", editable: false },
    { header: "concerns", source: "data", path: "concerns", format: "array", editable: true },
    { header: "concerns_confidence", source: "enrichments", path: "confidence.concerns", format: "number", editable: false },
    { header: "_expected_concerns", source: "data", path: "_expected_concerns", format: "array", editable: false },
    { header: "description_ko", source: "data", path: "description.ko", format: "string", editable: true },
    { header: "description_en", source: "data", path: "description.en", format: "string", editable: true },
    { header: "review_summary_ko", source: "data", path: "review_summary.ko", format: "string", editable: true },
    { header: "review_summary_en", source: "data", path: "review_summary.en", format: "string", editable: true },
    { header: "_available_at", source: "data", path: "_available_at", format: "array", editable: false },
    { header: "tags", source: "data", path: "tags", format: "array", editable: true },
  ],
```

- [ ] **Step 3-5: review-exporter 테스트 추가**

기존 `review-exporter.test.ts`에 추가:

```typescript
it("product export에 _expected 참조 컬럼 포함", () => {
  const csv = exportForReview([enrichedProductRecord]);
  expect(csv).toContain("_expected_skin_types");
  expect(csv).toContain("_expected_concerns");
  expect(csv).toContain("_available_at");
});

it("product import에서 _expected 컬럼은 수정 불가 (editable: false)", () => {
  const validated = importReviewed(enrichedJson, reviewedCsv);
  // _expected 값은 원본 유지, 수정된 CSV 값 무시
  expect(validated[0].data._expected_skin_types).toEqual(["dry", "oily"]);
});
```

- [ ] **Step 3-6: 테스트 통과 확인**

```bash
npx vitest run scripts/seed/lib/enrich-service.test.ts scripts/seed/lib/review-exporter.test.ts
```

Expected: ALL PASS

- [ ] **Step 3-7: 커밋**

```bash
git add scripts/seed/lib/enrich-service.ts scripts/seed/lib/enrich-service.test.ts \
       scripts/seed/lib/review-exporter.ts scripts/seed/lib/review-exporter.test.ts
git commit -m "feat(P2-64a): FIELD_MAPPINGS.product + review 컬럼 확장 — _expected 참조 + tags"
```

---

### Task 4: YAML → CSV 변환 + sourceId 생성

**Files:**
- Reference: `scripts/seed/manifests/products-skincare.yaml`, `products-other.yaml`
- Create: `scripts/seed/data/products-raw.csv` (생성물)

- [ ] **Step 4-1: YAML → CSV 변환 스크립트 실행**

매니페스트 YAML을 읽어 CSV로 변환. id 컬럼에 슬러그 sourceId 기입.

```bash
npx tsx -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { generateProductSlug } from './scripts/seed/lib/utils/slug';
import { stringifyCsvRows } from './scripts/seed/lib/utils/csv-parser';

const skincare = parse(readFileSync('scripts/seed/manifests/products-skincare.yaml', 'utf8')).products;
const other = parse(readFileSync('scripts/seed/manifests/products-other.yaml', 'utf8')).products;
const all = [...skincare, ...other];

const rows = all.map(p => ({
  id: generateProductSlug(p.name_en),
  name_ko: p.name_ko,
  name_en: p.name_en,
  brand: p.brand,
  category: p.category,
  subcategory: p.subcategory || '',
  budget_level: p.budget_level || '',
  expected_skin_types: (p.expected_skin_types || []).join('|'),
  expected_concerns: (p.expected_concerns || []).join('|'),
  available_at: (p.available_at || []).join('|'),
}));

// sourceId 유니크 검증
const ids = rows.map(r => r.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length > 0) { console.error('DUPLICATE sourceIds:', [...new Set(dupes)]); process.exit(1); }

const csv = stringifyCsvRows(rows);
writeFileSync('scripts/seed/data/products-raw.csv', csv);
console.log('Generated', rows.length, 'products. Duplicates: 0');
"
```

Expected: `Generated 200 products. Duplicates: 0`

- [ ] **Step 4-2: sourceId 유니크 검증 확인**

위 스크립트에서 중복 체크가 통과했는지 확인. 실패 시 충돌하는 제품명 확인 후 매니페스트 수정.

- [ ] **Step 4-3: CSV → RawRecord 변환**

```bash
npx tsx -e "
import { loadCsvAsRawRecords } from './scripts/seed/lib/providers/csv-loader';
import { writeFileSync } from 'node:fs';

const records = loadCsvAsRawRecords(
  'scripts/seed/data/products-raw.csv',
  'product',
  { source: 'product' }
);

writeFileSync('scripts/seed/data/products-raw.json', JSON.stringify(records, null, 2));
console.log('RawRecords:', records.length, '| source:', records[0]?.source, '| sourceId sample:', records[0]?.sourceId);
"
```

Expected: `RawRecords: 200 | source: product | sourceId sample: prod-innisfree-green-tea-seed-hyaluronic-cream`

- [ ] **Step 4-4: 커밋**

```bash
git add scripts/seed/data/products-raw.csv scripts/seed/data/products-raw.json
git commit -m "chore(P2-64a): products CSV 200건 + RawRecord 변환 완료"
```

---

### Task 5: AI 보강 (Enrich)

**Files:**
- Input: `scripts/seed/data/products-raw.json`
- Output: `scripts/seed/data/products-enriched.json`

- [ ] **Step 5-1: brand_id 룩업 테이블 준비**

enrich 전에 brands DB에서 name.en → id 매핑을 products-raw.json의 data.brand 필드에 주입:

```bash
npx tsx -e "
import { readFileSync, writeFileSync } from 'node:fs';

const brands = JSON.parse(readFileSync('scripts/seed/data/brands-validated.json', 'utf8'));
const brandMap = new Map();
for (const b of brands) {
  if (b.data?.name?.en) brandMap.set(b.data.name.en, b.data.id);
}

const records = JSON.parse(readFileSync('scripts/seed/data/products-raw.json', 'utf8'));
let matched = 0, unmatched = 0;
for (const r of records) {
  const brandName = r.data.brand;
  const brandId = brandMap.get(brandName);
  if (brandId) { r.data.brand_id = brandId; matched++; }
  else { r.data.brand_id = null; unmatched++; console.warn('No brand match:', brandName); }
}

writeFileSync('scripts/seed/data/products-raw.json', JSON.stringify(records, null, 2));
console.log('Brand matched:', matched, '| Unmatched:', unmatched);
"
```

Expected: `Brand matched: 200 | Unmatched: 0` (모든 브랜드가 매니페스트 정규화 + Daiso 추가로 매칭)

- [ ] **Step 5-2: Enrich 실행**

```bash
npx tsx scripts/seed/enrich.ts --input data/products-raw.json --output data/products-enriched.json
```

Expected: 200건 enriched. 6언어 번역 + skin_types/concerns AI 분류 + description/review_summary 생성.
예상 비용: ~$6 (Claude API).

- [ ] **Step 5-3: enriched 결과 검증**

```bash
npx tsx -e "
import { readFileSync } from 'node:fs';
const records = JSON.parse(readFileSync('scripts/seed/data/products-enriched.json', 'utf8'));
console.log('Total:', records.length);
console.log('With skin_types:', records.filter(r => r.data.skin_types?.length > 0).length);
console.log('With concerns:', records.filter(r => r.data.concerns?.length > 0).length);
console.log('With description:', records.filter(r => r.data.description?.ko).length);
console.log('With _expected_skin_types:', records.filter(r => r.data._expected_skin_types?.length > 0).length);
console.log('With tags:', records.filter(r => r.data.tags?.length > 0).length);
console.log('Sample confidence:', JSON.stringify(records[0]?.enrichments?.confidence));
"
```

- [ ] **Step 5-4: 커밋**

```bash
git add scripts/seed/data/products-enriched.json
git commit -m "chore(P2-64a): products 200건 AI 보강 완료"
```

---

### Task 6: Review Export → D-7 전수 검수 → Import

**Files:**
- Output: `scripts/seed/review-data/review-product-*.csv`
- Output: `scripts/seed/data/products-validated.json`

- [ ] **Step 6-1: Review CSV 내보내기**

```bash
npx tsx scripts/seed/export-review.ts --input data/products-enriched.json
```

Expected: `review-data/review-product-{timestamp}.csv` + `review-data/enriched-product-{timestamp}.json` 생성.

CSV 컬럼: id, source_id, name_ko, name_en, skin_types, skin_types_confidence, _expected_skin_types, concerns, concerns_confidence, _expected_concerns, _available_at, tags, description_ko, description_en, review_summary_ko, review_summary_en, is_approved, review_notes

- [ ] **Step 6-2: [사용자 검수] Google Sheets에서 D-7 전수 검수**

검수 기준:
1. **skin_types** (AI) vs **_expected_skin_types** (매니페스트) 비교 → 불일치 시 판단
2. **concerns** (AI) vs **_expected_concerns** (매니페스트) 비교 → 불일치 시 판단
3. **description_ko/en** — 자연스러운지, 정확한지 확인
4. **review_summary_ko/en** — AI disclaimer 포함 확인
5. **is_approved** = TRUE 설정 (수정 완료된 건)

- [ ] **Step 6-3: 검수된 CSV 재임포트**

```bash
npx tsx scripts/seed/import-review.ts \
  --enriched review-data/enriched-product-*.json \
  --csv review-data/review-product-*.csv \
  --output data/products-validated.json
```

- [ ] **Step 6-4: 커밋**

```bash
git add scripts/seed/data/products-validated.json
git commit -m "chore(P2-64a): products 200건 D-7 전수 검수 완료"
```

---

### Task 7: DB 적재

**Files:**
- Input: `scripts/seed/data/products-validated.json`

- [ ] **Step 7-1: Zod 검증**

```bash
npx tsx scripts/seed/validate.ts --input data/products-validated.json --types product
```

Expected: `Passed: 200 | Failed: 0`

_expected_*, _available_at, tags:budget:* 필드는 productCreateSchema에 없으므로 Zod `.object()`가 자동 strip. DB에 도달하지 않음.

- [ ] **Step 7-2: DB 적재**

```bash
npx tsx scripts/seed/load.ts --input data/products-validated.json --types product
```

Expected: `product: inserted 200, updated 0, failed 0`
FK 순서: brands(Phase A 이미 적재) → products(이번 적재). Q-13 준수.

- [ ] **Step 7-3: DB 적재 결과 검증**

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { count } = await sb.from('products').select('*', { count: 'exact', head: true });
console.log('products count:', count);
const { data: sample } = await sb.from('products').select('name, brand_id, skin_types, concerns, tags, status').limit(3);
console.log('sample:', JSON.stringify(sample, null, 2));
"
```

Expected: `products count: 200`

- [ ] **Step 7-4: 전체 테스트 통과 확인**

```bash
npx vitest run scripts/seed/
npx tsc --noEmit
```

Expected: ALL PASS, 타입 에러 0건.

- [ ] **Step 7-5: 최종 커밋**

```bash
git add scripts/seed/data/products-validated.json
git commit -m "feat(P2-64a): products 200건 DB 적재 완료 — Phase B 1차 완료"
```

---

## 범위 외 필드 (D-9: 미커버 항목 명시)

schema.dbml products 테이블 중 본 계획에서 의도적으로 미적재하는 필드:

| 필드 | 사유 | 적재 시점 |
|------|------|----------|
| `hair_types` | skincare 위주 MVP, haircare 제품에만 해당 | D-7 검수에서 필요 시 수동 기입 |
| `purchase_links` | P2-66 별도 태스크 | P2-66 |
| `english_label` | P2-67 별도 태스크 (CSV 수동 기입) | P2-67 |
| `tourist_popular` | 관리자 수동 설정 | 관리자 앱 |
| `rating`, `review_count` | 관리자 수동 입력 | 관리자 앱 |
| `key_ingredients` | P2-64c junction과 동시 처리 (데이터 일관성) | P2-64c |
| `images` | D-14 placeholder 전략, 크롤링 미실행 | 브랜드 승인 후 |
| `embedding` | P2-64d 벡터 생성 태스크 | P2-64d |
| `price`, `volume` | null (Q-3 null-safe). budget_level을 tags에 보존 | CSV 수동 보충 또는 v0.2 |

모든 필드는 Zod 스키마에서 nullable/optional/default이므로 검증 통과.

---

## 규칙 준수 체크리스트

```
✅ P-1  4계층 DAG: scripts/ → shared/ 단방향
✅ P-2  Core 불변: core/ 수정 0건
✅ P-7  단일 변경점: slug.ts, csv-loader.ts, enrich-service.ts, review-exporter.ts 각 1파일
✅ P-8  순환 의존 금지: 모든 import 단방향
✅ P-9  scripts/ Composition Root: server/ import 0건, shared/ 읽기 전용 import만
✅ P-10 제거 안전성: src/ → scripts/seed/ 역참조 0건
✅ Q-3  null-safe: price, volume, key_ingredients 모두 nullable
✅ Q-12 멱등성: 결정론적 UUID v5 + UPSERT on conflict
✅ Q-13 FK 순서: brands → products
✅ Q-14 스키마 정합성: Zod ↔ schema.dbml 일치
✅ D-7  전수 검수: AI confidence = 참고, _expected = 참고, 인간 최종 판단
✅ D-14 이미지: image_url 미수집 (크롤링 미실행), images=[] (placeholder)
✅ G-2  중복 금지: 기존 파이프라인 재사용
✅ G-4  미사용 코드 금지: 모든 신규 코드에 호출자 존재
✅ G-5  기존 패턴: treatments CSV 파이프라인과 동일
✅ G-11 AI 확장: slug.ts 공유, FieldSpec 인터페이스 기반
✅ G-12 외부 소스: P2-V7 확인 완료 (브랜드 1순위, 올리브영 보조)
✅ V-1~V-26: 전수 통과
```
