// gokoreamate — Affiliates Module
// TASK-021: integrate supabase affiliate links with scheduler injector pipeline

export type {
  AffiliateLinkRow,
  AffiliateDisplay,
  AffiliateDisplayMap,
  SupportedLocale,
} from "./types";
export { LOCALE_FALLBACK_CHAIN } from "./types";
export { queryAffiliateLinks, buildAffiliateMap, resolveLocaleText } from "./affiliate-loader";
