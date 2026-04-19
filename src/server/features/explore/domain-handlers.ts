import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExploreDomain } from '@/shared/types/explore';
import type { RankedResult, ScoredItem } from '@/server/features/beauty/judgment';
import { rank } from '@/server/features/beauty/judgment';
import { findAllProducts } from '@/server/features/repositories/product-repository';
import { findAllTreatments } from '@/server/features/repositories/treatment-repository';
import { findAllStores } from '@/server/features/repositories/store-repository';
import { findAllClinics } from '@/server/features/repositories/clinic-repository';
import { scoreProducts } from '@/server/features/beauty/shopping';
import { scoreTreatments } from '@/server/features/beauty/treatment';
import { scoreStores } from '@/server/features/beauty/store';
import { scoreClinics } from '@/server/features/beauty/clinic';

export interface DomainHandler {
  fetch(
    client: SupabaseClient,
    filters: Record<string, unknown>,
    pagination: { page: number; pageSize: number },
    sort: { field: string; order: 'asc' | 'desc' },
  ): Promise<{ data: unknown[]; total: number }>;

  score(
    items: unknown[],
    ...scoringArgs: unknown[]
  ): RankedResult<ScoredItem>[];
}

const DOMAIN_HANDLERS: Record<ExploreDomain, DomainHandler> = {
  products: {
    fetch: (client, filters, pagination, sort) =>
      findAllProducts(
        client,
        { ...filters, status: 'active' } as Parameters<typeof findAllProducts>[1],
        pagination,
        sort,
      ),
    score: (items, preferredIngredients, avoidedIngredients) => {
      const scored = scoreProducts(
        items as Parameters<typeof scoreProducts>[0],
        (preferredIngredients ?? []) as string[],
        (avoidedIngredients ?? []) as string[],
      );
      return rank(scored);
    },
  },
  treatments: {
    fetch: (client, filters, pagination, sort) =>
      findAllTreatments(
        client,
        { ...filters, status: 'active' } as Parameters<typeof findAllTreatments>[1],
        pagination,
        sort,
      ),
    score: (items, endDate, stayDays) => {
      const scored = scoreTreatments(
        items as Parameters<typeof scoreTreatments>[0],
        (endDate ?? null) as string | null,
        (stayDays ?? null) as number | null,
        new Date(),
      );
      return rank(scored);
    },
  },
  stores: {
    fetch: (client, filters, pagination, sort) =>
      findAllStores(
        client,
        { ...filters, status: 'active' } as Parameters<typeof findAllStores>[1],
        pagination,
        sort,
      ),
    score: (items, userLanguage) => {
      const scored = scoreStores(
        items as Parameters<typeof scoreStores>[0],
        (userLanguage ?? null) as string | null,
      );
      return rank(scored);
    },
  },
  clinics: {
    fetch: (client, filters, pagination, sort) =>
      findAllClinics(
        client,
        { ...filters, status: 'active' } as Parameters<typeof findAllClinics>[1],
        pagination,
        sort,
      ),
    score: (items, userLanguage) => {
      const scored = scoreClinics(
        items as Parameters<typeof scoreClinics>[0],
        (userLanguage ?? null) as string | null,
      );
      return rank(scored);
    },
  },
};

export function getDomainHandler(domain: ExploreDomain): DomainHandler | null {
  return DOMAIN_HANDLERS[domain] ?? null;
}
