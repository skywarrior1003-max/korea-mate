import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTourApiImage } from "@/lib/tourapi-images";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const spotName = searchParams.get("spotName");
  const searchKeyword = searchParams.get("searchKeyword") ?? undefined;

  if (!spotName) {
    return NextResponse.json({ imageUrl: null }, { status: 400 });
  }

  const imageUrl = await getTourApiImage(spotName, searchKeyword);
  return NextResponse.json({ imageUrl });
}
