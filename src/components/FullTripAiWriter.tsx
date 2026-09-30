"use client";

// 전체 여행 AI 글쓰기 (Owner 교정 2026-09-30)
//
// 사용자가 My Trip 에 일정·사진·메모를 다 담은 뒤, 이 버튼을 **직접 눌렀을 때만** 한 번의 요청으로
// 여행 제목·Story 제목·소개와 각 기록(사진)의 제목·내용을 세 가지 표현으로 함께 제안받는다.
//  · 자동 호출 없음. 이 화면을 열면 저장된 지난 제안만 불러온다(AI 호출·차감 0).
//  · 같은 한 번의 요청에 기록 사진(기록마다 첫 장, 상한 안)을 함께 싣는다. 실제로 본 사진 수와 반영하지 못한
//    사진(이유)을 화면에 따로 알린다 — 보지 못한 사진을 본 것처럼 표시하지 않는다.
//  · 제안은 적용이 아니다. 비어 있는 칸만 기본 선택되고, 직접 쓴 내용은 지금 값과 제안을 나란히
//    보여 준 뒤 사용자가 고를 때만 바뀐다.
//  · 성공한 새 제안 1건 = 전체 여행 AI 글쓰기 사용권 1회(월 2회 · My Trip·Story 공통). 실패 = 0.

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import FreeAiUsedNote from "@/components/FreeAiUsedNote";
import ConsentSheet from "@/components/auth/ConsentSheet";
import { getCurrentUser, signInWithGoogle } from "@/lib/auth/auth-client";
import { withAuthHeader } from "@/lib/auth/device-auth-headers";
import { apiFullTrip, apiFullTripBalance, type FullTripPhotoCoverage, type FullTripPhotoPlan } from "@/lib/mytrip-writing/full-trip-api";
import { FULL_TRIP_STYLES, defaultSelected, type FullTripProposal, type FullTripStyle } from "@/lib/mytrip-writing/full-trip-core";

export interface FullTripMomentView { id: string; title: string | null; memo: string | null; place: string | null; day: number | null; synced: boolean }

type Phase = "idle" | "confirm" | "busy" | "result" | "failed" | "freeUsed" | "login" | "applying";

export default function FullTripAiWriter(props: {
  itineraryId: string;
  deviceId: string;
  tripTitle: string | null;
  storyTitle: string | null;
  storyIntro: string | null;
  moments: FullTripMomentView[];
  onApplied: (v: { tripTitle?: string; storyTitle?: string; storyIntro?: string; tone: FullTripStyle; momentIds: string[] }) => void;
}) {
  const t = useTranslations("fullTripAi");
  const tDir = useTranslations("aiWrite");
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>("idle");
  const [proposal, setProposal] = useState<FullTripProposal | null>(null);
  const [photos, setPhotos] = useState<FullTripPhotoCoverage | null>(null);
  const [photoPlan, setPhotoPlan] = useState<FullTripPhotoPlan | null>(null);
  const [savedView, setSavedView] = useState(false);
  const [style, setStyle] = useState<FullTripStyle>("calm");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [nextFreeAt, setNextFreeAt] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);

  const current = (): Record<string, string | null> => {
    const m: Record<string, string | null> = { tripTitle: props.tripTitle, storyTitle: props.storyTitle, storyIntro: props.storyIntro };
    for (const x of props.moments) m[`m:${x.id}`] = [x.title, x.memo].filter(v => v && v.trim()).join(" · ") || null;
    return m;
  };
  // 비어 있는 칸만 기본 선택 — 직접 쓴 내용은 고를 때만 바뀐다
  const resetPicks = (p: FullTripProposal | null, s: FullTripStyle) => {
    const cur = current(), sp = p?.[s];
    const next: Record<string, boolean> = {};
    if (sp?.tripTitle) next.tripTitle = defaultSelected(cur.tripTitle);
    if (sp?.storyTitle) next.storyTitle = defaultSelected(cur.storyTitle);
    if (sp?.storyIntro) next.storyIntro = defaultSelected(cur.storyIntro);
    for (const m of sp?.moments ?? []) next[`m:${m.id}`] = defaultSelected(cur[`m:${m.id}`]);
    setPicked(next);
  };

  // 열 때는 저장된 지난 제안만(재열람 = 요청·차감 0) + 남은 횟수 안내
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await apiFullTrip({ itineraryId: props.itineraryId, deviceId: props.deviceId, locale, mode: "load" });
      if (alive && (r.kind === "proposal" || r.kind === "none")) setPhotoPlan(r.photoPlan ?? null);
      if (alive && r.kind === "proposal") {
        const first = FULL_TRIP_STYLES.find(s => r.proposal[s]) ?? "calm";
        setProposal(r.proposal); setPhotos(r.photos); setSavedView(true); setStyle(first); resetPicks(r.proposal, first); setPhase("result");
      }
      const b = await apiFullTripBalance();
      if (alive && b) { setRemaining(b.remaining); setNextFreeAt(b.resetsAt); }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 열 때 한 번(여행·언어가 바뀔 때만)
  }, [props.itineraryId, props.deviceId, locale]);

  async function ask() {
    if (!(await getCurrentUser())) { setPhase("login"); return; }
    setPhase("confirm");
  }
  async function generate(forceFresh = false) {
    setPhase("busy"); setApplied(false); setApplyFailed(false);
    const r = await apiFullTrip({ itineraryId: props.itineraryId, deviceId: props.deviceId, locale, mode: "generate", forceFresh });
    if (r.kind === "proposal") {
      setProposal(r.proposal); setPhotos(r.photos); setSavedView(!r.charged); setPhase("result");
      const firstStyle = FULL_TRIP_STYLES.find(s => r.proposal[s]) ?? "calm";
      setStyle(firstStyle); resetPicks(r.proposal, firstStyle);
      const b = await apiFullTripBalance(); if (b) setRemaining(b.remaining);
    } else if (r.kind === "freeUsed") { setNextFreeAt(r.nextFreeAt); setPhase("freeUsed"); }
    else if (r.kind === "login") setPhase("login");
    else setPhase("failed");
  }

  async function apply() {
    const sp = proposal?.[style];
    if (!sp) return;
    setPhase("applying"); setApplyFailed(false);
    const headers = await withAuthHeader({ "Content-Type": "application/json", "x-device-id": props.deviceId });
    const it: Record<string, string> = {};
    if (picked.tripTitle && sp.tripTitle) it.trip_title = sp.tripTitle;
    if (picked.storyTitle && sp.storyTitle) it.story_title = sp.storyTitle;
    if (picked.storyIntro && sp.storyIntro) it.story_intro = sp.storyIntro;
    let ok = true;
    if (Object.keys(it).length > 0) {
      const r = await fetch(`/api/itinerary/${encodeURIComponent(props.itineraryId)}`, { method: "PATCH", headers, body: JSON.stringify({ ...it, story_tone: style }) }).catch(() => null);
      ok = ok && !!r?.ok;
    }
    const doneMoments: string[] = [];
    for (const m of sp.moments) {
      if (!picked[`m:${m.id}`]) continue;
      const body: Record<string, string> = {};
      if (m.title) body.title = m.title;
      if (m.memo) body.memo = m.memo;
      const r = await fetch(`/api/trip-moments/${encodeURIComponent(m.id)}`, { method: "PATCH", headers, body: JSON.stringify(body) }).catch(() => null);
      if (r?.ok) doneMoments.push(m.id); else ok = false;
    }
    props.onApplied({
      ...(it.trip_title ? { tripTitle: it.trip_title } : {}), ...(it.story_title ? { storyTitle: it.story_title } : {}),
      ...(it.story_intro ? { storyIntro: it.story_intro } : {}), tone: style, momentIds: doneMoments,
    });
    setApplied(ok); setApplyFailed(!ok); setPhase("result");
  }

  const sp = proposal?.[style];
  const cur = current();
  const momentMeta = new Map(props.moments.map(m => [m.id, m]));
  const pickCount = Object.values(picked).filter(Boolean).length;
  const row = (key: string, label: string, proposed: string) => (
    <label key={key} className="flex items-start gap-3 py-2.5 border-t border-black/5 cursor-pointer" data-full-trip-row={key}>
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={!!picked[key]} onChange={e => setPicked(p => ({ ...p, [key]: e.target.checked }))} />
      <span className="min-w-0">
        <span className="block text-[11.5px] font-bold text-[#8A919B]">{label}</span>
        {cur[key] && (
          <span className="block text-[12.5px] text-[#8A919B]">
            {t("current")}: <span className={picked[key] ? "line-through decoration-black/30" : ""}>{cur[key]}</span>
            <span className="block text-[11.5px] font-bold text-[#B45309]" data-user-written="">{t("userWritten")}</span>
          </span>
        )}
        <span className="block text-[13.5px] text-[#131b2e] leading-relaxed">{proposed}</span>
      </span>
    </label>
  );

  return (
    <section className="max-w-4xl mx-auto px-6 py-4" aria-label={t("heading")} data-full-trip-ai="">
      <div className="rounded-2xl border border-black/10 bg-white/80 px-5 py-4">
        <p className="text-[15px] font-black text-[#131b2e]">{t("heading")}</p>
        <p className="mt-1 text-[12.5px] text-[#565D66] leading-relaxed">{t("desc")}</p>
        {remaining !== null && <p className="mt-1 text-[11.5px] text-[#8A919B]" data-full-trip-remaining={remaining}>{t("remaining", { count: remaining })}</p>}

        {(phase === "idle" || phase === "failed") && (
          <div className="mt-3">
            {phase === "failed" && <p role="alert" className="mb-2 text-[12.5px] font-bold text-red-600">{t("failed")}</p>}
            <button type="button" data-full-trip-ask="" onClick={() => void ask()}
              className="gkm-focus px-4 py-2 rounded-xl text-sm font-black text-white bg-[#131b2e]">
              {phase === "failed" ? t("retry") : t("ask")}
            </button>
          </div>
        )}
        {phase === "login" && (
          <div className="mt-3">
            <p className="text-[12.5px] font-bold text-[#131b2e]">{t("needLogin")}</p>
            <button type="button" onClick={() => setConsentOpen(true)} className="gkm-focus mt-2 px-4 py-2 rounded-xl text-sm font-black text-white bg-[#131b2e]">{t("loginCta")}</button>
            <ConsentSheet open={consentOpen} onClose={() => setConsentOpen(false)}
              onProceed={() => { void signInWithGoogle(window.location.pathname + window.location.search); }} />
          </div>
        )}
        {phase === "confirm" && (
          <div className="mt-3" data-full-trip-confirm="">
            <p className="text-[13.5px] font-bold text-[#131b2e]">{t("confirmTitle")}</p>
            <p className="mt-1 text-[12px] text-[#565D66]">{t("confirmBody")}</p>
            {/* 사용권을 쓰기 전에 — 기록마다 첫 사진만 · 최대 12장, 빠지는 사진과 이유 */}
            <p className="mt-1 text-[12px] font-bold text-[#131b2e]" data-full-trip-plan={photoPlan ? `${photoPlan.will_use}/${photoPlan.candidates}` : "unknown"}>
              {!photoPlan || photoPlan.candidates === 0 ? t("planNoPhotos") : t("planPhotos", { used: photoPlan.will_use, total: photoPlan.candidates })}
              {photoPlan && photoPlan.skipped.length > 0 && ` ${t("planSkipped", { count: photoPlan.skipped.length, reasons: [...new Set(photoPlan.skipped.map(x => t(`skip_${x.reason}` as "skip_over_count")))].join(", ") })}`}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" data-full-trip-go="" onClick={() => void generate(savedView && !!proposal)} className="gkm-focus px-4 py-2 rounded-xl text-sm font-black text-white bg-[#131b2e]">{t("confirmYes")}</button>
              <button type="button" onClick={() => setPhase(proposal ? "result" : "idle")} className="gkm-focus px-4 py-2 rounded-xl text-sm font-bold border border-black/15 text-[#565D66]">{t("confirmNo")}</button>
            </div>
          </div>
        )}
        {phase === "busy" && <p role="status" className="mt-3 text-[12.5px] text-[#565D66]">{t("busy")}</p>}
        {phase === "freeUsed" && (
          <div className="mt-3">
            <FreeAiUsedNote kind="writing" nextFreeAt={nextFreeAt} className="text-[12.5px] font-bold text-[#565D66]" />
            {proposal && <button type="button" onClick={() => setPhase("result")} className="gkm-focus mt-2 text-xs font-bold underline">{t("backToSaved")}</button>}
          </div>
        )}

        {(phase === "result" || phase === "applying") && proposal && (
          <div className="mt-3" data-full-trip-result="">
            {savedView && <p className="text-[11.5px] text-[#8A919B]" data-full-trip-saved="">{t("savedView")}</p>}
            {/* 실제로 본 사진 · 반영하지 못한 사진(이유) — 보지 못한 사진을 본 것처럼 말하지 않는다 */}
            <p className="text-[11.5px] text-[#565D66]" data-full-trip-photos={photos ? `${photos.shown.length}/${photos.candidates}` : "none"}>
              {photos && photos.shown.length > 0 ? t("photosShown", { count: photos.shown.length }) : t("photosNone")}
              {photos && photos.skipped.length > 0 && ` ${t("photosSkipped", { count: photos.skipped.length, reasons: [...new Set(photos.skipped.map(x => t(`skip_${x.reason}` as "skip_over_count")))].join(", ") })}`}
            </p>
            <div role="tablist" aria-label={t("styleLabel")} className="mt-2 flex flex-wrap gap-2">
              {FULL_TRIP_STYLES.filter(s => proposal[s]).map(s => (
                <button key={s} type="button" role="tab" aria-selected={style === s} data-full-trip-style={s} onClick={() => { setStyle(s); resetPicks(proposal, s); }}
                  className={`gkm-focus px-3 py-1.5 rounded-full text-xs font-black border ${style === s ? "bg-[#131b2e] text-white border-[#131b2e]" : "border-black/15 text-[#131b2e]"}`}>
                  {tDir(s === "calm" ? "dir_calm" : s === "witty" ? "dir_witty" : "dir_warm")}
                </button>
              ))}
            </div>
            {sp && (
              <div className="mt-2">
                {sp.tripTitle && row("tripTitle", t("fieldTripTitle"), sp.tripTitle)}
                {sp.storyTitle && row("storyTitle", t("fieldStoryTitle"), sp.storyTitle)}
                {sp.storyIntro && row("storyIntro", t("fieldStoryIntro"), sp.storyIntro)}
                {sp.moments.map(m => {
                  const meta = momentMeta.get(m.id);
                  if (!meta) return null;
                  const seen = photos?.shown.includes(m.id);
                  const missed = photos?.skipped.some(x => x.momentId === m.id);
                  const label = [meta.day ? t("dayN", { n: meta.day }) : null, meta.place, seen ? t("tagPhotoSeen") : missed ? t("tagPhotoMissed") : null].filter(Boolean).join(" · ") || t("fieldMoment");
                  return row(`m:${m.id}`, label, [m.title, m.memo].filter(Boolean).join(" — "));
                })}
              </div>
            )}
            {applied && <p role="status" className="mt-2 text-[12.5px] font-bold text-emerald-700">{t("applied")}</p>}
            {applyFailed && <p role="alert" className="mt-2 text-[12.5px] font-bold text-red-600">{t("applyFailed")}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" data-full-trip-apply="" disabled={pickCount === 0 || phase === "applying"} onClick={() => void apply()}
                className="gkm-focus px-4 py-2 rounded-xl text-sm font-black text-white bg-[#131b2e] disabled:opacity-40">
                {phase === "applying" ? t("applying") : t("apply", { count: pickCount })}
              </button>
              <button type="button" data-full-trip-regen="" onClick={() => void ask()} className="gkm-focus px-3 py-2 rounded-xl text-xs font-bold border border-black/15 text-[#565D66]">{t("regenerate")}</button>
            </div>
            <p className="mt-2 text-[11px] text-[#8A919B]">{t("noPhotoNote")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
