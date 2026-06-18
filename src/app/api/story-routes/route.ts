// GoKoreaMate / gokoreamate.com — GET /api/story-routes
// TASK-019: Story Routes API + Legacy Cleanup
//
// 200: { data: RouteTemplate[] }        — city 필터 적용 목록
// 400: { error: string }                — 잘못된 쿼리 파라미터

import { NextRequest, NextResponse } from "next/server";
import { findRoutesByCity, loadRouteTemplates } from "@/lib/story-routes";
import type { RouteTemplate } from "@/lib/story-routes";

// STATIC_EXPORT=true (Cloudflare Pages CI) 모드에서 GET 라우트는 force-static 필요
export const dynamic = "force-static";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");

  let routes: RouteTemplate[];

  if (city) {
    const normalized = city.toLowerCase().trim();
    if (!/^[a-z]+$/.test(normalized)) {
      return NextResponse.json(
        { error: "city must contain only lowercase letters" },
        { status: 400 },
      );
    }
    routes = findRoutesByCity(normalized);
  } else {
    routes = loadRouteTemplates().filter(r => r.is_active);
  }

  return NextResponse.json({ data: routes }, { status: 200 });
}
