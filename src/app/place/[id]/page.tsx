// S1 — Place Detail (/place/[id], owner 결정 1: 안정 city_spots numeric id 기반)
// 정적 export: generateStaticParams가 빌드 시 city_spots id 목록을 조회해 SSG.
// 데이터도 빌드 시 조회해 정적 렌더 — 런타임 Supabase 의존 없음.
// env 부재·네트워크 실패 시 빈 params 반환 → 기존 빌드를 깨뜨리지 않는다.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlaceDetailClient from "./PlaceDetailClient";
import type { CitySpotRow } from "@/lib/city-spots";

export const dynamicParams = false; // 정적 export — 빌드된 id 외에는 404

interface Props {
  params: Promise<{ id: string }>;
}

// ── 빌드 타임 Supabase REST 조회 (anon key — 공개 읽기 전용) ─────────────────

function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function fetchSpotIds(): Promise<number[]> {
  const env = supabaseEnv();
  if (!env) return [];
  try {
    const res = await fetch(`${env.url}/rest/v1/city_spots?select=id&order=id`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as { id: number }[];
    return rows.map(r => r.id);
  } catch {
    return [];
  }
}

async function fetchSpot(id: string): Promise<CitySpotRow | null> {
  const env = supabaseEnv();
  if (!env) return null;
  if (!/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`${env.url}/rest/v1/city_spots?id=eq.${id}&limit=1`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as CitySpotRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const ids = await fetchSpotIds();
  return ids.map(id => ({ id: String(id) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const spot = await fetchSpot(id);
  if (!spot) return { title: "Place — gokoreamate" };
  const desc = spot.why_it_matters ?? spot.description ?? `${spot.name} in ${spot.city}`;
  return {
    title: `${spot.name} — ${spot.city} | gokoreamate`,
    description: desc.slice(0, 155),
    alternates: { canonical: `https://gokoreamate.com/place/${id}/` },
    openGraph: {
      title: `${spot.name} — ${spot.city}`,
      description: desc.slice(0, 155),
      url: `https://gokoreamate.com/place/${id}/`,
      ...(spot.image_url ? { images: [{ url: spot.image_url }] } : {}),
    },
  };
}

export default async function PlacePage({ params }: Props) {
  const { id } = await params;
  const spot = await fetchSpot(id);
  if (!spot) notFound();
  return <PlaceDetailClient spot={spot} />;
}
