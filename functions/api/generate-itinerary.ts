interface Env {
  GEMINI_API_KEY: string;
}

// Node.js process.env 접근 허용 (하네스/테스트 런너 전용)
declare const process: { env: Record<string, string | undefined> };

interface RequestBody {
  city: string;
  startDate: string;
  endDate: string;
  travelers: string;
  travelStyle: string;
  startLocation?: string;
  arrivalTime?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOCATION ANCHOR SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

interface LocationAnchor {
  displayName: string;
  radius: string;
  allowedZones: string[];
  prohibitedZones: string[];
  eveningSpots: string;
}

function detectLocationAnchor(loc: string): LocationAnchor | null {
  const l = loc.toLowerCase();

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
        "Seomyeon (서면)", "Gijang", "Haedong Yonggungsa", "Jangsan",
      ],
      eveningSpots:
        "Bupyeong Kkangtong Night Market (부평깡통야시장 — open until midnight), " +
        "Jagalchi Fish Market evening (open until 21:00), " +
        "Gwangbok-ro pedestrian street (광복로 야경), " +
        "Nampo-dong street food alley, " +
        "Busan Tower (부산타워) night view from Yongdusan Park",
    };
  }

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

  if (
    l.includes("ktx") || l.includes("busan station") ||
    l.includes("부산역") || l.includes("seomyeon")
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

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MEGA EVENTS — VisitBusan Official (비짓부산 실시간 공식 행사)
// ─────────────────────────────────────────────────────────────────────────────

interface MegaEvent {
  title: string;
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  location: string;
  description: string;
  startTime?: string;
  endTime?: string;
}

export const MEGA_EVENTS: MegaEvent[] = [
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

// ─────────────────────────────────────────────────────────────────────────────
//  GEMINI UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const MODELS = [
  "gemini-2.5-flash",
];
const MAX_RETRIES = 3;   // 5→3: 비용 방어 (503 재시도만, 429는 즉시 종료)
const RETRY_DELAY_MS = 3000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string
): Promise<unknown> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      }),
    }
  );

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errBody = (await response.json()) as {
        error?: { message?: string; status?: string };
      };
      detail =
        errBody?.error?.message ?? errBody?.error?.status ?? response.statusText;
    } catch {
      // keep statusText
    }
    throw new Error(`Gemini ${response.status} [${model}]: ${detail}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error(`Empty response from model: ${model}`);

  // responseMimeType=json 이어도 방어적으로 파싱
  const trimmed = rawText.trim();
  const jsonStart = trimmed.search(/[{[]/);
  const cleaned = jsonStart > 0 ? trimmed.slice(jsonStart) : trimmed;
  return JSON.parse(cleaned);
}

// ─────────────────────────────────────────────────────────────────────────────
//  PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt(
  city: string,
  startDate: string,
  endDate: string,
  numDays: number,
  travelers: string,
  travelStyle: string,
  startLocation: string,
  arrivalTime: string,
  arrivalHour: number
): string {
  const loc = startLocation.toLowerCase();
  const anchor = detectLocationAnchor(loc);

  const isMorningArrival   = arrivalHour < 12;
  const isNoonArrival      = arrivalHour >= 12 && arrivalHour < 15;
  const isAfternoonArrival = arrivalHour >= 15 && arrivalHour < 17;
  const isEveningArrival   = arrivalHour >= 17 && arrivalHour < 20;
  const isNightArrival     = arrivalHour >= 20;

  const isAirportEvening =
    (loc.includes("airport") || loc.includes("gimhae") || loc.includes("공항")) &&
    (isEveningArrival || isNightArrival);

  let day1Block = "";

  if (isAirportEvening) {
    const market2Time = String(Math.min(arrivalHour + 1, 22)).padStart(2, "0") + ":00";
    day1Block = `
╔══════════════════════════════════════════════════════╗
  MANDATORY Day 1 TEMPLATE — COPY EXACTLY, DO NOT ALTER
╚══════════════════════════════════════════════════════╝
Day 1 date: ${startDate}

The traveler lands at Gimhae Airport at ${arrivalTime}.
They CANNOT be at any attraction before ${arrivalTime}.
The ONLY valid Day 1 places are the two below. No substitutions.

Place 1 — FIXED (copy verbatim):
  name: "Gimhae Airport Limousine → Nampo-dong"
  category: "Experience"
  location: "Gimhae International Airport Arrivals → Nampo-dong, Jung-gu, Busan"
  time: "${arrivalTime}"
  duration: "45 min"
  tips: "Airport Limousine Bus Line 3 (공항리무진 3번) departs every 20 min from Arrivals Exit 1. Drop-off: Nampo-dong / Gwangbok-ro. Ticket ₩8,000 at the booth (cash or T-money). ~40 min ride."
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Gimhae+International+Airport+Busan+Korea"

Place 2 — FIXED (copy verbatim):
  name: "Bupyeong Kkangtong Night Market (부평깡통야시장)"
  category: "Market"
  location: "Bupyeong-dong, Jung-gu, Busan — 5 min walk from Nampo-dong limousine stop"
  time: "${market2Time}"
  duration: "1h 30 min"
  tips: "Busan's iconic night market, open until midnight. Must-try: tteokbokki, hotteok, bindaetteok. Cash preferred; some stalls accept card. Solo-friendly."
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Bupyeong+Kkangtong+Night+Market+Busan+Korea"

DAY 1 ABSOLUTE PROHIBITIONS:
✗ DO NOT add Haeundae Beach — traveler is at Nampo-dong, 40 min away.
✗ DO NOT add Gwangalli, Centum City, BIFF Square, Taejongdae.
✗ DO NOT add Morning or Lunch slots — traveler lands in the EVENING.
✗ Day 1 "places" array has EXACTLY 2 entries. No more, no less.

From Day 2 onward: generate freely for ${travelers} traveler(s), ${travelStyle} style.`;

  } else if (anchor && (isEveningArrival || isNightArrival)) {
    const anchorTime = arrivalTime || `${String(arrivalHour).padStart(2, "0")}:00`;
    day1Block = `
╔══════════════════════════════════════════════════════╗
  HARD CONSTRAINT — Day 1 PHYSICAL ARRIVAL RESTRICTION
╚══════════════════════════════════════════════════════╝
The traveler arrives at: ${anchor.displayName}
Arrival time: ${anchorTime}

The traveler is physically at ${anchor.displayName} starting ${anchorTime}.
They CANNOT visit any place before ${anchorTime}.
They CANNOT travel far from ${anchor.displayName} on Day 1.

DAY 1 BINDING RULES (not suggestions — incorrect output if violated):

RULE 1 — TIME CONSTRAINT:
  • The time field of EVERY Day 1 place MUST be "${anchorTime}" or later.
  • A place with time "09:00", "10:00", "11:00", "12:00", "14:00", "16:00", or any
    time before "${anchorTime}" on Day 1 is WRONG. Do not generate it.

RULE 2 — LOCATION CONSTRAINT:
  • ALL Day 1 places MUST be in one of these zones (within 15 min of ${anchor.displayName}):
    ${anchor.allowedZones.map(z => `    → ${z}`).join("\n")}

RULE 3 — PROHIBITED LOCATIONS on Day 1:
  These places are far from ${anchor.displayName} and physically unreachable on Day 1:
    ${anchor.prohibitedZones.map(z => `    ✗ ${z}`).join("\n")}

RULE 4 — CONTENT:
  • Include only 2–3 evening/night spots on Day 1 (dinner, night market, night view).
  • Suggested evening spots near ${anchor.displayName}:
    ${anchor.eveningSpots}

RULE 5 — Day 2+:
  • Day 2 onward: generate full day schedule freely (morning to evening) anywhere in ${city}.
  • ${travelers} traveler(s), ${travelStyle} travel style.`;

  } else if (anchor && isAfternoonArrival) {
    day1Block = `
DAY 1 — AFTERNOON ARRIVAL AT ${anchor.displayName.toUpperCase()} (${arrivalTime}):
• SKIP all morning activities (before ${arrivalTime}).
• First place on Day 1 must be at ${arrivalTime} or later.
• ALL Day 1 places must be within: ${anchor.radius}.
• Allowed zones: ${anchor.allowedZones.join(", ")}.
• PROHIBITED on Day 1: ${anchor.prohibitedZones.join(", ")}.
• From Day 2 onward: generate freely anywhere in ${city}.`;

  } else if (isEveningArrival) {
    day1Block = `
DAY 1 — EVENING ARRIVAL AT ${(startLocation || city).toUpperCase()} (${arrivalTime}):
• The traveler physically cannot visit anywhere before ${arrivalTime}.
• Day 1 place times MUST all be ≥ ${arrivalTime}.
• DO NOT schedule Morning, Breakfast, or Lunch on Day 1.
• Include 2–3 evening spots only: dinner, night market, night view, or rooftop bar.
• Keep Day 1 places close to ${startLocation || city} arrival area.
• From Day 2 onward: full day schedule starting from morning.`;

  } else if (isNightArrival) {
    day1Block = `
DAY 1 — NIGHT ARRIVAL (${arrivalTime}):
• Traveler arrives very late. Day 1 has ONLY 1 place maximum.
• That 1 place must be at ${arrivalTime} or later (nearby late-night snack or hotel area).
• NO morning, lunch, or afternoon activities on Day 1.
• From Day 2 onward: full day schedule starting from morning.`;

  } else if (isMorningArrival) {
    day1Block = `Day 1 — Morning arrival (${arrivalTime}) near ${startLocation || city}. Start with breakfast nearby, then full morning + afternoon sightseeing.`;

  } else if (isNoonArrival) {
    day1Block = `Day 1 — Noon arrival (${arrivalTime}) near ${startLocation || city}. Skip breakfast and morning activities. Start with late lunch nearby, then afternoon and evening spots.`;
  }

  const locationNote =
    startLocation && !isAirportEvening && !anchor
      ? `Traveler arrives at: ${startLocation}. Day 1 must begin near this location.`
      : "";

  // Build final reminder for evening/night arrivals
  const day1Reminder = (isEveningArrival || isNightArrival) && anchor
    ? `
PRE-OUTPUT CHECK (verify before generating JSON):
1. Does EVERY Day 1 place have time ≥ "${arrivalTime}"? If NO → fix it.
2. Are ALL Day 1 places within ${anchor.radius}? If NO → replace with nearby alternatives.
3. Does Day 1 include any of these? ${anchor.prohibitedZones.join(", ")} → If YES → REMOVE them.`
    : (isEveningArrival || isNightArrival) && isAirportEvening
    ? `
PRE-OUTPUT CHECK: Day 1 should have EXACTLY 2 places matching the template above.`
    : "";

  // ── VisitBusan Mega Events ─────────────────────────────────────────────────
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

  return `You are an expert Korea travel planner for foreign visitors.
User input: city=${city}, dates=${startDate}→${endDate}, travelers=${travelers}, style=${travelStyle}
Arrival: startLocation="${startLocation || "(not specified)"}", arrivalTime="${arrivalTime}"

${locationNote}
${day1Block}
${megaEventBlock}
${droneAnchorBlock}

GLOBAL RULES (Days 2–${numDays} and all days without a constraint above):
1. Include 4–5 places per day, starting from morning.
2. All place times in HH:MM 24-hour format.
3. Cluster spots geographically each day to minimize transit time.
4. Focus on real, well-known spots in ${city}, Korea.
5. Tips must be practical for foreigners (cash/card, transport, language, hours).
${day1Reminder}

OUTPUT FORMAT: Return ONLY a raw JSON object. No markdown fences, no explanation text.

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
          "tips": "Practical tip for foreign visitors",
          "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=Place+Name+${city}+Korea"
        }
      ]
    }
  ]
}

Rules for JSON output:
- googleMapsUrl: use + for spaces in the query string
- dates: sequential from ${startDate} to ${endDate}
- Day 1 evening/night: places array contains ONLY entries with time ≥ "${arrivalTime}"
- Total days in output: exactly ${numDays}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  HARNESS ENTRY POINT (Node.js / test runner)
// ─────────────────────────────────────────────────────────────────────────────

export interface HarnessInput {
  startLocation: string;
  arrivalTime: string;           // "Morning"|"Evening"|"Night"|"HH:MM"
  travelDates: [string, string]; // [startDate, endDate]
}

export interface HarnessSlot { placeName: string }

export interface HarnessResult {
  days: Array<{
    slots: {
      morning?: HarnessSlot;
      lunch?:   HarnessSlot;
      evening?: HarnessSlot;
      night?:   HarnessSlot;   // 21:00+
    };
  }>;
}

export async function generateItineraryInternal(input: HarnessInput): Promise<HarnessResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment");

  const [startDate, endDate] = input.travelDates;

  // Parse human-readable arrivalTime label
  const t = input.arrivalTime.toLowerCase();
  let arrivalHour = 14;
  let arrivalTimeStr = "14:00";
  if      (t.includes("morning"))   { arrivalHour =  9; arrivalTimeStr = "09:00"; }
  else if (t.includes("noon"))      { arrivalHour = 12; arrivalTimeStr = "12:00"; }
  else if (t.includes("afternoon")) { arrivalHour = 14; arrivalTimeStr = "14:00"; }
  else if (t.includes("evening"))   { arrivalHour = 17; arrivalTimeStr = "17:00"; }
  else if (t.includes("night"))     { arrivalHour = 20; arrivalTimeStr = "20:00"; }
  else if (/^\d{2}:\d{2}$/.test(input.arrivalTime)) {
    arrivalHour = parseInt(input.arrivalTime.split(":")[0]!, 10);
    arrivalTimeStr = input.arrivalTime;
  }

  const numDays =
    Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  const prompt = buildPrompt(
    "Busan", startDate, endDate, numDays,
    "1", "Solo",
    input.startLocation, arrivalTimeStr, arrivalHour
  );

  let geminiResult: unknown = null;
  let lastErr = "unknown";

  outer: for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // 비용 방어 로그
        console.log(
          `[Gemini Live Call] ${new Date().toISOString()} | route=harness-internal | model=${model} | attempt=${attempt + 1}/${MAX_RETRIES} | mock=false`
        );
        geminiResult = await callGemini(apiKey, model, prompt);
        break outer;
      } catch (err) {
        lastErr = (err as Error).message;
        const status = parseInt(lastErr.match(/Gemini (\d+)/)?.[1] ?? "0");
        // 429 쿼터 초과 — 재시도 없이 즉시 실패 (비용 누수 방지)
        if (status === 429) break;
        if (status === 503 && attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        break;
      }
    }
  }

  if (!geminiResult) throw new Error(`Gemini all models failed: ${lastErr}`);

  const raw = geminiResult as {
    days?: Array<{ places?: Array<{ name: string; time?: string }> }>;
  };
  if (!Array.isArray(raw.days)) throw new Error("Gemini response missing 'days' array");

  // Transform places[] → slots format expected by the harness
  const days: HarnessResult["days"] = raw.days.map((day) => {
    const places = day.places ?? [];
    let morning: HarnessSlot | undefined;
    let lunch:   HarnessSlot | undefined;
    let evening: HarnessSlot | undefined;
    let night:   HarnessSlot | undefined;

    for (const p of places) {
      const h = parseInt((p.time ?? "12:00").split(":")[0]!, 10);
      if      (h < 12 && !morning)            morning = { placeName: p.name };
      else if (h >= 12 && h < 14 && !lunch)  lunch   = { placeName: p.name };
      else if (h >= 17 && h < 21 && !evening) evening = { placeName: p.name };
      else if (h >= 21 && !night)             night   = { placeName: p.name };
    }

    return { slots: { morning, lunch, evening, night } };
  });

  return { days };
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLOUDFLARE PAGES FUNCTION ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export const onRequestPost: (context: {
  request: Request;
  env: Env;
}) => Promise<Response> = async ({ request, env }) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  // API 키 사전 검증
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured on the server." }),
      { status: 500, headers: corsHeaders }
    );
  }

  // Request body 파싱
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body — expected JSON." }),
      { status: 400, headers: corsHeaders }
    );
  }

  const {
    city = "Busan",
    startDate,
    endDate,
    travelers = "1",
    travelStyle = "Solo",
    startLocation = "",
    arrivalTime = "14:00",
  } = body;

  if (!startDate || !endDate) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: startDate, endDate." }),
      { status: 400, headers: corsHeaders }
    );
  }

  const numDays =
    Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  const arrivalHour = arrivalTime
    ? parseInt(arrivalTime.split(":")[0] ?? "14", 10)
    : 14;

  const prompt = buildPrompt(
    city, startDate, endDate, numDays,
    travelers, travelStyle,
    startLocation, arrivalTime, arrivalHour
  );

  const allErrors: string[] = [];

  for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // 비용 방어 로그 — API Key는 절대 출력하지 않음
        console.log(
          `[Gemini Live Call] ${new Date().toISOString()} | route=cloudflare-pages-fn | model=${model} | attempt=${attempt + 1}/${MAX_RETRIES} | mock=false`
        );
        const result = await callGemini(apiKey, model, prompt);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: corsHeaders,
        });
      } catch (err) {
        const msg = (err as Error).message;
        allErrors.push(`[${model} attempt ${attempt + 1}] ${msg}`);

        const httpStatus = parseInt(msg.match(/Gemini (\d+)/)?.[1] ?? "0");
        // 429 쿼터 초과 — 재시도 없이 즉시 실패 (비용 누수 방지)
        if (httpStatus === 429) break;
        if (httpStatus === 503 && attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        break;
      }
    }
  }

  // 모든 모델 실패 → 솔직한 에러 반환 (Mock 데이터 없음)
  const lastError = allErrors[allErrors.length - 1] ?? "All Gemini models failed.";
  console.error("Gemini all models failed:", allErrors.join(" | "));
  return new Response(
    JSON.stringify({ error: `AI generation failed. Please try again. (${lastError})` }),
    { status: 500, headers: corsHeaders }
  );
};
