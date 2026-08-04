// 사진이 없는 도시의 Hero 아트.
//
// 경주·전주는 승인 시안에도 저장소에도 도시 사진이 없다. 다른 도시 사진을
// 돌려쓰면 그 도시가 아닌 곳을 그 도시라고 보여주게 되므로 쓰지 않는다.
// 사진인 척도 하지 않는다 — 추상 형태만 쓴다.
//
// 도시마다 다른 인상을 주되 새로고침마다 바뀌면 그것도 정보가 아니라서
// slug 로 결정론적으로 파생한다.

const CITY_ART: Record<string, { a: number; b: number; tilt: number; shape: "arc" | "peak" | "grid" }> = {
  gyeongju: { a: 24, b: 74, tilt: 168, shape: "arc"  },  // 능선처럼 낮고 둥근 형태
  jeonju:   { a: 70, b: 26, tilt: 142, shape: "grid" },  // 한옥 지붕처럼 겹치는 선
  busan:    { a: 18, b: 72, tilt: 160, shape: "arc"  },
  seoul:    { a: 76, b: 22, tilt: 200, shape: "peak" },
  jeju:     { a: 30, b: 60, tilt: 130, shape: "peak" },
};

const FALLBACK = { a: 40, b: 60, tilt: 160, shape: "arc" as const };

export default function CityHeroArt({ slug }: { slug: string }) {
  const c = CITY_ART[slug] ?? FALLBACK;

  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundColor: "#131b2e",
        backgroundImage:
          `radial-gradient(circle at ${c.a}% 70%, rgba(0,65,200,0.42) 0%, transparent 58%),` +
          `radial-gradient(circle at ${c.b}% 22%, rgba(38,254,220,0.20) 0%, transparent 52%),` +
          `linear-gradient(${c.tilt}deg, rgba(255,255,255,0.07) 0%, transparent 62%)`,
      }}
    >
      <svg
        className="absolute inset-x-0 bottom-0 w-full"
        viewBox="0 0 390 220"
        preserveAspectRatio="none"
        style={{ height: "58%" }}
      >
        {c.shape === "arc" && (
          <>
            <path d="M0 190 Q 98 96 196 152 T 390 118 L390 220 L0 220Z" fill="rgba(255,255,255,0.055)" />
            <path d="M0 214 Q 120 150 230 186 T 390 168 L390 220 L0 220Z" fill="rgba(255,255,255,0.045)" />
          </>
        )}
        {c.shape === "grid" && (
          <>
            {[0, 1, 2, 3].map(i => (
              <path
                key={i}
                d={`M${-30 + i * 108} 220 L${44 + i * 108} 128 L${118 + i * 108} 220Z`}
                fill="rgba(255,255,255,0.05)"
              />
            ))}
            <rect x="0" y="205" width="390" height="15" fill="rgba(255,255,255,0.05)" />
          </>
        )}
        {c.shape === "peak" && (
          <>
            <path d="M0 220 L110 92 L214 220Z" fill="rgba(255,255,255,0.055)" />
            <path d="M150 220 L262 128 L390 220Z" fill="rgba(255,255,255,0.045)" />
          </>
        )}
      </svg>
    </div>
  );
}
