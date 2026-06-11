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
) {
  const response = await fetch("/api/generate-itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, startDate, endDate, travelers, travelStyle, startLocation, arrivalTime, preferredSpots, departurePlace, departureTime }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Server error ${response.status}`);
  }

  return response.json();
}
