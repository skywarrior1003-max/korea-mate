// 지도를 어디서 열 것인가 — 링크에서 읽어낼 수 있는 것만 읽는다.
//
// 이 파일은 문자열만 다룬다. 네트워크를 타지 않는다는 뜻이고, 그게 핵심이다.
// 짧은 링크(naver.me · maps.app.goo.gl)는 어디로 가는지 알려면 그 주소를
// 실제로 열어 봐야 한다. 서버가 사용자가 준 임의 주소를 열게 만드는 순간
// 그건 우리 서버로 아무 데나 요청을 보낼 수 있는 통로가 된다. 그래서 짧은
// 링크는 "모른다" 로 답하고 사용자에게 지도를 맡긴다.
//
// 좌표를 읽어내도 그건 시작점일 뿐이다. 저장되는 값은 사용자가 지도에서
// 확인한 중심 좌표다 — 여기서 읽은 값이 아니다.

export interface SeedCoordinate {
  lat: number;
  lng: number;
}

/** 좌표는 짝이고, 각자 범위 안에 있고, 숫자여야 한다. (0,0) 은 바다 한가운데다. */
function valid(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

const pair = (lat: number, lng: number): SeedCoordinate | null =>
  valid(lat, lng) ? { lat, lng } : null;

/**
 * 이 주소가 어디로 가는지 열어 봐야만 아는 종류인가.
 *
 * 호출부는 이걸로 "링크를 못 읽었다" 와 "짧은 링크라 읽지 않는다" 를 갈라
 * 사용자에게 다른 말을 해 준다. 둘 다 결과는 같지만 이유가 다르다.
 */
export function isShortMapLink(raw: string): boolean {
  const host = hostOf(raw);
  if (!host) return false;
  return (
    host === "naver.me" ||
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    host === "maps.google.com.hk" ||
    host.endsWith(".page.link")
  );
}

function hostOf(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * 지도 링크에서 좌표를 읽는다. 못 읽으면 null — 지어내지 않는다.
 *
 * 읽는 형태는 주소 문자열 안에 좌표가 그대로 들어 있는 것뿐이다.
 *
 *   Google  `/@35.15,129.16,17z` · `!3d35.15!4d129.16` · `?q=35.15,129.16`
 *   Naver   `?c=129.16,35.15,15,0,0,0,dh` (경도가 먼저다) · `?lat=..&lng=..`
 *
 * Naver 의 옛 `c=` 값은 도(degree) 가 아니라 미터 좌표계라 수백만 단위가 온다.
 * 범위 검사에서 자연히 걸러진다 — 형식을 따로 알아볼 필요가 없다.
 */
export function parseMapLinkCoordinate(raw: string): SeedCoordinate | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (isShortMapLink(s)) return null;

  // Google 상세: !3d<lat>!4d<lng> — 장소를 특정한 뒤에 붙는 값이라 가장 정확하다.
  const g3d = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (g3d) {
    const hit = pair(parseFloat(g3d[1]), parseFloat(g3d[2]));
    if (hit) return hit;
  }

  // Google 지도 중심: /@<lat>,<lng>,<zoom>z
  const gAt = s.match(/[/@](-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,\d+(?:\.\d+)?z)?/);
  if (gAt && s.includes("@")) {
    const hit = pair(parseFloat(gAt[1]), parseFloat(gAt[2]));
    if (hit) return hit;
  }

  let url: URL | null = null;
  try {
    url = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }
  const q = url.searchParams;

  // 이름이 붙은 값이 가장 덜 모호하다 — 순서를 추측하지 않아도 된다.
  const namedLat = q.get("lat") ?? q.get("y");
  const namedLng = q.get("lng") ?? q.get("lon") ?? q.get("x");
  if (namedLat && namedLng) {
    const hit = pair(parseFloat(namedLat), parseFloat(namedLng));
    if (hit) return hit;
  }

  // Google `?q=` · `?ll=` · `?query=` — 위도가 먼저다.
  for (const key of ["ll", "q", "query", "center", "destination"]) {
    const v = q.get(key);
    if (!v) continue;
    const m = v.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (!m) continue;
    const hit = pair(parseFloat(m[1]), parseFloat(m[2]));
    if (hit) return hit;
  }

  // Naver `?c=` — 경도가 먼저다. 위/경도를 바꿔 넣으면 엉뚱한 나라가 나온다.
  const c = q.get("c");
  if (c) {
    const parts = c.split(",");
    if (parts.length >= 2) {
      const hit = pair(parseFloat(parts[1]), parseFloat(parts[0]));
      if (hit) return hit;
    }
  }

  return null;
}

export type SeedSource = "link" | "address" | "gps" | "city" | "none";

export interface LocationSeed {
  coordinate: SeedCoordinate | null;
  source:     SeedSource;
}

/**
 * 어느 근거로 지도를 열지 고른다. 순서가 곧 신뢰도다.
 *
 * 링크에 박힌 좌표 > 주소를 찾아 얻은 좌표 > 지금 내가 선 자리 > 도시 중심.
 * 마지막까지 못 찾아도 실패가 아니다 — 지도는 열리고 사용자가 맞추면 된다.
 */
export function chooseSeed(v: {
  link?:    SeedCoordinate | null;
  address?: SeedCoordinate | null;
  gps?:     SeedCoordinate | null;
  city?:    SeedCoordinate | null;
}): LocationSeed {
  if (v.link    && valid(v.link.lat,    v.link.lng))    return { coordinate: v.link,    source: "link"    };
  if (v.address && valid(v.address.lat, v.address.lng)) return { coordinate: v.address, source: "address" };
  if (v.gps     && valid(v.gps.lat,     v.gps.lng))     return { coordinate: v.gps,     source: "gps"     };
  if (v.city    && valid(v.city.lat,    v.city.lng))    return { coordinate: v.city,    source: "city"    };
  return { coordinate: null, source: "none" };
}
