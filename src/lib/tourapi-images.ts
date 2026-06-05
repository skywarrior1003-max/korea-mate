interface TourApiItem {
  firstimage?: string;
  firstimage2?: string;
}

interface TourApiResponse {
  response?: {
    body?: {
      items?: { item?: TourApiItem[] } | string;
      totalCount?: number;
    };
  };
}

export async function getTourApiImage(
  spotName: string,
  searchKeyword?: string
): Promise<string | null> {
  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey) return null;

  const keyword = searchKeyword || spotName;

  const params = new URLSearchParams({
    serviceKey: apiKey,
    keyword,
    numOfRows: "5",
    pageNo: "1",
    MobileOS: "ETC",
    MobileApp: "KoreaMate",
    _type: "json",
  });

  try {
    const response = await fetch(
      `https://apis.data.go.kr/B551011/EngService2/searchKeyword2?${params.toString()}`,
      { next: { revalidate: 86400 } }
    );

    if (!response.ok) return null;

    const data: TourApiResponse = await response.json();
    const items = data?.response?.body?.items;

    if (
      !items ||
      typeof items === "string" ||
      !Array.isArray(items.item) ||
      items.item.length === 0
    ) {
      return null;
    }

    // Pick first result that has a non-empty image URL
    const rawUrl =
      items.item
        .flatMap((i) => [i.firstimage ?? "", i.firstimage2 ?? ""])
        .find((url) => url.trim() !== "") ?? null;

    if (!rawUrl) return null;

    return rawUrl.replace(/^http:\/\//, "https://");
  } catch {
    return null;
  }
}
