export interface EventAnchor {
  name: string;
  date: string;          // YYYY-MM-DD — specific trip day
  time: string;          // HH:MM 24h
  durationHours: number;
  location: string;
  googleMapsUrl?: string;
}

export async function generateItinerary(
  city: string,
  startDate: string,
  endDate: string,
  travelers: string,
  travelStyle: string,
  startLocation?: string,
  arrivalTime?: string,
  preferredSpots?: string[],
  departurePlace?: string,
  departureTime?: string,
  eventAnchors?: EventAnchor[],
) {
  const response = await fetch("/api/generate-itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, startDate, endDate, travelers, travelStyle, startLocation, arrivalTime, preferredSpots, departurePlace, departureTime, eventAnchors }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Server error ${response.status}`);
  }

  return response.json();
}
