// Event 내부 상세 — 정적 export: (도시 × 기간형 콘텐츠 id) 전부 빌드 타임에 굽는다.
// 종료된 행사의 상세도 굽는다(공유 링크 보존) — 목록 노출만 걸러진다.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventDetailClient } from "@/components/quiet/EventsClient";
import { CITY_SLUGS } from "@/data/cities";
import { getCityEventById, getCityEvents } from "@/data/regional/regional-recommendations";

export const dynamic = "force-static";

export function generateStaticParams() {
  const past = new Date(0); // 만료 필터 없이 전부 — 상세는 종료돼도 존재한다
  return CITY_SLUGS.flatMap(slug =>
    getCityEvents(slug, past).map(ev => ({ slug, eventId: ev.id })),
  );
}

interface Props { params: Promise<{ slug: string; eventId: string }>; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, eventId } = await params;
  const ev = getCityEventById(slug, eventId);
  const city = slug.charAt(0).toUpperCase() + slug.slice(1);
  return { title: `${ev?.name ?? "Event"} — ${city} · gokoreamate` };
}

export default async function Page({ params }: Props) {
  const { slug, eventId } = await params;
  if (!CITY_SLUGS.includes(slug as (typeof CITY_SLUGS)[number])) notFound();
  if (!getCityEventById(slug, eventId)) notFound();
  return <EventDetailClient slug={slug} eventId={eventId} />;
}
