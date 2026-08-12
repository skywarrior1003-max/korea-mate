"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

// 도시 이름과 한 줄 소개는 고유명사·장소 특징이라 번역하지 않는다.
// 감싸는 UI 문구만 cityLinks 네임스페이스를 쓴다 — 키는 이미 4개 언어에
// 들어 있었는데 배선이 빠져 있었다.
const CITIES = [
  { name: "Seoul",     emoji: "🏙️", desc: "K-pop · Palaces · Street Food",   href: "/explore/seoul" },
  { name: "Busan",     emoji: "🌊", desc: "Beaches · Seafood · Night Views",  href: "/explore/busan" },
  { name: "Jeju",      emoji: "🌋", desc: "Hallasan · Olle Trail · Nature",   href: "/explore/jeju" },
  { name: "Gyeongju",  emoji: "🏛️", desc: "Temples · Royal Tombs · History", href: "/explore/gyeongju" },
];

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
              key={city.name}
              href={city.href}
              className="group flex flex-col gap-3 p-5 rounded-2xl border border-[#E6DFD5] bg-white hover:border-[#D4AF37] hover:shadow-md transition-all"
            >
              <span className="text-3xl">{city.emoji}</span>
              <div>
                <p className="text-base font-black text-[#2C2520] group-hover:text-[#D4AF37] transition-colors">
                  {city.name}
                </p>
                <p className="text-xs text-[#8C6239] mt-0.5 leading-relaxed">{city.desc}</p>
              </div>
              <span className="text-xs font-black text-[#D4AF37] mt-auto">{t("cta")}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
