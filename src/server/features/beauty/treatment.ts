import 'server-only';
import type { Treatment } from '@/shared/types/domain';
import type { ScoredItem } from './judgment';
import { checkDowntimeSafety } from '@/shared/utils/date';

// ============================================================
// 시술 도메인 로직 — search-engine.md §3.2
// 3단계 다운타임 하드 필터 + ScoredItem 변환.
// §2.3: treatment.ts → judgment.ts (단방향).
// R-7: shared/ + beauty/judgment ONLY.
// L-7: 순수 함수. DB/API 호출 없음. today 파라미터 주입.
// G-2: checkDowntimeSafety는 shared/utils/date.ts 재사용.
// G-9: export 1개 (scoreTreatments).
// ============================================================

const BASE_SCORE = 0.5;
const WARNING_PENALTY = 0.1;

/**
 * 잔여 체류일 계산 — 순수 함수 (today 파라미터 주입, L-7).
 * shared/utils/date.ts의 getRemainingDays와 시그니처 상이 (today 파라미터).
 */
function calculateRemainingDays(
  endDate: string | null,
  stayDays: number | null,
  today: Date,
): number | null {
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    const t = new Date(today);
    t.setHours(0, 0, 0, 0);
    const diff = Math.ceil(
      (end.getTime() - t.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.max(0, diff);
  }
  if (stayDays != null) return stayDays;
  return null;
}

/**
 * Treatment[]에 다운타임 기반 안전성 판단을 적용하여 ScoredItem[]로 변환.
 * PRD §4-A: downtime > remainingDays → 제외.
 * user-screens.md: downtime >= 50% remainingDays → 경고.
 * search-handler(P2-20)에서 rank()와 함께 사용.
 */
export function scoreTreatments(
  treatments: Treatment[],
  endDate: string | null,
  stayDays: number | null,
  today: Date,
): ScoredItem[] {
  const remainingDays = calculateRemainingDays(endDate, stayDays, today);
  const results: ScoredItem[] = [];

  for (const treatment of treatments) {
    const safety = checkDowntimeSafety(
      treatment.downtime_days,
      remainingDays,
    );

    if (safety === 'excluded') continue;

    const isWarning = safety === 'warning';

    results.push({
      id: treatment.id,
      score: isWarning ? BASE_SCORE - WARNING_PENALTY : BASE_SCORE,
      reasons: [],
      warnings: isWarning
        ? [
            `Recovery ${treatment.downtime_days}d approaches remaining ${remainingDays}d`,
          ]
        : [],
      is_highlighted: treatment.is_highlighted,
    });
  }

  return results;
}
