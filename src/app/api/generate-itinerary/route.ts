import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MODELS = ["gemini-2.5-flash"];
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(apiKey: string, model: string, prompt: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const msg = (errBody as { error?: { message?: string } })?.error?.message || response.statusText;
    throw new Error(`Gemini ${response.status}: ${msg}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Empty response from Gemini");
  return JSON.parse(rawText);
}

// ── 지역 앵커 정의 ─────────────────────────────────────────────────────────
// 특정 출발 지역이 감지되면 Day 1 동선을 해당 권역 내로 강제 바인딩
interface LocationAnchor {
  displayName: string;           // 프롬프트에 표시할 이름
  radius: string;                // 허용 반경 설명
  allowedZones: string[];        // Day 1에 허용할 지역/동네 목록
  prohibitedZones: string[];     // Day 1에 절대 불가 지역
  eveningSpots: string;          // 저녁 도착 시 추천 스팟 프롬프트
}

function detectLocationAnchor(loc: string): LocationAnchor | null {
  const l = loc.toLowerCase();

  // 남포동 권역 감지 (Nampo-dong, 남포동, BIFF, Gwangbok-ro, Jagalchi 등)
  if (
    l.includes("nampo") || l.includes("남포") ||
    l.includes("biff") || l.includes("gwangbok") ||
    l.includes("jagalchi") || l.includes("자갈치") ||
    l.includes("nampo-dong")
  ) {
    return {
      displayName: "Nampo-dong / Jung-gu area",
      radius: "within 15 minutes walk or 10 min taxi from Nampo-dong",
      allowedZones: [
        "Nampo-dong (남포동)", "Jung-gu (중구)", "Jagalchi (자갈치)",
        "Bupyeong-dong (부평동)", "Yeongdo-gu (영도구)", "Busan Station area (부산역)",
        "Gwangbok-ro (광복로)", "BIFF Square", "Taejongdae (태종대 — taxi OK)",
      ],
      prohibitedZones: [
        "Haeundae Beach", "Gwangalli Beach", "Centum City",
        "Seomyeon (서면)", "Gijang", "Haedong Yonggungsa",
        "Jangsan", "Songdo Beach (far end)",
      ],
      eveningSpots:
        "Bupyeong Kkangtong Night Market (부평깡통야시장 — open until midnight), " +
        "Jagalchi Fish Market evening (open until 21:00), " +
        "Gwangbok-ro pedestrian street (광복로 야경), " +
        "Nampo-dong street food alley, " +
        "Busan Tower (부산타워) night view from Yongdusan Park",
    };
  }

  // 해운대 권역 감지
  if (l.includes("haeundae") || l.includes("해운대")) {
    return {
      displayName: "Haeundae area",
      radius: "within 20 minutes walk or 10 min taxi from Haeundae Beach",
      allowedZones: [
        "Haeundae Beach (해운대해수욕장)", "Dongbaekseom Island (동백섬)",
        "Marine City (마린시티)", "Centum City (센텀시티)",
        "Dalmaji Hill (달맞이고개)", "Haeundae Market (해운대시장)",
      ],
      prohibitedZones: [
        "Nampo-dong", "Jagalchi", "Gamcheon Culture Village",
        "Busan Station", "Taejongdae",
      ],
      eveningSpots:
        "Haeundae Beach night walk, Marine City rooftop bars, " +
        "Dalmaji Hill café strip, Haeundae Market street food",
    };
  }

  // 광안리 권역 감지 (Gwangalli Beach, 광안리, 수영구)
  if (l.includes("gwangalli") || l.includes("광안리") || l.includes("gwangan")) {
    return {
      displayName: "Gwangalli Beach area",
      radius: "within 20 minutes walk or 10 min taxi from Gwangalli Beach",
      allowedZones: [
        "Gwangalli Beach (광안리해수욕장)", "Suyeong-gu (수영구)",
        "Gwangan Bridge viewpoint (광안대교)", "Millak Waterfront Park (밀락더마켓)",
        "Geumnyeonsan (금련산 — short taxi)", "Nam-gu (남구 — adjacent)",
      ],
      prohibitedZones: [
        "Nampo-dong", "Jagalchi", "Busan Station", "Taejongdae", "Gijang",
        "Gamcheon Culture Village",
      ],
      eveningSpots:
        "Gwangalli Beach sunset & Gwangan Bridge lighting (from 20:00), " +
        "Millak Waterfront Park (밀락더마켓) rooftop bars, " +
        "Gwangalli beachfront café strip, Suyeong night seafood alley",
    };
  }

  // KTX 부산역 / 서면 권역 감지 (한국어 "서면" 포함)
  if (
    l.includes("ktx") || l.includes("busan station") ||
    l.includes("부산역") || l.includes("seomyeon") || l.includes("서면")
  ) {
    return {
      displayName: "Busan Station / Seomyeon area",
      radius: "within 20 minutes subway or taxi from Busan Station",
      allowedZones: [
        "Busan Station (부산역)", "Seomyeon (서면)", "Nampo-dong (남포동)",
        "Jung-gu (중구)", "Jagalchi (자갈치)", "Bupyeong-dong (부평동)",
      ],
      prohibitedZones: [
        "Haeundae Beach", "Gwangalli", "Gijang", "Centum City (far)",
      ],
      eveningSpots:
        "Seomyeon underground shopping street, Bupyeong Night Market, " +
        "Nampo-dong street food, Busan Station plaza area",
    };
  }

  return null; // 앵커 없음 → 자유 생성
}

// ── 개발·테스트 환경 모의 일정 생성기 ────────────────────────────────────
function buildMockItinerary(
  city: string,
  startDate: string,
  endDate: string,
  startLocation?: string,
  arrivalTime?: string
) {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  const numDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const arrivalHour = arrivalTime ? parseInt(arrivalTime.split(":")[0] ?? "14", 10) : 14;
  const isEveningArrival = arrivalHour >= 17;
  const startArea = startLocation ?? city;

  // Day 1 도착 야간 템플릿 (항상 공통)
  const DAY1_EVENING_TEMPLATES = [
    { name: `${startArea} Arrival Check-in`,  category: "Experience", location: startArea,    time: `${String(arrivalHour).padStart(2,"0")}:00`, duration: "1h",    tips: "[MOCK] Check in to your hotel and freshen up." },
    { name: "Jagalchi Fish Market",            category: "Market",     location: "Nampo-dong", time: "18:00",                                     duration: "1h 30m", tips: "[MOCK] Try fresh seafood on the 2nd floor dining area." },
    { name: "Bupyeong Night Market",           category: "Market",     location: "Jung-gu",   time: "20:00",                                     duration: "1h",    tips: "[MOCK] Open until midnight. Cash preferred." },
  ];

  // 도착 지역 기반 Day 2 첫날 템플릿 — 도착지에서 모닝 시작
  const la = (startLocation ?? "").toLowerCase();
  const isHaeundaeAnchor  = la.includes("haeundae") || la.includes("해운대");
  const isGwangalliAnchor = la.includes("gwangalli") || la.includes("광안리") || la.includes("gwangan");
  const isNampoAnchor     = la.includes("nampo") || la.includes("남포") || la.includes("jagalchi") || la.includes("biff") || la.includes("gwangbok");

  type MockPlace = { name: string; category: string; location: string; time: string; duration: string; tips: string };
  const DAY2_TEMPLATES: MockPlace[] = isHaeundaeAnchor ? [
    { name: "Haeundae Beach Morning Walk",   category: "Attraction", location: "Haeundae",   time: "09:00", duration: "1h",  tips: "[MOCK] Best before 10 AM for fewer crowds." },
    { name: "Dongbaekseom Island Walk",      category: "Attraction", location: "Haeundae",   time: "11:00", duration: "1h",  tips: "[MOCK] Free entry. Scenic coastal path around the island." },
    { name: "Haeundae Market Lunch",         category: "Restaurant", location: "Haeundae",   time: "13:00", duration: "1h",  tips: "[MOCK] Try halmae gukbap (할매국밥). ₩9,000." },
    { name: "Marine City Rooftop Bar",       category: "Experience", location: "Marine City",time: "18:00", duration: "1h",  tips: "[MOCK] Best city + sea view at sunset." },
  ] : isGwangalliAnchor ? [
    { name: "Gwangalli Beach Morning Walk",  category: "Attraction", location: "Suyeong-gu", time: "09:00", duration: "1h",  tips: "[MOCK] Best at low tide — great view of Gwangan Bridge." },
    { name: "Millak Waterfront Park",        category: "Attraction", location: "Suyeong-gu", time: "11:00", duration: "1h",  tips: "[MOCK] 밀락더마켓 — open-air food & café market on the waterfront." },
    { name: "Gamcheon Culture Village",      category: "Attraction", location: "Saha-gu",    time: "14:00", duration: "2h",  tips: "[MOCK] Wear comfortable shoes — steep hills." },
    { name: "Gwangan Bridge Night View",     category: "Attraction", location: "Suyeong-gu", time: "20:00", duration: "1h",  tips: "[MOCK] Bridge lights up around 20:00. Best viewed from the beach." },
  ] : isNampoAnchor ? [
    { name: "Gamcheon Culture Village",      category: "Attraction", location: "Saha-gu",    time: "09:30", duration: "2h",  tips: "[MOCK] Wear comfortable shoes — steep hills." },
    { name: "Taejongdae Coastal Walk",       category: "Attraction", location: "Yeongdo-gu", time: "13:00", duration: "2h",  tips: "[MOCK] Take the Danubi Train inside the park." },
    { name: "Gwangalli Beach Sunset",        category: "Attraction", location: "Suyeong-gu", time: "17:30", duration: "1h",  tips: "[MOCK] Great view of Gwangandaegyo Bridge at night." },
    { name: "Busan Tower Night View",        category: "Attraction", location: "Nampo-dong", time: "20:00", duration: "1h",  tips: "[MOCK] ₩12,000 entry. Best at night." },
  ] : [
    // Seomyeon / KTX BusanStation / 기타: Day 2 모닝은 서면 근처 시작
    { name: "Seomyeon Breakfast — 돼지국밥", category: "Restaurant", location: "Seomyeon",   time: "09:00", duration: "1h",  tips: "[MOCK] Order pork soup rice (돼지국밥). ₩8,000. Cash or card OK." },
    { name: "Gamcheon Culture Village",      category: "Attraction", location: "Saha-gu",    time: "11:00", duration: "2h",  tips: "[MOCK] Wear comfortable shoes — steep hills." },
    { name: "Jagalchi Fish Market",          category: "Market",     location: "Nampo-dong", time: "14:00", duration: "1h 30m", tips: "[MOCK] Try fresh seafood on the 2nd floor dining area." },
    { name: "Gwangalli Beach Sunset",        category: "Attraction", location: "Suyeong-gu", time: "17:30", duration: "1h",  tips: "[MOCK] Great view of Gwangandaegyo Bridge." },
  ];

  // Day 3+ 공통 순환 템플릿
  const DAY3_PLUS_TEMPLATES: MockPlace[] = [
    { name: "Haedong Yonggungsa Temple",     category: "Attraction", location: "Gijang-gun", time: "09:30", duration: "2h",  tips: "[MOCK] Arrive early — parking gets full by 10 AM." },
    { name: "BIFF Square Street Food",       category: "Market",     location: "Nampo-dong", time: "15:00", duration: "1h",  tips: "[MOCK] Famous for ssiat hotteok (seed pancake)." },
    { name: "Taejongdae Coastal Walk",       category: "Attraction", location: "Yeongdo-gu", time: "14:00", duration: "2h",  tips: "[MOCK] Take the Danubi Train inside the park." },
    { name: "Michelin Lunch — Busan Gukbap", category: "Restaurant", location: "Seomyeon",   time: "12:30", duration: "1h",  tips: "[MOCK] Order 돼지국밥 (pork soup rice). ₩8,000." },
    { name: "Oryukdo Skywalk",               category: "Attraction", location: "Nam-gu",     time: "15:00", duration: "1h",  tips: "[MOCK] Glass-floor walkway over the sea." },
    { name: "Haeundae Beach Morning Walk",   category: "Attraction", location: "Haeundae",   time: "09:00", duration: "1h",  tips: "[MOCK] Best before 10 AM for fewer crowds." },
    { name: "Gwangalli Beach Sunset",         category: "Attraction", location: "Suyeong-gu", time: "17:30", duration: "1h",  tips: "[MOCK] Great view of Gwangandaegyo Bridge at night." },
    { name: "Busan Tower Night View",        category: "Attraction", location: "Nampo-dong", time: "20:00", duration: "1h",  tips: "[MOCK] ₩12,000 entry. Best at night." },
  ];

  // 아침 도착 / 일반 Day 1 전체 스케줄 템플릿 (비저녁 도착 Day 1용)
  const DAY1_FULL_TEMPLATES: MockPlace[] = [
    { name: `${startArea} Arrival Check-in`,  category: "Experience", location: startArea,    time: `${String(arrivalHour).padStart(2,"0")}:00`, duration: "1h",    tips: "[MOCK] Check in to your hotel and freshen up." },
    { name: "Gamcheon Culture Village",        category: "Attraction", location: "Saha-gu",    time: "10:30",                                     duration: "2h",    tips: "[MOCK] Wear comfortable shoes — steep hills." },
    { name: "Jagalchi Fish Market",            category: "Market",     location: "Nampo-dong", time: "14:00",                                     duration: "1h 30m", tips: "[MOCK] Try fresh seafood on the 2nd floor dining area." },
    { name: "Gwangalli Beach Sunset",          category: "Attraction", location: "Suyeong-gu", time: "17:30",                                     duration: "1h",    tips: "[MOCK] Great view of Gwangandaegyo Bridge." },
  ];

  const days = Array.from({ length: numDays }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];

    let places: MockPlace[];
    if (i === 0 && isEveningArrival) {
      // Day 1 저녁 도착: 도착 + 야시장 2개
      places = DAY1_EVENING_TEMPLATES;
    } else if (i === 0) {
      // Day 1 비저녁 도착: 도착 + 당일 스케줄
      places = DAY1_FULL_TEMPLATES;
    } else if (i === 1) {
      // Day 2: 도착 지역 기반 모닝 시작
      places = DAY2_TEMPLATES;
    } else {
      // Day 3+: 공통 순환
      const offset = (i - 2) * 4;
      places = DAY3_PLUS_TEMPLATES.slice(offset % DAY3_PLUS_TEMPLATES.length, (offset % DAY3_PLUS_TEMPLATES.length) + 4);
    }

    return {
      date: dateStr,
      dayNumber: i + 1,
      places: places.map(p => ({
        ...p,
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + " " + city + " Korea")}`,
      })),
    };
  });

  return { days };
}

// ── 모의 모드 활성 조건 ────────────────────────────────────────────────────
// 우선순위 (높은 순):
//   1. FORCE_LIVE_API=true  → 무조건 Live (대표 품질 확인용, HARNESS_SKIP_GEMINI 무시)
//   2. MOCK_GEMINI=1        → 무조건 Mock  (개발자 명시적 Mock 강제)
//   3. HARNESS_SKIP_GEMINI=1 → Mock (harness/pre-push 비용 방어)
//   4. NODE_ENV=development/test → Mock (기본 개발 환경)
//   5. 그 외 → Live (프로덕션)
function isMockMode(): boolean {
  // FORCE_LIVE_API=true: 대표 품질 확인 시 최우선 Live 스위치
  // HARNESS_SKIP_GEMINI=1이 함께 설정되어 있어도 Live 허용
  if (process.env.FORCE_LIVE_API === "true") {
    return false;
  }
  // 명시적 Mock 플래그 (FORCE_LIVE_API 없을 때만 적용)
  if (
    process.env.MOCK_GEMINI === "1" ||
    process.env.HARNESS_SKIP_GEMINI === "1"
  ) {
    return true;
  }
  // 기본: 개발/테스트 환경은 Mock
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  );
}

function subtractMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = ((h * 60 + (m ?? 0)) - mins + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ── VisitBusan Mega Events (parity with Cloudflare functions) ─────────────
interface MegaEvent {
  title: string;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  startTime?: string;
  endTime?: string;
}

const MEGA_EVENTS: MegaEvent[] = [
  {
    title: "Gwangalli M Drone Light Show — BTS THE CITY ARIRANG BUSAN (광안리 M드론 라이트쇼)",
    startDate: "2026-06-12",
    endDate:   "2026-06-13",
    location:  "Gwangalli Beach, 219 Gwanganbeolli-ro, Suyeong-gu, Busan (수영구 광안해변로 219)",
    description: "World-scale M-drone light show at Gwangalli Beach. BTS Arirang Busan edition. Official: https://www.visitbusan.net",
    startTime: "22:00",
  },
  {
    title: "The Red Moment Busan (더 레드 모먼트 부산)",
    startDate: "2026-06-11",
    endDate:   "2026-06-13",
    location:  "Busan (venue TBA)",
    description: "Special evening event in Busan. 19:00–20:30. Official: https://www.visitbusan.net",
    startTime: "19:00",
    endTime:   "20:30",
  },
  {
    title: "Port Village Busan 2026 (포트 빌리지 부산 2026)",
    startDate: "2026-06-09",
    endDate:   "2026-06-14",
    location:  "Busan Port area (부산항 일대)",
    description: "Multi-cultural festival at Busan Port. Official: https://www.visitbusan.net",
  },
  {
    title: "2026 Byeolbada Busan Night Market (별바다부산 나이트마켓)",
    startDate: "2026-06-01",
    endDate:   "2026-08-31",
    location:  "Haeundae area, Busan (해운대구 일대)",
    description: "Busan's signature summer night market series. Official: https://www.visitbusan.net",
  },
  {
    title: "2026 Busan Gourmet Selection (부산 고메 셀렉션)",
    startDate: "2026-06-04",
    endDate:   "2026-06-30",
    location:  "Participating restaurants across Busan (부산 전역 참여 레스토랑)",
    description: "Busan's premier gourmet dining event. Official: https://www.visitbusan.net",
  },
  {
    title: "2026 Big Banana Busan Night Market (빅바나나 부산 나이트마켓)",
    startDate: "2026-06-01",
    endDate:   "2026-08-31",
    location:  "Busan (venue TBA — check Visit Busan official site)",
    description: "Visit Busan official summer night market. K-POP stages, street food, cultural experiences. Official: https://www.visitbusan.net",
  },
  {
    title: "BTS THE CITY ARIRANG BUSAN — Welcome Centers (Gimhae Airport & Busan Station)",
    startDate: "2026-06-09",
    endDate:   "2026-06-13",
    location:  "Gimhae International Airport (arrival hall) & Busan Station Eurasia Plaza",
    description: "Official Visit Busan ARMY welcome centers. Free city guides, BTS THE CITY event schedule, and limited welcome kits. Open during arrival hours June 9–13. Official: https://www.visitbusan.net",
  },
];

function getOverlappingMegaEvents(tripStart: string, tripEnd: string): MegaEvent[] {
  const ts = new Date(tripStart).getTime();
  const te = new Date(tripEnd).getTime();
  return MEGA_EVENTS.filter(ev => {
    const es = new Date(ev.startDate).getTime();
    const ee = new Date(ev.endDate).getTime();
    return es <= te && ee >= ts;
  });
}

function getBTSDroneShowDate(tripStart: string, tripEnd: string): string | null {
  const ts = new Date(tripStart);
  const te = new Date(tripEnd);
  for (const d of ["2026-06-12", "2026-06-13"]) {
    const dt = new Date(d);
    if (dt >= ts && dt <= te) return d;
  }
  return null;
}

export async function POST(request: NextRequest) {
  let body: {
    city: string; startDate: string; endDate: string;
    travelers: string; travelStyle: string;
    startLocation?: string; arrivalTime?: string;
    preferredSpots?: string[];
    departurePlace?: string; departureTime?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { city, startDate, endDate, travelers, travelStyle, startLocation, arrivalTime, preferredSpots, departurePlace, departureTime } = body;
  if (!city || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── 개발·테스트 환경: 실 API 호출 없이 모의 데이터 즉시 반환 ──────────────
  if (isMockMode()) {
    console.log(`[generate-itinerary] MOCK MODE (NODE_ENV=${process.env.NODE_ENV}) — skipping Gemini API call`);
    return NextResponse.json(buildMockItinerary(city, startDate, endDate, startLocation, arrivalTime));
  }

  // ── 프로덕션 전용: 실제 Gemini API 키 검증 ───────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const numDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // ── 도착 시간 파싱 ──────────────────────────────────────────────────────
  const arrivalHour = arrivalTime ? parseInt(arrivalTime.split(":")[0] ?? "14", 10) : 14;
  const loc = startLocation?.toLowerCase() ?? "";

  // ── 시간대 분류 ────────────────────────────────────────────────────────
  const isMorningArrival   = arrivalHour < 12;                         // 09:00 이전
  const isNoonArrival      = arrivalHour >= 12 && arrivalHour < 15;   // 12:00~14:59
  const isAfternoonArrival = arrivalHour >= 15 && arrivalHour < 17;   // 15:00~16:59
  const isEveningArrival   = arrivalHour >= 17 && arrivalHour < 20;   // 17:00~19:59  ← 핵심 케이스
  const isNightArrival     = arrivalHour >= 20;                       // 20:00 이후

  // ── 공항 저녁 도착 감지 ────────────────────────────────────────────────
  const isAirportEvening =
    (loc.includes("airport") || loc.includes("gimhae") || loc.includes("공항")) &&
    (isEveningArrival || isNightArrival);

  // ── Location Anchor 감지 ───────────────────────────────────────────────
  const anchor = detectLocationAnchor(loc);

  // ────────────────────────────────────────────────────────────────────────
  //  Day 1 프롬프트 블록 생성
  // ────────────────────────────────────────────────────────────────────────

  let day1Block = "";

  if (isAirportEvening) {
    // ── CASE A: 김해공항 저녁 도착 → 처방형 고정 템플릿 (리무진 + 야시장) ──
    const market2Time = String(Math.min(arrivalHour + 1, 22)).padStart(2, "0") + ":00";
    day1Block = `
══════════════════════════════════════
MANDATORY Day 1 TEMPLATE — DO NOT MODIFY. Copy EXACTLY.
══════════════════════════════════════
Day 1 date: ${startDate}

Place 1 (index 0 — FIXED):
  name: "Gimhae Airport Limousine → Nampo-dong"
  category: "Experience"
  location: "Gimhae International Airport Arrivals → Nampo-dong, Jung-gu, Busan"
  time: "${arrivalTime}"
  duration: "45 min"
  tips: "Airport Limousine Bus Line 3 (공항리무진 3번) departs every 20 min from Arrivals Exit 1. Drop-off: Nampo-dong / Gwangbok-ro. Ticket ₩8,000 at the booth (cash or T-money). ~40 min ride. Activate your Korea eSIM on the bus — you will need navigation as soon as you step off."
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Gimhae+International+Airport+Busan+Korea"

Place 2 (index 1 — FIXED):
  name: "Bupyeong Kkangtong Night Market (부평깡통야시장)"
  category: "Market"
  location: "Bupyeong-dong, Jung-gu, Busan — 5 min walk from Nampo-dong limousine stop"
  time: "${market2Time}"
  duration: "1h 30 min"
  tips: "Busan's iconic night market, open until midnight. Must-try: tteokbokki, hotteok, bindaetteok. Cash preferred; some stalls accept card. Completely solo-friendly — just point at what you want. Lively even on weeknights."
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Bupyeong+Kkangtong+Night+Market+Busan+Korea"

ABSOLUTE RULES for Day 1 (AIRPORT EVENING):
- Output ONLY the 2 places listed above for Day 1. ZERO additional places.
- DO NOT add: Haeundae Beach, Gwangalli, Centum City, BIFF Square, Taejongdae, Haedong Yonggungsa, or ANY location more than 15 min from Nampo-dong.
- DO NOT add any Morning, Breakfast, or Lunch slots. This traveler arrives in the EVENING.
- From Day 2 onward: generate freely for ${travelers} traveler(s), ${travelStyle} style.
══════════════════════════════════════`;

  } else if (anchor && (isEveningArrival || isNightArrival)) {
    // ── CASE B: 특정 지역(남포동 등) + 저녁 도착 → Location Anchor + 저녁 스킵 ──
    const anchorTime = arrivalTime ?? `${String(arrivalHour).padStart(2, "0")}:00`;
    day1Block = `
══════════════════════════════════════
Day 1 LOCATION ANCHOR + EVENING ARRIVAL RULES
══════════════════════════════════════
The traveler arrives at: ${anchor.displayName}
Arrival time: ${anchorTime} (EVENING — ${arrivalHour}:00)

MANDATORY Day 1 rules:
1. SKIP Morning (before 12:00) and Lunch (12:00–16:59) time slots completely.
   → First place time must be ${anchorTime} or later.
2. ALL Day 1 places MUST be located within: ${anchor.radius}.
3. Allowed zones for Day 1: ${anchor.allowedZones.join(", ")}.
4. PROHIBITED on Day 1: ${anchor.prohibitedZones.join(", ")}.
5. Evening spot suggestions for this area: ${anchor.eveningSpots}.
6. Include 2–3 evening/night spots for Day 1 only (dinner, night market, night view).
7. Day 2 MORNING (09:00–12:00): MUST start near ${anchor.displayName} — a local breakfast or morning activity within: ${anchor.allowedZones.slice(0, 3).join(", ")}. Do NOT place Haeundae Beach, Gwangalli Beach, or any distant spot as the first activity of Day 2 morning.
8. From Day 2 afternoon (14:00+) and Day 3 onward: generate freely for ${travelers} traveler(s), ${travelStyle} style.
══════════════════════════════════════`;

  } else if (anchor && isAfternoonArrival) {
    // ── CASE C: 특정 지역 + 오후 도착 → Location Anchor, 오전 스킵 ──
    day1Block = `
Day 1 LOCATION ANCHOR (AFTERNOON ARRIVAL):
- Traveler arrives at ${anchor.displayName} around ${arrivalTime}.
- SKIP Morning activities. Start from afternoon (${arrivalTime} or later).
- All Day 1 places must be within: ${anchor.allowedZones.join(", ")}.
- PROHIBITED: ${anchor.prohibitedZones.join(", ")}.
- From Day 2 onward: generate freely for ${travelers} traveler(s), ${travelStyle} style.`;

  } else if (anchor && isNoonArrival) {
    // ── CASE C2: 특정 지역 + 점심 도착 (KTX 부산역 점심 등) → Anchor 강제 적용 ──
    day1Block = `
══════════════════════════════════════
Day 1 LOCATION ANCHOR — NOON / LUNCH ARRIVAL (MANDATORY)
══════════════════════════════════════
The traveler arrives at: ${anchor.displayName}
Arrival time: ${arrivalTime} (NOON — lunch time)

ABSOLUTE Day 1 rules:
1. SKIP ALL morning activities (09:00–11:59). Day 1 first place time MUST be ${arrivalTime} or later.
2. ALL Day 1 places MUST be physically located within: ${anchor.allowedZones.join(", ")}.
3. STRICTLY PROHIBITED on Day 1: ${anchor.prohibitedZones.join(", ")}.
   → Do NOT place Haeundae, Gwangalli, or any far district on Day 1.
4. Start with a lunch restaurant near ${anchor.displayName}, then afternoon and evening spots in the same area.
5. Include 3–4 spots total for Day 1 (lunch, afternoon activity, evening/dinner).
6. From Day 2 onward: generate freely for ${travelers} traveler(s), ${travelStyle} style.
══════════════════════════════════════`;

  } else if (anchor && isMorningArrival) {
    // ── CASE C3: 특정 지역 + 아침 도착 → Anchor 강제 적용, 풀데이 ──
    day1Block = `
Day 1 LOCATION ANCHOR (MORNING ARRIVAL):
- Traveler arrives at ${anchor.displayName} around ${arrivalTime} (MORNING).
- Start the full day near the arrival area.
- ALL Day 1 places MUST be within: ${anchor.allowedZones.join(", ")}.
- PROHIBITED on Day 1: ${anchor.prohibitedZones.join(", ")}.
- Include breakfast near ${anchor.displayName}, then morning + afternoon + evening sightseeing in anchor zone.
- From Day 2 onward: generate freely for ${travelers} traveler(s), ${travelStyle} style.`;

  } else if (isEveningArrival) {
    // ── CASE D: 저녁 도착 (특정 지역 없음) → Morning + Lunch 완전 스킵 ──
    day1Block = `
IMPORTANT Day 1 — EVENING ARRIVAL:
- Traveler arrives at ${startLocation ?? city} at ${arrivalTime} (EVENING).
- ABSOLUTE RULE: Do NOT schedule ANY morning, breakfast, or lunch activities on Day 1.
- Day 1 time slots must start at ${arrivalTime} or later.
- Include 2–3 evening spots only: dinner restaurant, night market, night view, or rooftop bar near ${startLocation ?? city}.
- No daytime sightseeing. The traveler will be tired from travel.
- From Day 2 onward: full day schedule starting from morning.`;

  } else if (isNightArrival) {
    // ── CASE E: 야간 도착 → 당일 1개 야경 스팟만 ──
    day1Block = `
IMPORTANT Day 1 — NIGHT ARRIVAL:
- Traveler arrives very late at ${arrivalTime}. 
- Day 1 must have ONLY 1 spot: a simple nearby night view, snack spot, or hotel check-in activity.
- No morning, lunch, or afternoon activities on Day 1.
- From Day 2 onward: full day schedule starting from morning.`;

  } else if (isMorningArrival) {
    // ── CASE F: 아침 도착 → 풀데이 ──
    day1Block = `Day 1: Traveler arrives in the morning (${arrivalTime}). Start with breakfast near ${startLocation ?? city}, then full morning + afternoon sightseeing.`;

  } else if (isNoonArrival) {
    // ── CASE G: 오후 도착 → 오전 스킵 ──
    day1Block = `Day 1: Traveler arrives around ${arrivalTime}. Skip breakfast and morning activities. Start with check-in or late lunch near ${startLocation ?? city}, then afternoon and evening spots.`;
  }

  // ── locationNote: 앵커가 없고 공항 저녁도 아닐 때만 보충 ──────────────
  const locationNote =
    startLocation && !isAirportEvening && !anchor
      ? `Starting point / arrival location: ${startLocation}. On Day 1, begin the route near this location and sequence spots geographically outward.`
      : "";

  // ── 취향 스팟 우선 반영 ────────────────────────────────────────────────
  const preferredSpotsNote =
    preferredSpots && preferredSpots.length > 0
      ? `\nUSER'S SAVED FAVORITE SPOTS (must prioritize — include as many of these as possible across all days):\n${preferredSpots.map((s) => `  - ${s}`).join("\n")}\n`
      : "";

  // ── 마지막 날 출발 정보 블록 ────────────────────────────────────────────
  let lastDayBlock: string;
  if (departurePlace && departureTime) {
    const isAirport = departurePlace.toLowerCase().includes("airport") || departurePlace.toLowerCase().includes("gimhae");
    const buffer = isAirport ? 90 : 60;
    const cutoff = subtractMinutes(departureTime, buffer);
    lastDayBlock = `
LAST DAY (Day ${numDays}) — DEPARTURE RULES (MANDATORY):
- Traveler departs from: ${departurePlace} at ${departureTime}.
- Must arrive at departure point ${buffer} min early. Final activity MUST end by ${cutoff}.
- ALL spots on Day ${numDays} must be close to ${departurePlace} to minimize transit risk.
- Do NOT place any spot on the opposite side of the city from ${departurePlace} on Day ${numDays}.`;
  } else {
    lastDayBlock = `
LAST DAY (Day ${numDays}) — NO DEPARTURE INFO:
- No departure info provided. Keep Day ${numDays} light and central.
- Avoid long-distance or hard-to-reach spots on the last day.
- Prioritize spots near the city center or near the Day 1 starting area.`;
  }

  // ── VisitBusan Mega Events 블록 ──────────────────────────────────────
  const overlappingEvents = getOverlappingMegaEvents(startDate, endDate);
  const droneDate = getBTSDroneShowDate(startDate, endDate);

  const megaEventBlock = overlappingEvents.length > 0 ? `

╔══════════════════════════════════════════════════════╗
  VISITBUSAN OFFICIAL MEGA EVENTS — HIGHEST PRIORITY
╚══════════════════════════════════════════════════════╝
Real confirmed events during this trip. Integrate them on their exact dates.
All dates are in YYYY-MM-DD format — do NOT alter or approximate:

${overlappingEvents.map(ev =>
    `• [${ev.startDate} ~ ${ev.endDate}] ${ev.title}\n  Location: ${ev.location}${ev.startTime ? `\n  Time: ${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ""}` : ""}\n  ${ev.description}`
  ).join("\n\n")}` : "";

  const droneAnchorBlock = droneDate ? (() => {
    const dayNum =
      Math.ceil(
        (new Date(droneDate).getTime() - new Date(startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;
    return `

╔══════════════════════════════════════════════════════╗
  🔴 BTS DRONE SHOW ANCHOR — DAY ${dayNum} (${droneDate}) 22:00 FIXED
╚══════════════════════════════════════════════════════╝
SUPREME PRIORITY — overrides ALL other Day ${dayNum} location anchors and prohibited-zone lists.
Even if Gwangalli appears in a "prohibited" list above, it is REQUIRED on Day ${dayNum}.

MANDATORY: Include this EXACT entry in Day ${dayNum} places array — no substitutions:
  name: "Gwangalli M Drone Light Show — BTS THE CITY ARIRANG BUSAN"
  category: "Experience"
  location: "Gwangalli Beach, 219 Gwanganbeolli-ro, Suyeong-gu, Busan"
  time: "22:00"
  duration: "1 hour"
  tips: "World-scale M-drone show. Free entry. Arrive by 21:30 — beach fills up fast. Bring a jacket."
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Gwangalli+Beach+Busan+Korea"

Day ${dayNum} evening cluster (17:00–21:30): ALL spots in Gwangalli–Millak area:
  ✓ Gwangalli restaurant strip — dinner (~18:30)
  ✓ Millak Waterfront Park — evening walk (~20:00)
  ✓ Gwangan Bridge night-view café
  ✗ BANNED on Day ${dayNum} evening: Haeundae, Nampo-dong, Seomyeon, Centum City
  NOTE: If traveling from arrival point (e.g. Busan Station) to Gwangalli, ~25 min by subway — schedule departure by 17:30.`;
  })() : "";

  // ── 최종 프롬프트 ──────────────────────────────────────────────────────
  const prompt = `You are an expert Korea travel planner for foreign visitors.

Create a detailed ${numDays}-day itinerary for ${city}, Korea.
Travel dates: ${startDate} to ${endDate}
Number of travelers: ${travelers}
Travel style: ${travelStyle}
${locationNote}
${preferredSpotsNote}
${day1Block}
${lastDayBlock}
${megaEventBlock}
${droneAnchorBlock}

CRITICAL GLOBAL RULES (apply to ALL days):
1. ALWAYS follow the Day 1 time restrictions above. If the traveler arrives in the evening, Day 1 has NO morning or lunch slots.
2. For Day 2 and beyond: include 4–5 places per day, starting from morning.
3. All place times must be in HH:MM 24-hour format.
4. Geographically cluster spots by neighborhood each day to minimize transit time.
5. Focus on real, well-known spots in ${city}.
6. Tips must be practical for foreigners (cash/card info, transport, language tips).
7. STRICTLY follow the Last Day departure rules above.
8. NEVER recommend the "Jungkook Hometown Route" — do NOT include Baekyang Elementary/Middle School (백양초/중학교) in Mandeok-dong (만덕동) as a destination. Do not suggest any itinerary centered on Jungkook's childhood school or residential area in Buk-gu. This content has been retired.

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "dayNumber": 1,
      "places": [
        {
          "name": "Place name in English",
          "category": "Attraction | Restaurant | Cafe | Market | Museum | Park | Shopping | Experience",
          "location": "District or neighborhood name",
          "time": "HH:MM",
          "duration": "X hours",
          "tips": "Practical tip for foreign visitors (payment, language, transport, etc.)",
          "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=ENCODED+PLACE+NAME+${city}+Korea"
        }
      ]
    }
  ]
}

Additional rules:
- googleMapsUrl must use proper URL encoding for spaces (use + not %20)
- Dates must follow the travel dates in order starting from ${startDate}
- For Day 1 evening/night arrivals: the "places" array starts ONLY from the arrival time — no earlier entries`;

  let lastError: Error = new Error("Unknown error");

  for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // 비용 방어 로그 — API Key는 절대 출력하지 않음
        console.log(
          `[Gemini Live Call] ${new Date().toISOString()} | route=next-api/generate-itinerary | model=${model} | attempt=${attempt + 1}/${MAX_RETRIES} | FORCE_LIVE_API=${process.env.FORCE_LIVE_API ?? "not_set"} | HARNESS_SKIP_GEMINI=${process.env.HARNESS_SKIP_GEMINI ?? "not_set"} | mock=false`
        );
        const result = await callGemini(apiKey, model, prompt);
        return NextResponse.json(result);
      } catch (err) {
        lastError = err as Error;
        const status = parseInt(lastError.message.match(/Gemini (\d+)/)?.[1] || "0");
        // 429 쿼터 초과 — 재시도 없이 즉시 에러 반환 (비용 누수 방지)
        if (status === 429) break;
        if (status === 503 && attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        break;
      }
    }
  }

  return NextResponse.json({ error: lastError.message }, { status: 500 });
}
