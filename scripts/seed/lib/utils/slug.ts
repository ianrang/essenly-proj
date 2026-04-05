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
