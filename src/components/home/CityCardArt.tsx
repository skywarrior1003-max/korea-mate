// 사진이 없는 도시의 공식 대체 아트.
//
// 회색 박스를 쓰지 않는다. 지금 사진이 있는 도시는 부산뿐이고(KOGL 24종),
// 나머지 네 도시는 권리가 확인된 자산이 하나도 없다. 다른 도시 사진을 돌려쓰거나
// 생성 이미지를 넣으면 실제 그곳의 모습인 것처럼 오해된다 — 그래서 애초에
// 사진처럼 보이지 않는 추상 아트로 그린다.
//
// 도시마다 색·각도가 달라야 카드가 구분되므로 slug 로 결정론적으로 파생한다.
// 랜덤이 아니다 — 새로고침마다 색이 바뀌면 그것도 정보가 아니다.

const HUES: Record<string, { a: number; b: number; tilt: number }> = {
  busan:    { a: 18, b: 72, tilt: 160 },
  seoul:    { a: 76, b: 22, tilt: 200 },
  jeju:     { a: 30, b: 60, tilt: 130 },
  gyeongju: { a: 64, b: 34, tilt: 175 },
  jeonju:   { a: 46, b: 80, tilt: 145 },
};

const FALLBACK = { a: 40, b: 60, tilt: 160 };

export default function CityCardArt({ slug, label }: { slug: string; label: string }) {
  const h = HUES[slug] ?? FALLBACK;

  return (
    <div
      className="absolute inset-0"
      aria-hidden
      style={{
        backgroundColor: "var(--gkm-ink)",
        backgroundImage:
          `radial-gradient(circle at ${h.a}% 68%, rgba(255,74,45,0.30) 0%, transparent 55%),` +
          `radial-gradient(circle at ${h.b}% 24%, rgba(95,91,214,0.28) 0%, transparent 50%),` +
          `linear-gradient(${h.tilt}deg, rgba(255,255,255,0.06) 0%, transparent 60%)`,
      }}
    >
      {/* 도시명 이니셜을 아주 크게 깔아 카드마다 다른 인상을 만든다.
          장식이므로 스크린리더에는 읽히지 않는다 — 이름은 카드 본문에 있다. */}
      <span
        className="absolute -bottom-4 -right-2 font-black leading-none select-none"
        style={{ fontSize: "7rem", color: "rgba(255,255,255,0.05)" }}
      >
        {label.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}
