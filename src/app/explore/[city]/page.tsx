import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ExploreCity from "@/components/ExploreCity";
import { CITY_CONFIGS, CITY_SLUGS } from "@/data/cities";

interface Props {
  params: Promise<{ city: string }>;
}

export function generateStaticParams() {
  return CITY_SLUGS.map(city => ({ city }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params;
  const config = CITY_CONFIGS[slug];
  if (!config) return {};
  return {
    title: `Explore ${config.name} — gokoreamate`,
    description: `Discover the best spots, food, and hidden gems in ${config.name} (${config.nameKo}). Interactive map, GPS Near Me, and curated travel guides.`,
    alternates: {
      canonical: `https://gokoreamate.com/explore/${slug}/`,
    },
    openGraph: {
      title: `Explore ${config.name} — gokoreamate`,
      description: `Plan your ${config.name} adventure with curated spots, NaverMap, and solo-travel tips.`,
      url: `https://gokoreamate.com/explore/${slug}/`,
    },
  };
}

export default async function ExploreCityPage({ params }: Props) {
  const { city: slug } = await params;
  const config = CITY_CONFIGS[slug];
  if (!config) notFound();
  return <ExploreCity city={config} />;
}
