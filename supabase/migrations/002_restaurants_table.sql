-- 완전 멱등 마이그레이션: DROP TABLE 없음 — 기존 데이터 보존, 재실행 안전
-- 2026 부산 미식 가이드 (미쉐린 2026 + 부산의 맛 2026 + 택슐랭 2025)

CREATE TABLE IF NOT EXISTS restaurants (
  id               TEXT PRIMARY KEY,
  source           TEXT NOT NULL,       -- michelin-2026 | busan-mat-2026 | taegshlang-2025
  award            TEXT,                -- 1star | 2star | bib-gourmand | selected | certified | recommended
  name_ko          TEXT NOT NULL,
  name_en          TEXT NOT NULL,
  category_ko      TEXT NOT NULL,
  category_en      TEXT NOT NULL,
  district_ko      TEXT NOT NULL,
  district_en      TEXT NOT NULL,
  address_ko       TEXT NOT NULL,
  address_en       TEXT NOT NULL,
  description_ko   TEXT NOT NULL,
  description_en   TEXT NOT NULL,
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  image            TEXT,
  price_range      TEXT,
  tags             TEXT[],
  phone            TEXT,
  reservation_required BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurants_source    ON restaurants(source);
CREATE INDEX IF NOT EXISTS idx_restaurants_district  ON restaurants(district_en);
CREATE INDEX IF NOT EXISTS idx_restaurants_award     ON restaurants(award);

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON restaurants;
CREATE POLICY "anon_all" ON restaurants FOR ALL TO anon USING (true) WITH CHECK (true);
