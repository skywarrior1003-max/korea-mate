-- ============================================================
-- GoKoreaMate — contact_inquiries table
-- Run this once in Supabase Dashboard > SQL Editor
-- ============================================================

-- ── 1. Create table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id                 TEXT        PRIMARY KEY,
  type               TEXT        NOT NULL,
  name               TEXT,
  email              TEXT        NOT NULL,
  message            TEXT        NOT NULL,
  related_page_url   TEXT,
  related_place_id   TEXT,
  related_place_name TEXT,
  language           TEXT,
  status             TEXT        NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'waiting_user', 'resolved', 'archived', 'spam')),
  priority           TEXT        NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'high')),
  ai_category        TEXT,
  ai_summary         TEXT,
  admin_note         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Auto-update updated_at on every row update ─────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_inquiries_updated_at ON contact_inquiries;
CREATE TRIGGER trg_contact_inquiries_updated_at
  BEFORE UPDATE ON contact_inquiries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created_at ON contact_inquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status     ON contact_inquiries (status);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_type       ON contact_inquiries (type);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_priority   ON contact_inquiries (priority);

-- ── 4. Enable Row Level Security ──────────────────────────────
ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

-- ── 5. RLS Policies ───────────────────────────────────────────

-- 5a. Anyone (including anonymous users) may INSERT a new inquiry.
--     This is needed so the public contact form can submit without auth.
DROP POLICY IF EXISTS "contact_insert_anon" ON contact_inquiries;
CREATE POLICY "contact_insert_anon"
  ON contact_inquiries
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 5b. Anonymous users may NOT read inquiries (SELECT is blocked).
--     The service_role key used by server-side admin API bypasses RLS
--     entirely — no SELECT policy is needed for admin reads.

-- 5c. Anonymous users may NOT update or delete inquiries.
--     No UPDATE/DELETE policies for anon → denied by default.

-- ── 6. Verify setup ───────────────────────────────────────────
-- After running, confirm with:
--   SELECT COUNT(*) FROM contact_inquiries;   -- should return 0
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'contact_inquiries';
--   SELECT * FROM pg_policies WHERE tablename = 'contact_inquiries';

-- ── 7. Required .env.local variables ─────────────────────────
-- NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
-- NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   (INSERT permission only via RLS)
-- SUPABASE_SERVICE_ROLE_KEY=eyJ...       (bypasses RLS — admin SELECT/UPDATE)
-- ADMIN_KEY=<strong-random-secret>       (server-only, NOT NEXT_PUBLIC_)
-- RESEND_API_KEY=re_...                  (optional — email notifications)
-- ADMIN_NOTIFICATION_EMAIL=your@email.com (optional)
-- CONTACT_FROM_EMAIL=noreply@gokoreamate.com (optional, must be Resend-verified)
-- NEXT_PUBLIC_SITE_URL=https://gokoreamate.com (optional)
