-- ============================================================
-- Migration 006: user_profiles.beauty_summary 컬럼 추가
-- DV-4 AI 뷰티 프로필 요약 저장용 (system-prompt-spec.md §10.1)
-- ============================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS beauty_summary TEXT;

COMMENT ON COLUMN user_profiles.beauty_summary IS
  'DV-4: AI 생성 뷰티 프로필 자연어 요약 (2-3문장). features/profile/에서 생성.';
