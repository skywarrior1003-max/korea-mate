// Travel Essential 내부 상세 — 정적 export: (도시 × travel_utility id) 전부 빌드 타임에 굽는다.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EssentialDetailClient } from "@/components/quiet/EssentialsClient";
import { CITY_SLUGS } from "@/data/cities";
import { getTravelEssentials } from "@/data/regional/regional-recommendations";

export const dynamic = "force-static";

export function generateStaticParams() {
  return CITY_SLUGS.flatMap(slug =>
    getTravelEssentials(slug).map(es => ({ slug, essId: es.id })),
  );
}

interface Props { params: Promise<{ slug: string; essId: string }>; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, essId } = await params;
  const es = getTravelEssentials(slug).find(e => e.id === essId);
  const city = slug.charAt(0).toUpperCase() + slug.slice(1);
  return { title: `${es?.title ?? "Travel essentials"} — ${city} · gokoreamate` };
}

export default async function Page({ params }: Props) {
  const { slug, essId } = await params;
  if (!CITY_SLUGS.includes(slug as (typeof CITY_SLUGS)[number])) notFound();
  if (!getTravelEssentials(slug).some(e => e.id === essId)) notFound();
  return <EssentialDetailClient slug={slug} essId={essId} />;
}
