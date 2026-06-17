-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 004: events 테이블 — GoKoreaMate 날짜 기반 행사 데이터 원본
--
-- ⚠ DRAFT: DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT USER APPROVAL ⚠
--
-- 목적: 축제·콘서트·전시·마켓 등 날짜 기반 행사 정보를 저장하는 단일 원본.
--       AI Scheduler, Trip Planner, Events 탐색 화면이 이 테이블을 참조한다.
--
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-06-17
-- Task  : TASK-004
-- ══════════════════════════════════════════════════════════════════════════════

-- pgcrypto 확장 보장 (003_places_table.sql과 동일)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── events 테이블 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (

  -- ── 기본 식별자 ──────────────────────────────────────────────────────────────
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 외부 시스템 식별자 (source + 고유값 조합으로 중복 방지)
  -- 예: visit-busan_fireworks-2026 | kto-api_biff-2026
  -- 한 번 결정하면 변경 금지 (My Trip, AI Scheduler가 이 값에 의존)
  event_id          TEXT        UNIQUE NOT NULL,

  -- ── 장소 연결 ─────────────────────────────────────────────────────────────
  -- places 테이블에 등록된 장소가 있으면 연결, 없으면 NULL
  -- 이름으로 연결 금지 — 반드시 places.id 기준
  place_id          UUID        REFERENCES places(id) ON DELETE SET NULL,

  -- ── 지역 ──────────────────────────────────────────────────────────────────
  city              TEXT        NOT NULL,   -- 예: busan | seoul | jeju
  district          TEXT,                   -- 예: Haeundae-gu | Jung-gu

  -- ── 다국어 제목 (jsonb 주머니 구조) ──────────────────────────────────────
  -- 형식: {"ko": "부산 불꽃축제", "en": "Busan Fireworks Festival",
  --        "ja": "釜山花火祭り", "zh": "釜山烟火节"}
  -- 언어 키는 ISO 639-1 코드 사용 (ko, en, ja, zh, fr, es, ...)
  -- 서비스 표시 우선순위: 요청 언어 → en → ko → 첫 번째 값
  -- 새 언어 추가 시 스키마 변경 없이 키만 추가
  title             JSONB       NOT NULL DEFAULT '{}',

  -- ── 다국어 설명 (jsonb 주머니 구조) ──────────────────────────────────────
  -- title과 동일한 구조
  -- 예: {"ko": "매년 10월 광안리에서 열리는 대규모 불꽃축제",
  --      "en": "Large-scale fireworks festival held at Gwangalli every October"}
  description       JSONB       NOT NULL DEFAULT '{}',

  -- ── 행사 분류 ──────────────────────────────────────────────────────────────
  -- 허용값: festival | concert | exhibition | market | seasonal
  --         sports | performance | food | cultural | other
  event_type        TEXT        NOT NULL DEFAULT 'other',

  -- ── 날짜 및 시간 ──────────────────────────────────────────────────────────
  -- ⚠ start_date, end_date는 NOT NULL — 날짜 없는 행사는 등록 불가
  start_date        DATE        NOT NULL,
  end_date          DATE        NOT NULL,

  -- 시간 정보는 nullable — 종일 행사 또는 시간 미정인 경우 NULL
  start_time        TIME,
  end_time          TIME,

  -- display_until: 이 날짜 이후 기본 Events 목록에서 자동 숨김
  -- 통상 end_date + 1~3일로 설정 (여운 기간 부여 가능)
  -- My Trip 안에 저장된 행사는 숨기지 않고 "Past Event" 라벨로 표시
  display_until     DATE        NOT NULL,

  -- fixed_time_event: true이면 AI Scheduler / Rule-based Scheduler 모두
  -- 해당 start_time ~ end_time을 Lock으로 처리
  -- 이 시간대에 다른 장소 배치 불가, 주변 동선 최적화의 기준점
  fixed_time_event  BOOLEAN     NOT NULL DEFAULT false,

  -- ── 위치 좌표 ─────────────────────────────────────────────────────────────
  -- place_id로 연결된 경우에도 별도 좌표 허용
  -- (행사 전용 임시 위치가 places 좌표와 다를 수 있음)
  lat               NUMERIC(10, 7),
  lng               NUMERIC(10, 7),

  -- ── 데이터 출처 ──────────────────────────────────────────────────────────
  -- 허용 source값: visit-busan | korean-tourism-api | manual | busan-metro | 기타 공식 API
  -- 블로그·SNS·비공식 크롤링은 절대 입력 금지
  source            TEXT        NOT NULL,
  official_url      TEXT,   -- 공식 행사 페이지 URL
  ticket_url        TEXT,   -- 예매 링크 (없으면 NULL)

  -- ── 제휴 링크 연결 ────────────────────────────────────────────────────────
  -- TASK-007에서 affiliate_links 테이블 설계 후 FK 활성화 예정
  -- DRAFT: FK 제약은 아직 적용하지 않음
  -- affiliate_link_id UUID REFERENCES affiliate_links(id) ON DELETE SET NULL,
  affiliate_link_id UUID,

  -- ── 미디어 ───────────────────────────────────────────────────────────────
  -- TASK-006 media_licenses 설계 완료 전까지 실데이터 입력 금지
  -- 라이선스 확인된 이미지만 설정 가능
  image_url         TEXT,

  -- ── 관리 상태 ─────────────────────────────────────────────────────────────
  -- admin_status = 'approved'인 행사만 공개 노출
  -- 허용값: pending | approved | rejected
  admin_status      TEXT        NOT NULL DEFAULT 'pending',

  -- 소프트 삭제 (false로 설정하면 모든 화면에서 즉시 숨김)
  is_active         BOOLEAN     NOT NULL DEFAULT true,

  -- AI Scheduler 후보 포함 여부 (운영자가 개별 판단 후 활성화)
  is_ai_usable      BOOLEAN     NOT NULL DEFAULT false,

  -- ── 타임스탬프 ────────────────────────────────────────────────────────────
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── 제약 ──────────────────────────────────────────────────────────────────
  CONSTRAINT events_date_order     CHECK (end_date >= start_date),
  CONSTRAINT events_display_order  CHECK (display_until >= start_date),
  CONSTRAINT events_time_order     CHECK (
    start_time IS NULL OR end_time IS NULL OR end_time >= start_time
  ),
  CONSTRAINT events_admin_status   CHECK (admin_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT events_event_type     CHECK (event_type IN (
    'festival', 'concert', 'exhibition', 'market', 'seasonal',
    'sports', 'performance', 'food', 'cultural', 'other'
  ))
);

-- ── 인덱스 ──────────────────────────────────────────────────────────────────

-- 날짜 범위 기반 조회 (핵심 쿼리: "Happening during your trip")
CREATE INDEX IF NOT EXISTS idx_events_date_range
  ON events (start_date, end_date);

-- display_until 기반 자동 숨김 필터
CREATE INDEX IF NOT EXISTS idx_events_display_until
  ON events (display_until);

-- 도시별 조회
CREATE INDEX IF NOT EXISTS idx_events_city
  ON events (city);

-- AI Scheduler 후보 풀 조회
CREATE INDEX IF NOT EXISTS idx_events_ai_usable
  ON events (is_ai_usable, admin_status)
  WHERE is_ai_usable = true AND admin_status = 'approved';

-- 장소 연결 조회
CREATE INDEX IF NOT EXISTS idx_events_place_id
  ON events (place_id)
  WHERE place_id IS NOT NULL;

-- ── updated_at 자동 갱신 트리거 ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_events_updated_at();

-- ── RLS 정책 계획 (DRAFT 주석 — 실제 적용 전 별도 승인 필요) ───────────────
--
-- 공개 SELECT: admin_status = 'approved' AND is_active = true
--              AND display_until >= CURRENT_DATE
--
-- 관리자 전체 조회: service role key 사용
-- 쓰기 권한: 관리자 전용 (service role key — gokoreamate admin만 접근)
-- 일반 사용자: SELECT only (anon key)
--
-- ALTER TABLE events ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "events_public_read" ON events
--   FOR SELECT USING (
--     admin_status = 'approved'
--     AND is_active = true
--     AND display_until >= CURRENT_DATE
--   );

-- ── 사용 예시 (주석) ──────────────────────────────────────────────────────────
--
-- [다국어 행사 등록 예시]
-- INSERT INTO events (event_id, city, title, description, event_type,
--                     start_date, end_date, display_until, source)
-- VALUES (
--   'visit-busan_fireworks-2026',
--   'busan',
--   '{"ko": "부산 불꽃축제 2026", "en": "Busan Fireworks Festival 2026",
--     "ja": "釜山花火祭り 2026", "zh": "釜山烟火节 2026"}',
--   '{"ko": "매년 10월 광안리 해변에서 열리는 대규모 불꽃축제",
--     "en": "Large-scale fireworks festival at Gwangalli Beach every October",
--     "ja": "毎年10月に広安里海岸で開催される大規模な花火祭り",
--     "zh": "每年10月在广安里海滩举办的大型烟火节"}',
--   'festival',
--   '2026-10-24', '2026-10-25', '2026-10-28',
--   'visit-busan'
-- );
--
-- [앱에서 다국어 제목 조회 예시 — PostgreSQL]
-- SELECT title->>'en' AS title_en,
--        title->>'ko' AS title_ko,
--        title->>'ja' AS title_ja
-- FROM events WHERE admin_status = 'approved';
--
-- [특정 날짜와 겹치는 행사 조회 — "Happening during your trip"]
-- SELECT * FROM events
-- WHERE start_date <= '2026-10-26'  -- trip_end_date
--   AND end_date   >= '2026-10-23'  -- trip_start_date
--   AND admin_status = 'approved'
--   AND is_active = true
--   AND display_until >= CURRENT_DATE;

-- ══════════════════════════════════════════════════════════════════════════════
-- End of 004_events_schema.sql — GoKoreaMate / gokoreamate.com
-- ⚠ DRAFT: 실제 Supabase 운영 DB 적용은 사장님 승인 후 진행할 것
-- ══════════════════════════════════════════════════════════════════════════════
