// City Hub Events 전체보기 — 정적 export: 5개 도시 slug 를 빌드 타임에 굽는다.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventsAllClient } from "@/components/quiet/EventsClient";
import { CITY_SLUGS } from "@/data/cities";

export const dynamic = "force-static";

export function generateStaticParams() {
  return CITY_SLUGS.map(slug => ({ slug }));
}

interface Props { params: Promise<{ slug: string }>; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const city = slug.charAt(0).toUpperCase() + slug.slice(1);
  return { title: `What's happening in ${city} — gokoreamate` };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  if (!CITY_SLUGS.includes(slug as (typeof CITY_SLUGS)[number])) notFound();
  return <EventsAllClient slug={slug} />;
}
