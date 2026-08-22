// 다국어 키 어댑터 — source `zh-CN` → Main `zh`. (TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1)
// Main city_spots.name_l10n / desc_l10n / why_l10n 은 {en, ko, ja, zh} 네 키뿐이다.

export const MAIN_LOCALES = ["en", "ko", "ja", "zh"] as const;
export type MainLocale = typeof MAIN_LOCALES[number];

const SOURCE_TO_MAIN: Record<string, MainLocale> = {
  en: "en", ko: "ko", ja: "ja", zh: "zh",
  "zh-CN": "zh", "zh-cn": "zh", "zh-Hans": "zh", "zh-hans": "zh",
};

/** 모르는 locale 은 버린다(null) — 엉뚱한 키를 DB 에 넣지 않는다 */
export function toMainLocale(sourceLocale: string | null | undefined): MainLocale | null {
  if (typeof sourceLocale !== "string") return null;
  return SOURCE_TO_MAIN[sourceLocale.trim()] ?? null;
}

export type L10n = Partial<Record<MainLocale, string>>;

/** 빈 문자열·공백·비문자열은 키를 만들지 않는다. 키가 하나도 없으면 null. */
export function buildL10n(entries: Array<[string | null | undefined, unknown]>): L10n | null {
  const out: L10n = {};
  for (const [loc, value] of entries) {
    const l = toMainLocale(loc);
    if (!l || typeof value !== "string") continue;
    const v = value.trim();
    if (v) out[l] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 표시 fallback(계약 초안): l10n[locale] → l10n.en → name */
export function pickName(l10n: L10n | null | undefined, locale: string, fallback: string): string {
  const l = toMainLocale(locale);
  if (l10n && l && l10n[l]) return l10n[l]!;
  if (l10n?.en) return l10n.en;
  return fallback;
}
