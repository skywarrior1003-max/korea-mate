"use client";

// 여행 전체 Story 표지 편집 (STORY-HERO-TONE-SELECTION V2 §3).
//
// 실사용자 계약:
//  · 먼저 "어떤 분위기로 여행 이야기를 남길까요?" 를 묻는다 — 질문 표시만으로는
//    AI 호출 0. AI 가 문체를 대신 고르지 않고, 세 문체를 미리 만들지 않는다.
//  · 사용자가 문체 하나를 고르면 그 방향의 제목+소개문 한 쌍을 **정확히 1회**
//    생성한다. 수정·저장·열람은 호출 0. 문체 변경/재생성만 행동당 +1회이며,
//    그 비용은 UI 문구(heroRegenNote)로 과장 없이 알린다.
//  · 저장을 눌러야 Story 에 반영된다(PATCH story_title/story_intro/story_tone).
//    공개 표지는 저장된 최종값만 쓴다.
//  · 같은 입력+같은 문체는 sessionStorage 캐시(해시 키 — 평문 저장 0)로
//    재호출하지 않는다.

import { useCallback, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  WRITING_DIRECTIONS, STORY_HERO_PROMPT_VERSION, deriveHeroMomentFacts,
  type WritingDirection, type WritingContext, type PublicMomentFact,
} from "@/lib/mytrip-writing/writing-core";
import { apiSuggestStoryHero } from "@/lib/mytrip-writing/api";

const ORANGE = "#FF4A2D";

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

interface Props {
  itineraryId: string;
  deviceId: string;
  city: string;
  startDate: string;
  endDate: string;
  /** 여행 패턴 사실(deriveTripWritingFacts 결과) — 좌표·내부 id 없음 */
  tripFacts: string[];
  /** 공개로 저장된 moment 의 장소명·제목·메모만(§5 허용 입력) */
  publicMoments: PublicMomentFact[];
  hasPublicPhoto: boolean;
  storyTitle: string | null;
  storyIntro: string | null;
  storyTone: string | null;
  onSaved: (v: { title: string; intro: string; tone: WritingDirection }) => void;
}

export default function StoryHeroEditor({
  itineraryId, deviceId, city, startDate, endDate, tripFacts, publicMoments,
  hasPublicPhoto, storyTitle, storyIntro, storyTone, onSaved,
}: Props) {
  const t = useTranslations("story");
  const locale = useLocale();
  const [mode, setMode] = useState<"saved" | "ask" | "edit">(storyTitle ? "saved" : "ask");
  const [tone, setTone] = useState<WritingDirection | null>(
    storyTone === "calm" || storyTone === "witty" || storyTone === "warm" ? storyTone : null);
  const [title, setTitle] = useState(storyTitle ?? "");
  const [intro, setIntro] = useState(storyIntro ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [limitedSec, setLimitedSec] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const inflight = useRef<AbortController | null>(null);

  const buildContext = useCallback((): WritingContext => ({
    city,
    dates: `${startDate} – ${endDate}`,
    hasPhoto: hasPublicPhoto,
    tripFacts: [...tripFacts, ...deriveHeroMomentFacts(publicMoments)],
  }), [city, startDate, endDate, hasPublicPhoto, tripFacts, publicMoments]);

  /**
   * 문체 선택 = 그 방향으로 정확히 1요청(같은 입력·같은 문체는 캐시 → 0).
   * forceFresh 는 "다시 제안받기" 명시 버튼 전용 — 그때만 캐시를 지나쳐 +1.
   */
  const pickTone = useCallback(async (dir: WritingDirection, opts?: { forceFresh?: boolean }) => {
    if (busy) return;
    setTone(dir);
    setFailed(false);
    const context = buildContext();
    const key = `gkm_hero_${STORY_HERO_PROMPT_VERSION}_${locale}_${dir}_${djb2(JSON.stringify(context))}`;
    if (!opts?.forceFresh) try {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        const j = JSON.parse(cached) as { title?: string; intro?: string };
        if (j.title && j.intro) { setTitle(j.title); setIntro(j.intro); setMode("edit"); return; }
      }
    } catch { /* private mode */ }
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setBusy(true);
    setLimitedSec(null);
    const out = await apiSuggestStoryHero({
      direction: dir, locale, context, itineraryId, deviceId,
      forceFresh: opts?.forceFresh, signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    setBusy(false);
    if (out && "rateLimited" in out) {
      // 제한(§I) — 남은 시간만 안내. 직접 작성·저장은 계속 가능하다.
      setLimitedSec(out.retryAfterSec);
    } else if (out) {
      setTitle(out.title);
      setIntro(out.intro);
      try { sessionStorage.setItem(key, JSON.stringify(out)); } catch { /* private mode */ }
    } else {
      // 실패해도 막지 않는다 — 직접 쓰거나 다시 시도(§8)
      setFailed(true);
    }
    setMode("edit");
  }, [busy, buildContext, locale, itineraryId, deviceId]);

  const save = useCallback(async () => {
    if (saving || !title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/itinerary/${encodeURIComponent(itineraryId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify({
          story_title: title.trim().slice(0, 80),
          story_intro: intro.trim().slice(0, 300),
          ...(tone ? { story_tone: tone } : {}),
        }),
      });
      if (res.ok) {
        setMode("saved");
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2500);
        onSaved({ title: title.trim(), intro: intro.trim(), tone: tone ?? "calm" });
      }
    } finally {
      setSaving(false);
    }
  }, [saving, title, intro, tone, itineraryId, deviceId, onSaved]);

  const toneLabel = (d: WritingDirection) =>
    t(d === "calm" ? "heroToneCalm" : d === "witty" ? "heroToneWitty" : "heroToneWarm");

  return (
    <section className="max-w-4xl mx-auto px-6 py-5" aria-label={t("heroEditHeading")}>
      <div className="rounded-2xl border border-black/10 bg-white/70 backdrop-blur px-5 py-4">
        <p className="text-[11px] font-black uppercase tracking-widest text-[#8A919B]">{t("heroEditHeading")}</p>

        {mode === "saved" && (
          <div className="mt-2">
            <p className="text-[17px] font-black text-[#131b2e]">{title}</p>
            {intro && <p className="mt-1 text-[13.5px] text-[#565D66] leading-relaxed">{intro}</p>}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMode("ask")}
                className="gkm-focus px-3 py-1.5 rounded-full text-xs font-bold border border-black/15 text-[#565D66] cursor-pointer"
              >
                {t("heroChangeTone")}
              </button>
              {savedFlash && <span className="text-xs font-bold text-emerald-600">✓ {t("heroSaved")}</span>}
            </div>
          </div>
        )}

        {mode === "ask" && (
          <div className="mt-2">
            <p className="text-[15px] font-bold text-[#131b2e]">{t("heroToneQuestion")}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {WRITING_DIRECTIONS.map(d => (
                <button
                  key={d} type="button" disabled={busy}
                  onClick={() => void pickTone(d)}
                  className="gkm-focus px-4 py-2 rounded-full text-sm font-black border cursor-pointer disabled:opacity-50"
                  style={tone === d
                    ? { backgroundColor: ORANGE, color: "#fff", borderColor: ORANGE }
                    : { backgroundColor: "transparent", color: "#131b2e", borderColor: "rgba(0,0,0,0.18)" }}
                >
                  {toneLabel(d)}
                </button>
              ))}
            </div>
            {/* 재생성 비용 고지(§3) — 과장 없이 */}
            <p className="mt-2 text-[11.5px] text-[#8A919B]">{t("heroRegenNote")}</p>
            {busy && (
              <p className="mt-2 flex items-center gap-2 text-[12.5px] text-[#565D66]" role="status">
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-black/20 border-t-[#FF4A2D] animate-spin" aria-hidden />
                {t("heroBusy")}
              </p>
            )}
          </div>
        )}

        {mode === "edit" && (
          <div className="mt-2 space-y-2.5">
            {failed && <p role="alert" className="text-[12.5px] font-bold text-red-600">{t("heroFailed")}</p>}
            {limitedSec !== null && <p role="status" className="text-[12.5px] font-bold text-[#8A919B]">{t("heroLimited", { sec: Math.ceil(limitedSec) })}</p>}
            <label className="block">
              <span className="text-[11.5px] font-bold text-[#8A919B]">{t("heroTitleLabel")}</span>
              <input
                value={title} onChange={e => setTitle(e.target.value)} maxLength={80}
                className="gkm-focus mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-[15px] font-bold text-[#131b2e]"
              />
            </label>
            <label className="block">
              <span className="text-[11.5px] font-bold text-[#8A919B]">{t("heroIntroLabel")}</span>
              <textarea
                value={intro} onChange={e => setIntro(e.target.value)} maxLength={300} rows={3}
                className="gkm-focus mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-[13.5px] text-[#131b2e] leading-relaxed"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button" onClick={() => void save()} disabled={saving || !title.trim()}
                className="gkm-focus px-4 py-2 rounded-xl text-sm font-black text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: ORANGE }}
              >
                {t("heroSave")}
              </button>
              {/* 명시적 재제안(§B) — 누를 때만 정확히 1요청. 자동 재호출 없음. */}
              {tone && (
                <button
                  type="button" onClick={() => void pickTone(tone, { forceFresh: true })} disabled={busy}
                  className="gkm-focus px-3 py-2 rounded-xl text-xs font-bold border border-black/15 text-[#565D66] cursor-pointer disabled:opacity-50"
                >
                  {busy ? t("heroBusy") : t("heroRegen")}
                </button>
              )}
              <button
                type="button" onClick={() => setMode("ask")} disabled={busy}
                className="gkm-focus px-3 py-2 rounded-xl text-xs font-bold border border-black/15 text-[#565D66] cursor-pointer"
              >
                {t("heroChangeTone")}
              </button>
            </div>
            {/* 비용 구조 안내(§B) — 과장 없이 */}
            <p className="text-[11.5px] text-[#8A919B]">{t("heroCostNote")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
