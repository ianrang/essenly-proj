import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  applyArrayOverlap,
  applyExact,
  applyMax,
  applyMin,
  applyTextSearch,
  applyLimit,
  applyPagination,
  applySort,
} from '@/server/features/repositories/query-utils';

function createMockQuery() {
  const query = {
    overlaps: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  };
  return query;
}

describe('query-utils', () => {
  describe('applyArrayOverlap', () => {
    it('값 있음 → overlaps 호출', () => {
      const q = createMockQuery();
      applyArrayOverlap(q, 'skin_types', ['dry', 'oily']);
      expect(q.overlaps).toHaveBeenCalledWith('skin_types', ['dry', 'oily']);
    });

    it('null → query 미변경 (VP-3)', () => {
      const q = createMockQuery();
      const result = applyArrayOverlap(q, 'skin_types', undefined);
      expect(q.overlaps).not.toHaveBeenCalled();
      expect(result).toBe(q);
    });

    it('빈 배열 → query 미변경', () => {
      const q = createMockQuery();
      const result = applyArrayOverlap(q, 'skin_types', []);
      expect(q.overlaps).not.toHaveBeenCalled();
      expect(result).toBe(q);
    });
  });

  describe('applyExact', () => {
    it('값 있음 → eq 호출', () => {
      const q = createMockQuery();
      applyExact(q, 'category', 'skincare');
      expect(q.eq).toHaveBeenCalledWith('category', 'skincare');
    });

    it('undefined → query 미변경', () => {
      const q = createMockQuery();
      const result = applyExact(q, 'category', undefined);
      expect(q.eq).not.toHaveBeenCalled();
      expect(result).toBe(q);
    });
  });

  describe('applyMax', () => {
    it('값 있음 → lte 호출', () => {
      const q = createMockQuery();
      applyMax(q, 'price', 20000);
      expect(q.lte).toHaveBeenCalledWith('price', 20000);
    });
  });

  describe('applyMin', () => {
    it('값 있음 → gte 호출', () => {
      const q = createMockQuery();
      applyMin(q, 'price', 5000);
      expect(q.gte).toHaveBeenCalledWith('price', 5000);
    });
  });

  describe('applyTextSearch', () => {
    it('값 있음 → or ILIKE 호출', () => {
      const q = createMockQuery();
      applyTextSearch(q, 'name', 'cosrx');
      expect(q.or).toHaveBeenCalledWith(
        "name->>ko.ilike.%cosrx%,name->>en.ilike.%cosrx%",
      );
    });

    it('빈 문자열 → query 미변경', () => {
      const q = createMockQuery();
      const result = applyTextSearch(q, 'name', '  ');
      expect(q.or).not.toHaveBeenCalled();
      expect(result).toBe(q);
    });
  });

  describe('applyLimit', () => {
    it('limit 적용', () => {
      const q = createMockQuery();
      applyLimit(q, 5);
      expect(q.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('applyPagination', () => {
    it('page/pageSize → range 호출', () => {
      const q = createMockQuery();
      applyPagination(q, 2, 20);
      expect(q.range).toHaveBeenCalledWith(20, 39);
    });
  });

  describe('applySort', () => {
    it('허용 필드 → order 적용', () => {
      const q = createMockQuery();
      applySort(q, 'rating', 'desc', ['rating', 'created_at']);
      expect(q.order).toHaveBeenCalledWith('rating', { ascending: false });
    });

    it('미허용 필드 → 기본값 사용', () => {
      const q = createMockQuery();
      applySort(q, 'malicious_field', 'asc', ['rating', 'created_at']);
      expect(q.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });
  });
});
