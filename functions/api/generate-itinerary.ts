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

// gemini-1.5-flash has the widest regional availability — always primary
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

/**
 * Strips all LLM response wrappers and extracts raw JSON.
 * Handles: plain JSON, ```json...```, leading prose + JSON, trailing prose.
 */
function extractJson(raw: string): unknown {
  let text = raw.trim();

  // 1. Extract content inside markdown code fence if present
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) {
    text = fenced[1].trim();
  }

  // 2. Advance to first JSON delimiter ({ or [)
  const jsonStart = text.search(/[{[]/);
  if (jsonStart > 0) {
    text = text.slice(jsonStart);
  }

  // 3. Truncate at last closing delimiter (} or ]) to strip trailing prose
  const lastClose = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (lastClose >= 0 && lastClose < text.length - 1) {
    text = text.slice(0, lastClose + 1);
  }

  return JSON.parse(text);
}

/**
 * Calls one Gemini model with the bare-minimum payload.
 * No generationConfig — prevents schema conflicts that cause HTTP 400.
 */
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
        errBody?.error?.message ??
        errBody?.error?.status ??
        response.statusText;
    } catch {
      // JSON parse of error body failed — keep statusText
    }
    throw new Error(`Gemini ${response.status} [${model}]: ${detail}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error(`Empty response from Gemini model: ${model}`);
  }

  return extractJson(rawText);
}

export const onRequestPost: (context: {
  request: Request;
  env: Env;
}) => Promise<Response> = async ({ request, env }) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  // ── API key guard ──────────────────────────────────────────────
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          "GEMINI_API_KEY is not set. Add it in Cloudflare Pages → Settings → Environment Variables.",
      }),
      { status: 500, headers: corsHeaders }
    );
  }

  // ── Request body ───────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body — expected JSON." }),
      { status: 400, headers: corsHeaders }
    );
  }

  const { city, startDate, endDate, travelers, travelStyle } = body;
  if (!city || !startDate || !endDate) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: city, startDate, endDate.",
      }),
      { status: 400, headers: corsHeaders }
    );
  }

  // ── Build prompt ───────────────────────────────────────────────
  const numDays =
    Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

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

  // ── Call Gemini with model fallback chain ──────────────────────
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
        allErrors.push(`[attempt ${attempt + 1}] ${msg}`);

        const httpStatus = parseInt(
          msg.match(/Gemini (\d+)/)?.[1] ?? "0"
        );

        // Retry only on rate-limit / overload; everything else → next model
        if (
          (httpStatus === 503 || httpStatus === 429) &&
          attempt < MAX_RETRIES - 1
        ) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        break;
      }
    }
  }

  return new Response(
    JSON.stringify({
      error: "All Gemini models failed.",
      details: allErrors,
    }),
    { status: 500, headers: corsHeaders }
  );
};
