// 다중 공유 카드 덱 (STORY-MULTICARD-JOURNEY-MAP-AND-AI-COST-PREVIEW-V1 §6).
//
// 이력 감사 결과(§4-1): 다중 카드는 과거에 구현·계약된 적이 없다 — 2026-08-19
// 문서는 "자동 생성 template 하나" 였다. 그러므로 이것은 복구가 아니라 **신규
// Preview 계약**이다. 카드 수는 고정 14 가 아니라 여행 구성에서 동적으로 나온다:
//   표지 1 + Day 시작 N + 장소 M + 여정·마무리 1  (3일·9곳 → 1+3+9+1 = 14)
// 장기 여행의 상한·요약 규칙은 Owner 결정 항목으로 남긴다(임의 확정 금지).
//
// 입력은 공개 Story payload(ApiStory)뿐이다 — story-card-source 계약 그대로:
// 비공개 moment·좌표·내부 id 는 응답에 오지 않으므로 여기서도 만들 수 없다.

import { memoryPhotoUrl, type ApiStory, type ApiMemory } from "./story-adapter";
import { resolveDisplayImage } from "../place-detail/place-detail-core.ts";

export interface DeckPlace {
  dayNumber: number;
  /** Day 안 방문 순번(1부터) */
  order: number;
  placeName: string;
  /** 공개 개인 사진(우선) 또는 null */
  momentPhotoSrc: string | null;
  /** 공식 카탈로그 이미지 또는 null — 개인 사진이 없을 때의 카드 배경 */
  officialPhotoSrc: string | null;
  /** 사용자가 저장한 제목/메모(공개 Memory) — 없으면 경험담을 만들지 않는다 */
  title: string | null;
  memo: string | null;
}

export type StoryCardSpec =
  | { kind: "cover" }
  | { kind: "day"; dayNumber: number; dateLabel: string; placeNames: string[] }
  | { kind: "place"; place: DeckPlace }
  | { kind: "journey"; days: { dayNumber: number; places: DeckPlace[] }[] };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function scheduledDays(raw: unknown): { dayNumber?: number; date?: string; places?: unknown[] }[] {
  if (Array.isArray(raw)) return raw as { dayNumber?: number; date?: string; places?: unknown[] }[];
  if (raw && typeof raw === "object") {
    const v2 = raw as { __v?: unknown; scheduled?: unknown };
    if (v2.__v === 2 && Array.isArray(v2.scheduled)) return v2.scheduled as { dayNumber?: number; date?: string; places?: unknown[] }[];
  }
  return [];
}

interface ApiPlace { name?: unknown; place_id?: unknown; image?: unknown }

function memoryForPlace(memories: ApiMemory[], place: ApiPlace, used: Set<ApiMemory>): ApiMemory | null {
  const pid = place.place_id;
  if (typeof pid !== "string" && typeof pid !== "number") return null;
  for (const m of memories) {
    if (used.has(m)) continue;
    if (typeof m.placeId === "string" && m.placeId !== "" && String(pid) === m.placeId) return m;
  }
  return null;
}

/** 공개 Story payload → 카드 덱. 카드 수 = 1 + N(day) + M(place) + 1. */
export function buildStoryCardDeck(api: ApiStory): StoryCardSpec[] {
  const memories = api.memories ?? [];
  const used = new Set<ApiMemory>();
  const days = scheduledDays(api.days);
  const specs: StoryCardSpec[] = [{ kind: "cover" }];
  const journeyDays: { dayNumber: number; places: DeckPlace[] }[] = [];

  days.forEach((day, di) => {
    const dayNumber = typeof day.dayNumber === "number" ? day.dayNumber : di + 1;
    const places = Array.isArray(day.places) ? (day.places as ApiPlace[]) : [];
    specs.push({
      kind: "day", dayNumber,
      dateLabel: str(day.date),
      placeNames: places.map(p => str(p.name)).filter(Boolean),
    });
    const jd: DeckPlace[] = [];
    places.forEach((place, idx) => {
      const m = memoryForPlace(memories, place, used);
      if (m) used.add(m);
      const dp: DeckPlace = {
        dayNumber, order: idx + 1,
        placeName: str(place.name) || (m?.placeName ?? ""),
        momentPhotoSrc: m && m.photos.length > 0 ? memoryPhotoUrl(api.id, m.photos[0]!.ref) : null,
        officialPhotoSrc: resolveDisplayImage(str(place.image) || null),
        title: m && typeof m.title === "string" && m.title.trim() ? m.title.trim() : null,
        memo: m && typeof m.memo === "string" && m.memo.trim() ? m.memo.trim() : null,
      };
      specs.push({ kind: "place", place: dp });
      jd.push(dp);
    });
    journeyDays.push({ dayNumber, places: jd });
  });

  specs.push({ kind: "journey", days: journeyDays });
  return specs;
}

// ── 무압축(STORE) ZIP — 전체 카드 저장 fallback (§6-4) ───────────────────────
// 패키지를 추가하지 않는다(패키지 정책). PNG 는 이미 압축돼 있어 STORE 로 충분하다.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** {이름, 바이트} 목록 → STORE ZIP 바이트. 이름은 ASCII 만 쓴다(파일명은 우리가 만든다). */
export function buildStoreZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
  const u32 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]);
  const cat = (...parts: Uint8Array[]) => {
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = cat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0),
      name, f.data,
    );
    central.push(cat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ));
    chunks.push(local);
    offset += local.length;
  }
  const centralAll = cat(...central);
  const eocd = cat(
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralAll.length), u32(offset), u16(0),
  );
  return cat(...chunks, centralAll, eocd);
}
