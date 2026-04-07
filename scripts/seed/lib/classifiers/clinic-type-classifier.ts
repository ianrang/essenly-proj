// ============================================================
// Clinic Type Classifier — p2-62-clinic-data-collection.md §1-1
// 카카오 RawRecord.data → clinic_type 자동 분류.
// MVP: 정규식 다중 매핑. 추후 LLM 분류기로 교체 가능 (인터페이스).
// P-9: scripts/ 내부 import만. server/ import 금지.
// P-10: 삭제 시 enrich-service.ts만 영향 (scripts/ 내부).
// ============================================================

// ── 인터페이스 (G-11: LLM 확장점) ─────────────────────────

/** clinic_type 분류기 인터페이스 — LLM 구현으로 교체 가능 */
export interface ClinicTypeClassifier {
  classify(data: Record<string, unknown>): string | null;
}

// ── 정규식 분류 규칙 (G-10: 매직 문자열 상수화) ──────────

/** 분류 규칙: 하나의 type에 여러 정규식 패턴 매핑 */
interface ClassifierRule {
  type: string;
  patterns: RegExp[];
}

/** 정규식 분류 규칙 목록 — 순서 중요 (첫 매칭 우선) */
const CLASSIFIER_RULES: ClassifierRule[] = [
  {
    type: "dermatology",
    patterns: [/피부과/i, /dermatolog/i, /피부클리닉/i],
  },
  {
    type: "plastic_surgery",
    patterns: [/성형외과/i, /plastic/i],
  },
  {
    type: "med_spa",
    patterns: [/메드스파/i, /med.?spa/i],
  },
  {
    type: "aesthetic",
    patterns: [/에스테틱/i, /aesthetic/i, /피부관리/i, /skincare/i],
  },
  // 미매칭 → null (classify 메서드 폴백)
  // CLINIC_TYPES에 "other" 없음 → null 반환 (Q-14 스키마 정합성)
];

// ── 데이터 추출 헬퍼 (내부 전용) ──────────────────────────

/** data.name.ko 또는 data.name 문자열 추출 */
function extractName(data: Record<string, unknown>): string {
  const name = data.name;
  if (typeof name === "string") return name;
  if (name && typeof name === "object") {
    return String((name as Record<string, unknown>).ko ?? "");
  }
  return "";
}

/** data.raw.category_name 추출 (카카오 원본 카테고리) */
function extractCategory(data: Record<string, unknown>): string {
  const raw = data.raw as Record<string, unknown> | undefined;
  return String(raw?.category_name ?? "");
}

// ── MVP 구현: 정규식 분류기 ─────────────────────────────

/** 정규식 기반 clinic_type 분류기 (MVP) */
export class RegexClinicTypeClassifier implements ClinicTypeClassifier {
  classify(data: Record<string, unknown>): string | null {
    const text = `${extractName(data)} ${extractCategory(data)}`;

    for (const rule of CLASSIFIER_RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        return rule.type;
      }
    }

    return null;
  }
}

/** 기본 분류기 인스턴스 */
export const defaultClinicTypeClassifier: ClinicTypeClassifier =
  new RegexClinicTypeClassifier();
