-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 006: Media License 데이터 정책 및 스키마
--
-- ⚠ DRAFT: DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT USER APPROVAL ⚠
--
-- 목적: 저작권 위반 원천 차단을 위한 이미지 라이선스 추적 구조.
--       공식 홈페이지에 이미지가 있다는 것이 상업적 재사용 허가를 의미하지 않는다.
--       라이선스 미확인 이미지는 DB 등록 자체가 불가능하도록 설계한다.
--
-- 포함 테이블:
--   1. media_licenses    — 라이선스 유형 마스터 (재사용 가능한 라이선스 원본)
--   2. place_media       — 개별 이미지 등록 (장소·행사에 연결)
--   3. place_sources     — 장소 데이터 출처 추적
--   4. place_match_logs  — 이미지-장소 매칭 이력 (audit trail)
--   5. admin_review_queue — 관리자 검토 대기열 (법적 승인 게이트)
--
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-06-17
-- Task  : TASK-006
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. media_licenses — 라이선스 마스터
-- ────────────────────────────────────────────────────────────────────────────
-- 하나의 라이선스 유형을 한 번만 등록하면 여러 이미지에서 재사용한다.
-- 예: "공공누리 1유형"은 수백 장의 이미지가 동일한 license_id를 참조한다.
--
-- [핵심 원칙]
-- commercial_use_allowed = false인 라이선스에 묶인 이미지는
-- gokoreamate.com 서비스에 절대 노출하지 않는다.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS media_licenses (

  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 식별 슬러그 — 사람이 읽기 쉬운 고유값
  -- 예: direct-photo | partner-contract | gongkongnuri-type1 | cc-by-4.0
  --     api-allowed | official-site-pending | forbidden
  license_id            TEXT        UNIQUE NOT NULL,

  -- 라이선스 분류
  -- 허용값: direct-photo | partner-contract | public-license
  --         api-allowed | pending | forbidden
  license_type          TEXT        NOT NULL,

  -- GoKoreaMate 상업 서비스에서 사용 가능 여부
  -- false이면 place_media에 등록해도 절대 앱에 노출하지 않는다
  commercial_use_allowed BOOLEAN    NOT NULL,

  -- 출처 표기 의무 여부 (예: 공공누리는 반드시 출처 표기 필요)
  attribution_required  BOOLEAN     NOT NULL DEFAULT true,

  -- 이미지 편집·가공 허용 여부 (썸네일 리사이즈 포함)
  modification_allowed  BOOLEAN     NOT NULL DEFAULT false,

  -- 라이선스 발급 기관 또는 출처명
  -- 예: Visit Busan | 한국관광공사 | 공공누리 | Creative Commons
  source_name           TEXT        NOT NULL,

  -- 라이선스 조건 원문 URL (반드시 확인 후 기록)
  source_url            TEXT,

  -- 추가 조건, 사용 제한, 주의사항 자유 기록
  notes                 TEXT,

  -- 라이선스 내용을 실제로 확인한 일시와 담당자
  -- NULL이면 미검증 상태 → commercial_use_allowed 신뢰 불가
  verified_at           TIMESTAMPTZ,
  verified_by           TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT media_licenses_type CHECK (
    license_type IN (
      'direct-photo', 'partner-contract', 'public-license',
      'api-allowed', 'pending', 'forbidden'
    )
  )
);

-- ── 사전 등록: GoKoreaMate 표준 라이선스 유형 ────────────────────────────────
-- 실제 운영 환경에 이 INSERT를 적용하기 전에 사장님 승인 필요

INSERT INTO media_licenses
  (license_id, license_type, commercial_use_allowed, attribution_required,
   modification_allowed, source_name, source_url, notes, verified_at, verified_by)
VALUES
  -- 직접 촬영: 저작권 GoKoreaMate 보유 → 제약 없음
  ('direct-photo', 'direct-photo', true, false, true,
   'GoKoreaMate 직접 촬영',
   NULL,
   '운영팀 또는 계약 사진작가가 직접 촬영한 사진. 저작권은 gokoreamate.com에 귀속.',
   now(), 'system'),

  -- 제휴 계약: 개별 계약서 확인 필수
  ('partner-contract', 'partner-contract', true, true, false,
   '제휴 업체 계약 제공',
   NULL,
   '계약서에 명시된 사용 범위 내에서만 사용 가능. 계약 만료 시 즉시 사용 중단.',
   NULL, NULL),

  -- 공공누리 1유형: 출처 표기 후 자유 이용
  ('gongkongnuri-type1', 'public-license', true, true, true,
   '공공누리 1유형 (출처표시)',
   'https://www.kogl.or.kr/info/license.do',
   '출처를 밝히면 자유롭게 이용 가능. 상업적 이용 가능.',
   now(), 'system'),

  -- 공공누리 4유형: 가장 제한적 — 출처표시 + 비상업적 + 변경금지
  ('gongkongnuri-type4', 'public-license', false, true, false,
   '공공누리 4유형 (출처표시+비상업적이용금지+변경금지)',
   'https://www.kogl.or.kr/info/license.do',
   '비상업적 이용만 허용. GoKoreaMate 상업 서비스에 사용 불가.',
   now(), 'system'),

  -- Creative Commons BY 4.0
  ('cc-by-4.0', 'public-license', true, true, true,
   'Creative Commons Attribution 4.0 International',
   'https://creativecommons.org/licenses/by/4.0/',
   '출처 표기 후 상업적 이용 및 편집 가능.',
   now(), 'system'),

  -- 한국관광공사 TourAPI: 이용약관 재사용 허용 확인 시
  ('api-kto-tourapi', 'api-allowed', true, true, false,
   '한국관광공사 TourAPI',
   'https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do',
   '이용약관에 따라 출처 표기 후 서비스 내 사용 가능. 재배포 금지.',
   NULL, NULL),

  -- Visit Busan API: 별도 확인 필요
  ('api-visit-busan', 'api-allowed', true, true, false,
   'Visit Busan 공식 API',
   'https://www.visitbusan.net',
   'API 이용약관 재확인 필요. 상업적 재사용 허용 여부 공식 문서로 검증할 것.',
   NULL, NULL),

  -- 공식 홈페이지 이미지: 라이선스 확인 전 보류
  ('official-site-pending', 'pending', false, true, false,
   '공식 홈페이지 이미지 (라이선스 미확인)',
   NULL,
   '공식 홈페이지에 게시된 이미지라도 상업적 재사용 허가를 의미하지 않음. '
   '라이선스 확인 전까지 commercial_use_allowed = false 유지.',
   NULL, NULL),

  -- 금지: 블로그·SNS·리뷰 플랫폼
  ('forbidden', 'forbidden', false, false, false,
   '사용 금지 (블로그·SNS·리뷰 플랫폼)',
   NULL,
   '블로그, 인스타그램, 구글 이미지, 네이버 이미지, 미쉐린 등 리뷰 플랫폼 사진. '
   '원저작자 동의 없이 상업적 사용 절대 금지.',
   now(), 'system')

ON CONFLICT (license_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_media_licenses_type
  ON media_licenses (license_type);

CREATE INDEX IF NOT EXISTS idx_media_licenses_commercial
  ON media_licenses (commercial_use_allowed);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. place_media — 개별 이미지 등록
-- ────────────────────────────────────────────────────────────────────────────
-- 장소(places) 또는 행사(events)에 연결되는 실제 이미지 단위.
--
-- [핵심 설계 원칙]
-- license_id는 NOT NULL — 라이선스 없는 이미지는 등록 자체 불가.
-- admin_status = 'approved'인 이미지만 gokoreamate.com에 노출한다.
-- place_id와 event_id는 둘 다 NULL일 수 없다 (CHECK 제약).
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS place_media (

  media_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 장소 또는 행사 중 하나는 반드시 연결 (CHECK 제약 참조)
  place_id      UUID        REFERENCES places(id) ON DELETE SET NULL,
  event_id      UUID        REFERENCES events(id) ON DELETE SET NULL,

  media_type    TEXT        NOT NULL DEFAULT 'photo',   -- photo | thumbnail | video

  -- 이미지 URL — 외부 원본 또는 gokoreamate 스토리지
  media_url     TEXT        NOT NULL,

  -- gokoreamate.com 스토리지에 직접 저장한 경우의 경로
  -- 외부 URL만 참조하는 경우 NULL
  storage_path  TEXT,

  -- 해당 장소·행사의 대표 이미지 여부
  -- place_id당 is_primary = true는 하나만 권장 (애플리케이션 레벨에서 관리)
  is_primary    BOOLEAN     NOT NULL DEFAULT false,

  -- 라이선스 — NOT NULL 강제: 라이선스 없으면 등록 자체 불가 (저작권 방어막)
  license_id    UUID        NOT NULL REFERENCES media_licenses(id),

  -- 이미지 획득 경로 (예: visit-busan-api | direct-photo | partner | kto-api)
  source        TEXT        NOT NULL,

  -- 이미지 원본 출처 URL (나중에 저작권 검증에 사용)
  source_url    TEXT,

  -- 관리자 승인 상태 — approved만 앱에 노출
  admin_status  TEXT        NOT NULL DEFAULT 'pending',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- place_id와 event_id 중 하나는 반드시 존재
  CONSTRAINT place_media_must_have_target
    CHECK (place_id IS NOT NULL OR event_id IS NOT NULL),

  CONSTRAINT place_media_type
    CHECK (media_type IN ('photo', 'thumbnail', 'video')),

  CONSTRAINT place_media_admin_status
    CHECK (admin_status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_place_media_place_id
  ON place_media (place_id)
  WHERE place_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_place_media_event_id
  ON place_media (event_id)
  WHERE event_id IS NOT NULL;

-- 앱 노출용 쿼리 인덱스: approved + primary 이미지 빠른 조회
CREATE INDEX IF NOT EXISTS idx_place_media_approved_primary
  ON place_media (place_id, is_primary, admin_status)
  WHERE admin_status = 'approved';

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_place_media_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_place_media_updated_at ON place_media;
CREATE TRIGGER trg_place_media_updated_at
  BEFORE UPDATE ON place_media
  FOR EACH ROW EXECUTE FUNCTION update_place_media_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. place_sources — 장소 데이터 출처 추적
-- ────────────────────────────────────────────────────────────────────────────
-- 장소 정보(이름·주소·좌표 등)가 어디서 왔는지 추적하는 audit 테이블.
-- 이미지 이외의 데이터 출처도 기록하여 전체 데이터 신뢰도를 관리한다.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS place_sources (

  source_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id     UUID        NOT NULL REFERENCES places(id) ON DELETE CASCADE,

  -- 데이터 출처 유형
  -- 허용값: tourism-api | partner | manual | public-data
  source_type  TEXT        NOT NULL,
  source_name  TEXT        NOT NULL,   -- 예: Visit Busan | 한국관광공사 TourAPI
  source_url   TEXT,                   -- 원본 데이터 URL 또는 API 엔드포인트

  fetched_at   TIMESTAMPTZ,            -- 데이터 수집 시각

  -- 원본 API 응답 스냅샷 (디버깅·재검증 용도 — 개인정보 포함 금지)
  raw_data     JSONB,

  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT place_sources_type
    CHECK (source_type IN ('tourism-api', 'partner', 'manual', 'public-data'))
);

CREATE INDEX IF NOT EXISTS idx_place_sources_place_id
  ON place_sources (place_id);

CREATE INDEX IF NOT EXISTS idx_place_sources_type
  ON place_sources (source_type);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. place_match_logs — 이미지-장소 매칭 이력
-- ────────────────────────────────────────────────────────────────────────────
-- 이미지를 어떤 장소에 연결했는지, 어떤 방법으로 매칭했는지 기록한다.
-- "왜 이 사진이 저 장소에 연결됐지?"를 나중에 추적 가능하게 하는 audit trail.
-- 자동 매칭(API ID, 좌표)과 수동 매칭(운영자 직접 확인) 모두 기록한다.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS place_match_logs (

  log_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id          UUID        NOT NULL REFERENCES place_media(media_id) ON DELETE CASCADE,

  -- 매칭된 장소 (매칭 실패 시 NULL)
  matched_place_id  UUID        REFERENCES places(id) ON DELETE SET NULL,

  -- 매칭 방법
  -- api-id: API가 제공한 ID로 직접 연결 (가장 신뢰도 높음)
  -- coordinate: GPS 좌표 근접성으로 매칭
  -- name-exact: 장소명 정확 일치로 매칭
  -- manual: 운영자가 직접 확인하여 연결
  match_method      TEXT        NOT NULL,

  -- 자동 매칭 신뢰도 (0.0 ~ 1.0) — 수동 매칭은 NULL
  match_score       NUMERIC(4, 3),

  -- 매칭 결과
  -- matched: 성공 | unmatched: 대응 장소 없음
  -- conflict: 여러 장소 후보 충돌 | pending: 검토 대기
  match_status      TEXT        NOT NULL DEFAULT 'pending',

  -- 매칭 근거 또는 실패 사유 자유 기록
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT place_match_logs_method
    CHECK (match_method IN ('api-id', 'coordinate', 'name-exact', 'manual')),

  CONSTRAINT place_match_logs_status
    CHECK (match_status IN ('matched', 'unmatched', 'conflict', 'pending')),

  CONSTRAINT place_match_logs_score
    CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1))
);

CREATE INDEX IF NOT EXISTS idx_place_match_logs_media_id
  ON place_match_logs (media_id);

CREATE INDEX IF NOT EXISTS idx_place_match_logs_status
  ON place_match_logs (match_status)
  WHERE match_status IN ('pending', 'conflict');

-- ────────────────────────────────────────────────────────────────────────────
-- 5. admin_review_queue — 관리자 검토 대기열
-- ────────────────────────────────────────────────────────────────────────────
-- 모든 이미지는 admin_status = 'approved' 전까지 이 대기열을 통과해야 한다.
-- 법적 승인 게이트 역할 — 이 단계를 건너뛰고 이미지를 노출하는 것은 금지된다.
--
-- 검토 유형 (순서대로 진행):
--   1. license-verify  : 라이선스 내용 재확인 (commercial_use_allowed 검증)
--   2. place-match     : 이미지가 올바른 장소에 연결됐는지 확인
--   3. content-check   : 이미지 내용 적절성 확인 (민감한 내용 없는지)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_review_queue (

  queue_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id     UUID        NOT NULL REFERENCES place_media(media_id) ON DELETE CASCADE,

  -- 검토 유형: license-verify → place-match → content-check 순서
  review_type  TEXT        NOT NULL,

  -- 검토 우선순위: 1(긴급) ~ 10(낮음), 기본 5
  priority     INTEGER     NOT NULL DEFAULT 5,

  status       TEXT        NOT NULL DEFAULT 'pending',

  -- 검토자 이름 또는 관리자 ID
  reviewer     TEXT,

  -- 승인·거절 사유 (거절 시 반드시 기록)
  review_note  TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT admin_review_queue_type
    CHECK (review_type IN ('license-verify', 'place-match', 'content-check')),

  CONSTRAINT admin_review_queue_status
    CHECK (status IN ('pending', 'in-review', 'approved', 'rejected')),

  CONSTRAINT admin_review_queue_priority
    CHECK (priority BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS idx_admin_review_pending
  ON admin_review_queue (status, priority, created_at)
  WHERE status IN ('pending', 'in-review');

CREATE INDEX IF NOT EXISTS idx_admin_review_media_id
  ON admin_review_queue (media_id);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_admin_review_queue_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_review_queue_updated_at ON admin_review_queue;
CREATE TRIGGER trg_admin_review_queue_updated_at
  BEFORE UPDATE ON admin_review_queue
  FOR EACH ROW EXECUTE FUNCTION update_admin_review_queue_updated_at();

-- ── RLS 정책 계획 (DRAFT 주석 — 실제 적용 전 별도 승인 필요) ───────────────
--
-- media_licenses:
--   SELECT: 전체 공개 (라이선스 정보는 투명하게)
--   INSERT/UPDATE: 관리자 전용 (service role)
--
-- place_media:
--   SELECT (공개): admin_status = 'approved' AND
--                  license.commercial_use_allowed = true
--   INSERT/UPDATE/DELETE: 관리자 전용
--
-- place_sources, place_match_logs, admin_review_queue:
--   SELECT/INSERT/UPDATE/DELETE: 관리자 전용
--
-- ALTER TABLE media_licenses        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE place_media           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE place_sources         ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE place_match_logs      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE admin_review_queue    ENABLE ROW LEVEL SECURITY;

-- ── 사용 예시 (주석) ──────────────────────────────────────────────────────────
--
-- [공공누리 이미지 등록 → 검토 요청]
-- INSERT INTO place_media
--   (place_id, media_type, media_url, is_primary, license_id, source, source_url)
-- SELECT
--   '<place_uuid>', 'photo',
--   'https://cdn.visitbusan.net/images/xxx.jpg',
--   true,
--   id, 'visit-busan-api', 'https://www.visitbusan.net/attractions/xxx'
-- FROM media_licenses WHERE license_id = 'gongkongnuri-type1';
--
-- [admin_review_queue 자동 생성 (애플리케이션 레벨에서 처리)]
-- INSERT INTO admin_review_queue (media_id, review_type, priority)
-- VALUES ('<media_uuid>', 'license-verify', 3);
--
-- [gokoreamate 앱 노출용 이미지 조회]
-- SELECT pm.media_url, pm.storage_path
-- FROM place_media pm
-- JOIN media_licenses ml ON pm.license_id = ml.id
-- WHERE pm.place_id = '<place_uuid>'
--   AND pm.admin_status = 'approved'
--   AND ml.commercial_use_allowed = true
-- ORDER BY pm.is_primary DESC
-- LIMIT 5;

-- ══════════════════════════════════════════════════════════════════════════════
-- End of 006_media_license_schema.sql — GoKoreaMate / gokoreamate.com
-- ⚠ DRAFT: 실제 Supabase 운영 DB 적용은 사장님 승인 후 진행할 것
-- 이미지 스크래핑·다운로드 금지 — 이 파일은 구조 설계만 포함
-- ══════════════════════════════════════════════════════════════════════════════
