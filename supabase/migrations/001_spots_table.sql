-- ══════════════════════════════════════════════════════════════════
--  KoreaMate — spots 마스터 테이블 (전 카테고리 통합 DB)
--  Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS spots (
  -- 기본 키 / 식별자
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  place_id      TEXT        UNIQUE NOT NULL,         -- Join Key (CSV slug)

  -- 이름
  name          TEXT        NOT NULL,
  name_ko       TEXT,

  -- 카테고리 (전 카테고리 지원)
  category      TEXT        NOT NULL
    CHECK (category IN (
      'attraction', 'restaurant', 'cafe', 'hiking',
      'activity', 'accommodation', 'cultural', 'market', 'shopping'
    )),
  subcategory   TEXT,                                -- "michelin-star", "coastal-trail" 등

  -- 위치
  city          TEXT        NOT NULL DEFAULT 'Busan',
  district      TEXT,
  address       TEXT,

  -- 콘텐츠
  description   TEXT,
  image_url     TEXT,                               -- 검증된 사진 URL

  -- 시간 & 난이도
  duration_minutes  INTEGER,
  difficulty        TEXT
    CHECK (difficulty IS NULL OR difficulty IN ('easy', 'moderate', 'hard')),
  required_gear     TEXT,                           -- 외국인용 준비물 안내

  -- 실용 정보
  tips              TEXT,
  price_range       TEXT,                           -- "Free", "₩15,000~₩30,000"
  michelin_stars    INTEGER
    CHECK (michelin_stars IS NULL OR michelin_stars IN (1, 2, 3)),
  opening_hours     TEXT,

  -- 외국인 친화도
  foreign_card_accepted  BOOLEAN DEFAULT true,
  solo_friendly          BOOLEAN DEFAULT true,

  -- 지도 링크
  google_maps_url   TEXT,
  naver_maps_url    TEXT,

  -- 관리
  is_published      BOOLEAN     DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_spots_category ON spots(category);
CREATE INDEX IF NOT EXISTS idx_spots_city     ON spots(city);
CREATE INDEX IF NOT EXISTS idx_spots_place_id ON spots(place_id);

-- Row Level Security (오픈 RLS — anon 읽기/쓰기 허용)
ALTER TABLE spots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read spots"
  ON spots FOR SELECT TO anon USING (true);

CREATE POLICY "Public insert spots"
  ON spots FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public update spots"
  ON spots FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Public delete spots"
  ON spots FOR DELETE TO anon USING (true);

-- updated_at 자동 갱신 트리거 (선택)
CREATE OR REPLACE FUNCTION update_spots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER spots_updated_at
  BEFORE UPDATE ON spots
  FOR EACH ROW EXECUTE FUNCTION update_spots_updated_at();
