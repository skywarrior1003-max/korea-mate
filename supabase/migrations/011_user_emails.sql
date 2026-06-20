-- TASK-039: user_emails table for non-member email capture
-- Matches /api/save-email route: upsert({ email, device_id }, { onConflict: "email,device_id" })

-- 1. user_emails 테이블 생성
CREATE TABLE IF NOT EXISTS user_emails (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL,
  device_id  TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT user_emails_email_device_uniq UNIQUE (email, device_id)
);

-- 2. anon INSERT 권한 (비회원 이메일 캡처)
GRANT INSERT ON user_emails TO anon;

-- 3. itineraries.email 컬럼 추가 (save-email API 2단계: 소급 업데이트)
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS email TEXT;
