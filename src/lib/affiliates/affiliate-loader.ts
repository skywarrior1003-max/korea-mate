// gokoreamate — Affiliate Links Loader
// TASK-021: integrate supabase affiliate links with scheduler injector pipeline
// Supabase anon client only — service role key forbidden.

import { supabase } from "../supabase";
import type { AffiliateLinkRow, AffiliateDisplay, AffiliateDisplayMap } from "./types";
import { LOCALE_FALLBACK_CHAIN } from "./types";

// ─── 로케일 해석 ─────────────────────────────────────────────────────────────
// 우선순위: 요청 locale → "en" → "ko" → 첫 번째 값 → ""

export function resolveLocaleText(
  jsonb:  Record<string, string>,
  locale: string,
): string {
  if (jsonb[locale]) return jsonb[locale];
  for (const fallback of LOCALE_FALLBACK_CHAIN) {
    if (jsonb[fallback]) return jsonb[fallback];
  }
  const first = Object.values(jsonb)[0];
  return first ?? "";
}

// ─── Supabase 쿼리 ───────────────────────────────────────────────────────────
// placement_context @> ["itinerary-card"] 필터로 일정 삽입 대상 제휴만 조회.
// city 매칭 우선, 없으면 city IS NULL (전국 공통) 재쿼리 (Zero-Row 폴백 체인).

const PLACEMENT_CONTEXT = "itinerary-card";
const MAX_AFFILIATE_ROWS = 3;

async function fetchAffiliateRows(
  city: string | undefined,
): Promise<AffiliateLinkRow[]> {
  const now = new Date().toISOString();

  const buildQuery = (withCity: boolean) => {
    let q = supabase
      .from("affiliate_links")
      .select(
        "affiliate_link_id, provider, category, title, description, destination_url, city, placement_context, priority, starts_at, ends_at",
      )
      .eq("admin_status", "approved")
      .eq("is_active", true)
      .contains("placement_context", [PLACEMENT_CONTEXT])
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("priority", { ascending: true })
      .limit(MAX_AFFILIATE_ROWS);

    if (withCity && city) {
      q = q.eq("city", city.toLowerCase().trim());
    } else {
      q = q.is("city", null);
    }

    return q;
  };

  // 1차: 도시 한정 쿼리
  if (city) {
    try {
      const { data, error } = await buildQuery(true);
      if (!error && Array.isArray(data) && data.length > 0) {
        return data as unknown as AffiliateLinkRow[];
      }
    } catch {
      // 쿼리 실패 → 폴백 진행
    }
  }

  // 2차: 전국 공통 재쿼리 (Zero-Row 폴백)
  try {
    const { data, error } = await buildQuery(false);
    if (!error && Array.isArray(data)) {
      return data as unknown as AffiliateLinkRow[];
    }
  } catch {
    // 최종 실패 → 빈 배열
  }

  return [];
}

export async function queryAffiliateLinks(
  city:   string | undefined,
): Promise<AffiliateLinkRow[]> {
  return fetchAffiliateRows(city);
}

// ─── AffiliateDisplayMap 생성 ────────────────────────────────────────────────

export function buildAffiliateMap(
  rows:   AffiliateLinkRow[],
  locale: string,
): AffiliateDisplayMap {
  const map: AffiliateDisplayMap = {};

  for (const row of rows) {
    const display: AffiliateDisplay = {
      provider:        row.provider,
      category:        row.category,
      title:           resolveLocaleText(row.title, locale),
      description:     resolveLocaleText(row.description, locale),
      destination_url: row.destination_url,
    };
    // 제목이 비어있는 행은 맵에서 제외 (불완전 데이터 방어)
    if (display.title) {
      map[row.affiliate_link_id] = display;
    }
  }

  return map;
}
