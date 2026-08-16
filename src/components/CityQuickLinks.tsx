"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CITY_CONFIGS, CITY_SLUGS } from "@/data/cities";

// 도시 이름은 고유명사라 그대로 둔다. 한 줄 소개는 "이 도시에 뭐가 있는지"를
// 설명하는 일반 UI 문구다 — 편집 의도로 영어를 고정한 문구(AI PRECISION ·
// BUSAN: GOLDEN HOUR 등) 목록에 들어 있지 않으므로 번역한다.
//
// 한라산·올레길처럼 한국 지명은 각 언어에서 실제로 쓰는 표기를 따른다.
// 로마자 그대로 두는 것보다 그쪽이 같은 장소를 더 잘 가리킨다.
// 도시 목록은 `CITY_CONFIGS` 하나에서 온다. 화면마다 배열을 들고 있으면 도시를
// 하나 더할 때 여러 곳을 고쳐야 하고, 실제로 여기에는 전주가 빠져 있었다.
const CITIES = CITY_SLUGS.map(slug => CITY_CONFIGS[slug]!);

export default function CityQuickLinks() {
  const t = useTranslations("cityLinks");

  return (
    <section className="py-14 px-4" style={{ backgroundColor: "#FAF7F2" }}>
      <div className="max-w-5xl mx-auto">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#8C6239] text-center mb-2">
          {t("label")}
        </p>
        <h2 className="text-2xl font-black text-[#2C2520] text-center mb-8">
          {t("subtitle")}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CITIES.map((city) => (
            <Link
              key={city.slug}
              href={`/explore/${city.slug}`}
              className="group flex flex-col gap-3 p-5 rounded-2xl border border-[#E6DFD5] bg-white hover:border-[#D4AF37] hover:shadow-md transition-all"
            >
              <span className="text-3xl">{city.emoji}</span>
              <div>
                <p className="text-base font-black text-[#2C2520] group-hover:text-[#D4AF37] transition-colors">
                  {city.name}
                </p>
                <p className="text-xs text-[#8C6239] mt-0.5 leading-relaxed">{t(`desc${city.name}`)}</p>
              </div>
              <span className="text-xs font-black text-[#D4AF37] mt-auto">{t("cta")}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
