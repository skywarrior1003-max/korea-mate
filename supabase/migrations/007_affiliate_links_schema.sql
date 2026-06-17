-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 007: Affiliate Links / Korea Ready 수익화 구조
--
-- ⚠ DRAFT: DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT USER APPROVAL ⚠
--
-- 목적: GoKoreaMate Korea Ready 섹션의 제휴 링크 관리 테이블.
--       외국인 여행자에게 필요한 준비 정보(eSIM·교통·액티비티·숙박)를
--       광고 배너가 아닌 '여행 준비 도움말' 형태로 노출한다.
--
--       ⚠ 실제 제휴 API 시크릿 키·OAuth 토큰은 절대 이 DB에 저장하지 않는다.
--         시크릿은 환경변수(.env.local / Cloudflare Secret)에만 보관한다.
--
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-06-17
-- Task  : TASK-007
--
-- TASK-004 연동 참고:
--   events.affiliate_link_id UUID → affiliate_links.id (FK 주석 해제 예정)
--   활성화 전 별도 사장님 승인 필요
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- affiliate_links — 제휴 링크 마스터
-- ────────────────────────────────────────────────────────────────────────────
--
-- [설계 원칙]
-- 1. Korea Ready는 광고 배너 농장이 아니라 여행 준비 도움말처럼 보여야 한다.
-- 2. placement_context(jsonb 배열)로 같은 링크를 여러 화면에 유연하게 노출한다.
-- 3. title / description은 jsonb 다국어 구조 — 외국인 대상 공식 콘텐츠이므로
--    TASK-004 events와 동일한 패턴 적용 (ko/en/ja/zh 키 확장 가능).
-- 4. tracking_code는 공개 안전한 UTM 파라미터 수준만 저장한다.
--    제휴 API 시크릿·OAuth 토큰은 절대 저장 금지.
-- 5. 직접 PG 결제 로직은 이 단계에서 구현하지 않는다.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_links (

  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 사람이 읽기 쉬운 고유 식별자
  -- 예: airalo-esim-korea | klook-busan-day-tour | korail-ktx-pass
  -- 한 번 결정 후 변경 금지 (events.affiliate_link_id가 이 값에 의존)
  affiliate_link_id   TEXT        UNIQUE NOT NULL,

  -- 제공 업체명
  -- 예: airalo | klook | viator | korail | kakao-mobility | agoda | booking
  provider            TEXT        NOT NULL,

  -- 카테고리 — 수익화 우선순위 및 Korea Ready 섹션 분류 기준
  -- 허용값: esim | activity | stay | transport | payment-tip | map-tip
  --   esim        : 수익화 1순위 — 신규 방문자 최우선 노출
  --   activity    : 수익화 2순위 — 액티비티·투어·체험
  --   stay        : 수익화 3순위 — 숙박
  --   transport   : 수익화 4순위 — 교통·공항픽업·KTX·버스
  --   payment-tip : 정보형 — 결제·전화번호 인증 팁 (직접 수익 없음)
  --   map-tip     : 정보형 — 지도 앱 사용 팁 (직접 수익 없음)
  category            TEXT        NOT NULL,

  -- ── 다국어 콘텐츠 (jsonb 주머니 구조) ──────────────────────────────────
  -- 외국인 대상 공식 서비스 콘텐츠 → TASK-004 events와 동일한 jsonb 패턴
  -- 형식: {"ko": "한국어 제목", "en": "English Title", "ja": "日本語タイトル"}
  -- 표시 우선순위: 요청 언어 → en → ko → 첫 번째 키
  title               JSONB       NOT NULL DEFAULT '{}',
  description         JSONB       NOT NULL DEFAULT '{}',

  -- ── 링크 정보 ──────────────────────────────────────────────────────────
  -- 최종 목적지 URL (제휴 링크 포함)
  destination_url     TEXT        NOT NULL,

  -- 공개 안전한 추적 파라미터만 저장 (UTM 파라미터 수준)
  -- ⚠ 제휴 API 시크릿·OAuth 토큰·비밀 키는 절대 여기에 저장 금지
  -- ⚠ 실제 제휴 계약 체결 전까지 NULL 유지
  tracking_code       TEXT,

  -- ── 노출 범위 ───────────────────────────────────────────────────────────
  -- 특정 도시 한정 시 설정 (예: busan | seoul | jeju)
  -- NULL이면 전국 공통 노출
  city                TEXT,

  -- 노출 위치 목록 — jsonb 배열로 복수 위치 동시 지정 가능
  -- 허용값:
  --   korea-ready-page  : Korea Ready 전용 페이지
  --   itinerary-start   : AI 일정 생성 시작 화면
  --   itinerary-card    : 일정 안 맥락 카드 (숙박·투어)
  --   near-airport      : 공항·항만 근처 Near Me 화면
  --   near-station      : 기차역·버스터미널 근처 Near Me 화면
  --   area-card         : 특정 지역 카드 내 (숙박·투어)
  --   home-hero         : 홈 화면 Korea Ready 섹션
  --
  -- 예시 — eSIM (모든 주요 화면):
  --   ["korea-ready-page", "itinerary-start", "home-hero"]
  -- 예시 — 부산 일일 투어 (맥락 삽입):
  --   ["korea-ready-page", "itinerary-card", "area-card"]
  -- 예시 — 공항 픽업 (공항 시나리오 한정):
  --   ["korea-ready-page", "near-airport"]
  placement_context   JSONB       NOT NULL DEFAULT '[]',

  -- ── 노출 우선순위 ────────────────────────────────────────────────────────
  -- 낮을수록 먼저 표시 (1 = 최우선)
  -- 기본값 50 — 의도적으로 낮게 설정해야 상단 노출
  -- eSIM: 1~5 권장 / Activity: 10~20 / Stay: 20~30 / Transport: 30~40
  priority            INTEGER     NOT NULL DEFAULT 50,

  -- ── 활성화 및 기간 ───────────────────────────────────────────────────────
  is_active           BOOLEAN     NOT NULL DEFAULT true,

  -- 계절 한정 상품 또는 프로모션 기간 설정 (NULL이면 상시 노출)
  starts_at           TIMESTAMPTZ,
  ends_at             TIMESTAMPTZ,

  -- 관리 상태 — approved만 앱에 노출
  admin_status        TEXT        NOT NULL DEFAULT 'pending',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── 제약 ──────────────────────────────────────────────────────────────────
  CONSTRAINT affiliate_links_category CHECK (
    category IN ('esim', 'activity', 'stay', 'transport', 'payment-tip', 'map-tip')
  ),
  CONSTRAINT affiliate_links_admin_status CHECK (
    admin_status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT affiliate_links_priority CHECK (
    priority BETWEEN 1 AND 100
  ),
  CONSTRAINT affiliate_links_period CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at
  )
);

-- ── 인덱스 ──────────────────────────────────────────────────────────────────

-- 앱 노출용 쿼리: approved + active + 카테고리 + 우선순위
CREATE INDEX IF NOT EXISTS idx_affiliate_links_active
  ON affiliate_links (category, priority, admin_status)
  WHERE is_active = true AND admin_status = 'approved';

-- 도시 한정 쿼리
CREATE INDEX IF NOT EXISTS idx_affiliate_links_city
  ON affiliate_links (city)
  WHERE city IS NOT NULL;

-- placement_context jsonb 배열 검색 (GIN 인덱스)
CREATE INDEX IF NOT EXISTS idx_affiliate_links_placement
  ON affiliate_links USING GIN (placement_context);

-- ends_at 기반 만료 필터
CREATE INDEX IF NOT EXISTS idx_affiliate_links_ends_at
  ON affiliate_links (ends_at)
  WHERE ends_at IS NOT NULL;

-- ── updated_at 자동 갱신 트리거 ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_affiliate_links_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_affiliate_links_updated_at ON affiliate_links;
CREATE TRIGGER trg_affiliate_links_updated_at
  BEFORE UPDATE ON affiliate_links
  FOR EACH ROW EXECUTE FUNCTION update_affiliate_links_updated_at();

-- ── TASK-004 events.affiliate_link_id FK 연동 안내 ──────────────────────────
-- 현재 events 테이블의 affiliate_link_id 컬럼은 FK 제약 없이 uuid만 존재.
-- affiliate_links 테이블 운영 반영 후 아래 ALTER를 별도 migration으로 적용:
--
-- ALTER TABLE events
--   ADD CONSTRAINT fk_events_affiliate_link
--   FOREIGN KEY (affiliate_link_id) REFERENCES affiliate_links(id) ON DELETE SET NULL;
--
-- ⚠ 이 ALTER는 별도 사장님 승인 후 실행할 것

-- ── RLS 정책 계획 (DRAFT 주석 — 실제 적용 전 별도 승인 필요) ───────────────
--
-- SELECT (공개): admin_status = 'approved' AND is_active = true
--                AND (starts_at IS NULL OR starts_at <= now())
--                AND (ends_at IS NULL OR ends_at >= now())
-- INSERT/UPDATE/DELETE: 관리자 전용 (service role)
--
-- ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "affiliate_links_public_read" ON affiliate_links
--   FOR SELECT USING (
--     admin_status = 'approved'
--     AND is_active = true
--     AND (starts_at IS NULL OR starts_at <= now())
--     AND (ends_at IS NULL OR ends_at >= now())
--   );

-- ── 샘플 데이터 (주석 — 실제 제휴 계약 후 별도 승인 받아 입력할 것) ─────────
--
-- [eSIM — 수익화 1순위]
-- INSERT INTO affiliate_links
--   (affiliate_link_id, provider, category,
--    title, description,
--    destination_url, tracking_code, city,
--    placement_context, priority)
-- VALUES (
--   'airalo-esim-korea', 'airalo', 'esim',
--   '{"ko": "한국 eSIM", "en": "Korea eSIM", "ja": "韓国eSIM", "zh": "韩国eSIM"}',
--   '{"ko": "도착 즉시 사용 가능한 한국 eSIM. 공항에서 유심 줄 설 필요 없음.",
--     "en": "Korea eSIM ready to use on arrival. No SIM card line at the airport.",
--     "ja": "到着後すぐ使える韓国eSIM。空港でのSIMカード購入不要。"}',
--   'https://www.airalo.com/korea-esim',
--   NULL,  -- 실제 제휴 계약 전까지 NULL
--   NULL,  -- 전국 공통
--   '["korea-ready-page", "itinerary-start", "home-hero"]',
--   1      -- 최우선 노출
-- );
--
-- [KTX 패스 — Transport]
-- INSERT INTO affiliate_links
--   (affiliate_link_id, provider, category,
--    title, description,
--    destination_url, city,
--    placement_context, priority)
-- VALUES (
--   'korail-ktx-pass', 'korail', 'transport',
--   '{"ko": "KTX 레일패스", "en": "KTX Rail Pass", "ja": "KTXレールパス"}',
--   '{"ko": "외국인 전용 KTX 무제한 패스.",
--     "en": "Unlimited KTX pass for foreign visitors."}',
--   'https://www.letskorail.com/ebizbf/EbizBfKrPassAbout.do',
--   NULL,
--   '["korea-ready-page", "near-station"]',
--   30
-- );
--
-- [앱에서 Korea Ready 페이지 쿼리 예시]
-- SELECT
--   affiliate_link_id, provider, category,
--   title->>'en' AS title_en,
--   description->>'en' AS description_en,
--   destination_url, priority
-- FROM affiliate_links
-- WHERE admin_status = 'approved'
--   AND is_active = true
--   AND (starts_at IS NULL OR starts_at <= now())
--   AND (ends_at IS NULL OR ends_at >= now())
--   AND placement_context @> '["korea-ready-page"]'  -- jsonb 배열 포함 검색
-- ORDER BY priority ASC;
--
-- [eSIM을 itinerary-start 화면에만 쿼리]
-- WHERE placement_context @> '["itinerary-start"]'
--   AND category = 'esim'
--   AND admin_status = 'approved'
--   AND is_active = true
-- ORDER BY priority ASC
-- LIMIT 3;

-- ══════════════════════════════════════════════════════════════════════════════
-- End of 007_affiliate_links_schema.sql — GoKoreaMate / gokoreamate.com
-- ⚠ DRAFT: 실제 Supabase 운영 DB 적용은 사장님 승인 후 진행할 것
-- ⚠ 실제 제휴 키·시크릿은 절대 이 파일에 포함하지 말 것
-- ══════════════════════════════════════════════════════════════════════════════
