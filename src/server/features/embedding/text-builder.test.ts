import { describe, it, expect, vi } from 'vitest';
import type { Product, Store, Clinic, Treatment } from '@/shared/types/domain';

vi.mock('server-only', () => ({}));

describe('text-builder', () => {
  describe('buildProductEmbeddingText', () => {
    it('모든 필드 결합 — " | " 구분', async () => {
      const { buildProductEmbeddingText } = await import('./text-builder');
      const product = {
        name: { en: 'Snail Mucin', ko: '달팽이 무신' },
        description: { en: 'Hydrating essence', ko: '수분 에센스' },
        category: 'skincare',
        skin_types: ['dry', 'sensitive'],
        concerns: ['dryness', 'redness'],
        key_ingredients: ['snail mucin', 'hyaluronic acid'],
        tags: ['bestseller', 'hydrating'],
      };
      const result = buildProductEmbeddingText(product as Partial<Product> as Product);
      expect(result).toContain('Snail Mucin. 달팽이 무신');
      expect(result).toContain('skincare');
      expect(result).toContain('dry, sensitive');
      expect(result).toContain('snail mucin, hyaluronic acid');
      expect(result).toContain('bestseller, hydrating');
      expect(result).toContain(' | ');
    });

    it('null 필드 건너뜀', async () => {
      const { buildProductEmbeddingText } = await import('./text-builder');
      const product = {
        name: { en: 'Test' },
        description: null,
        category: null,
        skin_types: [],
        concerns: [],
        key_ingredients: null,
        tags: [],
      };
      const result = buildProductEmbeddingText(product as Partial<Product> as Product);
      expect(result).toBe('Test');
      expect(result).not.toContain(' | ');
    });

    it('MAX_TEXT_LENGTH 초과 시 잘림', async () => {
      const { buildProductEmbeddingText } = await import('./text-builder');
      const product = {
        name: { en: 'A'.repeat(2500) },
        description: null,
        category: null,
        skin_types: [],
        concerns: [],
        key_ingredients: null,
        tags: [],
      };
      const result = buildProductEmbeddingText(product as Partial<Product> as Product);
      expect(result.length).toBe(2000);
    });
  });

  describe('buildStoreEmbeddingText', () => {
    it('stores 필드 결합', async () => {
      const { buildStoreEmbeddingText } = await import('./text-builder');
      const store = {
        name: { en: 'Olive Young', ko: '올리브영' },
        description: { en: 'K-beauty store' },
        district: 'Myeongdong',
        store_type: 'beauty_store',
        english_support: 'good',
        tourist_services: ['tax_refund'],
        tags: ['popular'],
      };
      const result = buildStoreEmbeddingText(store as Partial<Store> as Store);
      expect(result).toContain('Olive Young. 올리브영');
      expect(result).toContain('Myeongdong');
      expect(result).toContain('beauty_store');
      expect(result).toContain('tax_refund');
    });
  });

  describe('buildClinicEmbeddingText', () => {
    it('clinics 필드 결합', async () => {
      const { buildClinicEmbeddingText } = await import('./text-builder');
      const clinic = {
        name: { en: 'Seoul Clinic', ko: '서울클리닉' },
        description: null,
        district: 'Gangnam',
        clinic_type: 'dermatology',
        english_support: 'fluent',
        consultation_type: ['in_person', 'video'],
        tags: ['foreigner_friendly'],
      };
      const result = buildClinicEmbeddingText(clinic as Partial<Clinic> as Clinic);
      expect(result).toContain('Seoul Clinic. 서울클리닉');
      expect(result).toContain('Gangnam');
      expect(result).toContain('in_person, video');
    });
  });

  describe('buildTreatmentEmbeddingText', () => {
    it('treatments 필드 결합', async () => {
      const { buildTreatmentEmbeddingText } = await import('./text-builder');
      const treatment = {
        name: { en: 'Botox', ko: '보톡스' },
        description: { en: 'Wrinkle reduction' },
        category: 'injectable',
        target_concerns: ['wrinkles'],
        suitable_skin_types: ['normal', 'dry'],
        tags: ['popular'],
      };
      const result = buildTreatmentEmbeddingText(treatment as Partial<Treatment> as Treatment);
      expect(result).toContain('Botox. 보톡스');
      expect(result).toContain('injectable');
      expect(result).toContain('wrinkles');
      expect(result).toContain('normal, dry');
    });
  });
});
