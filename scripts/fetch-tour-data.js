const fs = require("fs");
const path = require("path");

const localInfoPath = path.join(__dirname, "../public/data/local-info.json");

// Normalize title for robust duplicate detection (remove all non-alphanumeric chars)
function normalizeTitle(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Clean markdown code blocks from Gemini response
function cleanGeminiResponse(text) {
  if (!text) return "";
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

async function run() {
  const tourApiKey = process.env.TOUR_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!tourApiKey) {
    console.error("Error: TOUR_API_KEY environment variable is missing.");
    process.exit(1);
  }
  if (!geminiApiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is missing.");
    process.exit(1);
  }

  // Load existing data
  let localData = [];
  try {
    if (fs.existsSync(localInfoPath)) {
      const fileContent = fs.readFileSync(localInfoPath, "utf8");
      localData = JSON.parse(fileContent);
    }
  } catch (err) {
    console.error("Warning: Failed to load local-info.json. Initializing as empty list.", err);
  }

  // [1단계] TourAPI에서 데이터 가져오기
  const keywords = ["Seoul", "Busan", "BTS"];
  const baseParams = {
    serviceKey: tourApiKey,
    MobileOS: "ETC",
    MobileApp: "KoreaMate",
    _type: "json",
    numOfRows: "20",
    pageNo: "1",
  };

  console.log("Fetching data from TourAPI...");

  let fetchedItems = [];
  for (const keyword of keywords) {
    const queryParams = new URLSearchParams({ ...baseParams, keyword });
    const tourUrl = `https://apis.data.go.kr/B551011/EngService2/searchKeyword2?${queryParams.toString()}`;
    try {
      const res = await fetch(tourUrl);
      if (!res.ok) {
        throw new Error(`TourAPI HTTP error: ${res.status}`);
      }
      const data = await res.json();
      let items = data.response?.body?.items?.item || [];
      if (!Array.isArray(items)) {
        items = items ? [items] : [];
      }
      fetchedItems = fetchedItems.concat(items);
    } catch (err) {
      console.error(`Error fetching from TourAPI (keyword: ${keyword}):`, err);
      process.exit(1);
    }
  }

  if (fetchedItems.length === 0) {
    console.log("No data returned from TourAPI.");
    process.exit(0);
  }

  // Filter out items that already exist locally
  // Primary: contentid match, Secondary: normalized title similarity
  const newItems = fetchedItems.filter((item) => {
    const tourNorm = normalizeTitle(item.title);
    return !localData.some((localItem) => {
      if (item.contentid && String(localItem.id) === String(item.contentid)) return true;
      const localNorm = normalizeTitle(localItem.name);
      return localNorm === tourNorm || tourNorm.includes(localNorm) || localNorm.includes(tourNorm);
    });
  });

  if (newItems.length === 0) {
    console.log("No new data found");
    process.exit(0);
  }

  console.log(`Found ${newItems.length} new items. Processing up to 10...`);
  const toProcess = newItems.slice(0, 10);

  // [2단계] Gemini AI로 신규 항목 가공
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

  for (const targetItem of toProcess) {
    console.log(`Processing: ${targetItem.title}`);

    const prompt = `Convert this Korea Tourism data into a JSON object for foreign travelers.
Raw TourAPI Data:
${JSON.stringify(targetItem, null, 2)}

Format:
{
  "id": ${Date.now()},
  "name": "English name of the place",
  "category": "one of (attraction/restaurant/event/accommodation)",
  "location": "city and district",
  "soloFriendly": true or false,
  "cardAccepted": true or false,
  "englishMenu": true or false,
  "barrierFree": true or false,
  "koreanSurvivalScore": number 0-100,
  "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=name+Korea",
  "affiliateLink": "#",
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "target": "who this is for",
  "summary": "one sentence English summary for foreign travelers"
}

Rules:
- name: Provide a clear, natural English name for the spot.
- category: Select the most accurate category from: attraction, restaurant, event, accommodation.
- location: General location (e.g., "Seoul, Jongno-gu" or "Busan, Haeundae-gu").
- koreanSurvivalScore: calculate based on soloFriendly(+20), cardAccepted(+20), englishMenu(+20), barrierFree(+20), general tourist-friendliness(+20)
- Respond with JSON only. No other text.`;

    await new Promise((r) => setTimeout(r, 7000));
    try {
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });

      if (!res.ok) {
        throw new Error(`Gemini API HTTP error: ${res.status}`);
      }

      const data = await res.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error("Empty response from Gemini API");
      }

      const parsedItem = JSON.parse(cleanGeminiResponse(responseText));
      localData.push(parsedItem);
      fs.writeFileSync(localInfoPath, JSON.stringify(localData, null, 2), "utf8");
      console.log(`  ✓ Added: ${parsedItem.name} (${parsedItem.category})`);
    } catch (err) {
      console.error(`  ✗ Failed: ${targetItem.title} —`, err.message);
    }
  }
}

run();
