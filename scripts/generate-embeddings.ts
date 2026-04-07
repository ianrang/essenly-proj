// scripts/generate-embeddings.ts
// P-9: scripts/ = Composition Root. server/core/ + shared/ import만 허용.
// server/features/ import 금지 → text-builder 로직을 로컬 헬퍼로 구성.
// 실행: npx tsx scripts/generate-embeddings.ts

import { createPipelineClient } from './seed/lib/utils/db-client';
import { embed } from 'ai';
import { google } from '@ai-sdk/google';
import { EMBEDDING_CONFIG } from '../src/shared/constants/embedding';
import type { EmbeddingEntityType } from '../src/shared/constants/embedding';

// ============================================================
// 임베딩 함수 — core/knowledge.ts embedDocument() 로직 재현.
// server-only가 CJS(tsx)에서 throw하므로 core/ import 불가.
// P-9 허용 범위이나 런타임 제약으로 직접 구성.
// core/knowledge.ts가 정본. 변경 시 동기화 필요.
// ============================================================

const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION) || 1024;
const embeddingModel = google.textEmbeddingModel('gemini-embedding-001');

async function embedDocument(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    providerOptions: {
      google: {
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: EMBEDDING_DIMENSION,
      },
    },
  });
  return embedding;
}

// ============================================================
// 텍스트 빌더 — embedding-strategy.md §2.2 로직 재현.
// features/embedding/text-builder.ts와 동일 로직이지만,
// P-9 제약으로 features/ import 불가 → 스크립트 내 로컬 구현.
// text-builder.ts가 정본. 변경 시 양쪽 동기화 필요.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 스크립트 전용, DB 레코드
type Entity = Record<string, any>;

const TEXT_BUILDERS: Record<EmbeddingEntityType, (e: Entity) => string> = {
  products: (p) => joinParts([
    getLocalizedText(p.name), getLocalizedText(p.description),
    p.category, p.skin_types?.join(', '), p.concerns?.join(', '),
    Array.isArray(p.key_ingredients) ? p.key_ingredients.join(', ') : '',
    getTagsText(p.tags),
  ]),
  stores: (s) => joinParts([
    getLocalizedText(s.name), getLocalizedText(s.description),
    s.district, s.store_type, s.english_support,
    s.tourist_services?.join(', '), getTagsText(s.tags),
  ]),
  clinics: (c) => joinParts([
    getLocalizedText(c.name), getLocalizedText(c.description),
    c.district, c.clinic_type, c.english_support,
    c.consultation_type?.join(', '), getTagsText(c.tags),
  ]),
  treatments: (t) => joinParts([
    getLocalizedText(t.name), getLocalizedText(t.description),
    t.category, t.target_concerns?.join(', '),
    t.suitable_skin_types?.join(', '), getTagsText(t.tags),
  ]),
};

// ============================================================
// 배치 처리
// ============================================================

const TABLE_NAMES: Record<EmbeddingEntityType, string> = {
  products: 'products',
  stores: 'stores',
  clinics: 'clinics',
  treatments: 'treatments',
};

const ENTITY_TYPES: EmbeddingEntityType[] = ['products', 'stores', 'clinics', 'treatments'];

async function batchGenerate(
  client: ReturnType<typeof createPipelineClient>,
  entityType: EmbeddingEntityType,
): Promise<{ success: number; failed: number }> {
  const table = TABLE_NAMES[entityType];
  const buildText = TEXT_BUILDERS[entityType];

  const { data: entities, error } = await client
    .from(table)
    .select('*')
    .eq('status', 'active');

  if (error) throw new Error(`${table} fetch failed: ${error.message}`);
  if (!entities?.length) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  for (const entity of entities) {
    try {
      const text = buildText(entity);
      if (!text) { success++; continue; }

      const embedding = await embedDocument(text);

      const { error: updateError } = await client
        .from(table)
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', entity.id);

      if (updateError) throw updateError;
      success++;
    } catch (err) {
      console.error('[EMBEDDING_FAILED]', {
        entityType, entityId: entity.id,
        error: (err as Error).message,
      });
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, EMBEDDING_CONFIG.BATCH_DELAY_MS));
  }

  return { success, failed };
}

async function main() {
  const client = createPipelineClient();

  console.log('=== Embedding Generation Start ===\n');

  const results: Record<string, { success: number; failed: number }> = {};

  for (const entityType of ENTITY_TYPES) {
    console.log(`[${entityType}] Generating embeddings...`);
    const result = await batchGenerate(client, entityType);
    results[entityType] = result;
    console.log(`[${entityType}] Done: ${result.success} success, ${result.failed} failed\n`);
  }

  console.log('=== Summary ===');
  let totalSuccess = 0;
  let totalFailed = 0;
  for (const [type, result] of Object.entries(results)) {
    console.log(`  ${type}: ${result.success}/${result.success + result.failed}`);
    totalSuccess += result.success;
    totalFailed += result.failed;
  }
  console.log(`\nTotal: ${totalSuccess} success, ${totalFailed} failed`);

  if (totalFailed > 0) {
    console.error('\nSome embeddings failed. Check logs above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
