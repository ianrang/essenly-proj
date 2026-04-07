-- ============================================================
-- Essenly K-Beauty AI Agent — Initial Schema
-- Version: 1.0 (MVP)
-- ============================================================

-- Enable pgvector extension (for future RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- User Data
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_method TEXT NOT NULL DEFAULT 'anonymous',
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  skin_type TEXT,
  hair_type TEXT,
  hair_concerns TEXT[],
  country TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  age_range TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  country TEXT NOT NULL DEFAULT 'KR',
  city TEXT NOT NULL DEFAULT 'seoul',
  skin_concerns TEXT[],
  interest_activities TEXT[],
  stay_days INT,
  start_date DATE,
  end_date DATE,
  budget_level TEXT,
  travel_style TEXT[],
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE beauty_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL,
  entity_id UUID,
  entity_type TEXT,
  date DATE,
  satisfaction INT CHECK (satisfaction BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE learned_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  category TEXT NOT NULL,
  preference TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('like', 'dislike')),
  confidence FLOAT DEFAULT 0.5,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID REFERENCES journeys(id),
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  card_data JSONB,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE behavior_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  target_id UUID,
  target_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- consent_records: 5 items per PRD §4-C (analytics added vs original DDL)
CREATE TABLE consent_records (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  location_tracking BOOLEAN DEFAULT false,
  behavior_logging BOOLEAN DEFAULT false,
  data_retention BOOLEAN DEFAULT false,
  marketing BOOLEAN DEFAULT false,
  analytics BOOLEAN DEFAULT false,
  consented_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Domain Data
-- ============================================================

CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,
  origin TEXT,
  tier TEXT,
  is_essenly BOOLEAN DEFAULT false,
  specialties TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,
  inci_name TEXT,
  function TEXT[],
  caution_skin_types TEXT[],
  common_in TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,
  description JSONB,
  brand_id UUID REFERENCES brands(id),
  category TEXT,
  subcategory TEXT,
  skin_types TEXT[],
  hair_types TEXT[],
  concerns TEXT[],
  key_ingredients JSONB,
  price INT,
  volume TEXT,
  english_label BOOLEAN DEFAULT false,
  tourist_popular BOOLEAN DEFAULT false,
  is_highlighted BOOLEAN DEFAULT false,
  highlight_badge JSONB,
  rating FLOAT,
  review_count INT DEFAULT 0,
  review_summary JSONB,
  images TEXT[],
  tags TEXT[],
  status TEXT DEFAULT 'active',
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,
  description JSONB,
  country TEXT DEFAULT 'KR',
  city TEXT DEFAULT 'seoul',
  district TEXT,
  location GEOGRAPHY(POINT, 4326),
  address JSONB,
  operating_hours JSONB,
  english_support TEXT DEFAULT 'none',
  store_type TEXT,
  brands_available UUID[],
  tourist_services TEXT[],
  payment_methods TEXT[],
  nearby_landmarks TEXT[],
  is_highlighted BOOLEAN DEFAULT false,
  highlight_badge JSONB,
  rating FLOAT,
  review_count INT DEFAULT 0,
  images TEXT[],
  tags TEXT[],
  status TEXT DEFAULT 'active',
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,
  description JSONB,
  country TEXT DEFAULT 'KR',
  city TEXT DEFAULT 'seoul',
  district TEXT,
  location GEOGRAPHY(POINT, 4326),
  address JSONB,
  operating_hours JSONB,
  english_support TEXT DEFAULT 'none',
  clinic_type TEXT,
  license_verified BOOLEAN DEFAULT false,
  consultation_type TEXT[],
  foreigner_friendly JSONB,
  booking_url TEXT,
  external_links JSONB,
  is_highlighted BOOLEAN DEFAULT false,
  highlight_badge JSONB,
  rating FLOAT,
  review_count INT DEFAULT 0,
  images TEXT[],
  tags TEXT[],
  status TEXT DEFAULT 'active',
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,
  description JSONB,
  category TEXT,
  subcategory TEXT,
  target_concerns TEXT[],
  suitable_skin_types TEXT[],
  price_range JSONB,
  duration_minutes INT,
  downtime_days INT,
  session_count TEXT,
  precautions JSONB,
  aftercare JSONB,
  is_highlighted BOOLEAN DEFAULT false,
  highlight_badge JSONB,
  rating FLOAT,
  review_count INT DEFAULT 0,
  images TEXT[],
  tags TEXT[],
  status TEXT DEFAULT 'active',
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  name JSONB NOT NULL,
  specialties TEXT[],
  languages TEXT[],
  certifications TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Junction tables
CREATE TABLE clinic_treatments (
  clinic_id UUID REFERENCES clinics(id),
  treatment_id UUID REFERENCES treatments(id),
  PRIMARY KEY (clinic_id, treatment_id)
);

CREATE TABLE product_stores (
  product_id UUID REFERENCES products(id),
  store_id UUID REFERENCES stores(id),
  PRIMARY KEY (product_id, store_id)
);

CREATE TABLE product_ingredients (
  product_id UUID REFERENCES products(id),
  ingredient_id UUID REFERENCES ingredients(id),
  type TEXT NOT NULL CHECK (type IN ('key', 'avoid')),
  PRIMARY KEY (product_id, ingredient_id)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_journeys_user_id ON journeys(user_id);
CREATE INDEX idx_journeys_status ON journeys(status);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_journey_id ON conversations(journey_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_behavior_logs_user_id ON behavior_logs(user_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_skin_types ON products USING GIN(skin_types);
CREATE INDEX idx_products_concerns ON products USING GIN(concerns);
CREATE INDEX idx_stores_district ON stores(district);
CREATE INDEX idx_stores_status ON stores(status);
CREATE INDEX idx_clinics_district ON clinics(district);
CREATE INDEX idx_clinics_status ON clinics(status);
CREATE INDEX idx_treatments_category ON treatments(category);
CREATE INDEX idx_treatments_target_concerns ON treatments USING GIN(target_concerns);
CREATE INDEX idx_treatments_suitable_skin_types ON treatments USING GIN(suitable_skin_types);
CREATE INDEX idx_learned_preferences_user_id ON learned_preferences(user_id);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavior_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE learned_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own journeys" ON journeys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own journeys" ON journeys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journeys" ON journeys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own conversations" ON conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own messages" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own messages" ON messages
  FOR INSERT WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own consent" ON consent_records
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can read own behavior logs" ON behavior_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own behavior logs" ON behavior_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own beauty history" ON beauty_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own beauty history" ON beauty_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own preferences" ON learned_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Domain data: publicly readable
CREATE POLICY "Products are publicly readable" ON products
  FOR SELECT USING (true);

CREATE POLICY "Stores are publicly readable" ON stores
  FOR SELECT USING (true);

CREATE POLICY "Clinics are publicly readable" ON clinics
  FOR SELECT USING (true);

CREATE POLICY "Treatments are publicly readable" ON treatments
  FOR SELECT USING (true);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brands are publicly readable" ON brands
  FOR SELECT USING (true);

CREATE POLICY "Ingredients are publicly readable" ON ingredients
  FOR SELECT USING (true);

CREATE POLICY "Doctors are publicly readable" ON doctors
  FOR SELECT USING (true);
