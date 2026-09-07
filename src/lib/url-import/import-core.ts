// External URL Import — 순수 코어 (TASK-GOKOREAMATE-EXTERNAL-URL-IMPORT-ENGINE-V1)
//
// 계약
//  · provider-neutral: 특정 AI/서비스 전용 파싱을 만들지 않는다. 어떤 URL 이든
//    같은 파이프라인(검증→안전 fetch→추출→분석→매칭→Preview)을 지난다.
//  · URL 입력만으로 저장되지 않는다 — 이 모듈은 Preview 재료만 만든다.
//  · 외부 글 전문을 복제하지 않는다 — 여행 사실(제목/도시/날짜/Day/시간/장소명/순서)만.
//  · AI 는 본문에 있는 사실만 구조화한다. 없는 장소·날짜·시간·주소를 만들면 안 되고,
//    불확실하면 null 이다(스키마와 파서가 강제).
//  · Import 는 scheduler 재생성이 아니다 — 원문 Day/순서/시간 보존이 우선이다.

export type ImportKind =
  | "gokoreamate_shared_trip"
  | "external_itinerary"
  | "single_place"
  | "multi_place_content"
  | "unsupported";

export const IMPORT_KINDS: readonly ImportKind[] = [
  "gokoreamate_shared_trip", "external_itinerary", "single_place", "multi_place_content", "unsupported",
];

// ── fetch 안전 상한 ──────────────────────────────────────────────────────────
export const MAX_REDIRECTS = 3;
export const FETCH_TIMEOUT_MS = 12_000;
export const MAX_RESPONSE_BYTES = 1_500_000;   // 1.5MB — 여행 글이면 충분, 남용 차단
export const MAX_TEXT_CHARS = 18_000;          // AI 로 보내는 추출 텍스트 상한
export const ALLOWED_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

// ── URL 검증 (SSRF 1차 방어 — 서버는 이 검증을 통과한 URL 만 fetch 한다) ────
export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: "invalid" | "scheme" | "blocked_host" };

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some(n => n > 255)) return true; // 이상한 리터럴도 차단
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast/reserved
  return false;
}

export function validateImportUrl(raw: string): UrlCheck {
  const s = (raw ?? "").trim();
  if (s.length === 0 || s.length > 2048) return { ok: false, reason: "invalid" };
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`); }
  catch { return { ok: false, reason: "invalid" }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (url.username || url.password) return { ok: false, reason: "blocked_host" };
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return { ok: false, reason: "blocked_host" };
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return { ok: false, reason: "blocked_host" };
  if (!host.includes(".")) return { ok: false, reason: "blocked_host" };   // 단일 라벨(내부 호스트명)
  if (/^\d+$/.test(host)) return { ok: false, reason: "blocked_host" };    // 십진 IP 리터럴
  if (/^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: "blocked_host" };
  if (isPrivateIpv4(host)) return { ok: false, reason: "blocked_host" };
  if (host.startsWith("[")) {
    const v6 = host.slice(1, -1);
    if (v6 === "::1" || /^f[cde]/i.test(v6) || /^fe[89ab]/i.test(v6)) return { ok: false, reason: "blocked_host" };
  }
  return { ok: true, url };
}

/** gokoreamate 자체 URL 인가 — 내부 URL 은 서버 fetch/AI 분석 대상이 아니다(§7). */
export function isOwnHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "gokoreamate.com" || h === "www.gokoreamate.com" || h.endsWith(".gokoreamate.com")
    || h.endsWith(".korea-mate.pages.dev");
}

// ── HTML → 읽을 수 있는 텍스트 (전문 복제가 아니라 구조 추출용 입력) ─────────
const ENTITY: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
  "&middot;": "·", "&ndash;": "–", "&mdash;": "—", "&hellip;": "…", "&rsquo;": "'", "&lsquo;": "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return " "; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; } })
    .replace(/&[a-z]+;|&#\d+;/gi, m => ENTITY[m.toLowerCase()] ?? " ");
}

export interface ExtractedPage {
  title: string;
  description: string;
  /** 구조 힌트(제목 ##, 목록 -)를 남긴 본문 텍스트. MAX_TEXT_CHARS 로 잘린다. */
  text: string;
}

export function extractReadableText(html: string): ExtractedPage {
  const pick = (re: RegExp): string => decodeEntities((html.match(re)?.[1] ?? "")).replace(/\s+/g, " ").trim();
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i)
    || pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i)
    || pick(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)
    || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i);

  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(header|footer|nav|aside)[\s\S]*?<\/\1>/gi, " ");
  // 구조 힌트 — Day 구획과 목록이 AI 에 보이게 한다
  s = s
    .replace(/<h[1-4][^>]*>/gi, "\n## ")
    .replace(/<\/h[1-4]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(p|div|section|article|tr|br|table|ul|ol|h5|h6)[^>]*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s)
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, description, text: s.slice(0, MAX_TEXT_CHARS) };
}

// ── AI 분석 계약 (provider-neutral 내부 계약 — 실제 provider 는 서버가 정한다) ─
export const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    content_kind: { type: "string", enum: ["external_itinerary", "single_place", "multi_place_content", "unsupported"] },
    trip_title: { type: "string", nullable: true },
    city: { type: "string", nullable: true },
    start_date: { type: "string", nullable: true },
    end_date: { type: "string", nullable: true },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day_number: { type: "integer" },
          date: { type: "string", nullable: true },
          stops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                time: { type: "string", nullable: true },
                note: { type: "string", nullable: true },
              },
              required: ["name"],
            },
          },
        },
        required: ["day_number", "stops"],
      },
    },
    places: { type: "array", items: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  },
  required: ["content_kind"],
} as const;

export function buildAnalyzePrompt(page: ExtractedPage, url: string): string {
  return [
    "You analyze one web page for a Korea-travel app. Extract ONLY facts that are explicitly written in the page text below.",
    "Classify content_kind:",
    '- "external_itinerary": a day-by-day travel plan (Day 1/Day 2, 1일차, dates or ordered daily sections).',
    '- "single_place": the page is about exactly one place/venue/attraction.',
    '- "multi_place_content": an article/list mentioning multiple visitable places without a day-by-day plan.',
    '- "unsupported": none of the above (news with no visitable places, login walls, unrelated content).',
    "Hard rules:",
    "- NEVER invent places, dates, times, or addresses that are not in the text. Unknown → null or omit.",
    "- Keep the ORIGINAL order of days and stops exactly as written. Do not reorder or optimize.",
    "- time: only if written, format HH:MM 24h. date: only if unambiguous, format YYYY-MM-DD.",
    "- city: only if the page clearly names one main destination city (lowercase English, e.g. busan/seoul/jeju/gyeongju/jeonju or another city name); else null.",
    "- place names: as written in the page (keep language). Max 40 places total.",
    "- note: at most one short factual phrase from the text (no marketing copy).",
    "- For external_itinerary fill days[]; also list all place names in places[]. For single_place put exactly one entry in places[]. For multi_place_content fill places[] only.",
    `Page URL: ${url}`,
    `Page title: ${page.title || "(none)"}`,
    `Page description: ${page.description || "(none)"}`,
    "Page text:",
    '"""',
    page.text,
    '"""',
    "Return JSON only.",
  ].join("\n");
}

// ── 분석 결과 정화 — 스키마를 통과했어도 여기서 한 번 더 잠근다 ─────────────
export interface AnalyzedStop { name: string; time: string | null; note: string | null }
export interface AnalyzedDay { day_number: number; date: string | null; stops: AnalyzedStop[] }
export interface AnalyzedContent {
  kind: Exclude<ImportKind, "gokoreamate_shared_trip">;
  trip_title: string | null;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  days: AnalyzedDay[];
  places: { name: string }[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const cleanStr = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.replace(/\s+/g, " ").trim().slice(0, max) : null;

export function parseAnalyzed(text: string): AnalyzedContent | null {
  let j: Record<string, unknown>;
  try { j = JSON.parse(text) as Record<string, unknown>; } catch { return null; }
  const kind = j.content_kind;
  if (kind !== "external_itinerary" && kind !== "single_place" && kind !== "multi_place_content" && kind !== "unsupported") return null;

  const days: AnalyzedDay[] = [];
  if (Array.isArray(j.days)) {
    for (const d of (j.days as Record<string, unknown>[]).slice(0, 14)) {
      const n = typeof d.day_number === "number" && d.day_number >= 1 && d.day_number <= 31 ? Math.floor(d.day_number) : null;
      if (n === null) continue;
      const stops: AnalyzedStop[] = [];
      if (Array.isArray(d.stops)) {
        for (const s of (d.stops as Record<string, unknown>[]).slice(0, 20)) {
          const name = cleanStr(s.name, 80);
          if (!name || name.length < 2) continue;
          const time = cleanStr(s.time, 5);
          stops.push({ name, time: time && HHMM.test(time) ? time : null, note: cleanStr(s.note, 140) });
        }
      }
      days.push({ day_number: n, date: (() => { const v = cleanStr(d.date, 10); return v && YMD.test(v) ? v : null; })(), stops });
    }
  }
  const places: { name: string }[] = [];
  const seen = new Set<string>();
  if (Array.isArray(j.places)) {
    for (const p of (j.places as Record<string, unknown>[]).slice(0, 40)) {
      const name = cleanStr(p.name, 80);
      if (name && name.length >= 2 && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); places.push({ name }); }
    }
  }
  const sd = cleanStr(j.start_date, 10);
  const ed = cleanStr(j.end_date, 10);
  return {
    kind,
    trip_title: cleanStr(j.trip_title, 80),
    city: cleanStr(j.city, 40)?.toLowerCase() ?? null,
    start_date: sd && YMD.test(sd) ? sd : null,
    end_date: ed && YMD.test(ed) ? ed : null,
    days,
    places,
  };
}

// ── place 매칭용 이름 정규화 — 정확 일치(대소문자·공백)만. fuzzy 없음. ───────
export function normalizePlaceName(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** PostgREST or=(name.ilike.X) 안에 넣어도 문법이 깨지지 않는 이름만 매칭을 시도한다 */
export function isMatchableName(name: string): boolean {
  return name.length >= 2 && name.length <= 80 && !/[,()*%\\"]/.test(name);
}
