/**
 * PoC Tool 정의 — TDD §3.5 기반
 *
 * search_beauty_data: 제품/시술 검색 (F1)
 * get_external_links: 외부 링크 조회 (F2)
 *
 * execute 함수는 mock 데이터를 반환. 프로덕션에서는 RAG + SQL 검색으로 대체.
 *
 * NOTE: Zod 4 + @ai-sdk/google 호환 이슈로 tool() 헬퍼 대신 inputSchema + zodSchema() 사용.
 * tool()의 parameters 키가 SDK 내부의 inputSchema로 매핑되지 않는 버그.
 * 프로덕션에서는 SDK 업데이트 후 tool() 헬퍼로 복원 가능.
 */
import { zodSchema } from 'ai';
import { z } from 'zod';
import { MOCK_PRODUCTS, MOCK_TREATMENTS, MOCK_LINKS } from './mock-data.js';

// Tool 파라미터 스키마 (Zod 4)
const searchBeautyDataSchema = z.object({
  query: z.string().describe('Search query in natural language'),
  domain: z
    .enum(['shopping', 'treatment'])
    .describe('Which domain to search: shopping for products, treatment for clinic procedures'),
  filters: z
    .object({
      skin_types: z
        .array(z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal']))
        .optional()
        .describe('Filter by suitable skin types'),
      concerns: z
        .array(z.string())
        .optional()
        .describe('Filter by target concerns (e.g. acne, wrinkles, dark_spots, dryness)'),
      budget_max_krw: z.number().optional().describe('Maximum budget in KRW'),
      english_support: z.boolean().optional().describe('Requires English-speaking staff'),
    })
    .optional()
    .describe('Optional filters to narrow results'),
  limit: z.number().optional().default(3).describe('Max results to return (default 3)'),
});

const getExternalLinksSchema = z.object({
  entity_id: z.string().describe('ID of the entity (e.g. prod-001, treat-001)'),
  entity_type: z
    .enum(['product', 'store', 'clinic', 'treatment'])
    .describe('Type of entity'),
});

// 타입 추출
type SearchParams = z.infer<typeof searchBeautyDataSchema>;
type LinkParams = z.infer<typeof getExternalLinksSchema>;

export const pocTools: Record<string, {
  description: string;
  inputSchema: ReturnType<typeof zodSchema>;
  execute: (args: any) => Promise<any>;
}> = {
  search_beauty_data: {
    description:
      'Search K-beauty products or treatments matching user criteria. Returns structured data for recommendation cards.',
    inputSchema: zodSchema(searchBeautyDataSchema),
    execute: async (args: any) => {
      const { domain, limit } = args ?? {};
      const data = domain === 'shopping' ? MOCK_PRODUCTS : MOCK_TREATMENTS;
      const results = data.slice(0, (limit as number) ?? 3);
      return { cards: results, total: data.length };
    },
  },

  get_external_links: {
    description:
      'Get purchase links, booking links, or map links for a specific product, store, clinic, or treatment.',
    inputSchema: zodSchema(getExternalLinksSchema),
    execute: async (args: any) => {
      const { entity_id } = args ?? {};
      return MOCK_LINKS[entity_id] ?? { links: [] };
    },
  },
};
