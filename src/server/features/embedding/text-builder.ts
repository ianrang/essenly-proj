import 'server-only';
import { EMBEDDING_CONFIG } from '@/shared/constants/embedding';
import type { Product, Store, Clinic, Treatment } from '@/shared/types/domain';

// ============================================================
// 임베딩 텍스트 빌더 — embedding-strategy.md §2.2
// L-7 준수: 순수 함수만 (DB/API 호출 없음).
// G-9: export 4개 (build*EmbeddingText).
// NOTE: scripts/generate-embeddings.ts에 로컬 복제 존재 (P-9 제약).
//       이 함수 수정 시 스크립트도 동기화 필요.
// ============================================================

function getLocalizedText(field: Record<string, string> | null): string {
  if (!field) return '';
  return EMBEDDING_CONFIG.TEXT_LANGUAGES
    .map(lang => field[lang] || '')
    .filter(Boolean)
    .join('. ');
}

function getTagsText(tags: string[] | null): string {
  if (!tags?.length) return '';
  const filter = EMBEDDING_CONFIG.TAG_FILTER;
  if (!filter) return tags.join(', ');
  return tags.filter(t => !filter.exclude.includes(t)).join(', ');
}

function joinParts(parts: (string | undefined | null)[]): string {
  return parts
    .filter(Boolean)
    .join(' | ')
    .slice(0, EMBEDDING_CONFIG.MAX_TEXT_LENGTH);
}

export function buildProductEmbeddingText(product: Product): string {
  return joinParts([
    getLocalizedText(product.name),
    getLocalizedText(product.description),
    product.category,
    product.skin_types?.join(', '),
    product.concerns?.join(', '),
    Array.isArray(product.key_ingredients)
      ? product.key_ingredients.join(', ')
      : '',
    getTagsText(product.tags),
  ]);
}

export function buildStoreEmbeddingText(store: Store): string {
  return joinParts([
    getLocalizedText(store.name),
    getLocalizedText(store.description),
    store.district,
    store.store_type,
    store.english_support,
    store.tourist_services?.join(', '),
    getTagsText(store.tags),
  ]);
}

export function buildClinicEmbeddingText(clinic: Clinic): string {
  return joinParts([
    getLocalizedText(clinic.name),
    getLocalizedText(clinic.description),
    clinic.district,
    clinic.clinic_type,
    clinic.english_support,
    clinic.consultation_type?.join(', '),
    getTagsText(clinic.tags),
  ]);
}

export function buildTreatmentEmbeddingText(treatment: Treatment): string {
  return joinParts([
    getLocalizedText(treatment.name),
    getLocalizedText(treatment.description),
    treatment.category,
    treatment.target_concerns?.join(', '),
    treatment.suitable_skin_types?.join(', '),
    getTagsText(treatment.tags),
  ]);
}
