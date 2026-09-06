// Official Recommended Trip 상세 — 정적 export: (도시 × 코스 id) 전부 빌드 타임에 굽는다.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TripCourseClient from "@/components/quiet/TripCourseClient";
import { CITY_SLUGS } from "@/data/cities";
import { getRecommendedTrips } from "@/data/regional/regional-recommendations";

export const dynamic = "force-static";

export function generateStaticParams() {
  return CITY_SLUGS.flatMap(slug =>
    getRecommendedTrips(slug).map(trip => ({ slug, tripId: trip.id })),
  );
}

interface Props { params: Promise<{ slug: string; tripId: string }>; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, tripId } = await params;
  const trip = getRecommendedTrips(slug).find(t => t.id === tripId);
  const city = slug.charAt(0).toUpperCase() + slug.slice(1);
  return { title: `${trip?.title ?? "Trip"} — ${city} · gokoreamate` };
}

export default async function Page({ params }: Props) {
  const { slug, tripId } = await params;
  if (!CITY_SLUGS.includes(slug as (typeof CITY_SLUGS)[number])) notFound();
  if (!getRecommendedTrips(slug).some(t => t.id === tripId)) notFound();
  return <TripCourseClient slug={slug} tripId={tripId} />;
}
