"use client";

// Home·더보기의 안내 진입점 (GOKOREAMATE-GUIDED-JOURNEY-TUTORIAL-V1)
//  · 아직 여행이 없고 안내를 고르지 않은 사용자: "어떻게 여행을 시작할까요?"(Home, 페이지 흐름 안 — 오버레이 아님)
//  · 멈춰 둔 안내(여행 중에 이어하기·끝내기): '이어하기'로 멈춘 단계부터 다시
//  · 더보기(always): 이어하기 / 처음부터 다시(경로 선택) / 켜기·끄기
// 첫 방문 안내(PreOpenNotice)가 열려 있는 동안에는 그리지 않는다 — 안내가 겹치지 않는다.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  readJourney, writeJourney, resumeJourney, endJourney, JOURNEY_CHANGE_EVENT, type JourneyState,
} from "@/lib/guided-journey/journey-core";
import JourneyStartChooser from "@/components/guided-journey/JourneyStartChooser";
import { apiFetchItinerariesByDevice } from "@/lib/itinerary-api";
import { getDeviceId } from "@/lib/deviceId";

export function useJourneyState(): JourneyState | null {
  const [js, setJs] = useState<JourneyState | null>(null);
  useEffect(() => {
    const sync = () => setJs(readJourney());
    Promise.resolve().then(sync);
    window.addEventListener(JOURNEY_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(JOURNEY_CHANGE_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return js;
}

/** 멈춘 안내를 멈춘 단계부터 다시 켠다(끝내기로 멈췄어도 같은 단계부터) */
export function resumeFromPause(js: JourneyState): void {
  if (!js.step) return;
  writeJourney(js.status === "paused" ? resumeJourney(js) : { ...js, status: "active" });
}

export function HomeJourneyEntry({ hasTrip, blocked }: { hasTrip: boolean | undefined; blocked: boolean }) {
  const t = useTranslations("journey");
  const js = useJourneyState();
  // Home 의 hasTrip 은 이 기기 키(koreamate_itin3_id_)만 본다 — 추천 일정 담기·가져오기로 만든 여행은
  // 그 키를 남기지 않아 "여행 없음"으로 보였다. 기기 키가 없을 때만 내 여행 목록(서버, 기기·계정 소유)을
  // 한 번 확인한다. 확인 전에는 선택지를 그리지 않는다(깜박 나타났다 사라지지 않게).
  const [serverHasTrip, setServerHasTrip] = useState<boolean | null>(null);
  const needServerCheck = !!js && js.status === "idle" && hasTrip === false;
  useEffect(() => {
    if (!needServerCheck) return;
    let alive = true;
    apiFetchItinerariesByDevice(getDeviceId())
      .then(rows => { if (alive) setServerHasTrip(rows.length > 0); })
      .catch(() => { if (alive) setServerHasTrip(false); });
    return () => { alive = false; };
  }, [needServerCheck]);
  if (!js || blocked || hasTrip === undefined) return null;
  if (js.status === "paused" && js.step) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-4">
        <div data-journey-resume="" className="rounded-2xl border border-line bg-surface-dim/40 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="flex-1 min-w-[12rem] text-[13px] font-bold text-ink">{t("resumeLine", { step: t(`steps.${js.step}.name`) })}</p>
          <button type="button" onClick={() => resumeFromPause(js)} className="gkm-focus min-h-10 px-3.5 rounded-xl bg-ink text-white text-[13px] font-bold">{t("resume")}</button>
          <button type="button" onClick={() => writeJourney(endJourney(js, "later"))} className="gkm-focus min-h-10 text-[13px] font-bold text-sub underline underline-offset-2">{t("dismissResume")}</button>
        </div>
      </div>
    );
  }
  if (js.status !== "idle" || hasTrip) return null;
  if (serverHasTrip !== false) return null; // 확인 중이거나 이미 여행이 있다
  return (
    <div className="max-w-xl mx-auto px-4 pt-4">
      <JourneyStartChooser hasTrip={false} />
    </div>
  );
}

export function MoreJourneyControls() {
  const t = useTranslations("journey");
  const js = useJourneyState();
  const [choosing, setChoosing] = useState(false);
  if (!js) return null;
  const on = js.status !== "off";
  const canResume = !!js.step && (js.status === "paused" || js.status === "later");
  return (
    <div className="px-5 py-4" data-journey-more="">
      <div className="flex items-center gap-4">
        <span className="min-w-0 flex-1">
          <span id="gkm-journey-toggle" className="block text-[16px] font-black text-ink leading-snug">{t("moreTitle")}</span>
          <span className="block text-[13px] text-sub mt-0.5 leading-snug">
            {js.status === "active" ? t("moreActive", { step: js.step ? t(`steps.${js.step}.name`) : "" })
              : canResume ? t("morePaused", { step: t(`steps.${js.step!}.name`) })
              : js.status === "done" ? t("moreDone") : on ? t("moreIdle") : t("moreOff")}
          </span>
        </span>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="gkm-journey-toggle"
          onClick={() => writeJourney(on ? endJourney(js, "off") : { ...js, status: "idle" })}
          className="gkm-focus relative shrink-0 w-12 h-7 rounded-full transition-colors"
          style={{ backgroundColor: on ? "#FF4A2D" : "#D9D2C7" }}>
          <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ left: on ? "calc(100% - 1.625rem)" : "0.125rem" }} />
        </button>
      </div>
      {on && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canResume && (
            <button type="button" onClick={() => resumeFromPause(js)} className="gkm-focus min-h-10 px-3.5 rounded-xl bg-ink text-white text-[13px] font-bold">{t("resume")}</button>
          )}
          <button type="button" aria-expanded={choosing} onClick={() => setChoosing(c => !c)} className="gkm-focus min-h-10 px-3.5 rounded-xl border border-ink text-[13px] font-bold text-ink">{t("restart")}</button>
        </div>
      )}
      {on && choosing && (
        // 추천 일정으로 담은 여행은 이 기기 키(koreamate_itin3_id_)를 남기지 않아 기기 판정으로는 알 수 없다 —
        // 더보기에서 다시 고를 때는 '내 여행에서 이어가기'를 늘 보인다(여행이 없으면 그 단계가 알려 준다)
        <div className="mt-3"><JourneyStartChooser hasTrip onDone={() => setChoosing(false)} /></div>
      )}
    </div>
  );
}
