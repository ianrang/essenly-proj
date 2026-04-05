import 'server-only';
import { z } from 'zod';
import {
  KB_DOCUMENTS,
  KB_INGREDIENT_TOPICS,
  KB_TREATMENT_TOPICS,
  type KbDocument,
} from '@/shared/constants/kb.generated';

// ============================================================
// lookup_beauty_knowledge Tool Handler
// R-6: tool handler. shared/constants에서 KB 데이터 조회.
// R-10: service 역호출 금지.
// P-3: 제거 시 다른 features/ 무영향.
// ============================================================

/** tool 입력 스키마 — service.ts에서 tool() inputSchema로 사용 */
export const lookupBeautyKnowledgeSchema = z.object({
  topic: z.string().describe(
    'Topic to look up. Use kebab-case. Examples: "retinol", "botox", "hyaluronic-acid"'
  ),
});

type KnowledgeArgs = z.infer<typeof lookupBeautyKnowledgeSchema>;

interface KnowledgeResult {
  found: boolean;
  topic: string;
  category: 'ingredient' | 'treatment' | null;
  content: string | null;
}

/**
 * lookup_beauty_knowledge tool execute 함수.
 * topic → KB_DOCUMENTS 조회 → 내용 반환.
 * 미존재 topic → { found: false }.
 */
export async function executeLookupBeautyKnowledge(
  args: KnowledgeArgs,
): Promise<KnowledgeResult> {
  const normalized = args.topic.toLowerCase().trim();
  const doc = KB_DOCUMENTS[normalized as keyof typeof KB_DOCUMENTS] as KbDocument | undefined;

  if (!doc) {
    return { found: false, topic: normalized, category: null, content: null };
  }

  return { found: true, topic: doc.topic, category: doc.category, content: doc.content };
}

/** 시스템 프롬프트에서 사용할 topic 목록 */
export const AVAILABLE_TOPICS = {
  ingredients: KB_INGREDIENT_TOPICS,
  treatments: KB_TREATMENT_TOPICS,
} as const;
