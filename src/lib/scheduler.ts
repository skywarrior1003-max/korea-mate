export async function generateItinerary(
  city: string,
  startDate: string,
  endDate: string,
  travelers: string,
  travelStyle: string
) {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment variables.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `You are a Korea travel expert. Create a detailed day-by-day itinerary for a foreign traveler.
City: ${city}, Dates: ${startDate} to ${endDate}, Travelers: ${travelers}, Style: ${travelStyle}
For each place include: name, category, location, estimated time, tips for foreigners.
Focus on: solo-friendly spots, places that accept foreign cards, English-friendly venues.
Format the response as JSON with this structure:
{ "days": [ { "date": "YYYY-MM-DD", "dayNumber": 1, "places": [ { "name": "Place Name", "category": "attraction/restaurant/event/accommodation", "location": "Area Name", "time": "10:00 AM", "duration": "2 hours", "tips": "Tip for foreigners", "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=..." } ] } ] }
googleMapsUrl format: https://www.google.com/maps/search/?api=1&query=장소명+${city}+Korea
Respond with JSON only. No other text.`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate itinerary: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Invalid response from Gemini API");
  }

  return JSON.parse(text);
}
