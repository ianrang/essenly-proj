/**
 * P0-21: SQL 구조화 검색 성능 (실제 Supabase DB)
 *
 * Mock 10건 삽입 → SQL 필터 쿼리 5종 → 응답 시간 측정 → 정리
 * 성공 기준: 모든 쿼리 < 100ms
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-21-db-search.ts
 */
import { createServiceClient, printResult } from './infra/helpers.js';
import { ALL_PRODUCTS, ALL_TREATMENTS } from './shared/mock-data.js';

const DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- 삽입할 데이터 변환 ---

function toProductRow(p: (typeof ALL_PRODUCTS)[number]) {
  return {
    name: p.name,
    category: p.category,
    skin_types: p.skin_types,
    concerns: p.concerns,
    key_ingredients: p.key_ingredients,
    price: p.price,
    english_label: p.english_label ?? false,
    tourist_popular: p.tourist_popular ?? false,
    is_highlighted: p.is_highlighted ?? false,
    highlight_badge: (p as any).highlight_badge ?? null,
    rating: p.rating,
    review_count: (p as any).review_count ?? 0,
    status: 'active',
  };
}

function toTreatmentRow(t: (typeof ALL_TREATMENTS)[number]) {
  return {
    name: t.name,
    category: t.category,
    target_concerns: t.target_concerns,
    suitable_skin_types: t.suitable_skin_types,
    price_range: t.price_range,
    duration_minutes: t.duration_minutes,
    downtime_days: t.downtime_days,
    is_highlighted: t.is_highlighted ?? false,
    highlight_badge: (t as any).highlight_badge ?? null,
    rating: t.rating,
    status: 'active',
  };
}

// --- SQL 쿼리 테스트 ---

interface QueryTest {
  id: string;
  description: string;
  run: (supabase: ReturnType<typeof createServiceClient>) => Promise<{ count: number; detail: string }>;
}

const QUERIES: QueryTest[] = [
  {
    id: 'S1',
    description: "WHERE 'dry' = ANY(skin_types)",
    run: async (sb) => {
      const { data, error } = await sb
        .from('products')
        .select('id, name, price')
        .contains('skin_types', ['dry']);
      if (error) throw new Error(error.message);
      return { count: data.length, detail: `${data.length} products for dry skin` };
    },
  },
  {
    id: 'S2',
    description: "WHERE skin_types && ARRAY['oily','combination']",
    run: async (sb) => {
      const { data, error } = await sb
        .from('products')
        .select('id, name, price')
        .overlaps('skin_types', ['oily', 'combination']);
      if (error) throw new Error(error.message);
      return { count: data.length, detail: `${data.length} products for oily/combination` };
    },
  },
  {
    id: 'S3',
    description: 'WHERE price BETWEEN 10000 AND 16000',
    run: async (sb) => {
      const { data, error } = await sb
        .from('products')
        .select('id, name, price')
        .gte('price', 10000)
        .lte('price', 16000);
      if (error) throw new Error(error.message);
      return { count: data.length, detail: `${data.length} products in 10K-16K range` };
    },
  },
  {
    id: 'S4',
    description: "Multi-filter: concerns contains 'acne' AND price < 15000",
    run: async (sb) => {
      const { data, error } = await sb
        .from('products')
        .select('id, name, price, concerns')
        .contains('concerns', ['acne'])
        .lt('price', 15000);
      if (error) throw new Error(error.message);
      return { count: data.length, detail: `${data.length} affordable acne products` };
    },
  },
  {
    id: 'S5',
    description: "Treatments: target_concerns contains 'dark_spots' AND downtime_days <= 1",
    run: async (sb) => {
      const { data, error } = await sb
        .from('treatments')
        .select('id, name, downtime_days')
        .contains('target_concerns', ['dark_spots'])
        .lte('downtime_days', 1);
      if (error) throw new Error(error.message);
      return { count: data.length, detail: `${data.length} low-downtime dark spot treatments` };
    },
  },
];

// --- 메인 ---

async function main() {
  console.log('=== P0-21: SQL Structured Search Performance ===\n');

  const supabase = createServiceClient();
  const insertedProductIds: string[] = [];
  const insertedTreatmentIds: string[] = [];
  let allPass = true;

  // --- 1. Mock 데이터 삽입 ---
  console.log('--- 1. Insert mock data ---');

  for (const p of ALL_PRODUCTS) {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert(toProductRow(p))
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      insertedProductIds.push(data.id);
    } catch (err) {
      console.error(`  ERROR inserting product ${p.id}: ${(err as Error).message}`);
    }
  }
  console.log(`  Products inserted: ${insertedProductIds.length}/${ALL_PRODUCTS.length}`);

  for (const t of ALL_TREATMENTS) {
    try {
      const { data, error } = await supabase
        .from('treatments')
        .insert(toTreatmentRow(t))
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      insertedTreatmentIds.push(data.id);
    } catch (err) {
      console.error(`  ERROR inserting treatment ${t.id}: ${(err as Error).message}`);
    }
  }
  console.log(`  Treatments inserted: ${insertedTreatmentIds.length}/${ALL_TREATMENTS.length}`);

  if (insertedProductIds.length === 0 && insertedTreatmentIds.length === 0) {
    console.error('\n  No data inserted. Cannot test queries.');
    process.exit(1);
  }

  await sleep(DELAY_MS);

  // --- 2. SQL 쿼리 성능 테스트 ---
  console.log('\n--- 2. SQL Query Performance ---');

  for (const qt of QUERIES) {
    console.log(`\n  ${qt.id}: ${qt.description}`);
    try {
      const start = performance.now();
      const result = await qt.run(supabase);
      const elapsed = performance.now() - start;

      const pass = elapsed < 100;
      if (!pass) allPass = false;
      printResult(
        `${qt.id} (${elapsed.toFixed(1)}ms)`,
        pass,
        `${result.detail} — ${pass ? '<100ms' : '>100ms SLOW'}`,
      );
    } catch (err) {
      printResult(qt.id, false, (err as Error).message);
      allPass = false;
    }
    await sleep(DELAY_MS);
  }

  // --- 3. 복합 쿼리 (JOIN 시뮬레이션) ---
  console.log('\n--- 3. Combined query ---');
  try {
    const start = performance.now();
    const { data, error } = await supabase
      .from('products')
      .select('id, name, price, skin_types, concerns, rating')
      .contains('skin_types', ['dry'])
      .gte('price', 10000)
      .lte('price', 20000)
      .order('rating', { ascending: false })
      .limit(5);

    const elapsed = performance.now() - start;
    if (error) throw new Error(error.message);

    const pass = elapsed < 100;
    if (!pass) allPass = false;
    printResult(
      `Combined (${elapsed.toFixed(1)}ms)`,
      pass,
      `dry + 10K-20K + rating desc → ${data.length} results`,
    );

    if (data.length > 0) {
      console.log('    Top result:', JSON.stringify(data[0].name));
    }
  } catch (err) {
    printResult('Combined', false, (err as Error).message);
    allPass = false;
  }

  // --- 4. 정리 ---
  console.log('\n--- 4. Cleanup ---');
  try {
    if (insertedProductIds.length > 0) {
      const { error } = await supabase
        .from('products')
        .delete()
        .in('id', insertedProductIds);
      if (error) throw new Error(error.message);
      printResult('DELETE products', true, `${insertedProductIds.length} rows`);
    }

    if (insertedTreatmentIds.length > 0) {
      const { error } = await supabase
        .from('treatments')
        .delete()
        .in('id', insertedTreatmentIds);
      if (error) throw new Error(error.message);
      printResult('DELETE treatments', true, `${insertedTreatmentIds.length} rows`);
    }
  } catch (err) {
    printResult('Cleanup', false, (err as Error).message);
  }

  // --- 결과 요약 ---
  console.log('\n=== P0-21 Results Summary ===');
  console.log(`  Queries tested: ${QUERIES.length} + 1 combined`);
  console.log(`  All < 100ms: ${allPass ? 'YES' : 'NO'}`);
  console.log(`  Note: 10건 규모 테스트. MVP 200~500건에서도 인덱스(GIN) 적용으로 성능 유지 예상.`);
  console.log(`\n=== P0-21 Verdict: ${allPass ? 'PASS' : 'FAIL'} ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
