import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// kb.generated mock — 실제 파일 의존 없이 테스트
vi.mock('@/shared/constants/kb.generated', () => ({
  KB_DOCUMENTS: {
    retinol: {
      topic: 'retinol',
      category: 'ingredient',
      content: '# 레티놀 (Retinol)\n\nTest content for retinol.',
    },
    botox: {
      topic: 'botox',
      category: 'treatment',
      content: '# 보톡스 (Botox)\n\nTest content for botox.',
    },
  },
  KB_INGREDIENT_TOPICS: ['retinol'],
  KB_TREATMENT_TOPICS: ['botox'],
}));

import {
  executeLookupBeautyKnowledge,
  lookupBeautyKnowledgeSchema,
  AVAILABLE_TOPICS,
} from './knowledge-handler';

describe('knowledge-handler', () => {
  describe('executeLookupBeautyKnowledge', () => {
    it('존재하는 ingredient topic → found: true + content 반환', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: 'retinol' });
      expect(result.found).toBe(true);
      expect(result.category).toBe('ingredient');
      expect(result.content).toContain('레티놀');
    });

    it('존재하는 treatment topic → found: true + content 반환', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: 'botox' });
      expect(result.found).toBe(true);
      expect(result.category).toBe('treatment');
      expect(result.content).toContain('보톡스');
    });

    it('미존재 topic → found: false', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: 'unknown-topic' });
      expect(result.found).toBe(false);
      expect(result.category).toBeNull();
      expect(result.content).toBeNull();
    });

    it('대소문자 정규화: "RETINOL" → "retinol" 매칭', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: 'RETINOL' });
      expect(result.found).toBe(true);
      expect(result.topic).toBe('retinol');
    });

    it('공백 트림: " retinol " → "retinol" 매칭', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: ' retinol ' });
      expect(result.found).toBe(true);
      expect(result.topic).toBe('retinol');
    });

    it('빈 문자열 → found: false', async () => {
      const result = await executeLookupBeautyKnowledge({ topic: '' });
      expect(result.found).toBe(false);
    });
  });

  describe('lookupBeautyKnowledgeSchema', () => {
    it('유효 입력 파싱 성공', () => {
      const result = lookupBeautyKnowledgeSchema.safeParse({ topic: 'retinol' });
      expect(result.success).toBe(true);
    });

    it('topic 누락 → 파싱 실패', () => {
      const result = lookupBeautyKnowledgeSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('AVAILABLE_TOPICS', () => {
    it('ingredients와 treatments 배열이 존재', () => {
      expect(AVAILABLE_TOPICS.ingredients).toEqual(['retinol']);
      expect(AVAILABLE_TOPICS.treatments).toEqual(['botox']);
    });
  });
});
