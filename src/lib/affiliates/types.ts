// gokoreamate — Affiliate Links Types
// TASK-021: integrate supabase affiliate links with scheduler injector pipeline

// ─── Supabase affiliate_links 테이블 행 ──────────────────────────────────────

export interface AffiliateLinkRow {
  affiliate_link_id: string;
  provider:          string;
  category:          string;
  title:             Record<string, string>;   // { ko, en, ja, zh, ... }
  description:       Record<string, string>;
  destination_url:   string;
  city:              string | null;
  placement_context: string[];
  priority:          number;
  starts_at:         string | null;
  ends_at:           string | null;
}

// ─── 로케일 해석 후 평탄화된 표시 데이터 ────────────────────────────────────

export interface AffiliateDisplay {
  provider:        string;
  category:        string;
  title:           string;
  description:     string;
  destination_url: string;
}

// 키: affiliate_link_id
export type AffiliateDisplayMap = Record<string, AffiliateDisplay>;

// ─── 로케일 폴백 체인 ─────────────────────────────────────────────────────────

export const LOCALE_FALLBACK_CHAIN = ["en", "ko", "ja", "zh"] as const;
export type SupportedLocale = typeof LOCALE_FALLBACK_CHAIN[number];
