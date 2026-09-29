"use client";

// "어떻게 여행을 시작할까요?" — 출발 방법 선택(GOKOREAMATE-GUIDED-JOURNEY-TUTORIAL-V1)
//
// 두 선택지는 같은 모양·같은 무게다. 어느 쪽도 미리 고르거나 권하지 않는다.
//  ① 고코리아메이트에서 발견하기 → 추천 일정 / 장소를 골라 직접 만들기
//  ② 이미 만든 일정 활용하기 → 링크 가져오기(지원 범위를 먼저 알린다 — 공개 웹페이지·블로그 링크만,
//     로그인 필요, AI 대화 답변 붙여넣기·파일은 지원하지 않는다)
// 이미 여행이 있는 사용자에게는 '내 여행에서 이어가기'(My Trip 합류 지점부터)를 함께 보인다.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { readJourney, writeJourney, startJourney, endJourney, type JourneyPath } from "@/lib/guided-journey/journey-core";

const START_HREF: Record<JourneyPath, string> = { course: "/", places: "/", import: "/import/", mytrip: "/my-trips/" };

export default function JourneyStartChooser({ hasTrip, onDone, compact = false }: { hasTrip: boolean; onDone?: () => void; compact?: boolean }) {
  const t = useTranslations("journey");
  const router = useRouter();
  const [open, setOpen] = useState<"discover" | "import" | null>(null);

  const go = (path: JourneyPath) => {
    writeJourney(startJourney(readJourney(), path));
    onDone?.();
    if (path !== "course" && path !== "places") router.push(START_HREF[path]);
    else if (window.location.pathname !== "/") router.push("/");
  };
  const later = () => { writeJourney(endJourney(readJourney(), "later")); onDone?.(); };

  const optCls = "gkm-focus w-full text-left rounded-2xl border px-4 py-3.5 transition-colors";
  const optStyle = (on: boolean) => ({ borderColor: on ? "var(--color-ink, #1f2328)" : "var(--color-line, #e6dfd5)", background: "var(--color-surface, #fff)" });
  const subBtn = "gkm-focus w-full text-left rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13px] font-bold text-ink hover:bg-surface-dim";

  return (
    <section data-journey-chooser="" aria-labelledby="gkm-journey-start-title" className={compact ? "" : "rounded-2xl border border-line bg-surface-dim/40 p-4 sm:p-5"}>
      <h2 id="gkm-journey-start-title" className="text-[16px] font-black text-ink">{t("startTitle")}</h2>
      <p className="mt-1 text-[13px] text-sub">{t("startLead")}</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <div>
          <button type="button" aria-expanded={open === "discover"} onClick={() => setOpen(open === "discover" ? null : "discover")}
            className={optCls} style={optStyle(open === "discover")}>
            <span className="block text-[14px] font-black text-ink">{t("optDiscover")}</span>
            <span className="block mt-0.5 text-[12.5px] leading-snug text-sub">{t("optDiscoverBody")}</span>
          </button>
          {open === "discover" && (
            <div className="mt-2 grid gap-1.5">
              <button type="button" onClick={() => go("course")} className={subBtn}>{t("pathCourse")}<span className="block text-[12px] font-normal text-sub">{t("pathCourseBody")}</span></button>
              <button type="button" onClick={() => go("places")} className={subBtn}>{t("pathPlaces")}<span className="block text-[12px] font-normal text-sub">{t("pathPlacesBody")}</span></button>
            </div>
          )}
        </div>
        <div>
          <button type="button" aria-expanded={open === "import"} onClick={() => setOpen(open === "import" ? null : "import")}
            className={optCls} style={optStyle(open === "import")}>
            <span className="block text-[14px] font-black text-ink">{t("optImport")}</span>
            <span className="block mt-0.5 text-[12.5px] leading-snug text-sub">{t("optImportBody")}</span>
          </button>
          {open === "import" && (
            <div className="mt-2 rounded-xl border border-line bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-sub">
              <p><span className="font-bold text-ink">{t("importCanLabel")}</span> {t("importCan")}</p>
              <p className="mt-1"><span className="font-bold text-ink">{t("importCannotLabel")}</span> {t("importCannot")}</p>
              <p className="mt-1">{t("importNeedLogin")}</p>
              <div className="mt-2.5 grid gap-1.5">
                <button type="button" onClick={() => go("import")} className={subBtn}>{t("pathImport")}</button>
                <button type="button" onClick={() => go("places")} className={subBtn}>{t("pathImportTextAlt")}</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {hasTrip && (
          <button type="button" onClick={() => go("mytrip")} className="gkm-focus text-[13px] font-bold text-ink underline underline-offset-2 min-h-9">{t("pathMyTrip")}</button>
        )}
        <button type="button" onClick={later} className="gkm-focus text-[13px] font-bold text-sub underline underline-offset-2 min-h-9">{t("later")}</button>
      </div>
    </section>
  );
}
