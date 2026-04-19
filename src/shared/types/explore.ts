export type ExploreDomain = 'products' | 'treatments' | 'stores' | 'clinics';

export interface FilterFieldDef {
  key: string;
  labelKey: string;
  type: 'select' | 'multi' | 'range';
  options?: { value: string; labelKey: string }[];
  max?: number;
  unit?: string;
}

export interface SortFieldDef {
  value: string;
  labelKey: string;
  requiresProfile?: boolean;
}

export interface ExploreDomainConfig {
  id: ExploreDomain;
  labelKey: string;
  filterFields: FilterFieldDef[];
  sortFields: SortFieldDef[];
  defaultSort: { field: string; order: 'asc' | 'desc' };
}

export interface ExploreResponse {
  data: Array<Record<string, unknown> & { reasons?: string[] }>;
  meta: {
    total: number;
    limit: number;
    offset: number;
    domain: string;
    scored: boolean;
  };
}
