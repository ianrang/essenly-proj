-- ============================================================
-- Migration 011: Drop doctors table
-- Reason: doctors 데이터는 서비스 추천 흐름에서 사용되지 않음.
--         PRD/TDD/tool-spec/search-engine 어디에도 참조 없음.
--         스키마 완결성 목적의 과설계로 판단하여 제거.
-- ============================================================

-- Drop RLS policies
DROP POLICY IF EXISTS "Doctors are publicly readable" ON doctors;

-- Drop indexes
DROP INDEX IF EXISTS idx_doctors_clinic_id;

-- Drop table (cascades FK constraint to clinics)
DROP TABLE IF EXISTS doctors;
