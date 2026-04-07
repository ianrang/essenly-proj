-- ============================================================
-- Migration 012: match_products/match_treatments RPC 카드 렌더링 컬럼 확장
-- P2-78: RETURNS TABLE을 카드 렌더링 필수 필드 전체로 확장.
-- SQL 폴백(select('*'))과 반환 필드 동일화.
-- embedding/created_at/updated_at/status 제외 (카드 미사용).
-- 기존 파라미터/WHERE/ORDER 변경 없음 (하위 호환).
-- NOTE: PostgreSQL은 CREATE OR REPLACE로 RETURNS TABLE 컬럼 변경 불가.
--       DROP FUNCTION 선행 필수.
-- ============================================================

-- 기존 함수 삭제 (파라미터 시그니처 명시)
DROP FUNCTION IF EXISTS match_products(vector, integer, text[], text[], integer);
DROP FUNCTION IF EXISTS match_treatments(vector, integer, text[], text[], integer, integer);

-- 제품 벡터 검색 (003 대체)
CREATE FUNCTION match_products(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_skin_types text[] DEFAULT NULL,
  filter_concerns text[] DEFAULT NULL,
  filter_max_price int DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  description jsonb,
  brand_id uuid,
  category text,
  subcategory text,
  skin_types text[],
  hair_types text[],
  concerns text[],
  key_ingredients jsonb,
  price int,
  volume text,
  purchase_links jsonb,
  english_label boolean,
  tourist_popular boolean,
  is_highlighted boolean,
  highlight_badge jsonb,
  rating float,
  review_count int,
  review_summary jsonb,
  images text[],
  tags text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.description, p.brand_id,
    p.category, p.subcategory,
    p.skin_types, p.hair_types, p.concerns, p.key_ingredients,
    p.price, p.volume, p.purchase_links,
    p.english_label, p.tourist_popular,
    p.is_highlighted, p.highlight_badge,
    p.rating, p.review_count, p.review_summary,
    p.images, p.tags,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM products p
  WHERE p.embedding IS NOT NULL
    AND p.status = 'active'
    AND (filter_skin_types IS NULL OR p.skin_types && filter_skin_types)
    AND (filter_concerns IS NULL OR p.concerns && filter_concerns)
    AND (filter_max_price IS NULL OR p.price <= filter_max_price)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 시술 벡터 검색 (007 대체)
CREATE FUNCTION match_treatments(
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  filter_skin_types text[] DEFAULT NULL,
  filter_concerns text[] DEFAULT NULL,
  filter_max_price int DEFAULT NULL,
  filter_max_downtime int DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name jsonb,
  description jsonb,
  category text,
  subcategory text,
  target_concerns text[],
  suitable_skin_types text[],
  price_min int,
  price_max int,
  price_currency text,
  duration_minutes int,
  downtime_days int,
  session_count text,
  precautions jsonb,
  aftercare jsonb,
  is_highlighted boolean,
  highlight_badge jsonb,
  rating float,
  review_count int,
  images text[],
  tags text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.name, t.description,
    t.category, t.subcategory,
    t.target_concerns, t.suitable_skin_types,
    t.price_min, t.price_max, t.price_currency,
    t.duration_minutes, t.downtime_days, t.session_count,
    t.precautions, t.aftercare,
    t.is_highlighted, t.highlight_badge,
    t.rating, t.review_count,
    t.images, t.tags,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM treatments t
  WHERE t.embedding IS NOT NULL
    AND t.status = 'active'
    AND (filter_skin_types IS NULL OR t.suitable_skin_types && filter_skin_types)
    AND (filter_concerns IS NULL OR t.target_concerns && filter_concerns)
    AND (filter_max_price IS NULL OR t.price_max <= filter_max_price)
    AND (filter_max_downtime IS NULL OR t.downtime_days <= filter_max_downtime)
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
