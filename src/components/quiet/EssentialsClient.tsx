"use client";

// City Hub Travel Essentials — 전체보기 목록 + GoKoreaMate 내부 상세.
// (CITY-HUB-EVENTS-ESSENTIALS-UX-AND-BLUE-NORMALIZATION-V1)
//
// Owner 확정 흐름: Hub(대표 1~2) → 전체보기 → 내부 상세 → 공식 홈페이지는 상세 안의
// 보조 링크. 수집된 필드(summary·종류·provider·이용조건·출처·확인일)를 실제로 보여
// 준다 — 실제 데이터에 있는 항목만, AI 로 만들지 않는다.

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { getTravelEssentials, essentialSummary, essentialKeyInfoRows, localizedText, type TravelEssential } from "@/data/regional/regional-recommendations";
import { quietCity } from "./quiet-data";

function essTitle(es: TravelEssential): string {
  return es.title ?? "";
}

export function EssentialsAllClient({ slug }: { slug: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const city = quietCity(slug);
  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const essentials = getTravelEssentials(slug);

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        <Link href={`/city/${slug}`} className="inline-flex items-center whitespace-nowrap text-[13px] text-[var(--qh-faint)] hover:text-[var(--qh-ink)] py-2 min-h-11 gkm-focus">
          ← {cityLabel}
        </Link>
        <h1 className="mt-1 text-[22px] md:text-[26px] font-semibold text-[var(--qh-ink)]">{t("essentialsIn", { city: cityLabel })}</h1>

        <ul className="mt-3">
          {essentials.map(es => {
            const summary = essentialSummary(es, locale);
            return (
              <li key={es.id}>
                <Link href={`/city/${slug}/essentials/${es.id}`} className="flex items-start gap-3.5 py-3 border-b border-[var(--qh-line)] gkm-focus min-h-11">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[var(--qh-ink)] leading-snug">{essTitle(es)}</span>
                    <span className="block mt-0.5 text-[11.5px] text-[var(--qh-faint2)] truncate">
                      {es.category ?? ""}{es.provider ? ` · ${es.provider}` : ""}
                    </span>
                    {summary && (
                      <span className="block mt-0.5 text-[12.5px] leading-snug text-[var(--qh-faint2)]"
                        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {summary}
                      </span>
                    )}
                  </span>
                  <span className="flex-none text-[13px]" style={{ color: "var(--qh-blue)" }} aria-hidden>→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function EssentialDetailClient({ slug, essId }: { slug: string; essId: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const city = quietCity(slug);
  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const es = getTravelEssentials(slug).find(e => e.id === essId);
  if (!es) {
    return (
      <div className="qh min-h-screen" style={{ backgroundColor: "var(--qh-paper)" }}>
        <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
          <Link href={`/city/${slug}/essentials`} className="inline-flex items-center text-[13px] text-[var(--qh-faint)] py-2 min-h-11 gkm-focus">← {t("essentialsIn", { city: cityLabel })}</Link>
        </div>
      </div>
    );
  }
  const summary = essentialSummary(es, locale);

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        <Link href={`/city/${slug}/essentials`} className="inline-flex items-center whitespace-nowrap text-[13px] text-[var(--qh-faint)] hover:text-[var(--qh-ink)] py-2 min-h-11 gkm-focus">
          ← {t("essentialsIn", { city: cityLabel })}
        </Link>
        <p className="mt-2 text-[11px] font-medium tracking-[.14em] text-[var(--qh-faint)] uppercase">
          {cityLabel}{es.category ? ` · ${es.category}` : ""}
        </p>
        <h1 className="mt-1 text-[22px] md:text-[26px] font-semibold text-[var(--qh-ink)] leading-snug">{essTitle(es)}</h1>
        {es.provider && <p className="mt-0.5 text-[12.5px] text-[var(--qh-faint)]">{es.provider}</p>}

        {summary && (
          <p className="mt-4 text-[14px] leading-relaxed whitespace-pre-line" style={{ color: "rgba(33,29,23,.78)" }}>{summary}</p>
        )}
        {es.eligibility && (
          <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "rgba(33,29,23,.62)" }}>{es.eligibility}</p>
        )}
        {localizedText(es.foreignNote ?? null, locale) && (
          <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "rgba(33,29,23,.62)" }}>
            {localizedText(es.foreignNote ?? null, locale)}
          </p>
        )}

        {/* 수집 원문의 상세 항목 — 운영시간·요금·이용조건 등, 있는 것만 그대로 */}
        {essentialKeyInfoRows(es).length > 0 && (
          <dl className="mt-5 border-t border-[var(--qh-line)]">
            {essentialKeyInfoRows(es).map(([k, v]) => (
              <div key={k} className="flex gap-4 py-2 border-b border-[var(--qh-line)]">
                <dt className="flex-none w-[110px] md:w-[140px] text-[12px] text-[var(--qh-faint)] leading-relaxed break-words">{k}</dt>
                <dd className="min-w-0 flex-1 text-[13px] leading-relaxed text-[var(--qh-ink)]">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {es.sourceUrl && (
          <a href={es.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-[4px] border px-4 py-2.5 text-[13.5px] font-medium gkm-focus min-h-11"
            style={{ borderColor: "var(--qh-blue)", color: "var(--qh-blue)" }}>
            {t("officialLink")} ↗
          </a>
        )}

        {/* freshness_note 는 내부 운영 기록이라 사용자에게 그리지 않는다 — 확인일만 */}
        {es.asOf && (
          <p className="mt-5 text-[11.5px] text-[var(--qh-faint2)]">{t("asOfLine", { date: es.asOf })}</p>
        )}
      </div>
    </div>
  );
}
