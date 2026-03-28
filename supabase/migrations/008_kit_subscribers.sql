-- ============================================================
-- Migration 008: kit_subscribers 테이블 생성
-- schema.dbml:209-224. Kit CTA 이메일 수집 (PRD §3.6).
-- 005_indexes.sql에서 예고: "kit_subscribers CREATE TABLE 마이그레이션 시 인덱스도 함께 추가"
-- ============================================================

CREATE TABLE IF NOT EXISTS kit_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  email_encrypted TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  locale TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 중복 제출 방지 (schema.dbml:220)
CREATE UNIQUE INDEX IF NOT EXISTS idx_kit_subscribers_email_hash
  ON kit_subscribers(email_hash);

-- RLS
ALTER TABLE kit_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own kit subscriptions" ON kit_subscribers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own kit subscriptions" ON kit_subscribers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- GRANT
GRANT SELECT, INSERT ON kit_subscribers TO authenticated;
GRANT ALL ON kit_subscribers TO service_role;

NOTIFY pgrst, 'reload schema';
