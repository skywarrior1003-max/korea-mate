-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 003: places 테이블 — GoKoreaMate 장소 단일 원본 (Single Source of Truth)
-- 완전 멱등 마이그레이션: DROP TABLE 없음 — 기존 데이터 보존, 재실행 안전
--
-- 목적: 레스토랑·관광지·카페·쇼핑 등 모든 장소의 최종 단일 원본 테이블
--       restaurants / spots 테이블은 이 테이블로 장기적으로 통합됩니다.
-- ══════════════════════════════════════════════════════════════════════════════

-- gen_random_uuid() 안정 보장 (Supabase 환경에서도 명시적 활성화)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS places (

  -- ── 기본 식별자 ────────────────────────────────────────────────────────────
  id                   UUID             PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 앱 전역에서 장소를 식별하는 안정적인 키
  -- 형식 예시: busan_food_001 | busan_rest_michelin_001 | busan_attr_001
  -- 한 번 결정하면 변경 금지 (즐겨찾기·일정·리뷰가 이 값에 의존)
  place_id             TEXT             UNIQUE NOT NULL,

  -- ── 이름 ────────────────────────────────────────────────────────────────────
  name                 TEXT             NOT NULL,        -- 대표 이름 (검색·AI용 기본값)
  name_ko              TEXT,                              -- 한국어 공식명
  name_en              TEXT,                              -- 영문명

  -- ── 분류 ─────────────────────────────────────────────────────────────────────
  -- category 허용값: restaurant | attraction | cafe | shopping | transport | event
  category             TEXT             NOT NULL,
  -- subcategory: 음식 장르·관광지 유형 등 (해물찜, Temple, Night Market 등 자유 텍스트)
  subcategory          TEXT,

  -- ── 설명 ────────────────────────────────────────────────────────────────────
  description          TEXT,                              -- 대표 설명 (한국어 우선)
  description_ko       TEXT,
  description_en       TEXT,

  -- ── 위치 ────────────────────────────────────────────────────────────────────
  address              TEXT,                              -- 대표 주소 (한국어 지번/도로명)
  road_address         TEXT,                              -- 도로명 주소 (선택)
  district             TEXT,                              -- 구/군 영문 (Haeundae-gu 등)
  district_ko          TEXT,                              -- 구/군 한국어 (해운대구 등)
  city                 TEXT             DEFAULT 'Busan',

  -- ── 연락처 ──────────────────────────────────────────────────────────────────
  phone                TEXT,

  -- ── 좌표 ────────────────────────────────────────────────────────────────────
  lat                  DOUBLE PRECISION,
  lng                  DOUBLE PRECISION,

  -- ── 지도 URL ────────────────────────────────────────────────────────────────
  google_maps_url      TEXT,
  naver_maps_url       TEXT,
  naver_search_keyword TEXT,                              -- 네이버 지도 직접 검색 키워드

  -- ── 이미지 ──────────────────────────────────────────────────────────────────
  image_url            TEXT,                              -- 대표 이미지 단일 URL
  images               JSONB            DEFAULT '[]'::JSONB, -- 추가 이미지 배열

  -- ── 출처 ────────────────────────────────────────────────────────────────────
  -- source 허용값: official_public | official_tourism | curated_manual | user_suggested
  source               TEXT             NOT NULL DEFAULT 'curated_manual',
  source_url           TEXT,                              -- 원본 URL
  -- source_ref: 출처 구분명 (michelin-2026 / Busan Food 100 / KTO 등)
  source_ref           TEXT,

  -- ── 등급/수상 (레스토랑 전용 — 비음식점은 NULL) ───────────────────────────
  -- 허용값: 1star | bib-gourmand | selected | certified | recommended | none
  award                TEXT,
  price_range          TEXT,                              -- $ | $$ | $$$

  -- ── 좌표 품질 ────────────────────────────────────────────────────────────────
  -- exact        : GPS 실측 또는 공식 좌표 (10m 이내)
  -- approximate  : 주소 지오코딩 결과 (10~200m 오차)
  -- address_only : 주소는 있으나 좌표 없음
  -- district_center : 구/군 중심 좌표 (1km+ 오차)
  -- unknown      : 좌표 품질 미검증
  coordinate_quality   TEXT             NOT NULL DEFAULT 'unknown',

  -- ── 콘텐츠 품질 ─────────────────────────────────────────────────────────────
  -- rich    : 설명 + 주소 + 전화 + 이미지 + 태그 모두 있음
  -- basic   : 설명 + 주소 + 전화 있음 (이미지 없어도 OK)
  -- minimal : 이름 + 카테고리 + 주소만 있음
  -- invalid : 필수 필드 누락
  detail_quality       TEXT             NOT NULL DEFAULT 'minimal',

  -- ── 기능 가용성 플래그 ──────────────────────────────────────────────────────
  is_active            BOOLEAN          NOT NULL DEFAULT TRUE,
  -- is_map_usable   : 지도 핀 표시 가능 여부 (approximate 이상이면 TRUE)
  is_map_usable        BOOLEAN          NOT NULL DEFAULT FALSE,
  -- is_route_usable : 경로 계산 사용 가능 여부 (exact 좌표 필요 — 기본 FALSE)
  is_route_usable      BOOLEAN          NOT NULL DEFAULT FALSE,
  -- is_ai_usable    : AI 일정 생성 후보에 포함 가능 여부 (공식 큐레이션이면 TRUE)
  is_ai_usable         BOOLEAN          NOT NULL DEFAULT FALSE,

  -- ── 관리 상태 ────────────────────────────────────────────────────────────────
  -- admin_status 허용값: approved | pending | rejected | needs_review
  admin_status         TEXT             NOT NULL DEFAULT 'approved',
  report_count         INTEGER          NOT NULL DEFAULT 0,
  tags                 TEXT[]           DEFAULT '{}',

  -- ── 구조화되지 않은 부가 정보 ────────────────────────────────────────────────
  -- reservation_required, opening_hours 등 필드 추가 전 임시 보관 또는 레거시 데이터
  extra                JSONB            DEFAULT '{}'::JSONB,

  -- ── 타임스탬프 ──────────────────────────────────────────────────────────────
  created_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW()

);

-- ══════════════════════════════════════════════════════════════════════════════
-- 인덱스
-- ══════════════════════════════════════════════════════════════════════════════

-- 기본 조회
CREATE INDEX IF NOT EXISTS idx_places_place_id       ON places(place_id);
CREATE INDEX IF NOT EXISTS idx_places_category       ON places(category);
CREATE INDEX IF NOT EXISTS idx_places_district       ON places(district);
CREATE INDEX IF NOT EXISTS idx_places_source         ON places(source);
CREATE INDEX IF NOT EXISTS idx_places_award          ON places(award) WHERE award IS NOT NULL;

-- 필터 조회 (부분 인덱스 — 해당 조건인 행만 인덱싱)
CREATE INDEX IF NOT EXISTS idx_places_active         ON places(id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_places_ai_usable      ON places(category, district) WHERE is_ai_usable = TRUE AND is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_places_map_usable     ON places(lat, lng)           WHERE is_map_usable = TRUE AND is_active = TRUE;

-- 좌표 범위 검색 (PostGIS 미사용 시 haversine 범위 쿼리용)
CREATE INDEX IF NOT EXISTS idx_places_lat_lng        ON places(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- 품질 관리
CREATE INDEX IF NOT EXISTS idx_places_coord_quality  ON places(coordinate_quality);
CREATE INDEX IF NOT EXISTS idx_places_detail_quality ON places(detail_quality);
CREATE INDEX IF NOT EXISTS idx_places_admin_status   ON places(admin_status);

-- 신고 처리 (report_count 높은 순 관리)
CREATE INDEX IF NOT EXISTS idx_places_report_count   ON places(report_count DESC) WHERE report_count > 0;

-- ══════════════════════════════════════════════════════════════════════════════
-- updated_at 자동 갱신 트리거
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_places_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_places_updated_at ON places;
CREATE TRIGGER trg_places_updated_at
  BEFORE UPDATE ON places
  FOR EACH ROW EXECUTE FUNCTION update_places_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS 활성화
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE places ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS 정책 (실제 적용)
--
-- 읽기: 공개 사용자(anon)는 is_active = TRUE AND admin_status = 'approved' 인 장소만 조회 가능.
-- 쓰기/수정/삭제: 공개 정책 없음 — service_role(서버 API)에서만 처리.
--   → INSERT / UPDATE / DELETE는 SUPABASE_SERVICE_ROLE_KEY를 사용하는 CF Function 또는
--     Supabase Dashboard에서만 실행할 것. 클라이언트 코드에서 직접 쓰기 금지.
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Public can read active approved places" ON places;
CREATE POLICY "Public can read active approved places"
  ON places
  FOR SELECT
  USING (
    is_active = TRUE
    AND admin_status = 'approved'
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS 정책 참고 — 향후 추가 가능한 옵션 (현재 비활성)
-- ══════════════════════════════════════════════════════════════════════════════

-- [옵션 A: 신고 자동 차단 — 장기 운영용]
--   report_count >= 10 이면 익명 조회에서 자동 제외.
--   적용하려면 위 "Public can read active approved places" 정책을 이 정책으로 교체.
--
-- DROP POLICY IF EXISTS "Public can read active approved places" ON places;
-- CREATE POLICY "Public can read active approved places"
--   ON places FOR SELECT
--   USING (is_active = TRUE AND admin_status = 'approved' AND report_count < 10);
