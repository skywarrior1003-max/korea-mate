// GoKoreaMate Blog — 공식 기반 여행 이해 콘텐츠 (BLOG-OFFICIAL-TRAVEL-CONTENT-V1)
//
// Owner 확정 계약
//  · Blog 는 여행을 "이해하고 선택하게" 만드는 콘텐츠다. 정답 코스를 강요하지 않는다.
//  · 공식/공공 관광 원천(Visit 지역 · KTO)을 발견 가능하게 정리하고 출처를 밝힌다.
//  · 요금표·운행정보·운영시간 같은 실용 정본은 싣지 않는다 — Travel Essentials 가 정본이고
//    Blog 는 맥락 설명과 링크만 담당한다. Events 의 날짜/상태 DB 도 복제하지 않는다.
//  · 4 locale(ko/en/ja/zh) 전문 동봉 — 페이지뷰마다 번역기를 부르지 않는다.
//  · 장소 연결은 실제 카탈로그 canonical id 로만 한다. 없는 관계를 만들지 않는다.
//
// 콘텐츠 사실 근거
//  · 장소명·id 는 Production city_spots 실조회로 확인한 published 장소다.
//  · 외부 링크는 전부 공식 관광기관 도메인이며 게시 시점에 HTTP 200 을 확인했다.
//  · 계절 서술은 월 단위 일반론까지만 — 특정 요금·일정·행사 날짜를 적지 않는다.

export type BlogLocale = "ko" | "en" | "ja" | "zh";

export interface L10n { ko: string; en: string; ja: string; zh: string }

export interface BlogLink {
  label: L10n;
  /** 문자열이면 전 locale 공통, L10n 이면 locale 별 공식 링크(공식 원천이 언어판을 제공할 때) */
  href: string | L10n;
  /** 자료 자체가 한 언어뿐일 때 라벨 옆에 붙는 표기 (예: "KO") */
  langNote?: string;
}

export interface BlogPlaceLink { id: number; name: L10n }

export interface BlogSection {
  heading?: L10n;
  /** 문단은 \n\n 으로 구분된 평문. 마크다운 아님 — 렌더러가 <p> 로 나눈다. */
  body: L10n;
  places?: BlogPlaceLink[];
  links?: BlogLink[];
}

export interface BlogSource { name: string; url: string }

export interface BlogPost {
  slug: string;
  /** 실제 게시일 */
  date: string;
  category: "seasons" | "cities" | "official-resources";
  title: L10n;
  summary: L10n;
  /** 사이트 내 정적 자산만 쓴다 */
  heroImage: string;
  sections: BlogSection[];
  sources: BlogSource[];
  /** 제휴 카드 id — 승인된 blog 표면에서만, 남발 금지(글당 0~2) */
  affiliateCards?: { id: "esimKlook" | "transferTransport" | "transferEsim" | "ktxSeoulBusan" | "carJeju"; emoji: string; product: string; variant?: string }[];
}

const VISIT_PORTALS = {
  busan: {
    ko: "https://www.visitbusan.net/index.do?menuCd=DOM_000000201001000000&langCd=ko",
    en: "https://www.visitbusan.net/index.do?menuCd=DOM_000000201001000000&langCd=en",
    ja: "https://www.visitbusan.net/index.do?menuCd=DOM_000000201001000000&langCd=ja",
    zh: "https://www.visitbusan.net/index.do?menuCd=DOM_000000201001000000&langCd=zh",
  },
  seoul: {
    ko: "https://korean.visitseoul.net/index",
    en: "https://english.visitseoul.net/index",
    ja: "https://japanese.visitseoul.net/index",
    zh: "https://chinese.visitseoul.net/index",
  },
  jeju: {
    ko: "https://www.visitjeju.net/kr",
    en: "https://www.visitjeju.net/en",
    ja: "https://www.visitjeju.net/ja",
    zh: "https://www.visitjeju.net/zh",
  },
  gyeongju: "https://www.gyeongju.go.kr/tour/index.do",
  jeonju: "https://tour.jeonju.go.kr/index.jeonju",
  kto: {
    ko: "https://english.visitkorea.or.kr",
    en: "https://english.visitkorea.or.kr",
    ja: "https://japanese.visitkorea.or.kr",
    zh: "https://chinese.visitkorea.or.kr",
  },
} as const;

export const BLOG_POSTS: BlogPost[] = [
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "understanding-korea-seasons",
    date: "2026-09-07",
    category: "seasons",
    heroImage: "/og/jeju/opengraph-image.png",
    title: {
      ko: "계절로 읽는 대한민국 여행",
      en: "Reading Korea by Its Seasons",
      ja: "季節で読む韓国旅行",
      zh: "按季节读懂韩国旅行",
    },
    summary: {
      ko: "한국은 사계절이 뚜렷한 나라입니다. 언제 오느냐에 따라 같은 도시가 전혀 다른 여행이 됩니다 — 계절별로 무엇이 달라지는지 정리했습니다.",
      en: "Korea has four distinct seasons, and the same city becomes a completely different trip depending on when you arrive. Here is what changes with each season.",
      ja: "韓国は四季がはっきりした国です。いつ訪れるかによって、同じ都市がまったく違う旅になります。季節ごとに何が変わるのかをまとめました。",
      zh: "韩国四季分明，来的时间不同，同一座城市会变成完全不同的旅行。这里整理了每个季节的变化。",
    },
    sections: [
      {
        body: {
          ko: "여행 날짜를 먼저 정했다면, 그 계절이 어떤 경험을 열어 주는지 아는 것이 일정 짜기의 절반입니다. 한국의 공식 관광기관들도 계절을 중심으로 콘텐츠를 바꿉니다 — 이 글은 계절별 큰 그림만 담고, 구체적인 행사·요금·운영시간은 각 도시의 공식 페이지와 Travel Essentials 화면에서 확인하는 것을 권합니다.",
          en: "If your dates are already set, knowing what each season opens up is half of planning. Korea's official tourism bodies rotate their own content by season too. This article stays with the big picture — for specific events, fees and operating hours, check each city's official pages and the Travel Essentials screens.",
          ja: "旅行の日程が決まっているなら、その季節がどんな体験を開いてくれるかを知ることが計画の半分です。韓国の公式観光機関も季節ごとにコンテンツを変えています。この記事は大きな流れだけを扱い、具体的なイベント・料金・営業時間は各都市の公式ページと Travel Essentials 画面での確認をおすすめします。",
          zh: "如果旅行日期已定，了解每个季节能带来什么体验，就是行程规划的一半。韩国的官方旅游机构也会按季节更新内容。本文只讲大方向——具体活动、费用和营业时间，请以各城市官方页面和 Travel Essentials 页面为准。",
        },
      },
      {
        heading: { ko: "봄 (3–5월) — 꽃과 산책의 계절", en: "Spring (Mar–May) — blossoms and walks", ja: "春（3〜5月）— 花と散歩の季節", zh: "春（3–5月）— 赏花与漫步" },
        body: {
          ko: "벚꽃과 봄꽃이 남쪽에서 북쪽으로 올라오는 계절입니다. 경주의 고분과 한옥 거리, 전주 한옥마을처럼 걷는 것이 곧 경험인 도시들이 가장 빛납니다. 낮과 아침의 기온 차가 크니 겹쳐 입을 옷이 유용합니다.",
          en: "Cherry and spring blossoms move up the peninsula from south to north. Cities where walking is the experience — Gyeongju's royal tombs and hanok streets, Jeonju Hanok Village — are at their best. Mornings stay cool, so layers help.",
          ja: "桜と春の花が南から北へ上がっていく季節です。歩くこと自体が体験になる都市 — 慶州の古墳や韓屋の街並み、全州韓屋村 — が最も輝きます。朝晩は冷えるので重ね着が便利です。",
          zh: "樱花和春花自南向北依次开放。以漫步为主的城市——庆州的古坟和韩屋街道、全州韩屋村——此时最美。早晚温差大，建议多层穿搭。",
        },
        places: [
          { id: 436, name: { ko: "대릉원", en: "Daereungwon Tomb Complex", ja: "大陵苑", zh: "大陵苑" } },
          { id: 749, name: { ko: "전주한옥마을", en: "Jeonju Hanok Village", ja: "全州韓屋村", zh: "全州韩屋村" } },
        ],
      },
      {
        heading: { ko: "여름 (6–8월) — 바다와 섬, 그리고 밤", en: "Summer (Jun–Aug) — sea, islands and nights", ja: "夏（6〜8月）— 海と島、そして夜", zh: "夏（6–8月）— 大海、海岛与夜晚" },
        body: {
          ko: "부산과 제주가 주인공이 되는 계절입니다. 해수욕장이 문을 열고, 더위를 피해 저녁과 밤의 야시장·해변 산책으로 하루의 중심이 옮겨 갑니다. 6월 말–7월에는 장마가 있으니 실내 대안을 하루쯤 섞어 두면 일정이 무너지지 않습니다.",
          en: "This is when Busan and Jeju take the lead. Beaches open, and the day's center of gravity shifts to evenings — night markets and shoreline walks after the heat. Late June to July brings the monsoon, so keeping one indoor alternative per day protects your plan.",
          ja: "釜山と済州が主役になる季節です。海水浴場が開き、暑さを避けて夜市や海辺の散歩など、一日の中心が夕方以降に移ります。6月末〜7月は梅雨があるので、屋内の代案を一日分ほど混ぜておくと日程が崩れません。",
          zh: "这是釜山和济州的主场。海水浴场开放，一天的重心转向傍晚——夜市和海边散步。6月底至7月有梅雨，每天留一个室内备选，行程就不会被打乱。",
        },
        places: [
          { id: 1, name: { ko: "해운대해수욕장", en: "Haeundae Beach", ja: "海雲台ビーチ", zh: "海云台海水浴场" } },
          { id: 2906, name: { ko: "협재해수욕장", en: "Hyeopjae Beach", ja: "挟才ビーチ", zh: "挟才海水浴场" } },
        ],
      },
      {
        heading: { ko: "가을 (9–11월) — 단풍과 축제의 절정", en: "Autumn (Sep–Nov) — foliage at its peak", ja: "秋（9〜11月）— 紅葉と祭りの最盛期", zh: "秋（9–11月）— 红叶与庆典的高峰" },
        body: {
          ko: "많은 여행자가 한국 여행의 최적기로 꼽는 계절입니다. 맑고 건조한 날이 이어지고, 산과 사찰이 단풍으로 물듭니다. 불국사 같은 산사(山寺)와 도시 근교의 산책로가 이 계절의 답입니다. 지역 축제가 가장 몰리는 시기이기도 하니, 각 도시 공식 행사 페이지를 출발 전에 한 번 확인해 보세요.",
          en: "Many travelers call this Korea's best season. Clear, dry days line up and the mountains and temples turn to foliage. Mountain temples like Bulguksa and near-city trails are the season's answer. It is also peak festival season — worth one look at each city's official event pages before you fly.",
          ja: "多くの旅行者が韓国旅行のベストシーズンに挙げる季節です。晴れて乾いた日が続き、山と寺院が紅葉に染まります。仏国寺のような山寺や、都市近郊の散策路がこの季節の答えです。地域の祭りが最も集中する時期でもあるので、出発前に各都市の公式イベントページを一度確認してみてください。",
          zh: "许多旅行者把秋天称为韩国旅行的最佳季节。晴朗干爽的日子接连不断，山峦与寺院被红叶染红。佛国寺这样的山寺和城市近郊的步道是这个季节的答案。这也是地方庆典最集中的时期，出发前不妨看一眼各城市的官方活动页面。",
        },
        places: [
          { id: 528, name: { ko: "불국사", en: "Bulguksa Temple", ja: "仏国寺", zh: "佛国寺" } },
        ],
      },
      {
        heading: { ko: "겨울 (12–2월) — 설경과 온기", en: "Winter (Dec–Feb) — snowscapes and warmth", ja: "冬（12〜2月）— 雪景色とぬくもり", zh: "冬（12–2月）— 雪景与暖意" },
        body: {
          ko: "춥지만 그만큼 선명한 계절입니다. 한라산의 설경 트레킹, 김이 오르는 시장 골목, 온돌의 온기가 겨울 여행의 언어입니다. 해가 짧으니 하루의 핵심 일정을 오후 이른 시간까지 배치하는 편이 여유롭습니다.",
          en: "Cold, but vivid. Snow trekking on Hallasan, steam rising over market alleys, the warmth of ondol floors — that is winter's vocabulary here. Days are short, so placing the day's key stops before mid-afternoon keeps things unhurried.",
          ja: "寒いぶん、輪郭のはっきりした季節です。漢拏山の雪景色トレッキング、湯気の立つ市場の路地、オンドルのぬくもり — それが冬の言葉です。日が短いので、一日の中心となる予定を午後早めまでに置くと余裕が生まれます。",
          zh: "寒冷，却格外清澈。汉拿山的雪景徒步、市场小巷升腾的热气、暖炕的温度——这就是冬天的语言。白天很短，把当天的重点行程安排在下午早些时候会更从容。",
        },
        places: [
          { id: 1871, name: { ko: "한라산 영실탐방로", en: "Hallasan Yeongsil Trail", ja: "漢拏山霊室コース", zh: "汉拿山灵室路线" } },
          { id: 790, name: { ko: "전주 남부시장", en: "Jeonju Nambu Market", ja: "全州南部市場", zh: "全州南部市场" } },
        ],
      },
      {
        heading: { ko: "어느 계절이든", en: "Whatever the season", ja: "どの季節でも", zh: "无论哪个季节" },
        body: {
          ko: "계절이 정해 주는 것은 분위기이지 정답이 아닙니다. 도시별 공식 추천 코스와 장소를 둘러보고, 마음에 드는 곳을 저장해 두면 일정을 만들 때 그대로 이어집니다.",
          en: "A season sets the mood, not the answer. Browse each city's official courses and places, save what speaks to you, and it carries straight into your trip plan.",
          ja: "季節が決めてくれるのは雰囲気であって、正解ではありません。各都市の公式おすすめコースと場所を眺めて、気に入った場所を保存しておけば、そのまま旅程づくりにつながります。",
          zh: "季节决定的是氛围，而不是标准答案。看看各城市的官方推荐路线和地点，把喜欢的收藏起来，做行程时就能直接用上。",
        },
        links: [
          { label: { ko: "도시 허브에서 계절 코스 보기", en: "Browse courses in the city hubs", ja: "都市ハブでコースを見る", zh: "在城市主页浏览路线" }, href: "/city/busan/" },
        ],
      },
    ],
    sources: [
      { name: "Korea Tourism Organization — VisitKorea", url: "https://english.visitkorea.or.kr" },
    ],
    affiliateCards: [
      { id: "esimKlook", emoji: "📶", product: "esim" },
      { id: "transferTransport", emoji: "🚐", product: "airportTransfer" },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "five-cities-five-rhythms",
    date: "2026-09-07",
    category: "cities",
    heroImage: "/og/busan/opengraph-image.png",
    title: {
      ko: "다섯 도시, 다섯 개의 리듬",
      en: "Five Cities, Five Rhythms",
      ja: "五つの都市、五つのリズム",
      zh: "五座城市，五种节奏",
    },
    summary: {
      ko: "서울·부산·제주·경주·전주는 같은 나라 안의 전혀 다른 다섯 여행입니다. 어떤 도시가 지금의 당신과 맞는지 — 각 도시의 성격을 공식 관광 정보와 실제 장소로 읽어 봅니다.",
      en: "Seoul, Busan, Jeju, Gyeongju and Jeonju are five completely different trips inside one country. Which city fits you right now? A read of each city's character through official tourism sources and real places.",
      ja: "ソウル・釜山・済州・慶州・全州は、同じ国の中のまったく違う五つの旅です。いまのあなたに合う都市はどれか — 各都市の性格を公式観光情報と実在の場所で読み解きます。",
      zh: "首尔、釜山、济州、庆州、全州，是同一个国家里五种完全不同的旅行。哪座城市适合现在的你？我们用官方旅游信息和真实地点来读懂每座城市的性格。",
    },
    sections: [
      {
        heading: { ko: "서울 — 밀도의 도시", en: "Seoul — the city of density", ja: "ソウル — 密度の都市", zh: "首尔 — 高密度之城" },
        body: {
          ko: "골목 하나를 돌 때마다 장면이 바뀌는 도시입니다. 고궁과 미술관, 시장과 신상 카페가 지하철 몇 정거장 안에 겹쳐 있습니다. 서울관광재단이 산과 예술 같은 테마별 공식 가이드를 여러 언어로 내는 이유도 — 한 가지 얼굴로는 설명이 안 되는 도시이기 때문입니다.",
          en: "A city where the scene changes every time you turn a corner. Palaces and art museums, markets and brand-new cafes overlap within a few subway stops. There is a reason the Seoul Tourism Organization publishes official themed guides — hiking, art — in multiple languages: no single face explains this city.",
          ja: "路地を一つ曲がるたびに場面が変わる都市です。古宮と美術館、市場と新しいカフェが、地下鉄数駅の中に重なっています。ソウル観光財団が登山やアートなどテーマ別の公式ガイドを多言語で出しているのも、一つの顔では説明できない都市だからです。",
          zh: "每拐过一条小巷，眼前的场景就会改变。古宫与美术馆、市场与新潮咖啡馆，在几个地铁站的范围内层层叠叠。首尔观光财团之所以用多种语言发行登山、艺术等主题官方指南，正是因为这座城市无法用一张面孔来概括。",
        },
        links: [
          { label: { ko: "서울 장소 둘러보기", en: "Explore Seoul places", ja: "ソウルの場所を見る", zh: "浏览首尔地点" }, href: "/city/seoul/" },
        ],
      },
      {
        heading: { ko: "부산 — 바다가 정하는 하루", en: "Busan — days set by the sea", ja: "釜山 — 海が決める一日", zh: "釜山 — 由大海决定的一天" },
        body: {
          ko: "아침 해변 산책으로 시작해 절벽 위 사찰을 지나 밤바다 앞에서 끝나는 하루 — 부산의 일정은 해안선을 따라 흐릅니다. 언덕 위 골목 마을과 오래된 시장이 바다 사이사이에 끼어들며 리듬을 바꿉니다.",
          en: "A day that starts with a morning beach walk, passes a temple on the cliffs, and ends facing the night sea — Busan itineraries flow along the coastline. Hillside alley villages and old markets slip in between stretches of water and change the rhythm.",
          ja: "朝のビーチ散歩で始まり、崖の上の寺院を経て、夜の海の前で終わる一日 — 釜山の旅程は海岸線に沿って流れます。丘の上の路地の村と古い市場が海の合間に入り込み、リズムを変えてくれます。",
          zh: "以清晨的海边散步开始，途经悬崖上的寺院，在夜晚的大海前结束——釜山的行程沿着海岸线流动。山坡上的巷弄村落和老市场穿插在海景之间，不断改变着节奏。",
        },
        places: [
          { id: 1, name: { ko: "해운대해수욕장", en: "Haeundae Beach", ja: "海雲台ビーチ", zh: "海云台海水浴场" } },
          { id: 25, name: { ko: "해동용궁사", en: "Haedong Yonggungsa Temple", ja: "海東龍宮寺", zh: "海东龙宫寺" } },
          { id: 2, name: { ko: "감천문화마을", en: "Gamcheon Culture Village", ja: "甘川文化村", zh: "甘川文化村" } },
        ],
      },
      {
        heading: { ko: "제주 — 자연이 주인공인 섬", en: "Jeju — an island where nature leads", ja: "済州 — 自然が主役の島", zh: "济州 — 自然当主角的海岛" },
        body: {
          ko: "화산이 만든 섬 하나가 통째로 여행지입니다. 한라산 탐방로, 에메랄드빛 해변, 폭포와 오름 — 이동 자체가 풍경이 되는 곳이라, 하루에 많이 담기보다 한 지역을 깊게 보는 편이 제주답습니다.",
          en: "One volcanic island, and the whole of it is the destination. Hallasan trails, emerald beaches, waterfalls and volcanic cones — even the driving is scenery here, so going deep in one area beats cramming the day.",
          ja: "火山がつくった一つの島、その全体が旅行地です。漢拏山の探訪路、エメラルドのビーチ、滝とオルム — 移動そのものが風景になる場所なので、一日に詰め込むより一つのエリアを深く見るのが済州らしい旅です。",
          zh: "一座火山造就的海岛，整座岛就是目的地。汉拿山步道、翡翠色的海滩、瀑布与小火山——在这里连移动本身都是风景，与其一天塞满行程，不如深入看透一个区域，这才是济州的玩法。",
        },
        places: [
          { id: 2906, name: { ko: "협재해수욕장", en: "Hyeopjae Beach", ja: "挟才ビーチ", zh: "挟才海水浴场" } },
          { id: 2877, name: { ko: "천지연폭포", en: "Cheonjiyeon Falls", ja: "天地淵滝", zh: "天地渊瀑布" } },
          { id: 1871, name: { ko: "한라산 영실탐방로", en: "Hallasan Yeongsil Trail", ja: "漢拏山霊室コース", zh: "汉拿山灵室路线" } },
        ],
      },
      {
        heading: { ko: "경주 — 지붕 없는 박물관", en: "Gyeongju — a museum without a roof", ja: "慶州 — 屋根のない博物館", zh: "庆州 — 没有屋顶的博物馆" },
        body: {
          ko: "천 년 왕국 신라의 수도였던 도시 전체가 유적입니다. 고분 사이를 걷고, 천문대 앞에 서고, 밤에는 연못에 비친 궁궐터를 봅니다. 자전거나 도보의 속도가 이 도시와 가장 잘 맞습니다.",
          en: "The entire city — capital of the thousand-year Silla kingdom — is the historic site. You walk between royal tombs, stand before an ancient observatory, and at night watch a palace pond hold its reflection. The pace of a bicycle or a walk fits this city best.",
          ja: "千年王国・新羅の都だった都市全体が遺跡です。古墳の間を歩き、古代の天文台の前に立ち、夜には池に映る宮殿跡を眺める。自転車や徒歩の速度が、この都市に一番合っています。",
          zh: "这座曾是千年王国新罗首都的城市，整体就是一处遗迹。漫步于古坟之间，伫立在古老的瞻星台前，夜晚看宫殿遗址倒映在池中。自行车或步行的速度，与这座城市最为合拍。",
        },
        places: [
          { id: 436, name: { ko: "대릉원", en: "Daereungwon Tomb Complex", ja: "大陵苑", zh: "大陵苑" } },
          { id: 457, name: { ko: "첨성대", en: "Cheomseongdae Observatory", ja: "瞻星台", zh: "瞻星台" } },
          { id: 439, name: { ko: "동궁과 월지", en: "Donggung Palace and Wolji Pond", ja: "東宮と月池", zh: "东宫与月池" } },
        ],
      },
      {
        heading: { ko: "전주 — 한옥과 미식의 도시", en: "Jeonju — hanok and food", ja: "全州 — 韓屋と美食の都市", zh: "全州 — 韩屋与美食之城" },
        body: {
          ko: "한옥 지붕이 이어지는 골목을 걷다가, 시장에서 한 끼로 하루의 핵심을 완성하는 도시입니다. 유네스코 음식창의도시라는 공식 타이틀이 과장이 아니라는 것을 골목의 냄새가 먼저 알려 줍니다.",
          en: "You walk lanes of tiled hanok roofs, then complete the day's centerpiece with a single meal at the market. The official UNESCO City of Gastronomy title is no exaggeration — the alley smells tell you first.",
          ja: "韓屋の屋根が連なる路地を歩き、市場での一食がその日のハイライトになる都市です。ユネスコ食文化創造都市という公式タイトルが誇張でないことは、路地の匂いが先に教えてくれます。",
          zh: "走过韩屋屋檐相连的巷子，再在市场用一顿饭完成当天的重头戏。联合国教科文组织“美食创意城市”的官方头衔绝非夸张——巷子里的香气会先告诉你。",
        },
        places: [
          { id: 749, name: { ko: "전주한옥마을", en: "Jeonju Hanok Village", ja: "全州韓屋村", zh: "全州韩屋村" } },
          { id: 790, name: { ko: "전주 남부시장", en: "Jeonju Nambu Market", ja: "全州南部市場", zh: "全州南部市场" } },
          { id: 795, name: { ko: "전주향교", en: "Jeonju Hyanggyo", ja: "全州郷校", zh: "全州乡校" } },
        ],
      },
      {
        heading: { ko: "고르는 법", en: "How to choose", ja: "選び方", zh: "如何选择" },
        body: {
          ko: "정답은 없습니다. 끌리는 도시의 장소들을 둘러보고 마음에 드는 곳을 저장해 두세요 — 저장한 장소는 여행 일정을 만들 때 This Trip 으로 그대로 이어집니다.",
          en: "There is no right answer. Browse the places in whichever city pulls you, and save the ones you like — saved places carry straight into This Trip when you build your itinerary.",
          ja: "正解はありません。惹かれる都市の場所を眺めて、気に入ったところを保存しておいてください — 保存した場所は、旅程を作るときに This Trip へそのままつながります。",
          zh: "没有标准答案。逛逛吸引你的那座城市的地点，把喜欢的收藏起来——收藏的地点在制定行程时会直接进入 This Trip。",
        },
        links: [
          { label: { ko: "여행 일정 만들기", en: "Plan your trip", ja: "旅程を作る", zh: "制定行程" }, href: "/planner" },
        ],
      },
    ],
    sources: [
      { name: "Visit Busan", url: VISIT_PORTALS.busan.en },
      { name: "Visit Seoul (STO)", url: VISIT_PORTALS.seoul.en },
      { name: "Visit Jeju", url: VISIT_PORTALS.jeju.en },
      { name: "Gyeongju City Tourism", url: VISIT_PORTALS.gyeongju },
      { name: "Jeonju City Tourism", url: VISIT_PORTALS.jeonju },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: "official-guides-and-maps",
    date: "2026-09-07",
    category: "official-resources",
    heroImage: "/og/gyeongju/opengraph-image.png",
    title: {
      ko: "공식 가이드북과 지도, 제대로 찾는 법",
      en: "Official Guidebooks and Maps, Found Properly",
      ja: "公式ガイドブックと地図の正しい探し方",
      zh: "官方指南与地图的正确打开方式",
    },
    summary: {
      ko: "각 도시의 관광기관은 무료 공식 가이드북과 지도를 여러 언어로 배포합니다. 흩어져 있어 찾기 어려운 공식 자료들을 도시별로 모았습니다 — 전부 공식 기관이 직접 배포하는 링크입니다.",
      en: "Each city's tourism body publishes free official guidebooks and maps in multiple languages — they are just scattered and hard to find. Here they are, city by city. Every link goes to the official publisher.",
      ja: "各都市の観光機関は、無料の公式ガイドブックと地図を多言語で配布しています。散らばっていて探しにくい公式資料を都市別にまとめました — すべて公式機関が直接配布するリンクです。",
      zh: "各城市的旅游机构都以多种语言发布免费的官方指南和地图——只是太分散，不好找。这里按城市整理好了，所有链接都直达官方发布处。",
    },
    sections: [
      {
        heading: { ko: "왜 공식 자료인가", en: "Why official sources", ja: "なぜ公式資料なのか", zh: "为什么用官方资料" },
        body: {
          ko: "지역 Visit 사이트는 그 도시를 가장 깊게 다루고, 한국관광공사(KTO)는 대한민국 전체 관점에서 외국인 여행자를 위한 정보를 다룹니다. 둘은 역할이 다릅니다 — 도시를 정했다면 그 도시의 공식 포털을, 큰 그림과 전국 단위 정보가 필요하면 KTO 를 보는 것이 기본입니다.",
          en: "Regional Visit sites cover their own city in the most depth, while the Korea Tourism Organization (KTO) covers Korea as a whole for international travelers. The roles differ: once your city is set, its official portal is the deep source; for the big picture and nationwide information, KTO is the place.",
          ja: "地域の Visit サイトはその都市を最も深く扱い、韓国観光公社（KTO）は韓国全体の観点から外国人旅行者向けの情報を扱います。役割が違うのです — 都市が決まったらその都市の公式ポータルを、大きな絵と全国単位の情報が必要なら KTO を見るのが基本です。",
          zh: "各地的 Visit 网站对本城市的介绍最深入，而韩国观光公社（KTO）则从全国角度为外国游客提供信息。两者角色不同：定好城市后，深挖该城市的官方门户；需要全局和全国性信息时，则看 KTO。",
        },
        links: [
          { label: { ko: "한국관광공사 VisitKorea", en: "VisitKorea (KTO)", ja: "VisitKorea（韓国観光公社）", zh: "VisitKorea（韩国观光公社）" }, href: VISIT_PORTALS.kto },
        ],
      },
      {
        heading: { ko: "서울 — 언어별 공식 가이드북", en: "Seoul — guidebooks in your language", ja: "ソウル — 言語別公式ガイドブック", zh: "首尔 — 多语言官方指南" },
        body: {
          ko: "서울관광재단(STO)은 관광 가이드북과 지도를 한국어·영어·일본어·중국어판으로 각각 배포합니다. 아래 링크는 보고 있는 언어에 맞는 판으로 연결됩니다.",
          en: "The Seoul Tourism Organization publishes its guidebook and map in Korean, English, Japanese and Chinese editions. The links below open the edition matching your current language.",
          ja: "ソウル観光財団（STO）は観光ガイドブックと地図を韓国語・英語・日本語・中国語版でそれぞれ配布しています。以下のリンクは、いま見ている言語に合った版につながります。",
          zh: "首尔观光财团（STO）分别以韩、英、日、中四种语言发布旅游指南和地图。以下链接会打开与你当前语言一致的版本。",
        },
        links: [
          {
            label: { ko: "서울 관광 가이드북 (PDF)", en: "Seoul Tourist Guidebook (PDF)", ja: "ソウル観光ガイドブック (PDF)", zh: "首尔旅游指南 (PDF)" },
            href: {
              ko: "https://korean.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1154&fileTy=ATTACH&fileNo=7",
              en: "https://english.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1164&fileTy=ATTACH&fileNo=7",
              ja: "https://japanese.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1165&fileTy=ATTACH&fileNo=7",
              zh: "https://chinese.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1166&fileTy=ATTACH&fileNo=7",
            },
          },
          {
            label: { ko: "서울 관광 지도 (PDF)", en: "Seoul Tourist Map (PDF)", ja: "ソウル観光マップ (PDF)", zh: "首尔旅游地图 (PDF)" },
            href: {
              ko: "https://korean.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1152&fileTy=ATTACH&fileNo=5",
              en: "https://english.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1153&fileTy=ATTACH&fileNo=5",
              ja: "https://japanese.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1159&fileTy=ATTACH&fileNo=5",
              zh: "https://chinese.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1161&fileTy=ATTACH&fileNo=8",
            },
          },
          {
            label: { ko: "서울 등산관광 가이드 (PDF)", en: "Seoul Hiking Tourism Guide (PDF)", ja: "ソウル登山観光ガイド (PDF)", zh: "首尔登山旅游指南 (PDF)" },
            href: {
              ko: "https://english.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1212&fileTy=ATTACH&fileNo=1",
              en: "https://english.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1212&fileTy=ATTACH&fileNo=1",
              ja: "https://japanese.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1217&fileTy=ATTACH&fileNo=1",
              zh: "https://chinese.visitseoul.net/comm/getFile?srvcId=GUIDEBOOK&parentSn=1213&fileTy=ATTACH&fileNo=2",
            },
          },
          {
            label: { ko: "디지털 관광 지도 (웹)", en: "Digital Tour Map (web)", ja: "デジタル観光マップ (Web)", zh: "数字旅游地图（网页）" },
            href: "https://map.seoul.go.kr/global/tourmap",
          },
        ],
      },
      {
        heading: { ko: "부산·제주·전주 — 공식 포털", en: "Busan · Jeju · Jeonju — official portals", ja: "釜山・済州・全州 — 公式ポータル", zh: "釜山·济州·全州 — 官方门户" },
        body: {
          ko: "이 도시들은 다국어 공식 포털 자체가 가장 충실한 가이드입니다. 각 포털은 한국어·영어·일본어·중국어를 지원합니다.",
          en: "For these cities, the multilingual official portal itself is the most complete guide. Each supports Korean, English, Japanese and Chinese.",
          ja: "これらの都市は、多言語の公式ポータル自体が最も充実したガイドです。各ポータルは韓国語・英語・日本語・中国語に対応しています。",
          zh: "对这些城市来说，多语言官方门户本身就是最完整的指南。各门户均支持韩、英、日、中四种语言。",
        },
        links: [
          { label: { ko: "비짓부산 (Visit Busan)", en: "Visit Busan", ja: "Visit Busan", zh: "Visit Busan" }, href: VISIT_PORTALS.busan },
          { label: { ko: "비짓제주 (Visit Jeju)", en: "Visit Jeju", ja: "Visit Jeju", zh: "Visit Jeju" }, href: VISIT_PORTALS.jeju },
          { label: { ko: "전주 문화관광", en: "Jeonju Tour", ja: "全州文化観光", zh: "全州文化观光" }, href: VISIT_PORTALS.jeonju, langNote: "KO/EN/JA/ZH" },
        ],
      },
      {
        heading: { ko: "경주 — 시가 직접 배포하는 자료", en: "Gyeongju — published by the city itself", ja: "慶州 — 市が直接配布する資料", zh: "庆州 — 由市政府直接发布" },
        body: {
          ko: "경주시는 관광안내지도와 유네스코 세계유산 역사유적지구 안내 자료를 시 공식 홈페이지에서 직접 배포합니다. 자료 페이지는 한국어입니다.",
          en: "Gyeongju City publishes its tourist maps and UNESCO Historic Areas guides directly on the city's official site. The download pages are in Korean.",
          ja: "慶州市は観光案内地図とユネスコ世界遺産・歴史遺跡地区の案内資料を市の公式サイトで直接配布しています。資料ページは韓国語です。",
          zh: "庆州市在市官方网站上直接发布旅游地图和联合国教科文组织历史遗迹区的介绍资料。资料页面为韩文。",
        },
        links: [
          { label: { ko: "경주 관광안내지도", en: "Gyeongju Tourist Map", ja: "慶州観光案内地図", zh: "庆州旅游地图" }, href: "https://gyeongju.go.kr/tour/page.do?mnu_uid=2367&reqType=1", langNote: "KO" },
          { label: { ko: "사적지 길라잡이 (유네스코 역사유적지구)", en: "Historic Sites Guide (UNESCO Historic Areas)", ja: "史跡ガイド（ユネスコ歴史遺跡地区）", zh: "史迹指南（UNESCO历史遗迹区）" }, href: "https://gyeongju.go.kr/tour/page.do?mnu_uid=4084", langNote: "KO" },
          { label: { ko: "관광책자 e-book 시리즈", en: "Tourism e-book series", ja: "観光冊子 e-book シリーズ", zh: "旅游手册电子书系列" }, href: "https://gyeongju.go.kr/tour/page.do?mnu_uid=2395", langNote: "KO" },
        ],
      },
      {
        heading: { ko: "정본은 언제나 공식 화면에서", en: "The canonical details live on official screens", ja: "正式な情報はいつも公式画面で", zh: "权威信息永远在官方页面" },
        body: {
          ko: "교통·환전·통신 같은 실용 정보의 정본은 이 블로그가 아니라 각 도시의 Travel Essentials 화면과 공식 기관 페이지입니다. 블로그는 길을 안내할 뿐, 숫자는 정본에서 확인하세요.",
          en: "For practical details — transport, money, connectivity — the canonical sources are each city's Travel Essentials screen and the official pages, not this blog. The blog points the way; verify numbers at the source.",
          ja: "交通・両替・通信などの実用情報の正式なソースは、このブログではなく各都市の Travel Essentials 画面と公式機関のページです。ブログは道案内をするだけ — 数字は正式なソースで確認してください。",
          zh: "交通、换汇、通信等实用信息的权威来源，是各城市的 Travel Essentials 页面和官方机构页面，而不是本博客。博客只负责指路——具体数字请以官方为准。",
        },
        links: [
          { label: { ko: "부산 Travel Essentials", en: "Busan Travel Essentials", ja: "釜山 Travel Essentials", zh: "釜山 Travel Essentials" }, href: "/city/busan/essentials/" },
        ],
      },
    ],
    sources: [
      { name: "Seoul Tourism Organization — Visit Seoul", url: VISIT_PORTALS.seoul.en },
      { name: "Visit Busan", url: VISIT_PORTALS.busan.en },
      { name: "Visit Jeju", url: VISIT_PORTALS.jeju.en },
      { name: "Gyeongju City Tourism", url: VISIT_PORTALS.gyeongju },
      { name: "Jeonju City Tourism", url: VISIT_PORTALS.jeonju },
      { name: "Korea Tourism Organization — VisitKorea", url: "https://english.visitkorea.or.kr" },
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | null {
  return BLOG_POSTS.find(p => p.slug === slug) ?? null;
}

/** 최신 글이 먼저 */
export function getBlogPostsSorted(): BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function pickL10n(v: L10n, locale: string): string {
  const l = (locale === "ko" || locale === "en" || locale === "ja" || locale === "zh") ? locale : "en";
  return v[l as BlogLocale] || v.en;
}

export function pickHref(href: string | L10n, locale: string): string {
  return typeof href === "string" ? href : pickL10n(href, locale);
}
