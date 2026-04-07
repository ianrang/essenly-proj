import 'server-only';
import type { Product } from '@/shared/types/domain';
import type { ScoredItem } from './judgment';

// ============================================================
// 쇼핑 도메인 로직 — search-engine.md §3.2
// 4단계 개인화 점수: DV-1/2 기반 성분 매칭.
// §2.3: shopping.ts → judgment.ts (단방향).
// R-7: shared/ + beauty/judgment ONLY.
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 1개 (scoreProducts).
// ============================================================

const BASE_SCORE = 0.5;
const PREFERRED_BONUS = 0.1;
const AVOIDED_PENALTY = 0.15;

function scoreProduct(
  product: Product,
  preferredIngredients: string[],
  avoidedIngredients: string[],
): { score: number; reasons: string[]; warnings: string[] } {
  const ingredients = product.key_ingredients ?? [];
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (ingredients.length === 0) {
    return { score: BASE_SCORE, reasons, warnings };
  }

  let score = BASE_SCORE;

  for (const ingredient of ingredients) {
    if (preferredIngredients.includes(ingredient)) {
      score += PREFERRED_BONUS;
      reasons.push(ingredient);
    }
    if (avoidedIngredients.includes(ingredient)) {
      score -= AVOIDED_PENALTY;
      warnings.push(ingredient);
    }
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    reasons,
    warnings,
  };
}

/**
 * Product[]에 DV-1/2 기반 개인화 점수를 부여하여 ScoredItem[]로 변환한다.
 * search-handler(P2-20)에서 rank()와 함께 사용.
 */
export function scoreProducts(
  products: Product[],
  preferredIngredients: string[],
  avoidedIngredients: string[],
): ScoredItem[] {
  return products.map((product) => {
    const { score, reasons, warnings } = scoreProduct(
      product,
      preferredIngredients,
      avoidedIngredients,
    );
    return {
      id: product.id,
      score,
      reasons,
      warnings,
      is_highlighted: product.is_highlighted,
    };
  });
}
