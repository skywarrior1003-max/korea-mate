// S1 — Place Detail (/place/[id], owner 결정 1: 안정 city_spots numeric id 기반)
// 정적 export: generateStaticParams가 빌드 시 city_spots id 목록을 조회해 SSG.
// 데이터도 빌드 시 조회해 정적 렌더 — 런타임 Supabase 의존 없음.
// env 부재·네트워크 실패 시 빈 params 반환 → 기존 빌드를 깨뜨리지 않는다.
//
// V1-A: 조회를 place-source 로 옮겨 sitemap 과 같은 장소 집합을 쓰게 했다.
//       Twitter card·장소 JSON-LD·Breadcrumb JSON-LD 를 추가했다.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlaceDetailClient from "./PlaceDetailClient";
import { fetchPublicSpotIds, fetchSpot } from "@/lib/place-detail/place-source";
import {
  resolvePlaceText,
  buildPlaceJsonLd,
  buildBreadcrumbJsonLd,
  placeUrl,
  toPlaceView,
  resolvePublicPlaceSummary,
  resolvePublicMetadataImage,
} from "@/lib/place-detail/place-detail-core";

export const dynamicParams = false; // 정적 export — 빌드된 id 외에는 404
// TASK-FIVE-CITY-CORE-PUBLISH-READINESS-HARDENING-V1: place-source 의 fetch 가 `cache: "no-store"`(Data Cache 재사용 금지)
// 가 됐다. Next 는 정적 생성 중 no-store fetch 를 만나면 라우트를 dynamic 으로 bail 시켜 `output: "export"` 빌드를
// 깨뜨리는데, `force-static` 이면 bail 하지 않고 그대로 정적 생성한다(sitemap.ts 와 같은 선언). 렌더 결과는 변하지 않는다.
export const dynamic = "force-static";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  // Gate B: reference — 숨긴 legacy 도 페이지를 만든다(사용자 Saved/My Trip/Story 링크 보존). sitemap 만 discovery.
  const ids = await fetchPublicSpotIds("reference");
  return ids.map(id => ({ id: String(id) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const spot = await fetchSpot(id);
  if (!spot) return { title: "Place — gokoreamate" };

  // 정적 페이지는 빌드 시 locale 을 알 수 없다. metadata 는 기본값(영어)을 쓰고,
  // 화면 본문은 클라이언트에서 활성 locale 로 다시 해석한다.
  const view = toPlaceView(spot);
  const text = resolvePlaceText(view, "en");

  // 화면과 **같은** resolver 를 쓴다. 서로 다른 필터를 쓰면 화면에서 가린 내부
  // 메모가 검색 스니펫에는 그대로 남는다.
  const summary = resolvePublicPlaceSummary(text);
  const desc = (summary ?? `${spot.name} in ${spot.city}`).slice(0, 155);

  const url = placeUrl(id);
  // 크롤러에는 onError fallback 이 없다 — 죽은 URL 을 넣지 않는다.
  const image = resolvePublicMetadataImage(spot.city, spot.image_url);

  return {
    title: `${spot.name} — ${spot.city} | gokoreamate`,
    description: desc,
    alternates: { canonical: url },
    // Gate B: 서비스에서 뺀 legacy(is_published=false)는 직접 링크로는 열리되 검색 색인에서는 뺀다
    ...(spot.is_published === false ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${spot.name} — ${spot.city}`,
      description: desc,
      url,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${spot.name} — ${spot.city}`,
      description: desc,
      images: [image],
    },
  };
}

export default async function PlacePage({ params }: Props) {
  const { id } = await params;
  const spot = await fetchSpot(id);
  if (!spot) notFound();

  // 클라이언트에는 상업 필드를 뺀 projection 만 넘긴다 (place-detail-core §0).
  const view = toPlaceView(spot);

  // 구조화 데이터는 화면에 실제로 표시되는 값만 담는다 (place-detail-core 계약).
  const text = resolvePlaceText(view, "en");
  const placeLd = buildPlaceJsonLd(view, text);
  const crumbLd = buildBreadcrumbJsonLd(view, text.name);

  return (
    <>
      {placeLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(placeLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }}
      />
      <PlaceDetailClient spot={view} />
    </>
  );
}
