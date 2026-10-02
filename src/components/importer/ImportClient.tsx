"use client";

// External Import — 입력·확인·저장 화면. (TASK-GOKOREAMATE-EXTERNAL-URL-IMPORT-ENGINE-V1 →
// GOKOREAMATE-EXTERNAL-TRIP-IMPORT-AND-GUIDED-JOURNEY-V2)
//
// 계약
//  · 입력은 두 가지를 사용자가 고른다: '글 붙여넣기'(Gemini·ChatGPT 등에서 복사한 일정 글) /
//    '링크 가져오기'(공개 블로그·웹페이지·AI 공개 공유 링크). 한 칸에서 추측하지 않는다.
//  · 입력만으로 저장되지 않는다. 반드시 이 확인 화면에서 사용자가 저장을 눌러야 My Trip/My Places 로 간다.
//  · gokoreamate 내부 URL 은 서버 분석 없이 기존 경로로 보낸다(§7).
//  · 원문 Day/순서/시간 보존 — 재배치·재생성·최적화 없음(Import ≠ scheduler). 시간은 사용자가 정한 시각으로 저장한다.
//  · place 연결: 정확 일치는 자동, 표기만 다른 경우는 '제안'(사용자가 눌러야 연결), 그 외는 내 장소로 보존.
//    잘못된 기존 장소에 조용히 합치지 않는다. 5개 도시 밖 장소도 버리지 않는다.
//  · 외부 원문의 평점·영업시간·이미지 URL 은 서비스 데이터로 채택하지 않는다(이름·순서·시간·짧은 설명만).
//  · 분석은 로그인 후 AI 로 한다. 완료된 가져오기 1건 = AI 도움 1회. 저장·재방문·직접 수정은 차감하지 않는다.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { detectPastedUrl } from "@/lib/home-url-detect";
import { apiAnalyze, apiImportBalance, type AnalyzeResponse, type ImportBalance } from "@/lib/url-import/api";
import type { AnalyzedContent, AnalyzedStop } from "@/lib/url-import/import-core";
import { buildPlaceMatcher, type MatchHit } from "@/lib/url-import/match-core";
import { loadSearchSpots } from "@/components/quiet/quiet-data";
import type { CitySpot } from "@/data/cities/types";
import { toEventItem } from "@/components/ExploreCity";
import { addPlaceToThisTrip } from "@/lib/place-actions/place-actions-core";
import { readTripDraft } from "@/lib/trip-draft/trip-draft-core";
import { apiSaveItinerary } from "@/lib/itinerary-api";
import { apiCreateUserSpotsFromImport, apiCreateUserSpotFromCanonical } from "@/lib/user-spots-api";
import { getDeviceId } from "@/lib/deviceId";
import { displayPlaceName } from "@/lib/place-display-name";
import { getCurrentUser, signInWithGoogle } from "@/lib/auth/auth-client";
import ConsentSheet from "@/components/auth/ConsentSheet";
import { tripCityKey } from "@/data/cities/trip-city";

type Phase = "idle" | "analyzing" | "preview" | "saving" | "error";
type Tab = "text" | "link";


const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayKst = (): string => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const minutesBetween = (a: string, b: string): number | null => {
  const [ah, am] = a.split(":").map(Number); const [bh, bm] = b.split(":").map(Number);
  const d = (bh! * 60 + bm!) - (ah! * 60 + am!);
  return d > 0 ? d : null;
};

/** 링크 입력의 오류 코드 → 사용자 문구 키. 링크로 안 되는 경우는 글 붙여넣기를 함께 권한다. */
const LINK_FALLBACK_ERRORS = new Set([
  "private_chat_url", "share_not_readable", "login_required_page", "not_found", "no_readable_text",
  "unsupported_content_type", "too_large", "timeout", "fetch_failed", "blocked_redirect", "too_many_redirects",
]);
const ERROR_KEYS: Record<string, string> = {
  authentication_required: "errLogin", invalid_session: "errLogin",
  consent_required: "errConsent",
  quota_exhausted: "errQuota", quota_unavailable: "errPaused",
  in_progress: "errInProgress",
  ai_unavailable_in_this_environment: "errPaused", ai_paused: "errPaused", analyze_unavailable: "errPaused", off: "errPaused",
  private_chat_url: "errPrivateChat", share_not_readable: "errShareNotReadable",
  login_required_page: "errLoginPage", not_found: "errNotFound",
  no_readable_text: "errNoText", unsupported_content_type: "errNoText",
  too_large: "errTooLarge", timeout: "errTimeout", client_timeout: "errNetwork", analyze_timeout: "errTimeout",
  fetch_failed: "errFetchFailed", network: "errNetwork", blocked_redirect: "errBlocked", too_many_redirects: "errBlocked",
  blocked_host: "errBlocked", invalid_url: "errBlocked", internal_url: "errBlocked",
  text_too_short: "errTextShort",
  unsupported: "errUnsupported", analyze_failed: "errAnalyze",
};

function ImportInner() {
  const t = useTranslations("importer");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const urlParam = params.get("url") ?? "";

  const [tab, setTab] = useState<Tab>(urlParam ? "link" : "text");
  const [urlInput, setUrlInput] = useState(urlParam);
  const [textInput, setTextInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<{ code: string; resetsAt?: string } | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [spots, setSpots] = useState<CitySpot[]>([]);
  const [user, setUser] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<ImportBalance | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);

  // 확인 화면 편집 상태
  const [tripTitle, setTripTitle] = useState("");
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateFromSource, setDateFromSource] = useState(true);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  /** '제안' 연결을 사용자가 받아들인 항목 */
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  /**
   * 사용자가 확인 화면에서 직접 더한 장소(AI 가 빠뜨린 곳) — Day 번호별. AI 결과의 순서·시각은 건드리지 않고
   * 그 Day 의 끝에 붙는다. 저장은 다른 장소와 같은 길(공식 장소 연결 → 아니면 내 장소로 보존)을 탄다.
   */
  const [added, setAdded] = useState<Record<number, AnalyzedStop[]>>({});
  const [addDraft, setAddDraft] = useState<Record<number, { name: string; time: string }>>({});
  const [addDup, setAddDup] = useState<number | null>(null);

  const analysis: AnalyzedContent | null = result?.ok ? result.analysis : null;
  /** 확인 화면·저장에 쓰는 Day 목록 — AI 결과 + 사용자가 더한 장소 */
  const daysWithAdded = analysis
    ? analysis.days.map(d => ({ ...d, stops: [...d.stops, ...(added[d.day_number] ?? [])] }))
    : [];
  const isAdded = (dayNumber: number, name: string) => (added[dayNumber] ?? []).some(s => s.name === name);
  function addMissing(dayNumber: number) {
    const draft = addDraft[dayNumber] ?? { name: "", time: "" };
    const name = draft.name.replace(/\s+/g, " ").trim().slice(0, 120);
    if (name.length < 2) return;
    const exists = (analysis?.days.find(d => d.day_number === dayNumber)?.stops ?? []).concat(added[dayNumber] ?? [])
      .some(s => s.name.trim().toLowerCase() === name.toLowerCase());
    if (exists) { setAddDup(dayNumber); return; }
    const time = /^\d{2}:\d{2}$/.test(draft.time) ? draft.time : null;
    setAdded(prev => ({ ...prev, [dayNumber]: [...(prev[dayNumber] ?? []), { name, time, end_time: null, time_text: null, note: null }] }));
    setAddDraft(prev => ({ ...prev, [dayNumber]: { name: "", time: "" } }));
    setAddDup(null);
  }
  /** 다음 무료 사용 가능 날짜(서버는 ISO UTC) — 한국 시간 날짜로 보인다 */
  const fmtDate = (iso: string | null): string => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }); }
    catch { return iso.slice(0, 10); }
  };
  const match = useMemo(() => buildPlaceMatcher(spots), [spots]);
  const source = result?.ok && result.url ? (() => { try { return new URL(result.url!).hostname.toLowerCase(); } catch { return "text"; } })() : "text";

  useEffect(() => {
    let alive = true;
    void (async () => {
      const u = await getCurrentUser();
      if (!alive) return;
      setUser(!!u);
      if (u) { const b = await apiImportBalance(); if (alive) setBalance(b); }
    })();
    return () => { alive = false; };
  }, []);

  /** 연결 결과 — exact 는 자동, suggest 는 사용자가 받아들였을 때만 */
  const linkOf = (key: string, name: string): { hit: MatchHit<CitySpot> | null; linked: CitySpot | null } => {
    const hit = match(name, analysis?.city ?? null);
    const linked = hit && (hit.kind === "exact" || accepted.has(key)) ? hit.spot : null;
    return { hit, linked };
  };

  async function analyze() {
    setDoneMsg(null);
    let input: { url: string } | { text: string };
    if (tab === "link") {
      const detected = detectPastedUrl(urlInput.trim());
      if (detected?.kind === "internal") { router.replace(detected.path); return; } // 서버 분석 금지(§7)
      if (!detected) { setPhase("error"); setError({ code: "invalid_url" }); return; }
      input = { url: detected.url };
    } else {
      if (textInput.trim().length < 20) { setPhase("error"); setError({ code: "text_too_short" }); return; }
      input = { text: textInput };
    }
    if (user === false) { setPhase("error"); setError({ code: "authentication_required" }); return; }
    setPhase("analyzing");
    setError(null);
    const [res, loadedSpots] = await Promise.all([apiAnalyze(input), loadSearchSpots()]);
    setSpots(loadedSpots);
    if (!res.ok) {
      setPhase("error");
      setError({ code: res.error, resetsAt: res.resets_at });
      if (res.error === "authentication_required" || res.error === "invalid_session") setUser(false);
      return;
    }
    setResult(res);
    if (res.balance) setBalance(res.balance);
    const a = res.analysis;
    setTripTitle(a.trip_title ?? res.pageTitle ?? "");
    setCity(a.city ?? "");
    const dayCount = Math.max(1, ...a.days.map(d => d.day_number));
    const known = a.start_date ?? a.days.find(d => d.date)?.date ?? null;
    const sd = known ?? todayKst();
    setDateFromSource(known !== null);
    setStartDate(sd);
    setEndDate(a.end_date ?? addDays(sd, dayCount - 1));
    setExcluded(new Set());
    setAdded({}); setAddDraft({}); setAddDup(null);
    setAccepted(new Set());
    setSelected(new Set(a.places.map(p => p.name)));
    setPhase("preview");
  }

  useEffect(() => {
    if (urlParam && user === true) void Promise.resolve().then(() => analyze());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParam, user]);

  /** 연결되지 않은 이름들을 내 장소로 보존하고 이름→id 를 돌려준다 */
  async function preserveUnmatched(items: { name: string; note?: string | null }[]): Promise<Map<string, string> | null> {
    if (items.length === 0) return new Map();
    const saved = await apiCreateUserSpotsFromImport(source, items.map(i => ({ name: i.name, note: i.note ?? null, city: tripCityKey(city) || null })));
    if (!saved) return null;
    return new Map(saved.map(s => [s.name.replace(/\s+/g, " ").trim().toLowerCase(), s.id]));
  }

  function placeFromStop(stop: AnalyzedStop, linked: CitySpot | null, ownId: string | null) {
    const duration = stop.time && stop.end_time ? minutesBetween(stop.time, stop.end_time) : null;
    return {
      name: stop.name,
      time: stop.time ?? "",
      // 원문 시각은 사용자가 정한 시각으로 저장한다(화면에 실제 시각으로 보이고, 스케줄러가 바꾸지 않는다)
      ...(stop.time ? { timeSource: "user" as const } : {}),
      // 서비스 장소에 연결될 때만 그 분류를 쓴다 — 모르는 분류를 만들어 저장하지 않는다(화면은 분류 없이도 표시)
      ...(linked?.category ? { category: linked.category } : {}),
      location: linked?.district ?? "",
      duration: duration ? `${duration}m` : "",
      tips: stop.note ?? "",
      googleMapsUrl: "",
      ...(linked ? {
        source: "city_spot" as const,
        place_id: String(linked.id),
        ...(linked.image ? { image: linked.image } : {}),
        ...(typeof linked.lat === "number" ? { lat: linked.lat } : {}),
        ...(typeof linked.lng === "number" ? { lng: linked.lng } : {}),
      } : ownId ? {
        source: "user_spot" as const,
        place_id: ownId,
        sourceKey: `user_spot:${ownId}`,
      } : {}),
    };
  }

  /** keyOf — 확인 화면에서 쓴 항목 키(제외·제안 수락)와 같은 키로 판정한다 */
  async function saveTrip(daysIn: { day_number: number; stops: AnalyzedStop[] }[],
                          keyOf: (dayNumber: number, name: string) => string = (d, n) => `${d}|${n}`) {
    if (!analysis || phase === "saving") return;
    setPhase("saving");
    // 1) 연결되지 않은 장소를 내 장소로 보존(버리지 않는다)
    const unmatched: { name: string; note: string | null }[] = [];
    for (const d of daysIn) for (const s of d.stops) {
      const key = keyOf(d.day_number, s.name);
      if (excluded.has(key)) continue;
      if (!linkOf(key, s.name).linked) unmatched.push({ name: s.name, note: s.note });
    }
    const ownIds = await preserveUnmatched(unmatched);
    if (!ownIds) { setPhase("preview"); setDoneMsg("errSave"); return; }
    // 2) My Trip — 원문 순서·시간 그대로
    const days = daysIn
      .map(d => ({
        date: addDays(startDate, d.day_number - 1),
        dayNumber: d.day_number,
        places: d.stops
          .filter(s => !excluded.has(keyOf(d.day_number, s.name)))
          .map(s => {
            const { linked } = linkOf(keyOf(d.day_number, s.name), s.name);
            const ownId = linked ? null : ownIds.get(s.name.replace(/\s+/g, " ").trim().toLowerCase()) ?? null;
            return placeFromStop(s, linked, ownId);
          }),
      }))
      .filter(d => d.places.length > 0);
    const id = crypto.randomUUID();
    const cityValue = city.trim();
    const okSave = await apiSaveItinerary({
      id,
      // 같은 도시는 한 값으로 저장 — 5개 도시 slug · 표에 있는 도시 로마자 key · 그 밖은 입력 그대로(trip-city.ts)
      city: tripCityKey(cityValue),
      start_date: startDate,
      end_date: endDate < startDate ? startDate : endDate,
      travelers: "1",
      travel_style: "imported",
      trip_title: tripTitle.trim() || null,
      days: { __v: 2, scheduled: days, unscheduled: [] },
    } as never, getDeviceId());
    if (okSave) router.push(`/itinerary?id=${encodeURIComponent(id)}`);
    else { setPhase("preview"); setDoneMsg("errSave"); }
  }

  // ── 장소 하나 → 내 장소(My Places) ─────────────────────────────────────────
  const [placeSavedId, setPlaceSavedId] = useState<string | null>(null);
  async function savePlaceToMine(name: string, note: string | null, linked: CitySpot | null) {
    setPhase("saving");
    let id: string | null = null;
    if (linked) {
      const r = await apiCreateUserSpotFromCanonical(Number(linked.id));
      id = r.ok ? r.spot?.id ?? "linked" : null;
    } else {
      const m = await preserveUnmatched([{ name, note }]);
      id = m ? [...m.values()][0] ?? null : null;
    }
    setPhase("preview");
    if (id) { setPlaceSavedId(id); setDoneMsg("placeSaved"); }
    else setDoneMsg("errSave");
  }

  // ── 여러 장소 → 서비스 장소는 This Trip, 나머지는 내 장소 ────────────────────
  async function addSelected() {
    if (!analysis) return;
    const draft = readTripDraft();
    let added = 0;
    const rest: { name: string }[] = [];
    for (const p of analysis.places) {
      if (!selected.has(p.name)) continue;
      const { linked } = linkOf(`p|${p.name}`, p.name);
      if (linked) {
        const tripCity = draft?.city?.toLowerCase() === linked.city.toLowerCase() ? draft.city : linked.city;
        if (addPlaceToThisTrip(toEventItem(linked), tripCity)) added += 1;
      } else rest.push({ name: p.name });
    }
    setPhase("saving");
    const saved = await preserveUnmatched(rest);
    setPhase("preview");
    if (!saved) { setDoneMsg("errSave"); return; }
    if (added > 0) router.push("/picks?tab=selected");
    else if (rest.length > 0) setDoneMsg("placesSaved");
    else setDoneMsg("selectHint");
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  const ui = {
    page: { backgroundColor: "var(--qh-paper)" } as const,
    ink: { color: "var(--qh-ink)" } as const,
    faint: { color: "var(--qh-faint)" } as const,
    line: { borderColor: "var(--qh-line)" } as const,
  };
  const primary = "gkm-focus w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-50";

  const badge = (hit: MatchHit<CitySpot> | null, linked: boolean) => (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border" style={{ ...ui.line, color: linked ? "var(--qh-blue)" : "var(--qh-clay)" }}>
      {linked ? t("linked") : hit ? t("suggested") : t("keptAsMine")}
    </span>
  );

  const errorBox = error && (() => {
    const key = ERROR_KEYS[error.code] ?? (error.code.startsWith("http_") ? "errNetwork" : "errAnalyze");
    return (
      <div data-tut="tut-import-error" data-import-error={error.code} role="alert" className="mt-5 rounded-2xl border p-4" style={ui.line}>
        <p className="text-sm font-bold" style={ui.ink}>{t(key, { date: fmtDate(error.resetsAt ?? null) })}</p>
        {(key === "errLogin" || key === "errConsent") && (
          <button type="button" onClick={() => setConsentOpen(true)} className="gkm-focus mt-3 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ backgroundColor: "var(--qh-navy)" }}>
            {t("loginCta")}
          </button>
        )}
        {tab === "link" && LINK_FALLBACK_ERRORS.has(error.code) && (
          <div className="mt-3">
            <p className="text-sm" style={ui.faint}>{t("pasteInstead")}</p>
            <button type="button" data-tut="tut-import-switch-text" onClick={() => { setTab("text"); setPhase("idle"); setError(null); }}
              className="gkm-focus mt-2 rounded-xl px-4 py-2.5 text-sm font-bold border" style={{ ...ui.line, ...ui.ink }}>
              {t("switchToText")}
            </button>
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="qh min-h-screen" style={ui.page}>
      <div className="max-w-xl mx-auto px-5 pt-8 pb-24">
        <h1 className="qh-serif text-2xl" style={ui.ink}>{t("title")}</h1>
        <p className="mt-2 text-sm leading-relaxed" style={ui.faint}>{t("lead")}</p>

        {(phase === "idle" || phase === "error" || phase === "analyzing") && (
          <div className="mt-6">
            <div role="tablist" aria-label={t("tabsLabel")} className="grid grid-cols-2 gap-2" data-tut="tut-import-tabs">
              {(["text", "link"] as const).map(k => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} data-tut={k === "text" ? "tut-import-tab-text" : "tut-import-tab-link"}
                  onClick={() => { setTab(k); if (phase === "error") { setPhase("idle"); setError(null); } }}
                  className="gkm-focus rounded-xl border px-3 py-3 text-sm font-bold"
                  style={{ ...ui.line, ...ui.ink, backgroundColor: tab === k ? "var(--qh-line)" : "transparent" }}>
                  {k === "text" ? t("tabText") : t("tabLink")}
                </button>
              ))}
            </div>

            {tab === "text" ? (
              <div className="mt-4">
                <label htmlFor="gkm-import-text" className="text-sm block mb-2" style={ui.faint}>{t("textLabel")}</label>
                <textarea id="gkm-import-text" data-tut="tut-import-text" value={textInput} onChange={e => setTextInput(e.target.value)}
                  rows={8} maxLength={18000} placeholder={t("textPlaceholder")}
                  className="gkm-focus w-full rounded-xl border px-3.5 py-3 text-sm bg-transparent leading-relaxed" style={{ ...ui.line, ...ui.ink }} />
              </div>
            ) : (
              <div className="mt-4">
                <label htmlFor="gkm-import-url" className="text-sm block mb-2" style={ui.faint}>{t("linkLabel")}</label>
                <input id="gkm-import-url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") void analyze(); }}
                  inputMode="url" data-tut="tut-import-url" placeholder="https://…"
                  className="gkm-focus w-full rounded-xl border px-3.5 py-3 text-sm bg-transparent" style={{ ...ui.line, ...ui.ink }} />
                <p className="mt-2 text-xs leading-relaxed" style={ui.faint}>{t("linkScope")}</p>
              </div>
            )}

            <p className="mt-3 text-xs leading-relaxed" style={ui.faint}>
              {user === false ? t("needLogin") : t("aiCountNote")}
              {balance && (() => {
                // 087 — 일정 만들기(가져오기·AI 일정 공통) 월 1회 + 신규 회원 최초 1회. 유료 잔액은 없다.
                const left = balance.plan.monthly_remaining + balance.plan.bonus_remaining;
                return ` ${left > 0
                  ? t(balance.plan.bonus_remaining > 0 ? "balancePlanWithBonus" : "balancePlan", { count: left })
                  : t("balanceUsed", { date: fmtDate(balance.resets_at) })}`;
              })()}
            </p>
            <button type="button" data-tut="tut-import-go" onClick={() => void analyze()} disabled={phase === "analyzing"}
              className={`${primary} mt-3`} style={{ backgroundColor: "var(--qh-navy)" }}>
              {phase === "analyzing" ? t("analyzing") : t("analyze")}
            </button>
            {phase === "analyzing" && <p className="mt-2 text-xs" role="status" style={ui.faint}>{t("analyzingNote")}</p>}
            {phase === "error" && errorBox}
            <ConsentSheet open={consentOpen} onClose={() => setConsentOpen(false)}
              onProceed={() => { void signInWithGoogle(window.location.pathname + window.location.search); }} />
          </div>
        )}

        {(phase === "preview" || phase === "saving") && analysis && result?.ok && (
          <div className="mt-5" data-tut="tut-import-preview" data-import-kind={analysis.kind}>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--qh-clay)" }}>
              {analysis.kind === "external_itinerary" ? t("kindItinerary") : analysis.kind === "single_place" ? t("kindPlace") : t("kindMulti")}
            </p>
            <p className="text-xs mt-2 leading-relaxed" style={ui.faint}>{t("previewNote")}</p>
            <p className="text-xs mt-1.5" style={ui.faint}>
              {t("sourceLine")}:{" "}
              {result.url ? (
                <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "var(--qh-blue)" }}>{source}</a>
              ) : t("sourceText")}
              {result.charged === false && ` · ${t("replayed")}`}
            </p>

            {/* ── 일정 → My Trip ── */}
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
                    <input value={city} onChange={e => setCity(e.target.value)} placeholder={t("cityOptional")}
                      className="gkm-focus w-full rounded-xl border px-3 py-2.5 text-sm bg-transparent" style={{ ...ui.line, ...ui.ink }} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={ui.faint}>{t("startLabel")}</label>
                    <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setDateFromSource(true); }}
                      className="gkm-focus w-full rounded-xl border px-3 py-2.5 text-sm bg-transparent" style={{ ...ui.line, ...ui.ink }} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={ui.faint}>{t("endLabel")}</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                      className="gkm-focus w-full rounded-xl border px-3 py-2.5 text-sm bg-transparent" style={{ ...ui.line, ...ui.ink }} />
                  </div>
                </div>
                {!dateFromSource && <p className="text-xs" style={{ color: "var(--qh-clay)" }}>{t("dateAssumed")}</p>}
                <p className="text-xs" style={ui.faint}>{t("excludeHint")}</p>
                {daysWithAdded.map(day => (
                  <div key={day.day_number} className="rounded-2xl border p-4" style={ui.line} data-import-day={day.day_number}>
                    <p className="text-sm font-bold" style={ui.ink}>Day {day.day_number}</p>
                    <ul className="mt-2 flex flex-col gap-2.5">
                      {day.stops.map(stop => {
                        const key = `${day.day_number}|${stop.name}`;
                        const { hit, linked } = linkOf(key, stop.name);
                        const on = !excluded.has(key);
                        return (
                          <li key={key} className="flex items-start gap-2.5" data-import-stop={stop.name} data-import-link={linked ? "linked" : hit ? "suggested" : "mine"}>
                            <input type="checkbox" checked={on} aria-label={stop.name} className="gkm-focus mt-0.5 h-4 w-4 shrink-0"
                              onChange={() => setExcluded(prev => { const n = new Set(prev); if (on) n.add(key); else n.delete(key); return n; })} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {(stop.time_text || stop.time) && <span className="text-xs font-bold tabular-nums" style={ui.faint}>{stop.time_text ?? stop.time}</span>}
                                <span className="text-sm" style={{ ...ui.ink, opacity: on ? 1 : 0.4 }}>{stop.name}</span>
                                {badge(hit, !!linked)}
                                {isAdded(day.day_number, stop.name) && (
                                  <>
                                    <span data-import-user-added className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border" style={{ ...ui.line, color: "var(--qh-navy)" }}>{t("userAddedBadge")}</span>
                                    <button type="button" className="gkm-focus text-[11px] underline" style={ui.faint}
                                      onClick={() => setAdded(prev => ({ ...prev, [day.day_number]: (prev[day.day_number] ?? []).filter(s => s.name !== stop.name) }))}>
                                      {t("removeAdded")}
                                    </button>
                                  </>
                                )}
                                {stop.optional && (
                                  <span data-import-optional className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border" style={{ ...ui.line, color: "var(--qh-clay)" }}>{t("optionalBadge")}</span>
                                )}
                              </div>
                              {stop.note && <p className="text-xs mt-0.5" style={ui.faint}>{stop.note}</p>}
                              {stop.optional && <p className="text-xs mt-0.5" style={{ color: "var(--qh-clay)" }}>{t("optionalHint")}</p>}
                              {hit && hit.kind === "suggest" && (
                                <button type="button" onClick={() => setAccepted(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                                  className="gkm-focus mt-1 text-xs font-bold underline underline-offset-2" style={{ color: "var(--qh-blue)" }}>
                                  {linked ? t("unlinkSuggestion") : t("linkSuggestion", { name: displayPlaceName(hit.spot.name, hit.spot.nameL10n ?? null, locale) })}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {/* AI 가 빠뜨린 장소를 저장 전에 직접 더한다 — 원문에 없는 장소를 AI 가 지어내지 않게, 사람만 더한다 */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap" data-import-add-missing={day.day_number}>
                      <input type="text" value={addDraft[day.day_number]?.name ?? ""} maxLength={120}
                        onChange={e => setAddDraft(prev => ({ ...prev, [day.day_number]: { name: e.target.value, time: prev[day.day_number]?.time ?? "" } }))}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMissing(day.day_number); } }}
                        placeholder={t("addMissingPlaceholder")} aria-label={t("addMissingLabel", { day: day.day_number })}
                        className="gkm-focus flex-1 min-w-[10rem] rounded-xl border px-3 py-2 text-sm bg-transparent" style={{ ...ui.line, ...ui.ink }} />
                      <input type="time" value={addDraft[day.day_number]?.time ?? ""} aria-label={t("addMissingTime")}
                        onChange={e => setAddDraft(prev => ({ ...prev, [day.day_number]: { name: prev[day.day_number]?.name ?? "", time: e.target.value } }))}
                        className="gkm-focus rounded-xl border px-2 py-2 text-sm bg-transparent" style={{ ...ui.line, ...ui.ink }} />
                      <button type="button" onClick={() => addMissing(day.day_number)}
                        disabled={(addDraft[day.day_number]?.name ?? "").trim().length < 2}
                        className="gkm-focus rounded-xl border px-3 py-2 text-sm font-bold disabled:opacity-40" style={{ ...ui.line, ...ui.ink }}>
                        {t("addMissingButton")}
                      </button>
                    </div>
                    {addDup === day.day_number && <p className="mt-1 text-xs" role="status" style={{ color: "var(--qh-clay)" }}>{t("addMissingDup")}</p>}
                  </div>
                ))}
                <p className="text-xs leading-relaxed" style={ui.faint}>{t("mineExplain")}</p>
                {doneMsg === "errSave" && <p className="text-xs" role="alert" style={{ color: "var(--qh-clay)" }}>{t("errSave")}</p>}
                <button data-tut="tut-import-confirm" onClick={() => void saveTrip(daysWithAdded)} disabled={phase === "saving"}
                  className={primary} style={{ backgroundColor: "var(--qh-navy)" }}>
                  {phase === "saving" ? t("importing") : t("importToMyTrip")}
                </button>
              </div>
            )}

            {/* ── 장소 하나 → 내 장소, 원하면 새 여행 ── */}
            {analysis.kind === "single_place" && (() => {
              const p = analysis.places[0] ?? { name: result.pageTitle ?? "" };
              const key = `p|${p.name}`;
              const { hit, linked } = linkOf(key, p.name);
              return (
                <div className="mt-5 rounded-2xl border p-4" style={ui.line} data-import-stop={p.name} data-import-link={linked ? "linked" : hit ? "suggested" : "mine"}>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-bold flex-1" style={ui.ink}>{linked ? displayPlaceName(linked.name, linked.nameL10n ?? null, locale) : p.name}</p>
                    {badge(hit, !!linked)}
                  </div>
                  {linked && <p className="text-xs mt-1" style={ui.faint}>{linked.city}{linked.district ? ` · ${linked.district}` : ""}</p>}
                  {hit && hit.kind === "suggest" && (
                    <button type="button" onClick={() => setAccepted(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                      className="gkm-focus mt-1 text-xs font-bold underline underline-offset-2" style={{ color: "var(--qh-blue)" }}>
                      {linked ? t("unlinkSuggestion") : t("linkSuggestion", { name: displayPlaceName(hit.spot.name, hit.spot.nameL10n ?? null, locale) })}
                    </button>
                  )}
                  {!linked && <p className="text-xs mt-2 leading-relaxed" style={ui.faint}>{t("placeMineExplain")}</p>}
                  {doneMsg === "errSave" && <p className="text-xs mt-2" role="alert" style={{ color: "var(--qh-clay)" }}>{t("errSave")}</p>}
                  {!placeSavedId ? (
                    <button type="button" data-tut="tut-import-place-save" onClick={() => void savePlaceToMine(p.name, null, linked)} disabled={phase === "saving"}
                      className={`${primary} mt-4`} style={{ backgroundColor: "var(--qh-navy)" }}>
                      {t("saveToMyPlaces")}
                    </button>
                  ) : (
                    <div className="mt-4 flex flex-col gap-2" data-import-saved="">
                      <p className="text-sm font-bold" role="status" style={ui.ink}>{t("placeSaved")}</p>
                      <button type="button" data-tut="tut-import-place-trip" disabled={phase === "saving"}
                        onClick={() => void saveTrip([{ day_number: 1, stops: [{ name: p.name, time: null, end_time: null, time_text: null, note: null }] }], (_d, n) => `p|${n}`)}
                        className={primary} style={{ backgroundColor: "var(--qh-navy)" }}>{t("placeToNewTrip")}</button>
                      <Link href="/picks?tab=mine" className="gkm-focus text-center rounded-xl py-3 text-sm font-bold border" style={{ ...ui.line, ...ui.ink }}>{t("openMyPlaces")}</Link>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── 장소 여러 곳 ── */}
            {analysis.kind === "multi_place_content" && (
              <div className="mt-5">
                <p className="text-sm" style={ui.faint}>{t("selectHint")}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {analysis.places.map(p => {
                    const key = `p|${p.name}`;
                    const { hit, linked } = linkOf(key, p.name);
                    const on = selected.has(p.name);
                    return (
                      <li key={p.name} className="flex items-center gap-2.5 rounded-2xl border p-3" style={ui.line} data-import-stop={p.name} data-import-link={linked ? "linked" : hit ? "suggested" : "mine"}>
                        <input type="checkbox" checked={on} aria-label={p.name} className="gkm-focus h-4 w-4 shrink-0"
                          onChange={() => setSelected(prev => { const n = new Set(prev); if (on) n.delete(p.name); else n.add(p.name); return n; })} />
                        <span className="text-sm flex-1 min-w-0 truncate" style={ui.ink}>{linked ? displayPlaceName(linked.name, linked.nameL10n ?? null, locale) : p.name}</span>
                        {badge(hit, !!linked)}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs leading-relaxed" style={ui.faint}>{t("multiExplain")}</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button type="button" data-tut="tut-import-multi-trip" disabled={phase === "saving"}
                    onClick={() => void saveTrip([{ day_number: 1, stops: analysis.places.filter(p => selected.has(p.name)).map(p => ({ name: p.name, time: null, end_time: null, time_text: null, note: null })) }], (_d, n) => `p|${n}`)}
                    className={primary} style={{ backgroundColor: "var(--qh-navy)" }}>{t("multiToNewTrip")}</button>
                  <button type="button" data-tut="tut-import-add" onClick={() => void addSelected()} disabled={phase === "saving"}
                    className="gkm-focus w-full rounded-xl py-3 text-sm font-bold border" style={{ ...ui.line, ...ui.ink }}>
                    {t("addToThisTrip")}
                  </button>
                </div>
                {doneMsg === "placesSaved" && <p className="text-xs mt-2" role="status" style={ui.faint}>{t("placesSaved")}</p>}
                {doneMsg === "selectHint" && <p className="text-xs mt-2" style={{ color: "var(--qh-clay)" }}>{t("selectHint")}</p>}
                {doneMsg === "errSave" && <p className="text-xs mt-2" role="alert" style={{ color: "var(--qh-clay)" }}>{t("errSave")}</p>}
              </div>
            )}

            <button type="button" onClick={() => { setPhase("idle"); setResult(null); setPlaceSavedId(null); setDoneMsg(null); }}
              className="gkm-focus mt-5 text-xs font-bold underline underline-offset-2" style={ui.faint}>{t("startOver")}</button>
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
