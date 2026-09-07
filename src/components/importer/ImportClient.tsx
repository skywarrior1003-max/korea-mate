"use client";

// External URL Import — Preview 화면. (TASK-GOKOREAMATE-EXTERNAL-URL-IMPORT-ENGINE-V1)
//
// 계약
//  · URL 입력만으로 저장되지 않는다. 반드시 이 Preview 에서 사용자가 확인해야
//    목적지(My Trip/Saved/This Trip)로 저장된다.
//  · gokoreamate 내부 URL 은 서버 분석 없이 기존 경로로 보낸다(§7).
//  · 원문 Day/순서/시간 보존 — 재배치·재생성 없음(Import ≠ scheduler).
//  · place 매칭은 카탈로그 정확 일치(원명+nameL10n)만. fuzzy/강제 매칭 없음.
//    미매칭 장소는 "확인 필요"로 보여 주되 구조를 망가뜨리지 않는다.
//  · My Places 임의 생성 없음 — 미매칭 단일 장소는 Saved 불가를 정직하게 알린다.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { detectPastedUrl } from "@/lib/home-url-detect";
import { apiAnalyzeUrl, type AnalyzeResponse } from "@/lib/url-import/api";
import type { AnalyzedContent } from "@/lib/url-import/import-core";
import { loadSearchSpots } from "@/components/quiet/quiet-data";
import type { CitySpot } from "@/data/cities/types";
import { toEventItem } from "@/components/ExploreCity";
import { savePlace, isPlaceSaved, addPlaceToThisTrip } from "@/lib/place-actions/place-actions-core";
import { normalizeForMatch } from "@/lib/place-identity";
import { readTripDraft } from "@/lib/trip-draft/trip-draft-core";
import { apiSaveItinerary } from "@/lib/itinerary-api";
import { getDeviceId } from "@/lib/deviceId";
import { displayPlaceName } from "@/lib/place-display-name";

type Phase = "idle" | "analyzing" | "preview" | "saving" | "error";

const KNOWN_CITIES = ["busan", "seoul", "jeju", "gyeongju", "jeonju"];

/** 카탈로그 정확 일치 매칭 — 원명과 nameL10n(ko/en/ja/zh) 동등 비교만. */
function buildMatcher(spots: CitySpot[]) {
  const index = new Map<string, CitySpot[]>();
  const put = (key: string | undefined | null, s: CitySpot) => {
    const k = typeof key === "string" ? normalizeForMatch(key) : "";
    if (k === "") return;
    const list = index.get(k) ?? [];
    if (!list.some(x => x.id === s.id)) { list.push(s); index.set(k, list); }
  };
  for (const s of spots) {
    put(s.name, s);
    const l10n = s.nameL10n as Record<string, string> | undefined | null;
    if (l10n) for (const v of Object.values(l10n)) put(v, s);
  }
  const lookup = (key: string, city: string | null): CitySpot | null => {
    const hits = index.get(key) ?? [];
    const scoped = city && KNOWN_CITIES.includes(city) ? hits.filter(h => h.city.toLowerCase() === city) : hits;
    // 정확 일치가 유일할 때만 — 애매하면 강제 매칭하지 않는다
    return scoped.length === 1 ? scoped[0]! : null;
  };
  // 선행 도시명 토큰 제거 — 유사도 매칭이 아니라 결정적 표기 규칙이다.
  // 위키류 표기("경주 첨성대")가 카탈로그 정식명("첨성대")과 어긋나는 경우만 다룬다.
  const CITY_PREFIX = ["경주", "서울", "부산", "제주", "전주", "busan", "seoul", "jeju", "gyeongju", "jeonju"];
  return (name: string, city: string | null): CitySpot | null => {
    const key = normalizeForMatch(name);
    const direct = lookup(key, city);
    if (direct) return direct;
    for (const p of CITY_PREFIX) {
      if (key.startsWith(p + " ")) return lookup(key.slice(p.length + 1), city);
    }
    return null;
  };
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function ImportInner() {
  const t = useTranslations("importer");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const urlParam = params.get("url") ?? "";

  const [input, setInput] = useState(urlParam);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [spots, setSpots] = useState<CitySpot[]>([]);

  // Preview 편집 상태
  const [tripTitle, setTripTitle] = useState("");
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const analysis: AnalyzedContent | null = result?.ok ? result.analysis : null;
  const match = useMemo(() => buildMatcher(spots), [spots]);

  async function analyze(raw: string) {
    const detected = detectPastedUrl(raw.trim());
    if (detected?.kind === "internal") {
      // 내부 URL — 기존 shared/캐논 경로 그대로. 서버 분석 금지(§7).
      router.replace(detected.path);
      return;
    }
    if (!detected) { setPhase("error"); setError("errBlocked"); return; }
    setPhase("analyzing");
    setError(null);
    const [res, loadedSpots] = await Promise.all([apiAnalyzeUrl(detected.url), loadSearchSpots()]);
    setSpots(loadedSpots);
    if (!res?.ok) {
      setPhase("error");
      const e = res?.error ?? "errFetch";
      setError(["blocked_host", "invalid_url", "internal_url", "off"].includes(e) ? "errBlocked"
        : ["unsupported", "no_readable_text", "analyze_failed", "analyze_timeout", "analyze_unavailable"].includes(e) ? "unsupported"
        : "errFetch");
      return;
    }
    setResult(res);
    const a = res.analysis;
    if (a.kind === "unsupported") { setPhase("error"); setError("unsupported"); return; }
    setTripTitle(a.trip_title ?? res.pageTitle ?? "");
    setCity(a.city && KNOWN_CITIES.includes(a.city) ? a.city : (a.city ?? ""));
    const dayCount = Math.max(1, ...a.days.map(d => d.day_number));
    const sd = a.start_date ?? a.days.find(d => d.date)?.date ?? new Date().toISOString().slice(0, 10);
    setStartDate(sd);
    setEndDate(a.end_date ?? addDays(sd, dayCount - 1));
    // multi-place 는 매칭된 장소를 기본 선택으로 시작한다(선택은 사용자가 확정).
    // state 반영 전이라 방금 로드한 spots 로 로컬 matcher 를 만든다.
    const localMatch = buildMatcher(loadedSpots);
    setSelected(new Set(a.places.filter(p => localMatch(p.name, a.city)).map(p => p.name)));
    setPhase("preview");
  }

  useEffect(() => {
    if (urlParam) void analyze(urlParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParam]);

  // ── 저장: external_itinerary → My Trip ────────────────────────────────────
  async function importToMyTrip() {
    if (!analysis || phase === "saving") return;
    if (city.trim() === "") { setDoneMsg("cityRequired"); return; }
    setPhase("saving");
    const days = analysis.days
      .filter(d => d.stops.some(s => !excluded.has(`${d.day_number}|${s.name}`)))
      .map(d => ({
        date: addDays(startDate, d.day_number - 1),
        dayNumber: d.day_number,
        places: d.stops
          .filter(s => !excluded.has(`${d.day_number}|${s.name}`))
          .map(s => {
            const m = match(s.name, analysis.city);
            // 기존 일정 렌더러는 category/location/time/duration 을 문자열로
            // 전제한다 — 미매칭 stop 도 빈 문자열로 항상 채운다(crash 방지).
            return {
              name: s.name,
              time: s.time ?? "",
              category: m?.category ?? "",
              location: m?.district ?? "",
              duration: "",
              tips: s.note ?? "",
              ...(m ? {
                source: "city_spot" as const,
                place_id: String(m.id),
                ...(m.image ? { image: m.image } : {}),
                ...(typeof m.lat === "number" ? { lat: m.lat } : {}),
                ...(typeof m.lng === "number" ? { lng: m.lng } : {}),
              } : {}),
            };
          }),
      }));
    const id = crypto.randomUUID();
    const okSave = await apiSaveItinerary({
      id,
      city: city.trim(),
      start_date: startDate,
      end_date: endDate,
      travelers: "1",
      travel_style: "imported",
      trip_title: tripTitle.trim() || null,
      days: { __v: 2, scheduled: days, unscheduled: [] },
    } as never, getDeviceId());
    if (okSave) router.push(`/itinerary?id=${encodeURIComponent(id)}`);
    else { setPhase("preview"); setDoneMsg("errFetch"); }
  }

  // ── 저장: single_place → Saved ────────────────────────────────────────────
  function saveSingle(spot: CitySpot) {
    const item = toEventItem(spot);
    if (!isPlaceSaved(item)) savePlace(item);
    setDoneMsg("savedDone");
  }

  // ── 저장: multi_place → This Trip ─────────────────────────────────────────
  function addSelectedToThisTrip() {
    if (!analysis) return;
    const draft = readTripDraft();
    let added = 0;
    for (const p of analysis.places) {
      if (!selected.has(p.name)) continue;
      const m = match(p.name, analysis.city);
      if (!m) continue;
      const tripCity = draft?.city?.toLowerCase() === m.city.toLowerCase() ? draft.city : m.city;
      if (addPlaceToThisTrip(toEventItem(m), tripCity)) added += 1;
    }
    if (added > 0) router.push("/picks?tab=selected");
    else setDoneMsg("selectHint");
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  const ui = {
    page: { backgroundColor: "var(--qh-paper)" } as const,
    ink: { color: "var(--qh-ink)" } as const,
    faint: { color: "var(--qh-faint)" } as const,
    line: { borderColor: "var(--qh-line)" } as const,
  };

  const badge = (matchedFlag: boolean) => (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
      style={matchedFlag
        ? { color: "var(--qh-blue)", border: "1px solid var(--qh-line)" }
        : { color: "var(--qh-clay)", border: "1px solid var(--qh-line)" }}
    >
      {matchedFlag ? t("matched") : t("unmatched")}
    </span>
  );

  return (
    <div className="qh min-h-screen" style={ui.page}>
      <div className="max-w-xl mx-auto px-5 pt-8 pb-24">
        <h1 className="qh-serif text-2xl" style={ui.ink}>{t("title")}</h1>

        {(phase === "idle" || phase === "error") && (
          <div className="mt-6">
            <label className="text-sm block mb-2" style={ui.faint}>{t("pasteLabel")}</label>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void analyze(input); }}
                inputMode="url"
                placeholder="https://…"
                className="gkm-focus flex-1 rounded-xl border px-3.5 py-3 text-sm bg-transparent"
                style={{ ...ui.line, ...ui.ink }}
              />
              <button
                onClick={() => void analyze(input)}
                className="gkm-focus rounded-xl px-4 py-3 text-sm font-bold text-white"
                style={{ backgroundColor: "var(--qh-navy)" }}
              >
                {t("analyze")}
              </button>
            </div>
            {phase === "error" && error && (
              <div className="mt-5 rounded-2xl border p-4" style={ui.line}>
                <p className="text-sm font-bold" style={ui.ink}>
                  {error === "unsupported" ? t("unsupportedTitle") : error === "errBlocked" ? t("errBlocked") : t("errFetch")}
                </p>
                {error === "unsupported" && <p className="text-sm mt-1" style={ui.faint}>{t("unsupportedBody")}</p>}
              </div>
            )}
          </div>
        )}

        {phase === "analyzing" && (
          <p className="mt-8 text-sm" style={ui.faint} role="status">{t("analyzing")}</p>
        )}

        {(phase === "preview" || phase === "saving") && analysis && result?.ok && (
          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--qh-clay)" }}>
              {analysis.kind === "external_itinerary" ? t("kindItinerary")
                : analysis.kind === "single_place" ? t("kindPlace") : t("kindMulti")}
            </p>
            <p className="text-xs mt-2 leading-relaxed" style={ui.faint}>{t("previewNote")}</p>
            <p className="text-xs mt-1.5" style={ui.faint}>
              {t("sourceLine")}:{" "}
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "var(--qh-blue)" }}>
                {new URL(result.url).hostname}
              </a>
            </p>

            {/* ── external_itinerary ── */}
            {analysis.kind === "external_itinerary" && (
              <div className="mt-5 flex flex-col gap-4">
                <div>
                  <label className="text-xs block mb-1" style={ui.faint}>{t("tripTitleLabel")}</label>
                  <input value={tripTitle} onChange={e => setTripTitle(e.target.value)}
                    className="gkm-focus w-full rounded-xl border px-3.5 py-2.5 text-sm bg-transparent" style={{ ...ui.line, ...ui.ink }} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs block mb-1" style={ui.faint}>{t("cityLabel")}</label>
                    <input value={city} onChange={e => setCity(e.target.value)}
                      className="gkm-focus w-full rounded-xl border px-3 py-2.5 text-sm bg-transparent" style={{ ...ui.line, ...ui.ink }} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={ui.faint}>{t("startLabel")}</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      className="gkm-focus w-full rounded-xl border px-3 py-2.5 text-sm bg-transparent" style={{ ...ui.line, ...ui.ink }} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={ui.faint}>{t("endLabel")}</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                      className="gkm-focus w-full rounded-xl border px-3 py-2.5 text-sm bg-transparent" style={{ ...ui.line, ...ui.ink }} />
                  </div>
                </div>

                <p className="text-xs" style={ui.faint}>{t("excludeHint")}</p>
                {analysis.days.map(day => (
                  <div key={day.day_number} className="rounded-2xl border p-4" style={ui.line}>
                    <p className="text-sm font-bold" style={ui.ink}>Day {day.day_number}</p>
                    <ul className="mt-2 flex flex-col gap-2">
                      {day.stops.map(stop => {
                        const key = `${day.day_number}|${stop.name}`;
                        const m = match(stop.name, analysis.city);
                        const on = !excluded.has(key);
                        return (
                          <li key={key} className="flex items-start gap-2.5">
                            <input type="checkbox" checked={on} className="gkm-focus mt-0.5 h-4 w-4 shrink-0"
                              onChange={() => setExcluded(prev => { const n = new Set(prev); if (on) n.add(key); else n.delete(key); return n; })} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {stop.time && <span className="text-xs font-bold tabular-nums" style={ui.faint}>{stop.time}</span>}
                                <span className="text-sm" style={{ ...ui.ink, opacity: on ? 1 : 0.4 }}>
                                  {m ? displayPlaceName(m.name, m.nameL10n ?? null, locale) : stop.name}
                                </span>
                                {badge(m !== null)}
                              </div>
                              {stop.note && <p className="text-xs mt-0.5" style={ui.faint}>{stop.note}</p>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}

                {doneMsg === "cityRequired" && <p className="text-xs" style={{ color: "var(--qh-clay)" }}>{t("cityRequired")}</p>}
                <button
                  onClick={() => void importToMyTrip()}
                  disabled={phase === "saving"}
                  className="gkm-focus w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--qh-navy)" }}
                >
                  {phase === "saving" ? t("importing") : t("importToMyTrip")}
                </button>
              </div>
            )}

            {/* ── single_place ── */}
            {analysis.kind === "single_place" && (() => {
              const name = analysis.places[0]?.name ?? result.pageTitle ?? "";
              const m = name ? match(name, analysis.city) : null;
              return (
                <div className="mt-5 rounded-2xl border p-4" style={ui.line}>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-bold flex-1" style={ui.ink}>
                      {m ? displayPlaceName(m.name, m.nameL10n ?? null, locale) : name}
                    </p>
                    {badge(m !== null)}
                  </div>
                  {m ? (
                    <>
                      {m.image && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={m.image} alt={m.name} className="w-full aspect-[16/9] object-cover rounded-xl mt-3" />
                      )}
                      <p className="text-xs mt-2" style={ui.faint}>{m.city}{m.district ? ` · ${m.district}` : ""}</p>
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => saveSingle(m)}
                          className="gkm-focus flex-1 rounded-xl py-3 text-sm font-bold text-white"
                          style={{ backgroundColor: "var(--qh-navy)" }}>
                          {doneMsg === "savedDone" ? t("savedDone") : t("saveToSaved")}
                        </button>
                        <Link href={`/place/${m.id}/`} className="gkm-focus rounded-xl px-4 py-3 text-sm font-bold border" style={{ ...ui.line, ...ui.ink }}>
                          →
                        </Link>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm mt-2 leading-relaxed" style={ui.faint}>{t("unmatchedSingle")}</p>
                  )}
                </div>
              );
            })()}

            {/* ── multi_place_content ── */}
            {analysis.kind === "multi_place_content" && (
              <div className="mt-5">
                <p className="text-sm" style={ui.faint}>{t("selectHint")}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {analysis.places.map(p => {
                    const m = match(p.name, analysis.city);
                    const on = selected.has(p.name);
                    return (
                      <li key={p.name} className="flex items-center gap-2.5 rounded-2xl border p-3" style={ui.line}>
                        <input type="checkbox" checked={on} disabled={m === null} className="gkm-focus h-4 w-4 shrink-0"
                          onChange={() => setSelected(prev => { const n = new Set(prev); if (on) n.delete(p.name); else n.add(p.name); return n; })} />
                        {m?.image && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={m.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        )}
                        <span className="text-sm flex-1 min-w-0 truncate" style={ui.ink}>
                          {m ? displayPlaceName(m.name, m.nameL10n ?? null, locale) : p.name}
                        </span>
                        {badge(m !== null)}
                      </li>
                    );
                  })}
                </ul>
                <button
                  onClick={addSelectedToThisTrip}
                  className="gkm-focus mt-4 w-full rounded-xl py-3.5 text-sm font-bold text-white"
                  style={{ backgroundColor: "var(--qh-navy)" }}
                >
                  {t("addToThisTrip")}
                </button>
                {doneMsg === "selectHint" && <p className="text-xs mt-2" style={{ color: "var(--qh-clay)" }}>{t("selectHint")}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ImportClient() {
  return (
    <Suspense fallback={null}>
      <ImportInner />
    </Suspense>
  );
}
