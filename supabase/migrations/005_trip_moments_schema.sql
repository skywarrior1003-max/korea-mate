-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 005: Trip Moments / GPS 데이터 모델
--
-- ⚠ DRAFT: DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT USER APPROVAL ⚠
--
-- 포함 테이블:
--   1. trip_sessions  — 여행 세션 원본 (비로그인 익명 세션 포함)
--   2. trip_items     — 일정 구성 장소·행사 목록
--   3. custom_spots   — 사용자 직접 추가 장소 (places와 완전 분리)
--   4. trip_moments   — 여행 추억 기록 (사진·코멘트·GPS·공유 설정)
--
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-06-17
-- Task  : TASK-005
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. trip_sessions — 여행 세션 원본
-- ────────────────────────────────────────────────────────────────────────────
-- 사용자의 여행 자체를 나타내는 단위.
-- user_id = NULL이면 익명(비로그인) 세션 — GoKoreaMate는 로그인을 강제하지 않는다.
-- trip_id는 앱 전역 식별자로 한 번 결정되면 변경 금지.
-- trip_items / trip_moments / custom_spots 모두 이 값에 의존한다.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_sessions (

  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 앱 전역 식별자 (예: busan-2026-oct-abc123)
  -- 변경 금지: trip_items, trip_moments, custom_spots가 이 값에 의존
  trip_id          TEXT        UNIQUE NOT NULL,

  -- Supabase Auth user — NULL이면 익명 세션 (로그인 강제 금지)
  user_id          UUID,

  city             TEXT        NOT NULL,   -- 예: busan | seoul | jeju
  start_date       DATE        NOT NULL,
  end_date         DATE        NOT NULL,
  arrival_time     TIME,                   -- AI Scheduler 입력값
  departure_time   TIME,                   -- AI Scheduler 입력값

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trip_sessions_date_order CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_trip_sessions_user_id
  ON trip_sessions (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trip_sessions_city_date
  ON trip_sessions (city, start_date, end_date);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. trip_items — 일정 구성 장소·행사
-- ────────────────────────────────────────────────────────────────────────────
-- My Trip에 추가된 장소(places)와 행사(events)를 순서대로 관리한다.
-- place_id / event_id 중 하나는 반드시 존재해야 한다.
-- 이름으로 연결 금지 — 반드시 ID 기준.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_items (

  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      TEXT        NOT NULL REFERENCES trip_sessions(trip_id) ON DELETE CASCADE,

  -- 장소 추가 시: place_id 설정, event_id NULL
  -- 행사 추가 시: event_id 설정, place_id NULL
  -- 둘 다 NULL 불가 (제약 참조)
  place_id     UUID        REFERENCES places(id) ON DELETE SET NULL,
  event_id     UUID        REFERENCES events(id) ON DELETE SET NULL,

  day          INTEGER,    -- 여행 N일차 (1부터 시작, NULL이면 날짜 미지정)
  item_order   INTEGER     NOT NULL DEFAULT 0,

  -- added_by: user(직접 추가) | ai(AI Scheduler) | route_template(스토리 루트)
  added_by     TEXT        NOT NULL DEFAULT 'user',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- place_id와 event_id 중 하나는 반드시 존재
  CONSTRAINT trip_items_must_have_target
    CHECK (place_id IS NOT NULL OR event_id IS NOT NULL),

  CONSTRAINT trip_items_added_by
    CHECK (added_by IN ('user', 'ai', 'route_template'))
);

CREATE INDEX IF NOT EXISTS idx_trip_items_trip_id
  ON trip_items (trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_items_trip_day
  ON trip_items (trip_id, day, item_order);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. custom_spots — 사용자 직접 추가 장소
-- ────────────────────────────────────────────────────────────────────────────
-- places 테이블에 없는 사용자만의 장소.
-- places / AI와 완전 분리 — AI가 custom_spots를 참조하거나 생성 금지.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_spots (

  custom_spot_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          TEXT        NOT NULL REFERENCES trip_sessions(trip_id) ON DELETE CASCADE,

  name             TEXT        NOT NULL,   -- 사용자 입력 장소 이름

  -- GPS 정보 — 정밀 주소 보증이 아닌 추억의 힌트
  lat              NUMERIC(10, 7),
  lng              NUMERIC(10, 7),
  gps_accuracy_m   NUMERIC,               -- GPS 정확도 (미터)

  address_label    TEXT,   -- 사람이 읽을 수 있는 주소 힌트 (예: "해운대 해수욕장 근처")
  note             TEXT,   -- 자유 메모

  -- 사진 — 업로드 시 EXIF 위치 정보 제거 필수
  photo_url        TEXT,

  -- 기본값: private (본인만 볼 수 있음)
  visibility       TEXT        NOT NULL DEFAULT 'private',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT custom_spots_visibility
    CHECK (visibility IN ('private', 'friends', 'public'))
);

CREATE INDEX IF NOT EXISTS idx_custom_spots_trip_id
  ON custom_spots (trip_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. trip_moments — 여행 추억 기록 (핵심 테이블)
-- ────────────────────────────────────────────────────────────────────────────
-- Trip Moments는 사용자의 여행기 원본 데이터다.
-- 사진·코멘트·GPS·공유 설정을 담는다.
--
-- [title / comment 타입 결정: plain text (jsonb 미적용)]
-- events.title/description은 서비스 공식 콘텐츠 → jsonb (다국어 필요)
-- trip_moments의 title/comment는 사용자 개인 추억 메모 → plain text (개인 언어로 입력)
-- 새 언어 지원이 필요한 데이터가 아니므로 jsonb 구조 불필요.
--
-- [GPS 정책]
-- GPS는 정밀 주소 보증이 아니라 사용자가 다시 찾아갈 수 있는 추억의 힌트.
-- 기본 공개 범위: private
-- 기본 위치 공유: hidden (SNS 공유 시 위치 기본 숨김)
-- exact 공유는 사용자가 명시적으로 선택해야만 활성화됨.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_moments (

  moment_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id              TEXT        NOT NULL REFERENCES trip_sessions(trip_id) ON DELETE CASCADE,

  -- 연결 장소 — 공식 장소 또는 사용자 직접 추가 장소 중 하나 (둘 다 NULL 가능 — 장소 없는 순간 기록 허용)
  place_id             UUID        REFERENCES places(id) ON DELETE SET NULL,
  custom_spot_id       UUID        REFERENCES custom_spots(custom_spot_id) ON DELETE SET NULL,

  -- 추억 내용 — 사용자 개인 언어로 입력하는 plain text (다국어 변환 불필요)
  title                TEXT,       -- 추억 제목 (예: "생애 첫 해물찜!")
  comment              TEXT,       -- 자유 텍스트 코멘트

  -- 사진 — 업로드 시 EXIF 위치 정보 제거 필수 (gokoreamate 서버에서 처리)
  photo_url            TEXT,

  -- GPS 위치 — 추억의 힌트, 정밀 주소 보증 아님
  lat                  NUMERIC(10, 7),
  lng                  NUMERIC(10, 7),
  gps_accuracy_m       NUMERIC,            -- GPS 정확도 (미터)
  geo_source           TEXT,               -- gps | manual | place

  -- 사람이 읽을 수 있는 위치 힌트 (예: "해운대 해수욕장 근처")
  address_label        TEXT,
  map_note             TEXT,               -- 지도 핀 관련 사용자 메모

  -- ── 프라이버시 설정 ────────────────────────────────────────────────────
  -- 기본값: private — 생성 즉시 본인만 볼 수 있음
  visibility           TEXT        NOT NULL DEFAULT 'private',

  -- SNS 공유 시 위치 공개 수준 — 기본값: hidden (위치 일절 미공개)
  -- exact는 사용자가 명시적으로 선택해야만 활성화됨
  share_location_level TEXT        NOT NULL DEFAULT 'hidden',

  -- Trip Story Card(9:16 공유 카드)에 포함 여부 — 기본 미포함
  include_in_share_card BOOLEAN    NOT NULL DEFAULT false,

  -- 실제 방문 시각 (GPS 타임스탬프 또는 사용자 입력)
  visit_time           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trip_moments_visibility
    CHECK (visibility IN ('private', 'friends', 'public')),

  CONSTRAINT trip_moments_share_location_level
    CHECK (share_location_level IN ('hidden', 'neighborhood', 'exact')),

  CONSTRAINT trip_moments_geo_source
    CHECK (geo_source IS NULL OR geo_source IN ('gps', 'manual', 'place'))
);

CREATE INDEX IF NOT EXISTS idx_trip_moments_trip_id
  ON trip_moments (trip_id);

-- Trip Story Card 후보 조회 (include_in_share_card = true인 것만)
CREATE INDEX IF NOT EXISTS idx_trip_moments_share_card
  ON trip_moments (trip_id, include_in_share_card)
  WHERE include_in_share_card = true;

-- ── updated_at 자동 갱신 트리거 — trip_sessions ──────────────────────────────
-- (trip_items / custom_spots / trip_moments는 수정보다 추가·삭제 위주라 트리거 생략)

-- ── RLS 정책 계획 (DRAFT 주석 — 실제 적용 전 별도 승인 필요) ───────────────
--
-- trip_sessions:
--   SELECT: 본인 세션(user_id = auth.uid()) 또는 익명(user_id IS NULL + 세션 토큰 매칭)
--   INSERT/UPDATE/DELETE: 본인만
--
-- trip_items / trip_moments / custom_spots:
--   trip_sessions와 동일한 소유자 정책 상속
--   visibility = 'public'인 trip_moments는 타인도 SELECT 가능
--
-- ALTER TABLE trip_sessions   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE trip_items      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE custom_spots    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE trip_moments    ENABLE ROW LEVEL SECURITY;

-- ── 사용 예시 (주석) ──────────────────────────────────────────────────────────
--
-- [여행 세션 생성]
-- INSERT INTO trip_sessions (trip_id, city, start_date, end_date)
-- VALUES ('busan-2026-oct-u7k2', 'busan', '2026-10-23', '2026-10-27');
--
-- [My Trip에 장소 추가]
-- INSERT INTO trip_items (trip_id, place_id, day, item_order, added_by)
-- VALUES ('busan-2026-oct-u7k2', '<place_uuid>', 1, 1, 'user');
--
-- [Trip Moment 기록 — private, 위치 숨김]
-- INSERT INTO trip_moments (trip_id, place_id, title, comment, photo_url,
--                           lat, lng, gps_accuracy_m, geo_source,
--                           visibility, share_location_level)
-- VALUES ('busan-2026-oct-u7k2', '<place_uuid>',
--         '생애 첫 해물찜!', '엄청 매웠지만 최고였다 🦀',
--         'https://storage.gokoreamate.com/moments/xxx.jpg',
--         35.1583, 129.1603, 5.2, 'gps',
--         'private', 'hidden');
--
-- [Trip Story Card 포함 항목 조회]
-- SELECT * FROM trip_moments
-- WHERE trip_id = 'busan-2026-oct-u7k2'
--   AND include_in_share_card = true
-- ORDER BY visit_time;

-- ══════════════════════════════════════════════════════════════════════════════
-- End of 005_trip_moments_schema.sql — GoKoreaMate / gokoreamate.com
-- ⚠ DRAFT: 실제 Supabase 운영 DB 적용은 사장님 승인 후 진행할 것
-- ══════════════════════════════════════════════════════════════════════════════
