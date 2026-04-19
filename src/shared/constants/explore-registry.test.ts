import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { EXPLORE_REGISTRY } from './explore-registry';
import type { ExploreDomain } from '@/shared/types/explore';

const VALID_DOMAINS: ExploreDomain[] = ['products', 'treatments', 'stores', 'clinics'];

describe('EXPLORE_REGISTRY', () => {
  it('4개 도메인을 포함한다', () => {
    expect(EXPLORE_REGISTRY).toHaveLength(4);
  });

  it('각 도메인 id가 ExploreDomain 유니온에 속한다', () => {
    const ids = EXPLORE_REGISTRY.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(VALID_DOMAINS));
  });

  it('모든 도메인에 filterFields가 1개 이상 존재한다', () => {
    for (const domain of EXPLORE_REGISTRY) {
      expect(domain.filterFields.length).toBeGreaterThan(0);
    }
  });

  it('모든 도메인에 sortFields가 1개 이상 존재한다', () => {
    for (const domain of EXPLORE_REGISTRY) {
      expect(domain.sortFields.length).toBeGreaterThan(0);
    }
  });

  it('모든 도메인에 defaultSort가 존재한다', () => {
    for (const domain of EXPLORE_REGISTRY) {
      expect(domain.defaultSort).toBeDefined();
      expect(domain.defaultSort.field).toBeTruthy();
      expect(['asc', 'desc']).toContain(domain.defaultSort.order);
    }
  });

  it('모든 도메인에 labelKey가 존재한다', () => {
    for (const domain of EXPLORE_REGISTRY) {
      expect(domain.labelKey).toBeTruthy();
    }
  });

  it('select/multi 타입 필터에 options가 존재한다', () => {
    for (const domain of EXPLORE_REGISTRY) {
      for (const field of domain.filterFields) {
        if (field.type === 'select' || field.type === 'multi') {
          expect(field.options).toBeDefined();
          expect(field.options!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('range 타입 필터에 max와 unit이 존재한다', () => {
    for (const domain of EXPLORE_REGISTRY) {
      for (const field of domain.filterFields) {
        if (field.type === 'range') {
          expect(field.max).toBeDefined();
          expect(field.unit).toBeTruthy();
        }
      }
    }
  });

  it('constants/ peer import 없이 인라인 리터럴만 사용한다 (V-16)', () => {
    const filePath = path.resolve(__dirname, 'explore-registry.ts');
    const source = fs.readFileSync(filePath, 'utf-8');
    const importLines = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import'));

    for (const line of importLines) {
      // type import는 허용 (shared/types)
      if (line.includes('type ') || line.includes('type{')) continue;
      // constants/ peer import 금지
      expect(line).not.toMatch(/from\s+['"].*constants\//);
    }
  });

  it('도메인 id에 중복이 없다', () => {
    const ids = EXPLORE_REGISTRY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
