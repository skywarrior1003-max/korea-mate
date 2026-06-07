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
  const day1Notes = arrivalHour < 12
    ? `Day 1: Traveler arrives in the morning (${arrivalTime}). Include breakfast near ${startLocation ?? city}, then full morning + afternoon sightseeing.`
    : arrivalHour < 15
    ? `Day 1: Traveler arrives around ${arrivalTime}. Skip breakfast/morning activities. Start with check-in or a late lunch near ${startLocation ?? city}, then afternoon and evening spots.`
    : `Day 1: Traveler arrives late (${arrivalTime}). Day 1 should only have 1–2 evening spots near ${startLocation ?? city} such as a night market, bridge view, or rooftop bar. No daytime sightseeing on Day 1.`;

  const locationNote = startLocation
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
