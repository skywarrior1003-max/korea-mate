interface Env {
  GEMINI_API_KEY: string;
}

interface RequestBody {
  city: string;
  startDate: string;
  endDate: string;
  travelers: string;
  travelStyle: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MOCK FALLBACK — 5-day Busan itinerary curated by KoreaMate
//  Returned whenever Gemini is unavailable (missing key, rate limit, error).
//  Dates are dynamically filled from the user's actual startDate.
// ─────────────────────────────────────────────────────────────────────────────

const BUSAN_TEMPLATE_DAYS = [
  {
    places: [
      {
        name: "Haeundae Beach",
        category: "Attraction",
        location: "Haeundae-gu",
        time: "10:00",
        duration: "2 hours",
        tips: "Free entry. Street food stalls sell tteokbokki and fish cakes (₩2,000–5,000). Foreign cards accepted at nearby cafés. Subway Line 2, Haeundae Station Exit 3.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Haeundae+Beach+Busan+Korea",
      },
      {
        name: "Dongbaek Island (APEC Naru Park)",
        category: "Park",
        location: "Haeundae-gu",
        time: "12:30",
        duration: "1 hour",
        tips: "Free entry. The island connects via a causeway. Great views of Gwangalli Bridge. Card accepted everywhere around the island.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Dongbaek+Island+Busan+Korea",
      },
      {
        name: "Haeundae Traditional Market",
        category: "Market",
        location: "Haeundae-gu",
        time: "14:00",
        duration: "1 hour",
        tips: "Try ssiat hotteok (₩1,500) and fried squid. Cash preferred. Most vendors don't speak English — point and pay.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Haeundae+Traditional+Market+Busan+Korea",
      },
      {
        name: "Gwangalli Beach & Gwangan Bridge Night View",
        category: "Attraction",
        location: "Suyeong-gu",
        time: "19:30",
        duration: "2 hours",
        tips: "Bridge lights up after sunset — arrive by 19:30. Buy a convenience store beer and sit on the beach. Subway Line 2, Gwangan Station Exit 3.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Gwangalli+Beach+Busan+Korea",
      },
    ],
  },
  {
    places: [
      {
        name: "Gamcheon Culture Village",
        category: "Attraction",
        location: "Saha-gu",
        time: "09:30",
        duration: "2 hours",
        tips: "Get the ₩2,000 trail map at the entrance — redeemable as a café stamp. Wear comfortable shoes; alleys are very steep. Bus 1-1 or 2 from Toseong-dong.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Gamcheon+Culture+Village+Busan+Korea",
      },
      {
        name: "Jagalchi Fish Market",
        category: "Restaurant",
        location: "Jung-gu",
        time: "12:00",
        duration: "1.5 hours",
        tips: "Choose live seafood on the ground floor, take it upstairs to a cooking booth. Budget ₩20,000–₩40,000/person. Mostly cash only. Subway Line 1, Jagalchi Station Exit 10.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Jagalchi+Fish+Market+Busan+Korea",
      },
      {
        name: "BIFF Square & Nampo-dong",
        category: "Attraction",
        location: "Jung-gu",
        time: "14:30",
        duration: "1.5 hours",
        tips: "Walk the celebrity handprint plaza, explore Nampo-dong shopping street. Gukje Market is 5 min walk. Foreign cards accepted everywhere here.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=BIFF+Square+Busan+Korea",
      },
      {
        name: "Busan Tower & Yongdusan Park",
        category: "Attraction",
        location: "Jung-gu",
        time: "17:00",
        duration: "1.5 hours",
        tips: "Admission ₩12,000. Views of the entire port and city. Take the escalator from Nampo Station Exit 1. Free park around the tower.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Busan+Tower+Korea",
      },
    ],
  },
  {
    places: [
      {
        name: "Hwangnyeongsan Sunrise/Night View Trail",
        category: "Park",
        location: "Yeonje-gu",
        time: "07:00",
        duration: "2 hours",
        tips: "Free 40-min hike to 360° city panorama. No direct subway — taxi (₩5,000–₩8,000) to trailhead is easiest. Non-slip shoes required.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Hwangnyeongsan+Busan+Korea",
      },
      {
        name: "UN Memorial Cemetery",
        category: "Museum",
        location: "Nam-gu",
        time: "10:30",
        duration: "1 hour",
        tips: "Free entry. The only UN-run cemetery in the world. English audio guides available. Bus 68 or 131. Smart dress code appreciated.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=UN+Memorial+Cemetery+Busan+Korea",
      },
      {
        name: "Shinsegae Centum City",
        category: "Shopping",
        location: "Haeundae-gu, Centum City",
        time: "13:00",
        duration: "2 hours",
        tips: "World's largest department store. Tax refund desk on B1. Foreign cards accepted. Subway Line 2, Centum City Station Exit 12.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Shinsegae+Centum+City+Busan+Korea",
      },
      {
        name: "Seomyeon Food Street (서면 먹자골목)",
        category: "Restaurant",
        location: "Busanjin-gu",
        time: "18:00",
        duration: "2 hours",
        tips: "Busan's busiest night food street. Try dakgalbi (spicy stir-fried chicken) for ₩10,000–₩15,000/person. Subway Line 1/2, Seomyeon Station Exit 1.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Seomyeon+Food+Street+Busan+Korea",
      },
    ],
  },
  {
    places: [
      {
        name: "Igidae Coastal Walk (이기대 해안산책로)",
        category: "Park",
        location: "Nam-gu",
        time: "09:00",
        duration: "3 hours",
        tips: "Free 4.7km cliff trail. Bus 27 or 131 from Gwangalli to Oryukdo Skywalk start. Bring water — no vendors on trail. Paved boardwalks along cliff edges.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Igidae+Coastal+Walk+Busan+Korea",
      },
      {
        name: "Oryukdo Skywalk",
        category: "Attraction",
        location: "Nam-gu",
        time: "13:00",
        duration: "1 hour",
        tips: "Glass-floor cliff walkway above the sea. Free entry. Shoe covers provided on-site. Bus 24 or 131 to Oryukdo stop.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Oryukdo+Skywalk+Busan+Korea",
      },
      {
        name: "Songdo Beach & Aerial Cable Car",
        category: "Experience",
        location: "Seo-gu",
        time: "15:30",
        duration: "1.5 hours",
        tips: "Cable car round trip ₩15,000. Runs 09:00–22:00. The car crosses over the sea — incredible views. Bus 7 or 71 from Nampo-dong.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Songdo+Beach+Cable+Car+Busan+Korea",
      },
      {
        name: "Gwangbok-ro Fashion Street",
        category: "Shopping",
        location: "Jung-gu",
        time: "18:30",
        duration: "1.5 hours",
        tips: "Busan's main shopping boulevard. Mix of Korean streetwear brands and international chains. Foreign cards accepted everywhere. Near Nampo Station.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Gwangbok-ro+Busan+Korea",
      },
    ],
  },
  {
    places: [
      {
        name: "Taejongdae Resort Park",
        category: "Park",
        location: "Yeongdo-gu",
        time: "09:30",
        duration: "2.5 hours",
        tips: "Take the Danubi train inside (₩3,000) or walk 4km loop trail. Rocky cliffs and lighthouse views. Bus 8 or 30 from Nampo-dong (45 min).",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Taejongdae+Resort+Busan+Korea",
      },
      {
        name: "Gukje Market (국제시장)",
        category: "Market",
        location: "Jung-gu",
        time: "13:00",
        duration: "1.5 hours",
        tips: "Korea's largest traditional market. Great for souvenirs, dried seafood, and street food. Cash preferred. Subway Line 1, Nampo Station Exit 3.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Gukje+Market+Busan+Korea",
      },
      {
        name: "Choryang Ibagu-gil (168 Steps)",
        category: "Attraction",
        location: "Dong-gu",
        time: "15:30",
        duration: "1.5 hours",
        tips: "Historic hillside alley overlooking the port. 168 Steps stairway with a monorail (₩500). Busan Station Exit 7, 10-min walk.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Choryang+Ibagu+Street+Busan+Korea",
      },
      {
        name: "Busan Station Departure",
        category: "Experience",
        location: "Dong-gu",
        time: "18:00",
        duration: "1 hour",
        tips: "KTX to Seoul takes 2h30m — book on Korail website. Coin lockers inside. Lotte Mart in the basement for last-minute Korean snacks.",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Busan+Station+Korea",
      },
    ],
  },
];

function buildFallbackItinerary(
  startDate: string,
  numDays: number,
  city: string,
  travelers: string
): unknown {
  const base = new Date(startDate);
  const days = [];

  for (let i = 0; i < numDays; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const template = BUSAN_TEMPLATE_DAYS[i % BUSAN_TEMPLATE_DAYS.length];
    days.push({
      date: dateStr,
      dayNumber: i + 1,
      places: template.places,
    });
  }

  return {
    days,
    _source: `KoreaMate curated itinerary — ${numDays} day(s) in ${city} for ${travelers} traveler(s).`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  GEMINI UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash",
];
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(raw: string): unknown {
  let text = raw.trim();

  // 1. Extract from markdown code fence
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) text = fenced[1].trim();

  // 2. Advance to first JSON delimiter
  const jsonStart = text.search(/[{[]/);
  if (jsonStart > 0) text = text.slice(jsonStart);

  // 3. Trim trailing non-JSON prose
  const lastClose = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (lastClose >= 0 && lastClose < text.length - 1) {
    text = text.slice(0, lastClose + 1);
  }

  return JSON.parse(text);
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
      // keep statusText if body parse fails
    }
    throw new Error(`Gemini ${response.status} [${model}]: ${detail}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error(`Empty response from model: ${model}`);
  return extractJson(rawText);
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

  // ── Parse request body ─────────────────────────────────────────
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body — expected JSON." }),
      { status: 400, headers: corsHeaders }
    );
  }

  const { city = "Busan", startDate, endDate, travelers = "1", travelStyle = "Solo" } = body;

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

  // ── Try Gemini if API key is available ─────────────────────────
  const apiKey = env.GEMINI_API_KEY;

  if (apiKey) {
    const prompt = `You are an expert Korea travel planner for foreign visitors.

Create a detailed ${numDays}-day itinerary for ${city}, Korea.
Travel dates: ${startDate} to ${endDate}
Number of travelers: ${travelers}
Travel style: ${travelStyle}

OUTPUT RULE: Return ONLY a raw JSON object. No markdown, no code fences, no explanation — just the JSON.

Required JSON structure:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "dayNumber": 1,
      "places": [
        {
          "name": "Place name in English",
          "category": "Attraction",
          "location": "District or neighborhood",
          "time": "09:00",
          "duration": "2 hours",
          "tips": "Practical tip for foreign visitors",
          "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=Place+Name+${city}+Korea"
        }
      ]
    }
  ]
}

Rules:
- 4 to 5 places per day, ordered chronologically
- Only real, well-known spots in ${city}
- Tips must help foreigners: cash vs card, English availability, transport
- Dates start from ${startDate} and increment each day`;

    const allErrors: string[] = [];

    for (const model of MODELS) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const result = await callGemini(apiKey, model, prompt);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: corsHeaders,
          });
        } catch (err) {
          const msg = (err as Error).message;
          allErrors.push(`[${model} attempt ${attempt + 1}] ${msg}`);

          const httpStatus = parseInt(msg.match(/Gemini (\d+)/)?.[1] ?? "0");
          if ((httpStatus === 503 || httpStatus === 429) && attempt < MAX_RETRIES - 1) {
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            continue;
          }
          break;
        }
      }
    }

    // Gemini failed — log errors and fall through to mock data
    console.error("Gemini all models failed:", allErrors.join(" | "));
  }

  // ── Fallback: return curated KoreaMate mock itinerary ──────────
  // Triggered when: (1) no API key, (2) all Gemini calls fail
  const fallback = buildFallbackItinerary(startDate, numDays, city, travelers);
  return new Response(JSON.stringify(fallback), {
    status: 200,
    headers: corsHeaders,
  });
};
