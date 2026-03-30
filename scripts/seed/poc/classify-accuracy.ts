// ============================================================
// P2-56r: AI 분류 정확도 PoC (U-1)
// M1 스켈레톤 제품 10건에 대해 classifier.ts 정확도 검증.
// 80% 미달 시 프롬프트/모델 개선 후 재실행.
// 실행: npx tsx scripts/seed/poc/classify-accuracy.ts
// P-9: scripts/ 내부 + shared/ import만. server/ import 금지.
// P-10: poc/ 삭제 시 빌드 에러 0건.
// ============================================================

import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { classifyFields, type FieldSpec } from "../lib/enrichment/classifier";
import { pipelineEnv } from "../config";
import {
  SKIN_TYPES,
  SKIN_CONCERNS,
} from "@/shared/constants/beauty";

// ── 타입 ────────────────────────────────────────────────────

/** M1 YAML 제품 구조 (분류 검증에 필요한 필드만) */
interface M1Product {
  id: string;
  name: { ko: string; en: string };
  brand_id: string;
  category: string;
  subcategory: string;
  skin_types: string[];
  concerns: string[];
  key_ingredients: string[] | null;
}

/** 제품별 비교 결과 */
export interface ProductResult {
  id: string;
  name: string;
  skinTypes: {
    predicted: string[];
    expected: string[];
    similarity: number;
    accurate: boolean;
  };
  concerns: {
    predicted: string[];
    expected: string[];
    similarity: number;
    accurate: boolean;
  };
  accurate: boolean;
}

/** PoC 실행 설정 */
export interface PocRunConfig {
  fieldSpecs: FieldSpec[];
  threshold: number;
  similarityThreshold: number;
}

/** PoC 실행 결과 */
export interface PocResult {
  config: {
    provider: string;
    model: string;
    threshold: number;
    similarityThreshold: number;
    timestamp: string;
  };
  products: ProductResult[];
  accuracy: {
    skinTypes: number;
    concerns: number;
    overall: number;
  };
  passed: boolean;
}

// ── 상수 (G-10) ─────────────────────────────────────────────

const DEFAULT_SIMILARITY_THRESHOLD = 0.5;
const DEFAULT_PASS_THRESHOLD = 0.8;
const M1_YAML_PATH = join(
  import.meta.dirname,
  "../data/m1-skeleton.yaml",
);
const RESULTS_DIR = join(import.meta.dirname, "../data");

// ── 비교 로직 (순수 함수 — 테스트 가능) ─────────────────────

/** Jaccard 유사도: 교집합/합집합. 양쪽 빈 배열이면 1.0 */
export function jaccardSimilarity(
  predicted: string[],
  expected: string[],
): number {
  const pSet = new Set(predicted);
  const eSet = new Set(expected);
  if (pSet.size === 0 && eSet.size === 0) return 1.0;
  const intersection = [...pSet].filter((v) => eSet.has(v)).length;
  const union = new Set([...pSet, ...eSet]).size;
  return union === 0 ? 1.0 : intersection / union;
}

/** 제품 단위 정확도 평가 */
export function evaluateProduct(
  predicted: { skinTypes: string[]; concerns: string[] },
  expected: { skinTypes: string[]; concerns: string[] },
  similarityThreshold: number,
): ProductResult {
  const skinSim = jaccardSimilarity(predicted.skinTypes, expected.skinTypes);
  const concernsSim = jaccardSimilarity(
    predicted.concerns,
    expected.concerns,
  );
  const skinAccurate = skinSim >= similarityThreshold;
  const concernsAccurate = concernsSim >= similarityThreshold;

  return {
    id: "",
    name: "",
    skinTypes: {
      predicted: predicted.skinTypes,
      expected: expected.skinTypes,
      similarity: skinSim,
      accurate: skinAccurate,
    },
    concerns: {
      predicted: predicted.concerns,
      expected: expected.concerns,
      similarity: concernsSim,
      accurate: concernsAccurate,
    },
    accurate: skinAccurate && concernsAccurate,
  };
}

/** 전체 정확도 계산 */
export function calculateOverallAccuracy(
  results: ProductResult[],
  threshold: number,
): { skinTypes: number; concerns: number; overall: number; passed: boolean } {
  const total = results.length;
  if (total === 0) return { skinTypes: 0, concerns: 0, overall: 0, passed: false };

  const skinCorrect = results.filter((r) => r.skinTypes.accurate).length;
  const concernsCorrect = results.filter((r) => r.concerns.accurate).length;
  const overallCorrect = results.filter((r) => r.accurate).length;

  const skinTypes = skinCorrect / total;
  const concerns = concernsCorrect / total;
  const overall = overallCorrect / total;

  return { skinTypes, concerns, overall, passed: overall >= threshold };
}

/** 분류 대상에서 정답 필드를 제외한 입력 데이터 추출 */
export function extractInputData(
  product: M1Product,
): Record<string, string | string[] | number | null | undefined> {
  return {
    name_ko: product.name.ko,
    name_en: product.name.en,
    brand_id: product.brand_id,
    category: product.category,
    subcategory: product.subcategory,
    key_ingredients: product.key_ingredients,
    // skin_types, concerns는 의도적으로 제외 (정답이므로)
  };
}

// ── 기본 설정 ───────────────────────────────────────────────

/** 기본 PoC 설정 — 프롬프트 개선 시 이 fieldSpecs만 수정 */
export function createDefaultConfig(): PocRunConfig {
  return {
    fieldSpecs: [
      {
        fieldName: "skin_types",
        allowedValues: SKIN_TYPES,
        promptHint:
          "Skin types this product is suitable for. Consider the product category, key ingredients, and typical usage.",
      },
      {
        fieldName: "concerns",
        allowedValues: SKIN_CONCERNS,
        promptHint:
          "Skin concerns this product addresses or helps improve. Consider the product's ingredients and intended effects.",
      },
    ],
    threshold: DEFAULT_PASS_THRESHOLD,
    similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
  };
}

// ── YAML 로드 ───────────────────────────────────────────────

function loadM1Products(): M1Product[] {
  const raw = readFileSync(M1_YAML_PATH, "utf-8");
  const data = parseYaml(raw) as { products: M1Product[] };
  return data.products;
}

// ── 메인 실행 ───────────────────────────────────────────────

async function runPoc(config: PocRunConfig): Promise<PocResult> {
  const products = loadM1Products();
  console.log(`\n=== P2-56r: AI Classification Accuracy PoC ===`);
  console.log(
    `Provider: ${pipelineEnv.AI_PROVIDER}, Model: ${pipelineEnv.AI_MODEL ?? "default"}`,
  );
  console.log(`Products: ${products.length}, Threshold: ${config.threshold}`);
  console.log(`Similarity threshold: ${config.similarityThreshold}\n`);

  const results: ProductResult[] = [];

  for (const product of products) {
    const inputData = extractInputData(product);
    const expected = {
      skinTypes: product.skin_types,
      concerns: product.concerns,
    };

    console.log(`  ${product.id}: ${product.name.en}...`);

    const classifyResult = await classifyFields(inputData, config.fieldSpecs);

    const predicted = {
      skinTypes: classifyResult.classified.skin_types?.values ?? [],
      concerns: classifyResult.classified.concerns?.values ?? [],
    };

    const evaluation = evaluateProduct(
      predicted,
      expected,
      config.similarityThreshold,
    );
    evaluation.id = product.id;
    evaluation.name = product.name.en;

    const skinIcon = evaluation.skinTypes.accurate ? "OK" : "FAIL";
    const concernsIcon = evaluation.concerns.accurate ? "OK" : "FAIL";
    console.log(
      `    skin_types: AI=${predicted.skinTypes.join(",")} / expected=${expected.skinTypes.join(",")} → ${skinIcon} (${(evaluation.skinTypes.similarity * 100).toFixed(0)}%)`,
    );
    console.log(
      `    concerns:   AI=${predicted.concerns.join(",")} / expected=${expected.concerns.join(",")} → ${concernsIcon} (${(evaluation.concerns.similarity * 100).toFixed(0)}%)`,
    );

    results.push(evaluation);
  }

  const accuracy = calculateOverallAccuracy(results, config.threshold);

  const pocResult: PocResult = {
    config: {
      provider: pipelineEnv.AI_PROVIDER,
      model: pipelineEnv.AI_MODEL ?? "default",
      threshold: config.threshold,
      similarityThreshold: config.similarityThreshold,
      timestamp: new Date().toISOString(),
    },
    products: results,
    accuracy: {
      skinTypes: accuracy.skinTypes,
      concerns: accuracy.concerns,
      overall: accuracy.overall,
    },
    passed: accuracy.passed,
  };

  // 결과 출력
  console.log(`\n=== Results ===`);
  console.log(
    `skin_types accuracy: ${(accuracy.skinTypes * 100).toFixed(0)}%`,
  );
  console.log(
    `concerns accuracy:   ${(accuracy.concerns * 100).toFixed(0)}%`,
  );
  console.log(`overall accuracy:    ${(accuracy.overall * 100).toFixed(0)}%`);
  console.log(
    `Verdict: ${accuracy.passed ? "PASS" : "FAIL"} (threshold: ${config.threshold * 100}%)`,
  );

  // 결과 JSON 저장
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = join(
    RESULTS_DIR,
    `poc-classify-${timestamp}.json`,
  );
  writeFileSync(outputPath, JSON.stringify(pocResult, null, 2));
  console.log(`\nResults saved: ${outputPath}`);

  return pocResult;
}

// ── CLI 진입점 (import 시 자동 실행 방지) ────────────────────

const isCLI =
  process.argv[1]?.endsWith("classify-accuracy.ts") ||
  process.argv[1]?.endsWith("classify-accuracy.js");

if (isCLI) {
  const config = createDefaultConfig();
  runPoc(config).catch((err) => {
    console.error("PoC failed:", err);
    process.exit(1);
  });
}
