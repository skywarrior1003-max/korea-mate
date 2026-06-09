import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash"];
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

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
  }

  let body: { city: string; startDate: string; endDate: string; travelers: string; travelStyle: string; startLocation?: string; arrivalTime?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { city, startDate, endDate, travelers, travelStyle, startLocation, arrivalTime } = body;
  if (!city || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const numDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Arrival time logic for Day 1 scheduling
  const arrivalHour = arrivalTime ? parseInt(arrivalTime.split(":")[0] ?? "14", 10) : 14;

  const loc = startLocation?.toLowerCase() ?? "";
  const isAirportEvening =
    (loc.includes("airport") || loc.includes("gimhae") || loc.includes("공항")) &&
    arrivalHour >= 17;

  // ── 저녁 김해공항 도착: Day 1을 처방형 템플릿으로 강제 고정 ──────────
  // AI에게 자유 생성을 허용하지 않고 남포동/부평 구역을 명시적으로 지정.
  // 리무진·eSIM 수익 배관이 자연스럽게 연결되는 동선.
  const airportEveningTemplate = isAirportEvening ? `
MANDATORY Day 1 — DO NOT CHANGE. Output EXACTLY this structure for Day 1:
Day 1 date: ${startDate}
Place 1 (REQUIRED, first):
  name: "Gimhae Airport Limousine → Nampo-dong"
  category: "Experience"
  location: "Gimhae International Airport Arrivals → Nampo-dong, Jung-gu"
  time: "${arrivalTime}"
  duration: "45 min"
  tips: "Airport Limousine Bus Line 3 (공항리무진 3번) departs every 20 min from Arrivals Exit 1, Drop-off: Nampo-dong/Gwangbok-ro. Ticket ₩8,000 (cash or T-money card at the booth). ~40 min ride. Activate your Korea eSIM on the bus — you'll need navigation as soon as you step off."
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Gimhae+International+Airport+Busan+Korea"

Place 2 (REQUIRED, second):
  name: "Bupyeong Kkangtong Night Market (부평깡통야시장)"
  category: "Market"
  location: "Bupyeong-dong, Jung-gu — 5 min walk from Nampo-dong limousine stop"
  time: (arrival time + 60 minutes)
  duration: "1h 30 min"
  tips: "Busan's iconic night market, open until midnight. Must-try: tteokbokki, hotteok, bindaetteok (mung bean pancake). Cash preferred; some stalls accept card. Completely solo-friendly — just point at what you want. Lively even on weeknights."
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Bupyeong+Kkangtong+Night+Market+Busan+Korea"

STRICT Day 1 RULES:
- Output ONLY these 2 places for Day 1. No exceptions.
- PROHIBITED on Day 1: Haeundae Beach, Gwangalli, Centum City, BIFF Square, Taejongdae, Haedong Yonggungsa, any location more than 15 min from Nampo-dong.
- From Day 2 onward: generate freely based on ${travelers} traveler(s) and ${travelStyle} style.
` : "";

  const day1Notes = isAirportEvening
    ? airportEveningTemplate
    : arrivalHour < 12
    ? `Day 1: Traveler arrives in the morning (${arrivalTime}). Include breakfast near ${startLocation ?? city}, then full morning + afternoon sightseeing.`
    : arrivalHour < 15
    ? `Day 1: Traveler arrives around ${arrivalTime}. Skip breakfast/morning activities. Start with check-in or late lunch near ${startLocation ?? city}, then afternoon and evening spots.`
    : `Day 1: Traveler arrives late (${arrivalTime}). Day 1 should only have 1–2 evening spots near ${startLocation ?? city} such as a night market, rooftop bar, or bridge view. No daytime sightseeing on Day 1.`;

  const locationNote = startLocation && !isAirportEvening
    ? `Starting point / arrival location: ${startLocation}. On Day 1, begin the route near this location and sequence spots geographically outward.`
    : "";

  const prompt = `You are an expert Korea travel planner for foreign visitors.

Create a detailed ${numDays}-day itinerary for ${city}, Korea.
Travel dates: ${startDate} to ${endDate}
Number of travelers: ${travelers}
Travel style: ${travelStyle}
${locationNote}
${day1Notes}

CRITICAL Day 1 rule: strictly follow the arrival time instruction above. Do NOT schedule morning activities if the traveler arrives in the afternoon or evening.

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

Rules:
- Include 4-5 places per day (fewer on Day 1 if late arrival), ordered by time
- Focus on real, well-known spots in ${city}
- Tips must be practical for foreigners (Cash only, English menu available, T-money card needed, etc.)
- googleMapsUrl must use proper URL encoding for spaces
- Dates must follow the travel dates in order starting from ${startDate}
- Geographically cluster spots by neighborhood per day to minimize transit time`;

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
