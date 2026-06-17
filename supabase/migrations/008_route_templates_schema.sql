-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 008: Story Routes / Route Templates 큐레이션 여행 루트 구조
--
-- ⚠ DRAFT: DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT USER APPROVAL ⚠
--
-- 목적: GoKoreaMate Story Routes 섹션의 큐레이션 루트 관리 테이블.
--       외국인 여행자에게 "BTS Day in Busan", "부산 먹방 Day" 같은
--       전문가 큐레이션 완성형 루트를 제공한다.
--
--       Story Routes는 두 가지 역할을 동시에 수행한다:
--       1. 지금 당장: AI 없이도 외국인에게 완성된 일정 제공
--       2. 미래: AI Scheduler(TASK-013/014)의 stay_minutes·rec_start_time 입력값
--
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-06-17
-- Task  : TASK-008
--
-- 연동 테이블:
--   places          (TASK-003) — route_template_items.place_id
--   events          (TASK-004) — route_template_items.event_id (festival 루트)
--   trip_items      (TASK-005) — added_by = 'route_template' 시 참조
--   place_media     (TASK-006) — cover_media_id (라이선스 게이트 필수 통과)
--   affiliate_links (TASK-007) — festival 루트 행사 카드 컨텍스트
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- route_templates — 큐레이션 루트 마스터
-- ────────────────────────────────────────────────────────────────────────────
--
-- [설계 원칙]
-- 1. Story Routes는 AI 환각이 아니라 사람이 검증한 루트다.
--    route_template_items의 모든 정류장은 places.id 또는 events.id로만 연결.
-- 2. title/description/highlight/note는 jsonb 다국어 주머니 구조.
--    TASK-004 events, TASK-007 affiliate_links와 동일한 GoKoreaMate 표준.
-- 3. cover_media_id → place_media → media_licenses 경유로 라이선스 자동 검증.
--    cover_image_url TEXT 직접 저장은 절대 금지 (저작권 무방비 상태 방지).
-- 4. stay_minutes는 AI Scheduler 시간 배분 입력값으로 설계.
--    루트를 My Trip에 추가할 때 trip_items에 이 값이 복사된다.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS route_templates (

  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 사람이 읽기 쉬운 고유 식별자
  -- 예: bts-day-busan | busan-food-seafood-gukbap | galmaetgil-ocean-walk
  -- 한 번 결정 후 변경 금지 (trip_items.route_template_id가 이 값에 의존)
  route_id          TEXT        UNIQUE NOT NULL,

  -- 도시 코드
  -- 예: busan | seoul | jeju
  city              TEXT        NOT NULL,

  -- ── 다국어 콘텐츠 (jsonb 주머니 구조) ──────────────────────────────────
  -- GoKoreaMate 외국인 대상 서비스 콘텐츠 표준:
  -- TASK-004 events, TASK-007 affiliate_links와 동일 패턴
  -- 형식: {"ko": "...", "en": "...", "ja": "...", "zh": "..."}
  -- 표시 우선순위: 요청 언어 → en → ko → 첫 번째 키
  title             JSONB       NOT NULL DEFAULT '{}',
  description       JSONB       NOT NULL DEFAULT '{}',

  -- 카드 노출용 한 줄 태그라인
  -- 예: {"ko": "BTS 성지 전부 여기 있다", "en": "Every BTS spot in one day"}
  highlight         JSONB       NOT NULL DEFAULT '{}',

  -- ── 분류 및 태그 ─────────────────────────────────────────────────────────

  -- 분위기·취향 태그 (GIN 인덱스 — Explore 필터에 사용)
  -- 예: ["romantic", "food", "instagrammable", "k-pop", "healing", "nature"]
  mood_tags         JSONB       NOT NULL DEFAULT '[]',

  -- 루트가 커버하는 부산 구역 (GIN 인덱스 — Near Me 연동 및 지도 표시)
  -- 예: ["해운대", "광안리", "센텀시티"]
  area_tags         JSONB       NOT NULL DEFAULT '[]',

  -- 루트 유형
  -- curated      : 일반 큐레이션 루트 (가장 일반적)
  -- festival     : 날짜 기반 행사 포함 루트 (events.id 참조)
  -- seasonal     : 계절 한정 루트 (벚꽃·단풍 등)
  -- walking-trail: 도보 특화 루트 (갈맷길 등)
  -- night        : 야경·야간 특화 루트
  route_type        TEXT        NOT NULL DEFAULT 'curated',

  -- 소요 시간 유형
  -- half-day : 3~5시간
  -- full-day : 6~10시간
  -- multi-day: 2일 이상
  duration_type     TEXT        NOT NULL DEFAULT 'full-day',

  -- 예상 총 소요 시간 (분) — AI Scheduler 일정 배분 기초값
  -- route_template_items.stay_minutes 합산과 이동 시간을 고려한 전체 예상치
  estimated_min     INTEGER,

  -- 난이도
  -- easy       : 노약자·어린이 동반 가능, 대중교통 중심
  -- moderate   : 도보 2~3km 포함, 일반 성인
  -- challenging: 도보 5km 이상 또는 급경사 포함
  difficulty        TEXT        NOT NULL DEFAULT 'easy',

  -- 추천 계절 (GIN 인덱스 — 시즌 필터)
  -- 예: ["spring", "fall"] — NULL이면 연중 운영
  -- 허용값: spring | summer | fall | winter
  best_season       JSONB,

  -- ── 커버 이미지 — TASK-006 라이선스 게이트 필수 통과 ─────────────────────
  -- ⚠ cover_image_url TEXT 직접 저장 금지
  -- 반드시 place_media → media_licenses.commercial_use_allowed = true 검증 후 사용
  -- 앱 쿼리 예시:
  --   JOIN place_media pm ON rt.cover_media_id = pm.media_id
  --   JOIN media_licenses ml ON pm.license_id = ml.id
  --   WHERE ml.commercial_use_allowed = true AND pm.admin_status = 'approved'
  cover_media_id    UUID,  -- FK: place_media(media_id) — 별도 migration 활성화 예정

  -- ── 노출 및 인기도 ───────────────────────────────────────────────────────
  is_active         BOOLEAN     NOT NULL DEFAULT true,

  -- 인기순 정렬 기준 — 조회/클릭/추가 이벤트로 증가
  -- 홈 화면 StoryRoutes 섹션 상위 4개 선정에 사용
  viewer_count      INTEGER     NOT NULL DEFAULT 0,

  -- 관리 상태 — approved만 앱에 노출
  admin_status      TEXT        NOT NULL DEFAULT 'pending',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── 제약 ──────────────────────────────────────────────────────────────────
  CONSTRAINT route_templates_route_type CHECK (
    route_type IN ('curated', 'festival', 'seasonal', 'walking-trail', 'night')
  ),
  CONSTRAINT route_templates_duration_type CHECK (
    duration_type IN ('half-day', 'full-day', 'multi-day')
  ),
  CONSTRAINT route_templates_difficulty CHECK (
    difficulty IN ('easy', 'moderate', 'challenging')
  ),
  CONSTRAINT route_templates_admin_status CHECK (
    admin_status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT route_templates_estimated_min CHECK (
    estimated_min IS NULL OR estimated_min > 0
  ),
  CONSTRAINT route_templates_viewer_count CHECK (
    viewer_count >= 0
  )
);

-- ────────────────────────────────────────────────────────────────────────────
-- route_template_items — 루트 정류장 목록
-- ────────────────────────────────────────────────────────────────────────────
--
-- [핵심 원칙]
-- - place_id 또는 event_id 중 반드시 하나만 설정 (CHECK 제약)
-- - 이름 문자열로 장소 연결 절대 금지 — 검증된 ID만 허용
-- - AI가 장소명을 직접 작성하거나 추가하는 것 절대 금지
-- - is_required = false 정류장은 시간 부족 시 AI Scheduler가 생략 가능
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS route_template_items (

  route_item_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  route_id          UUID        NOT NULL REFERENCES route_templates(id) ON DELETE CASCADE,

  -- 장소 정류장 (공식 places 테이블 기준)
  place_id          UUID,  -- FK: places(id) — places 테이블 존재 확인 후 활성화

  -- 행사 정류장 (festival 루트 전용 — TASK-004 events 연동)
  -- festival route_type일 때만 사용
  event_id          UUID,  -- FK: events(id) — events 테이블 존재 확인 후 활성화

  -- 정류장 순서 (1부터 시작)
  item_order        INTEGER     NOT NULL,

  -- 권장 시작 시간 (festival 루트의 고정 시간 행사에 사용)
  -- NULL이면 AI Scheduler가 자유롭게 배치
  -- events.fixed_time_event = true인 행사와 연동 시 필수 설정
  rec_start_time    TIME,

  -- 권장 체류 시간 (분) — AI Scheduler(TASK-013/014) 핵심 입력값
  -- My Trip 추가 시 trip_items에 이 값이 복사되어 일정 계산 기초가 됨
  -- 예: 광안리 해수욕장 = 90, 해동용궁사 = 45, 자갈치시장 = 60
  stay_minutes      INTEGER     NOT NULL DEFAULT 60,

  -- 정류장별 큐레이터 코멘트 (다국어 jsonb)
  -- 예: {"ko": "방탄소년단 뷔가 인증샷 찍은 그 포토존!", "en": "V's exact photo spot!"}
  note              JSONB       NOT NULL DEFAULT '{}',

  -- 다음 정류장까지 이동 수단 힌트 (다국어 jsonb)
  -- AI가 없어도 완전한 여행 가이드 역할
  -- 예: {"ko": "지하철 2호선 → 해운대역 (10분)", "en": "Subway Line 2 → Haeundae (10 min)"}
  -- 마지막 정류장은 NULL
  transport_to_next JSONB,

  -- false: 시간 부족 시 AI Scheduler가 생략 가능한 선택적 정류장
  -- true : 이 루트의 필수 핵심 — 생략 절대 금지
  is_required       BOOLEAN     NOT NULL DEFAULT true,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── 제약 ──────────────────────────────────────────────────────────────────

  -- place_id와 event_id 중 반드시 하나는 설정
  CONSTRAINT route_items_place_or_event CHECK (
    (place_id IS NOT NULL AND event_id IS NULL) OR
    (place_id IS NULL AND event_id IS NOT NULL)
  ),
  CONSTRAINT route_items_stay_minutes CHECK (
    stay_minutes > 0
  ),
  -- 동일 루트 내 순서 중복 방지
  UNIQUE (route_id, item_order)
);

-- ── 인덱스 ──────────────────────────────────────────────────────────────────

-- 홈 화면 StoryRoutes 섹션 쿼리: city + viewer_count 인기순
CREATE INDEX IF NOT EXISTS idx_route_templates_city_viewer
  ON route_templates (city, viewer_count DESC)
  WHERE is_active = true AND admin_status = 'approved';

-- route_type 필터 (festival / walking-trail / night)
CREATE INDEX IF NOT EXISTS idx_route_templates_route_type
  ON route_templates (city, route_type, admin_status)
  WHERE is_active = true;

-- mood_tags 분위기 필터 (GIN)
-- 예: WHERE mood_tags @> '["k-pop"]'
CREATE INDEX IF NOT EXISTS idx_route_templates_mood_tags
  ON route_templates USING GIN (mood_tags);

-- area_tags 구역 필터 (GIN)
-- 예: WHERE area_tags @> '["해운대"]'
CREATE INDEX IF NOT EXISTS idx_route_templates_area_tags
  ON route_templates USING GIN (area_tags);

-- best_season 계절 필터 (GIN)
-- 예: WHERE best_season @> '["spring"]'
CREATE INDEX IF NOT EXISTS idx_route_templates_best_season
  ON route_templates USING GIN (best_season);

-- 루트 정류장 순서 조회 (AI Scheduler 입력 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_route_items_order
  ON route_template_items (route_id, item_order);

-- place_id 기준 역방향 조회 (특정 장소가 포함된 루트 찾기)
CREATE INDEX IF NOT EXISTS idx_route_items_place
  ON route_template_items (place_id)
  WHERE place_id IS NOT NULL;

-- event_id 기준 역방향 조회 (특정 행사가 포함된 루트 찾기)
CREATE INDEX IF NOT EXISTS idx_route_items_event
  ON route_template_items (event_id)
  WHERE event_id IS NOT NULL;

-- ── updated_at 자동 갱신 트리거 ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_route_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_templates_updated_at ON route_templates;
CREATE TRIGGER trg_route_templates_updated_at
  BEFORE UPDATE ON route_templates
  FOR EACH ROW EXECUTE FUNCTION update_route_templates_updated_at();

-- ── TASK-005 trip_items 연동 안내 ────────────────────────────────────────────
-- My Trip에 루트 추가 시 동작 (앱 로직):
--   route_template_items 조회 → 각 정류장을 trip_items에 INSERT
--   trip_items.added_by = 'route_template' 설정
--   trip_items.place_id / event_id = route_template_items.place_id / event_id
--
-- route_templates.id를 trip_items에 저장하고 싶다면 별도 컬럼 추가 검토:
--   ALTER TABLE trip_items ADD COLUMN route_template_id UUID REFERENCES route_templates(id);
--   ⚠ 이 ALTER는 별도 사장님 승인 후 실행할 것

-- ── TASK-006 cover_media_id FK 활성화 안내 ──────────────────────────────────
-- place_media 테이블이 운영 반영된 후 별도 migration으로 FK 추가:
--
-- ALTER TABLE route_templates
--   ADD CONSTRAINT fk_route_cover_media
--   FOREIGN KEY (cover_media_id) REFERENCES place_media(media_id) ON DELETE SET NULL;
--
-- 앱 쿼리에서 라이선스 검증 패턴:
-- JOIN place_media pm ON rt.cover_media_id = pm.media_id
-- JOIN media_licenses ml ON pm.license_id = ml.id
-- WHERE ml.commercial_use_allowed = true
--   AND pm.admin_status = 'approved'
--
-- ⚠ cover_image_url TEXT 직접 저장 절대 금지 — 라이선스 무방비 상태 방지

-- ── TASK-004 events FK 활성화 안내 ──────────────────────────────────────────
-- events 테이블이 운영 반영된 후 별도 migration으로 FK 추가:
--
-- ALTER TABLE route_template_items
--   ADD CONSTRAINT fk_route_items_event
--   FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;

-- ── RLS 정책 계획 (DRAFT 주석 — 실제 적용 전 별도 승인 필요) ───────────────
--
-- route_templates:
--   SELECT (공개): admin_status = 'approved' AND is_active = true
--   INSERT/UPDATE/DELETE: 관리자 전용 (service role)
--
-- route_template_items:
--   SELECT: 연결된 route_templates가 approved + active인 경우만 공개
--   INSERT/UPDATE/DELETE: 관리자 전용 (service role)
--
-- ALTER TABLE route_templates ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE route_template_items ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "route_templates_public_read" ON route_templates
--   FOR SELECT USING (admin_status = 'approved' AND is_active = true);
--
-- CREATE POLICY "route_template_items_public_read" ON route_template_items
--   FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM route_templates rt
--       WHERE rt.id = route_template_items.route_id
--         AND rt.admin_status = 'approved'
--         AND rt.is_active = true
--     )
--   );

-- ── 샘플 데이터 (주석 — 운영자 큐레이션 완료 후 별도 승인 받아 입력할 것) ───
--
-- [BTS Day in Busan 루트]
-- INSERT INTO route_templates
--   (route_id, city, title, description, highlight,
--    mood_tags, area_tags, route_type, duration_type, estimated_min, difficulty)
-- VALUES (
--   'bts-day-busan', 'busan',
--   '{"ko": "BTS Day in Busan", "en": "BTS Day in Busan", "ja": "BTSの聖地巡礼 釜山", "zh": "BTS釜山圣地巡礼"}',
--   '{"ko": "방탄소년단 멤버들의 부산 흔적을 따라가는 하루 코스.",
--     "en": "A full-day tour following BTS members traces across Busan."}',
--   '{"ko": "BTS 성지 전부 여기 있다", "en": "Every BTS spot in one day"}',
--   '["k-pop", "instagrammable", "fan-tour"]',
--   '["해운대", "광안리", "수영구"]',
--   'curated', 'full-day', 480, 'easy'
-- );
--
-- [홈 화면 StoryRoutes 섹션 쿼리 예시]
-- SELECT route_id,
--        title->>'en'    AS title_en,
--        highlight->>'en' AS highlight_en,
--        mood_tags, area_tags, duration_type, estimated_min, viewer_count
-- FROM route_templates
-- WHERE city = 'busan'
--   AND admin_status = 'approved'
--   AND is_active = true
-- ORDER BY viewer_count DESC
-- LIMIT 4;
--
-- [AI Scheduler 입력: 루트 정류장 목록 조회]
-- SELECT rti.item_order, rti.place_id, rti.event_id,
--        rti.stay_minutes, rti.rec_start_time,
--        rti.note->>'en' AS note_en,
--        rti.transport_to_next->>'en' AS transport_en,
--        rti.is_required
-- FROM route_template_items rti
-- WHERE rti.route_id = (
--   SELECT id FROM route_templates WHERE route_id = 'bts-day-busan'
-- )
-- ORDER BY rti.item_order ASC;
--
-- [봄 여행자 대상 시즌 루트]
-- WHERE best_season @> '["spring"]'
--   AND admin_status = 'approved'
--   AND is_active = true
--
-- [특정 구역 포함 루트 (Near Me 연동)]
-- WHERE area_tags @> '["해운대"]'
--   AND admin_status = 'approved'

-- ══════════════════════════════════════════════════════════════════════════════
-- End of 008_route_templates_schema.sql — GoKoreaMate / gokoreamate.com
-- ⚠ DRAFT: 실제 Supabase 운영 DB 적용은 사장님 승인 후 진행할 것
-- ⚠ cover_image_url TEXT 직접 저장 절대 금지 — cover_media_id → place_media 경유
-- ⚠ route_template_items에 AI가 장소명 텍스트 직접 작성 절대 금지
-- ══════════════════════════════════════════════════════════════════════════════
