-- 077: user_consents — 동의 증거 원장 (CONSENT-AND-AUTH-ACTIVATION-V1 §E)
--
-- 계약:
--  · 활성 계정 = 현재 3개 문서 버전의 동의 행이 있는 auth 사용자.
--  · 저장하는 것: user id·3개 버전·locale·동의 플래그(전부 true 강제)·시각.
--  · 저장 금지: 이름·이메일·생년월일·IP·user agent·raw device id·actor hash·
--    Google token·OAuth profile·intent cookie/nonce 원문 — 컬럼 자체가 없다.
--  · 접근: service_role API 전용. anon/authenticated 직접 접근 전면 차단
--    (RLS ON + policy 0 + REVOKE). 사용자는 /api/auth/status 로 자신의 활성
--    여부만 확인한다.
--  · 동일 user + 동일 3버전 조합 UNIQUE — activate 재호출·중복 callback 이
--    행을 늘리지 못한다(멱등).
--  · auth.users ON DELETE CASCADE — 계정 삭제 Phase 에서 동의 행이 함께
--    사라진다(고아 방지).
--  · 재실행 안전(IF NOT EXISTS·조건 가드). 073~076 무접촉.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_consents (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  age_gate_version       TEXT        NOT NULL,
  terms_version          TEXT        NOT NULL,
  privacy_version        TEXT        NOT NULL,
  locale                 TEXT        NOT NULL CHECK (locale IN ('ko','en','ja','zh')),
  age_over_14_confirmed  BOOLEAN     NOT NULL CHECK (age_over_14_confirmed = true),
  terms_agreed           BOOLEAN     NOT NULL CHECK (terms_agreed = true),
  privacy_acknowledged   BOOLEAN     NOT NULL CHECK (privacy_acknowledged = true),
  accepted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 동일 사용자·동일 문서 버전 조합은 정확히 1행
DO $c077$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_consents_user_versions_uniq') THEN
    ALTER TABLE public.user_consents
      ADD CONSTRAINT user_consents_user_versions_uniq
      UNIQUE (user_id, age_gate_version, terms_version, privacy_version);
  END IF;
END $c077$;

-- 활성 판정 조회용(user_id 선두 — 버전 3종 등치 조회)
CREATE INDEX IF NOT EXISTS idx_user_consents_user ON public.user_consents (user_id);

-- ── 잠금: RLS ON + policy 0 + 직접 권한 전면 회수 ───────────────────────────
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.user_consents TO service_role;

-- ── 검증 — 계약이 실제로 걸렸는지 ──────────────────────────────────────────
DO $v077$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_consents'
      AND column_name IN ('email','name','birth_date','ip','user_agent','device_id','actor_hash','nonce')
  ) THEN
    RAISE EXCEPTION '[077] PII 금지 컬럼이 존재';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'user_consents' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '[077] RLS 미적용';
  END IF;
END $v077$;

COMMIT;
