// Page 1 기본 — 브랜드 에디토리얼.
//
// 첫 방문자가 처음 보는 화면이다. 여기에 개인 데이터는 한 줄도 없다.
// 문구는 전부 editorial-story.ts 에서 오고, 이 파일은 배치만 한다.
//
// 사진은 KOGL Type 1 자산이며 place_match_status="theme_only" 다. 그래서
// 이미지에는 테마 라벨만 붙이고, 장소 이름은 글 쪽에 둔다. 사진이 그 장소를
// 찍은 것이라고 말하지 않기 위해서다.

"use client";

import { useLocale, useTranslations } from "next-intl";
import { editorialStoryFor } from "@/data/home/editorial-story";
import { assetsByTheme } from "@/lib/trip-cover/assets.data";
import { coverProxyPath, THEME_LABEL } from "@/lib/trip-cover/cover-core";

export default function InspiredStorytellingHome({ onPlanTrip }: { onPlanTrip: () => void }) {
  const t = useTranslations("home");
  const story = editorialStoryFor(useLocale());

  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--gkm-ink)" }}>
      {/* ── Story Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-5 pt-12 pb-10 sm:pt-16">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 22% 62%, rgba(255,74,45,0.20) 0%, transparent 52%)," +
              "radial-gradient(circle at 78% 20%, rgba(95,91,214,0.18) 0%, transparent 48%)",
          }}
        />
        <div className="relative max-w-2xl mx-auto">
          <p className="text-[10px] font-black tracking-[0.2em] text-white/40 mb-4">
            {story.kicker}
          </p>
          <h1
            className="text-4xl sm:text-6xl font-black text-white leading-[1.05] mb-3"
            style={{ textWrap: "balance" }}
          >
            {story.title}
          </h1>
          <p className="text-base sm:text-lg text-white/55 font-medium mb-5">{story.subtitle}</p>
          <p className="text-sm sm:text-base text-white/45 leading-relaxed">{story.lead}</p>
        </div>
      </section>

      {/* ── 여행 단편 ──────────────────────────────────────────────────── */}
      <section className="px-5 pb-8" aria-label={t("storyFragments")}>
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          {story.fragments.map((f, i) => {
            // 테마별 후보 중 첫 자산. 후보가 없으면 사진 없이 글만 나간다.
            const asset = assetsByTheme(f.theme)[0];
            return (
              <article key={`${f.theme}-${i}`} className="flex flex-col gap-3">
                <div
                  className="relative w-full overflow-hidden rounded-card"
                  style={{ aspectRatio: "3 / 2", backgroundColor: "rgba(255,255,255,0.05)" }}
                >
                  {asset ? (
                    // 고정 비율 컨테이너 안에서만 늘어나므로 레이아웃이 흔들리지 않는다.
                    // next/image 를 쓰지 않는 이유: 정적 export + 같은 출처 프록시라
                    // 최적화기가 끼어들 여지가 없고, 프록시 경로를 그대로 써야 한다.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverProxyPath(asset.asset_id)}
                      alt={`${THEME_LABEL[f.theme]} — Busan`}
                      loading="lazy"
                      decoding="async"
                      width={asset.width}
                      height={asset.height}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 35% 60%, rgba(255,74,45,0.25) 0%, transparent 55%)",
                      }}
                    />
                  )}
                  <span className="absolute left-3 top-3 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider text-white"
                        style={{ backgroundColor: "rgba(25,28,33,0.65)" }}>
                    {THEME_LABEL[f.theme].toUpperCase()}
                  </span>
                </div>

                <div>
                  <p className="text-[11px] font-black tracking-widest mb-1" style={{ color: "var(--gkm-action-primary)" }}>
                    {f.dayLabel.toUpperCase()} · {f.place}
                  </p>
                  <p className="text-sm sm:text-base text-white/70 leading-relaxed">{f.line}</p>
                </div>
              </article>
            );
          })}
          <p className="text-[10px] text-white/25 leading-relaxed">{story.photoNote}</p>
        </div>
      </section>

      {/* ── Planner CTA ────────────────────────────────────────────────── */}
      <section className="px-5 pb-12">
        <div className="max-w-2xl mx-auto rounded-frame p-6 sm:p-8"
             style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <h2 className="text-xl sm:text-2xl font-black text-white mb-2">{story.closingTitle}</h2>
          <p className="text-sm text-white/50 leading-relaxed mb-6">{story.closingBody}</p>
          <button
            type="button"
            onClick={onPlanTrip}
            className="gkm-focus w-full sm:w-auto inline-flex items-center justify-center min-h-12 px-8 rounded-control text-base font-black text-white shadow-cta transition-colors hover:bg-action-hover"
            style={{ backgroundColor: "var(--gkm-action-primary)" }}
          >
            ✨ {t("planTrip")}
          </button>
        </div>
      </section>
    </div>
  );
}
