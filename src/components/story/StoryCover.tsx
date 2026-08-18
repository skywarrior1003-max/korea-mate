"use client";

// Immersive Cover — 최종 screen.png 의 첫 화면.
//
// 사진이 화면 전체를 차지하고, 아래에서 검게 깔리는 gradient 위에 날짜·도시,
// 제목, 작성자가 얹힌다. 맨 아래 가운데에 "Scroll to explore" 와 아래 화살표가
// 흔들린다. Copy·Save·일정 목록·지도는 여기 두지 않는다 — 첫 감정은
// "이 사람의 여행을 더 보고 싶다" 하나여야 한다.

import type { StoryCoverData } from "./story-types";
import {
  MARGIN_MOBILE, STACK_LG, STACK_MD, BASE,
  DISPLAY_MEMORY, TITLE_MD, LABEL_CAPS, LABEL_CAPS_WIDE,
} from "./story-tokens";

interface Props {
  data: StoryCoverData;
  /** 아래로 넘어갈 자리. Journal 섹션의 id 를 준다. */
  scrollHint?: string;
}

export default function StoryCover({ data, scrollHint }: Props) {
  return (
    <section
      className="relative h-screen w-full flex flex-col justify-end overflow-hidden"
      style={{ padding: MARGIN_MOBILE }}
    >
      {/* 사진. 배경으로 깔아 글자가 위에 오게 한다. */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center w-full h-full"
        style={{ backgroundImage: `url('${data.imageUrl}')` }}
        role="img"
        aria-label={data.title}
      />
      {/* 아래로 갈수록 검어진다 — 글자가 사진 위에서 읽히게 하는 유일한 장치다.
          Tailwind 유틸 대신 값을 직접 적는다. 이 저장소의 Tailwind 는 gradient 를
          oklab 으로 섞어서, 같은 정지색을 줘도 시안(sRGB)과 중간 톤이 달라진다.
          390px reference 실측값 그대로다. */}
      <div
        className="absolute inset-0 z-0"
        style={{ backgroundImage: "linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0))" }}
      />

      <div className="relative z-10 text-white" style={{ paddingBottom: STACK_LG }}>
        <p
          className="uppercase text-white/80"
          style={{ ...LABEL_CAPS_WIDE, marginBottom: BASE }}
        >
          {data.eyebrow}
        </p>
        <h1
          className="text-white drop-shadow-lg"
          style={{ ...DISPLAY_MEMORY, marginBottom: STACK_MD }}
        >
          {data.title}
        </h1>
        {data.authorName && (
          <div className="flex items-center gap-3">
            {data.authorAvatarUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                alt=""
                src={data.authorAvatarUrl}
                className="w-10 h-10 rounded-full object-cover border-2 border-white/50"
              />
            )}
            <span style={TITLE_MD}>{data.authorName}</span>
          </div>
        )}
      </div>

      {scrollHint && (
        <a
          href={`#${scrollHint}`}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center opacity-70 gkm-focus"
        >
          {/* prefers-reduced-motion 에서는 흔들지 않는다 */}
          <span className="motion-safe:animate-bounce flex flex-col items-center">
            <span className="text-white mb-1" style={LABEL_CAPS}>Scroll to explore</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 className="text-white">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </a>
      )}
    </section>
  );
}
