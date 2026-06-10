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
  const isHaeundaeAnchor = la.includes("haeundae") || la.includes("해운대") || la.includes("centum") || la.includes("센텀");
  const isNampoAnchor    = la.includes("nampo") || la.includes("남포") || la.includes("jagalchi") || la.includes("biff") || la.includes("gwangbok");

  type MockPlace = { name: string; category: string; location: string; time: string; duration: string; tips: string };
  const DAY2_TEMPLATES: MockPlace[] = isHaeundaeAnchor ? [
    { name: "Haeundae Beach Morning Walk",   category: "Attraction", location: "Haeundae",   time: "09:00", duration: "1h",  tips: "[MOCK] Best before 10 AM for fewer crowds." },
    { name: "Dongbaekseom Island Walk",      category: "Attraction", location: "Haeundae",   time: "11:00", duration: "1h",  tips: "[MOCK] Free entry. Scenic coastal path around the island." },
    { name: "Centum City — SHINSEGAE",       category: "Shopping",   location: "Centum City",time: "14:00", duration: "2h",  tips: "[MOCK] World's largest department store. Free Wi-Fi inside." },
    { name: "Marine City Rooftop Bar",       category: "Experience", location: "Marine City",time: "18:00", duration: "1h",  tips: "[MOCK] Best city + sea view at sunset." },
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
    { name: "Centum City Shopping",          category: "Shopping",   location: "Haeundae",   time: "14:00", duration: "2h",  tips: "[MOCK] Shinsegae — world's largest department store." },
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
// FORCE_LIVE_API=true 가 선언되면 개발 환경에서도 실 Gemini API를 호출한다.
// 단, HARNESS_SKIP_GEMINI=1 (pre-push 하네스) 또는 MOCK_GEMINI=1 은
// FORCE_LIVE_API보다 항상 우선 적용되어 하네스 검증을 보호한다.
function isMockMode(): boolean {
  // 하네스·명시적 mock 플래그는 최우선 — FORCE_LIVE_API로도 뚫리지 않음
  if (
    process.env.HARNESS_SKIP_GEMINI === "1" ||
    process.env.MOCK_GEMINI === "1"
  ) {
    return true;
  }
  // 강제 라이브 스위치: 개발·테스트 환경에서도 실 API 호출
  if (process.env.FORCE_LIVE_API === "true") {
    return false;
  }
  // 기본: 개발/테스트 환경은 Mock
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  );
}

export async function POST(request: NextRequest) {
  let body: {
    city: string; startDate: string; endDate: string;
    travelers: string; travelStyle: string;
    startLocation?: string; arrivalTime?: string;
    preferredSpots?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { city, startDate, endDate, travelers, travelStyle, startLocation, arrivalTime, preferredSpots } = body;
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

  // ── 최종 프롬프트 ──────────────────────────────────────────────────────
  const prompt = `You are an expert Korea travel planner for foreign visitors.

Create a detailed ${numDays}-day itinerary for ${city}, Korea.
Travel dates: ${startDate} to ${endDate}
Number of travelers: ${travelers}
Travel style: ${travelStyle}
${locationNote}
${preferredSpotsNote}
${day1Block}

CRITICAL GLOBAL RULES (apply to ALL days):
1. ALWAYS follow the Day 1 time restrictions above. If the traveler arrives in the evening, Day 1 has NO morning or lunch slots.
2. For Day 2 and beyond: include 4–5 places per day, starting from morning.
3. All place times must be in HH:MM 24-hour format.
4. Geographically cluster spots by neighborhood each day to minimize transit time.
5. Focus on real, well-known spots in ${city}.
6. Tips must be practical for foreigners (cash/card info, transport, language tips).

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
        const result = await callGemini(apiKey, model, prompt);
        return NextResponse.json(result);
      } catch (err) {
        lastError = err as Error;
        const status = parseInt(lastError.message.match(/Gemini (\d+)/)?.[1] || "0");
        if (status === 503 || status === 429) {
          if (attempt < MAX_RETRIES - 1) {
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            continue;
          }
          break;
        }
        break;
      }
    }
  }

  return NextResponse.json({ error: lastError.message }, { status: 500 });
}
