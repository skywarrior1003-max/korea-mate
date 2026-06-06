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

const MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"];
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(raw: string): unknown {
  const stripped = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  return JSON.parse(stripped);
}

async function callGemini(apiKey: string, model: string, prompt: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const msg = errBody?.error?.message || response.statusText;
    throw new Error(`Gemini ${response.status}: ${msg}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Empty response from Gemini");
  return extractJson(rawText);
}

export const onRequestPost: (context: { request: Request; env: Env }) => Promise<Response> = async ({
  request,
  env,
}) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY is not configured" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { city, startDate, endDate, travelers, travelStyle } = body;
  if (!city || !startDate || !endDate) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const numDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const prompt = `You are an expert Korea travel planner for foreign visitors.

Create a detailed ${numDays}-day itinerary for ${city}, Korea.
Travel dates: ${startDate} to ${endDate}
Number of travelers: ${travelers}
Travel style: ${travelStyle}

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
- Include 4-5 places per day, ordered by time
- Focus on real, well-known spots in ${city}
- Tips must be practical for foreigners (Cash only, English menu available, T-money card needed, etc.)
- googleMapsUrl must use proper URL encoding for spaces
- Dates must follow the travel dates in order starting from ${startDate}`;

  let lastError: Error = new Error("Unknown error");

  for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await callGemini(apiKey, model, prompt);
        return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
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

  return new Response(JSON.stringify({ error: lastError.message }), {
    status: 500,
    headers: corsHeaders,
  });
};
