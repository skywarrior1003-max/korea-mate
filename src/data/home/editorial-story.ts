// Home Page 1 기본 화면의 에디토리얼 콘텐츠.
//
// 이건 브랜드 콘텐츠다. 특정 사용자의 기록이 아니다. 그래서 "당신이 저장한
// 기억" 같은 표현을 쓰지 않는다 — 첫 방문자에게 그렇게 말하면 거짓말이 된다.
// 전하려는 건 하나다: "한국 여행은 이런 이야기로 남을 수 있습니다."
//
// 계절·도시·축제·캠페인마다 통째로 갈아끼울 수 있게 화면이 아니라 여기에 둔다.
// HomeClient 나 컴포넌트 안에 문구를 흩어놓으면 다음 캠페인 때 네 곳을 고쳐야 한다.
//
// 사진은 KOGL Type 1 자산(data/trip-cover/busan-v1-assets.json)만 쓴다.
// 그 자산들은 전부 place_match_status="theme_only" 라 "이 장소의 사진"이라고
// 말하면 안 된다. 그래서 조각마다 theme 만 지정하고, 화면에서는 테마 라벨을
// 붙인다. 본문의 장소 이름은 글이 소개하는 대상이지 사진의 캡션이 아니다.

import type { CoverTheme } from "@/lib/trip-cover/cover-core";

export interface StoryFragment {
  /** KOGL 자산을 고르는 기준. 사진의 성격을 말할 뿐 특정 장소를 지목하지 않는다 */
  theme: CoverTheme;
  /** 여정의 흐름을 보여주는 라벨. 실제 날짜가 아니라 편집 구성이다 */
  dayLabel: string;
  /** 글이 소개하는 실제 부산 장소 */
  place: string;
  /** 감성 문구. 사용자가 쓴 글처럼 보이게 하지 않는다 */
  line: string;
}

export interface EditorialStory {
  /** 이게 편집 콘텐츠임을 밝히는 라벨 */
  kicker: string;
  title: string;
  subtitle: string;
  lead: string;
  fragments: StoryFragment[];
  /** 사진 출처를 화면에 남기기 위한 문구 */
  photoNote: string;
  closingTitle: string;
  closingBody: string;
}

type Locale = "en" | "ko" | "ja" | "zh";

const EN: EditorialStory = {
  kicker: "GOKOREAMATE EDITORIAL",
  title: "Busan, Golden Hour",
  subtitle: "A journey along the coast",
  lead: "Mountains meet the sea, fish markets open before sunrise, and hillside alleys hold their colors until dusk. This is what a few days in Busan can look like.",
  fragments: [
    {
      theme: "beach_ocean",
      dayLabel: "First light",
      place: "Haeundae Beach",
      line: "The tide pulls back and the city wakes slowly. Nothing to plan yet — just the sound of water.",
    },
    {
      theme: "food_market",
      dayLabel: "Late morning",
      place: "Jagalchi Fish Market",
      line: "Vendors call out over the ice. You point at something you cannot name, and it arrives steaming.",
    },
    {
      theme: "culture_village",
      dayLabel: "Afternoon",
      place: "Gamcheon Culture Village",
      line: "Every staircase turns into a different color. You lose the map and keep walking anyway.",
    },
  ],
  photoNote: "Photos: Korea Tourism Organization (KOGL Type 1) — theme imagery",
  closingTitle: "Your trip can become a story",
  closingBody: "Tell us your dates and travel style. AI builds a day-by-day plan in about 30 seconds — free, no sign-up.",
};

const KO: EditorialStory = {
  kicker: "고코리아메이트 에디토리얼",
  title: "부산, 황금빛 시간",
  subtitle: "해안을 따라 걷는 여정",
  lead: "산이 바다와 만나고, 어시장은 해가 뜨기 전에 문을 열고, 언덕 골목은 해질 때까지 색을 품고 있습니다. 부산에서의 며칠은 이런 모습일 수 있습니다.",
  fragments: [
    {
      theme: "beach_ocean",
      dayLabel: "첫 빛",
      place: "해운대 해수욕장",
      line: "물이 빠지고 도시가 천천히 깨어납니다. 아직 정할 것은 없습니다. 파도 소리뿐입니다.",
    },
    {
      theme: "food_market",
      dayLabel: "늦은 아침",
      place: "자갈치 시장",
      line: "얼음 위로 상인들의 목소리가 오갑니다. 이름 모를 것을 가리키면 김이 오른 채로 나옵니다.",
    },
    {
      theme: "culture_village",
      dayLabel: "오후",
      place: "감천문화마을",
      line: "계단마다 색이 바뀝니다. 지도를 놓쳐도 그대로 걷게 됩니다.",
    },
  ],
  photoNote: "사진: 한국관광공사 (KOGL 제1유형) — 테마 이미지",
  closingTitle: "당신의 여행도 이야기가 됩니다",
  closingBody: "날짜와 여행 스타일만 알려주세요. AI가 30초 만에 하루 단위 일정을 만듭니다. 무료, 가입 없이.",
};

const JA: EditorialStory = {
  kicker: "GOKOREAMATE エディトリアル",
  title: "釜山、黄金の時間",
  subtitle: "海岸線をたどる旅",
  lead: "山が海と出会い、魚市場は日の出前に開き、丘の路地は夕暮れまで色を抱いています。釜山での数日は、こんな姿になるかもしれません。",
  fragments: [
    {
      theme: "beach_ocean",
      dayLabel: "夜明け",
      place: "海雲台ビーチ",
      line: "潮が引き、街がゆっくり目を覚まします。まだ決めることはありません。波の音だけです。",
    },
    {
      theme: "food_market",
      dayLabel: "遅い朝",
      place: "チャガルチ市場",
      line: "氷の上で売り手の声が交わります。名前の分からないものを指させば、湯気とともに出てきます。",
    },
    {
      theme: "culture_village",
      dayLabel: "午後",
      place: "甘川文化村",
      line: "階段ごとに色が変わります。地図を見失っても、そのまま歩き続けます。",
    },
  ],
  photoNote: "写真：韓国観光公社（KOGL 第1類型）— テーマ画像",
  closingTitle: "あなたの旅も物語になります",
  closingBody: "日程と旅のスタイルを教えてください。AI が約30秒で日別プランを作ります。無料・登録不要。",
};

const ZH: EditorialStory = {
  kicker: "GOKOREAMATE 编辑专题",
  title: "釜山，黄金时刻",
  subtitle: "沿着海岸线的旅程",
  lead: "山与海相遇，鱼市在日出前开张，山坡小巷把色彩留到黄昏。在釜山的几天，大概就是这个样子。",
  fragments: [
    {
      theme: "beach_ocean",
      dayLabel: "第一缕光",
      place: "海云台海滩",
      line: "潮水退去，城市慢慢醒来。此刻还不需要计划，只有海浪声。",
    },
    {
      theme: "food_market",
      dayLabel: "上午稍晚",
      place: "札嘎其鱼市场",
      line: "冰面上传来摊主的吆喝。你指了指叫不出名字的东西，它冒着热气端上来。",
    },
    {
      theme: "culture_village",
      dayLabel: "午后",
      place: "甘川文化村",
      line: "每一段台阶都换一种颜色。地图丢了，你还是继续走。",
    },
  ],
  photoNote: "照片：韩国观光公社（KOGL 第1类型）— 主题图片",
  closingTitle: "你的旅行也会成为故事",
  closingBody: "告诉我们日期和旅行风格。AI 约 30 秒生成逐日行程，免费、无需注册。",
};

export const EDITORIAL_STORY: Record<Locale, EditorialStory> = {
  en: EN, ko: KO, ja: JA, zh: ZH,
};

/** 지원하지 않는 로케일이 와도 화면이 비지 않게 한다 */
export function editorialStoryFor(locale: string): EditorialStory {
  return EDITORIAL_STORY[locale as Locale] ?? EN;
}
