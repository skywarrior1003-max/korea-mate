// 주소 한 줄을 지도 중심으로 바꾼다.
//
// 여기서 나온 좌표는 "이 장소의 위치" 가 아니라 "지도를 여기서 열자" 다.
// 주소는 건물까지만 알려 주고 우리가 찾는 것은 그 안의 어느 자리이기 때문이다.
// 최종 좌표는 언제나 사용자가 지도에서 확인한 중심이다.
//
// SDK 가 없거나 geocoder submodule 이 빠졌거나 서비스가 꺼져 있으면 null 을
// 돌려준다. 그때는 화면이 다음 근거(현재 위치 → 도시 중심)로 내려간다 —
// 못 찾았다고 등록을 막지 않는다.

import { isValidCoordinate } from "@/lib/geo";

export interface GeocodeHit { lat: number; lng: number }

/** 응답을 기다리는 최대 시간. 넘기면 지도를 먼저 띄운다 — 빈 화면으로 붙잡지 않는다. */
const TIMEOUT_MS = 6_000;

export async function geocodeAddress(query: string): Promise<GeocodeHit | null> {
  const q = (query ?? "").trim();
  if (!q) return null;
  if (typeof window === "undefined") return null;

  const service = window.naver?.maps?.Service;
  if (!service?.geocode) return null;

  return new Promise<GeocodeHit | null>((resolve) => {
    let settled = false;
    const done = (v: GeocodeHit | null) => { if (!settled) { settled = true; resolve(v); } };

    const timer = setTimeout(() => done(null), TIMEOUT_MS);

    try {
      service.geocode({ query: q }, (status, response) => {
        clearTimeout(timer);
        if (status !== service.Status.OK) return done(null);

        const first = response?.v2?.addresses?.[0];
        // x 가 경도, y 가 위도다. 문자열로 온다 — 뒤집거나 그대로 쓰면 엉뚱한 곳이 된다.
        const lng = Number(first?.x);
        const lat = Number(first?.y);
        if (!isValidCoordinate(lat, lng)) return done(null);
        done({ lat, lng });
      });
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}
