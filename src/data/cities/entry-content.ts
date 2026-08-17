// 도시 진입 화면(City Entry)의 도시별 콘텐츠.
//
// 예전엔 /busan · /seoul · /jeju · /gyeongju 가 각각 242줄짜리 페이지로 같은
// UI 를 네 번 복제하고 있었다. 화면은 CityEntry 하나로 합치고, 도시마다 다른
// 것만 여기 둔다.
//
// 문구는 기존 페이지에서 그대로 옮겼다 — 교통 요금·소요시간·계절 조언 같은
// 사실 정보를 손대지 않기 위해 다듬지 않고 원문을 유지한다. 같은 이유로
// 번역하지 않는다(UI chrome 만 4개 언어, 본문은 영어 원문).

export interface CityHighlight {
  emoji: string;
  name:  string;
  desc:  string;
  tag:   string;
}

export interface CityPractical {
  icon:  string;
  label: string;
  value: string;
}

export interface CityEntryContent {
  /** Hero 상단 배지 */
  badge:    string;
  /** 화면에 크게 쓰는 도시 이름. config.name 과 다를 수 있다(Jeju Island). */
  title:    string;
  tagline:  string;
  intro:    string;
  heroCta:  string;
  heroSub:  string;
  highlightsTitle:    string;
  highlightsSubtitle: string;
  practicalTitle:     string;
  practicalSubtitle:  string;
  plannerLabel: string;
  plannerTitle: string;
  plannerDesc:  string;
  highlights: CityHighlight[];
  practical:  CityPractical[];
  /** Editorial 제휴 카드를 붙일 수 있는 도시인지. KoreaReadySection 지원 도시만 true. */
  koreaReady: boolean;
}

export const BUSAN_ENTRY: CityEntryContent = {
  badge:   "🇰🇷 Korea Travel Guide",
  title:   "Busan",
  tagline: "Ocean City · Seafood Capital · Beach & Mountains",
  intro:   "Busan is Korea's second city and its undisputed capital of seafood, beaches, and nightlife. Where mountains meet the sea, traditional fish markets coexist with rooftop bars, and colorful hillside villages overlook glittering bridges. Plan your Busan itinerary in 30 seconds with AI.",
  heroCta: "✨ Plan My Busan Trip Free →",
  heroSub: "No sign-up required · AI generates your itinerary in 30 seconds",
  highlightsTitle:    "Must-See in Busan",
  highlightsSubtitle: "The essential Busan itinerary stops — from world-class beaches to coastal temples",
  practicalTitle:     "Practical Busan Travel Info",
  practicalSubtitle:  "Everything you need before and during your Busan trip",
  plannerLabel: "gokoreamate.com · AI Trip Planner",
  plannerTitle: "Ready to Plan Your Busan Itinerary?",
  plannerDesc:  "Tell the AI your travel dates and style — solo, couple, family, or group. Get a full day-by-day Busan itinerary in 30 seconds. Free, no sign-up needed.",
  koreaReady:   true,
  highlights: [
  {
    emoji: "🏖️",
    name: "Haeundae Beach",
    desc: "Korea's most famous beach — 1.5km of white sand flanked by luxury hotels. Summer brings millions of visitors; spring and autumn are tranquil and perfect.",
    tag: "Icon",
  },
  {
    emoji: "🎨",
    name: "Gamcheon Culture Village",
    desc: "Busan's 'Santorini of Korea' — a hillside village of colorful houses turned into an open-air art gallery. Each alleyway hides murals, sculptures, and cafes.",
    tag: "Art · Photo",
  },
  {
    emoji: "🐟",
    name: "Jagalchi Fish Market",
    desc: "Korea's largest seafood market, open since 1945. Buy raw octopus, sea cucumber, and live fish at basement stalls, then have them cooked upstairs on the spot.",
    tag: "Food",
  },
  {
    emoji: "🌉",
    name: "Gwangalli Beach & Diamond Bridge",
    desc: "Gwangandaegyo (Diamond Bridge) illuminates the night skyline across a 7.4km span. Gwangalli beach below is lined with trendy restaurants and cocktail bars.",
    tag: "Night View",
  },
  {
    emoji: "⛩️",
    name: "Haedong Yonggungsa Temple",
    desc: "A rare coastal Buddhist temple built directly on oceanside cliffs. The dramatic setting — waves crashing below pagodas — is unlike any other temple in Korea.",
    tag: "Temple",
  },
  {
    emoji: "🚡",
    name: "Songdo Sky Walk & Cable Car",
    desc: "Korea's first public beach (1913) with a glass-bottom sky walk jutting over the sea. The cable car offers sweeping views of the Busan coastline.",
    tag: "Scenic",
  },
],
  practical: [
  // 예약상품(KTX 티켓) 가격은 표시하지 않는다. 소요시간·경로 같은 이동 정보만 남긴다.
  { icon: "🚄", label: "Getting There", value: "KTX from Seoul Station: 2hr 15min. Busan (PUS) airport for international flights." },
  { icon: "🚇", label: "Getting Around", value: "Busan Metro (4 lines + BRT). T-money card works. Haeundae–Nampo area taxi: ₩8,000–₩15,000." },
  { icon: "🚌", label: "Airport Bus", value: "Limousine Bus 7 links Gimhae Airport to Haeundae in ~55 min (₩8,000). Fastest option without luggage." },
  { icon: "💳", label: "Payments", value: "Cards accepted in tourist areas. Carry ₩30,000 cash for Jagalchi Market and street vendors." },
  { icon: "🌤️", label: "Best Season", value: "Autumn (Sep–Nov) for mild weather. Summer (Jul–Aug) for beach season but crowded. Avoid Chuseok week." },
  { icon: "🍜", label: "Must Eat", value: "Milmyeon (wheat noodles), Dwaeji gukbap (pork rice soup), Ssiat hotteok (seed-filled pancake) at Nampodong." },
],
};

export const SEOUL_ENTRY: CityEntryContent = {
  badge:   "🇰🇷 Korea Travel Guide",
  title:   "Seoul",
  tagline: "Capital City · K-Culture · 10 Million Lights",
  intro:   "Seoul is Korea's beating heart — ancient palaces stand beside futuristic skyscrapers, street food alleys lead to Michelin-starred restaurants, and K-pop culture is everywhere. Plan your Seoul itinerary in 30 seconds with AI.",
  heroCta: "✨ Plan My Seoul Trip Free →",
  heroSub: "No sign-up required · AI generates your itinerary in 30 seconds",
  highlightsTitle:    "Must-See in Seoul",
  highlightsSubtitle: "The essential Seoul itinerary stops for first-time and repeat visitors",
  practicalTitle:     "Practical Seoul Travel Info",
  practicalSubtitle:  "Everything you need before and during your Seoul trip",
  plannerLabel: "gokoreamate.com · AI Trip Planner",
  plannerTitle: "Ready to Plan Your Seoul Itinerary?",
  plannerDesc:  "Tell the AI your travel dates and style — solo, couple, family, or group. Get a full day-by-day Seoul itinerary in 30 seconds. Free, no sign-up needed.",
  koreaReady:   true,
  highlights: [
  {
    emoji: "🏯",
    name: "Gyeongbokgung Palace",
    desc: "Korea's grandest Joseon-era palace. Catch the 10:00 & 14:00 Royal Guard Changing Ceremony — free entry under 25 or in hanbok.",
    tag: "UNESCO Heritage",
  },
  {
    emoji: "🏘️",
    name: "Bukchon Hanok Village",
    desc: "700-year-old alleyways of traditional hanok homes between Gyeongbokgung and Changdeokgung palaces. Best before 09:00 to beat the crowds.",
    tag: "Photo Spot",
  },
  {
    emoji: "🎵",
    name: "Hongdae & Sinchon",
    desc: "Seoul's university arts district — busking performances, indie music, late-night street food, and Korea's most vibrant youth culture.",
    tag: "Nightlife",
  },
  {
    emoji: "🛍️",
    name: "Myeongdong",
    desc: "Korea's flagship shopping district. K-beauty flagship stores, street food stalls (egg bread, tteokbokki, tornado potato), and duty-free malls.",
    tag: "Shopping",
  },
  {
    emoji: "🌉",
    name: "Han River Parks",
    desc: "Rent a bike along the Han River, grab convenience store fried chicken, and watch the nightly Banpo Bridge Rainbow Fountain show (May–Oct).",
    tag: "Free",
  },
  {
    emoji: "🌃",
    name: "N Seoul Tower (Namsan)",
    desc: "360° panoramic view of Seoul from 479m elevation. Cable car or 20-min hike. The love-lock fence is a rite of passage for every Seoul visitor.",
    tag: "Night View",
  },
],
  practical: [
  { icon: "✈️", label: "Getting There", value: "Incheon (ICN) — AREX Express Train to City Hall: 43 min, ₩9,500" },
  { icon: "🚇", label: "Getting Around", value: "Seoul Metro (9 lines). T-money card accepted. Single ride: ₩1,400–₩1,800" },
  { icon: "📱", label: "SIM / eSIM", value: "Buy at Incheon Airport arrival hall or pre-order eSIM online (activate on landing)" },
  { icon: "💳", label: "Payments", value: "Foreign Visa/Mastercard accepted almost everywhere. Carry ₩20,000 cash for street stalls" },
  { icon: "🌤️", label: "Best Season", value: "Spring (Mar–May) cherry blossoms · Autumn (Sep–Nov) foliage. Summer is hot & humid." },
  { icon: "🗣️", label: "Language", value: "English signage on all subway lines. Google Translate camera mode handles menus." },
],
};

export const JEJU_ENTRY: CityEntryContent = {
  badge:   "🇰🇷 Korea Travel Guide",
  title:   "Jeju Island",
  tagline: "Island Paradise · Volcanic Wonders · UNESCO Triple Crown",
  intro:   "Jeju is Korea's volcanic island gem — a UNESCO triple heritage site where lava tubes, crater lakes, turquoise beaches, and tangerine orchards coexist. No visa required for most nationalities. Plan your Jeju itinerary in 30 seconds with AI.",
  heroCta: "✨ Plan My Jeju Trip Free →",
  heroSub: "No sign-up required · AI generates your itinerary in 30 seconds",
  highlightsTitle:    "Must-See in Jeju",
  highlightsSubtitle: "The essential Jeju island itinerary stops — from volcanic peaks to hidden beaches",
  practicalTitle:     "Practical Jeju Travel Info",
  practicalSubtitle:  "Everything you need to know before visiting Jeju island",
  plannerLabel: "gokoreamate.com · AI Trip Planner",
  plannerTitle: "Ready to Plan Your Jeju Itinerary?",
  plannerDesc:  "Tell the AI your travel dates and style — solo, couple, family, or group. Get a full day-by-day Jeju island itinerary in 30 seconds. Free, no sign-up needed.",
  koreaReady:   true,
  highlights: [
  {
    emoji: "🌋",
    name: "Hallasan National Park",
    desc: "Korea's highest peak (1,950m) and a UNESCO World Heritage volcano. Eorimok trail (5.3km) rewards with stunning crater lake views on clear days.",
    tag: "UNESCO",
  },
  {
    emoji: "🌅",
    name: "Seongsan Ilchulbong",
    desc: "The 'Sunrise Peak' — a 182m volcanic crater rising from the sea. Climb 99 stone steps for a panoramic crater view. Best at dawn for the iconic sunrise.",
    tag: "UNESCO · Sunrise",
  },
  {
    emoji: "🕳️",
    name: "Manjanggul Lava Tube",
    desc: "One of the world's longest lava tubes (7.4km), formed 250,000 years ago. The accessible section (1km) maintains a cool 11°C year-round.",
    tag: "UNESCO",
  },
  {
    emoji: "🏖️",
    name: "Hamdeok & Hyeopjae Beach",
    desc: "Hamdeok's turquoise waters dazzle in summer. Hyeopjae faces west — perfect for sunset swims with volcanic rock formations in the background.",
    tag: "Beach",
  },
  {
    emoji: "🏘️",
    name: "Seopjikoji Coastal Trail",
    desc: "A 2km coastal walk past canola fields, stone walls, and volcanic rock cliffs. Made famous by the film 'Sopyonje'. Spectacular in spring (April canola).",
    tag: "Scenic Walk",
  },
  {
    emoji: "🍊",
    name: "Jeju Citrus Experience",
    desc: "Jeju is Korea's premier mandarin (hallabong) producer. Visit a tangerine farm for pick-your-own (Nov–Jan), or grab fresh hallabong juice at any market.",
    tag: "Local Food",
  },
],
  practical: [
  { icon: "✈️", label: "Getting There", value: "Direct flights from Seoul (GMP→CJU): 55 min. From Busan (PUS→CJU): 50 min. Jeju has no ferries from Seoul." },
  // 렌터카는 예약상품이다. 일당 요금을 싣지 않고 필요성·자격 요건만 안내한다.
  { icon: "🚗", label: "Getting Around", value: "Rent a car — Jeju's best spots are spread island-wide. International license accepted." },
  { icon: "🚌", label: "Without a Car", value: "Intercity buses connect major spots. Airport → Seongsan: ~1.5hr by bus 101. Slower but scenic." },
  { icon: "💳", label: "Payments", value: "Cards accepted widely. Carry some cash for smaller eateries and farm stalls." },
  { icon: "🌤️", label: "Best Season", value: "Spring (Mar–May) canola & cherry blossoms · Autumn (Sep–Nov) foliage. Typhoon risk Jul–Sep." },
  { icon: "🌊", label: "Haenyeo Culture", value: "Watch Jeju's legendary female divers (해녀) work at Seongsan or Udo Island — a UNESCO Intangible Heritage." },
],
};

export const GYEONGJU_ENTRY: CityEntryContent = {
  badge:   "🇰🇷 Korea Travel Guide",
  title:   "Gyeongju",
  tagline: "Ancient Capital · 1,000 Years of Silla · Open-Air Museum City",
  intro:   "Gyeongju was the capital of the Silla Kingdom for nearly 1,000 years. Today it's a UNESCO World Heritage city where grass-covered royal tombs, Buddhist temples, and ancient observatories stand peacefully among modern streets. Plan your trip with AI.",
  heroCta: "✨ Plan My Gyeongju Trip Free →",
  heroSub: "No sign-up required · AI generates your itinerary in 30 seconds",
  highlightsTitle:    "Must-See in Gyeongju",
  highlightsSubtitle: "The essential Gyeongju itinerary stops — 5 UNESCO sites in one city",
  practicalTitle:     "Practical Gyeongju Travel Info",
  practicalSubtitle:  "Everything you need to know before visiting Gyeongju",
  plannerLabel: "gokoreamate.com · AI Trip Planner",
  plannerTitle: "Ready to Plan Your Gyeongju Itinerary?",
  plannerDesc:  "Tell the AI your travel dates and style — solo, couple, family, or group. Get a full day-by-day Gyeongju itinerary in 30 seconds. Free, no sign-up needed.",
  koreaReady:   true,
  highlights: [
  {
    emoji: "🏛️",
    name: "Bulguksa Temple",
    desc: "Korea's most celebrated Buddhist temple, built in 751 CE. The two stone pagodas (Dabotap & Seokgatap) and Cheongungyo bridge are masterpieces of Silla architecture.",
    tag: "UNESCO",
  },
  {
    emoji: "🗿",
    name: "Seokguram Grotto",
    desc: "An 8th-century granite Buddha enshrined in a man-made cave overlooking the East Sea. Considered Korea's finest Buddhist artwork. 10-min bus from Bulguksa.",
    tag: "UNESCO",
  },
  {
    emoji: "🪦",
    name: "Tumuli Park (Royal Tombs)",
    desc: "23 massive grass-covered royal burial mounds of the Silla kingdom. Stroll freely around them at dusk when the park glows amber. Cheonmachong tomb is open inside.",
    tag: "Free",
  },
  {
    emoji: "🌸",
    name: "Anapji Pond (Donggung)",
    desc: "A Silla-era palace pond built in 674 CE — stunning at night when lanterns reflect across the water. One of Korea's most photographed night scenes.",
    tag: "Night View",
  },
  {
    emoji: "🔭",
    name: "Cheomseongdae Observatory",
    desc: "The oldest surviving astronomical observatory in Asia (634 CE). A 9.4m cylindrical stone tower in the middle of a field — simple, ancient, mesmerizing.",
    tag: "Historical",
  },
  {
    emoji: "🎋",
    name: "Gyeongju Yangdong Village",
    desc: "A 500-year-old Joseon aristocratic village with original tiled-roof mansions and thatched-roof homes. UNESCO-listed and far less crowded than Seoul's Bukchon.",
    tag: "UNESCO · Village",
  },
],
  practical: [
  // 부산과 같은 이유로 KTX 티켓 가격은 뺀다. 경주의 위치 감각은 소요시간만으로 전달된다.
  { icon: "🚄", label: "Getting There", value: "KTX from Seoul to Singyeongju: 2hr. From Busan: 23 min. Gyeongju sits between them." },
  { icon: "🚌", label: "Getting Around", value: "City bus #10 & #11 loop the main sites (Bulguksa, Tumuli, Cheomseongdae). All-day bus pass: ₩5,000" },
  { icon: "🚴", label: "Best Way", value: "Rent a bike near Gyeongju Station — the city is flat and the royal tombs area is perfect for cycling. ₩3,000–₩5,000/hr." },
  { icon: "💳", label: "Payments", value: "Cards accepted at major sites. Carry cash for street stalls near Bulguksa and the local market." },
  { icon: "🌤️", label: "Best Season", value: "Spring (Mar–May) cherry blossoms around the tombs · Autumn (Sep–Nov) for golden foliage + harvest moon festivals." },
  { icon: "🏨", label: "Base Camp", value: "Stay downtown for bike access to tombs. Or base in Busan (23 min by KTX) for a comfortable day trip." },
],
};

// Jeonju 는 아직 검증된 장소·실용 정보가 없다. 없는 것을 지어내지 않는다 —
// 도시 이름과 기존 seoDescription 만 쓰고 나머지 섹션은 렌더하지 않는다.
// AI 플래너도 Jeonju 를 지원하지 않으므로 CTA 를 Coming Soon 으로 둔다.
export const JEONJU_ENTRY: CityEntryContent = {
  badge:   "🇰🇷 Korea Travel Guide",
  title:   "Jeonju",
  tagline: "",
  intro:   "",
  heroCta: "",
  heroSub: "",
  highlightsTitle:    "",
  highlightsSubtitle: "",
  practicalTitle:     "",
  practicalSubtitle:  "",
  plannerLabel: "",
  plannerTitle: "",
  plannerDesc:  "",
  koreaReady:   false,
  highlights: [],
  practical:  [],
};

export const CITY_ENTRY_CONTENT: Record<string, CityEntryContent> = {
  busan:    BUSAN_ENTRY,
  seoul:    SEOUL_ENTRY,
  jeju:     JEJU_ENTRY,
  gyeongju: GYEONGJU_ENTRY,
  jeonju:   JEONJU_ENTRY,
};
