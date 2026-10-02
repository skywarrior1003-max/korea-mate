// 사진 원본에서 촬영 시각·촬영 위치만 읽는다 — 브라우저 안에서, 업로드 전에.
//
// 읽은 값은 "제안" 이다. 사용자가 [사용] 을 눌러야 시간·위치 칸에 들어간다.
// 업로드되는 사진은 이와 별개로 압축(canvas) + 서버 APP1 제거를 거쳐 EXIF·GPS 가
// 남지 않는다. 이 파일은 아무것도 서버로 보내지 않는다.
//
// 촬영 위치는 "카메라가 있던 자리" 다. 가게 주소와 다를 수 있고(길 건너에서 찍은
// 사진), 지금 휴대폰 위치와도 다르다. 화면은 셋을 섞지 않는다.
//
// JPEG 만 읽는다(HEIC 등은 null). 손상·부분 파일은 예외 없이 null.

export interface PhotoExif {
  /** 촬영 시각 "YYYY-MM-DD" · "HH:MM" — 카메라 시계 그대로(시간대 정보는 없을 수 있다). */
  date: string | null;
  time: string | null;
  /** 촬영 위치. 둘 다 있을 때만. */
  lat:  number | null;
  lng:  number | null;
}

const EMPTY: PhotoExif = { date: null, time: null, lat: null, lng: null };

/** 앞부분만 읽는다 — EXIF 는 파일 맨 앞(APP1)에 있다. */
const HEAD_BYTES = 256 * 1024;

export async function readPhotoExif(file: Blob): Promise<PhotoExif> {
  try {
    const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
    if (isHeif(head)) {
      // HEIC/HEIF(아이폰 기본 형식) — Exif 는 별도 항목(item)이고 파일 어디에 있는지 iloc 이 말해 준다.
      const at = locateHeifExif(head);
      if (!at) return EMPTY;
      const item = new Uint8Array(await file.slice(at.offset, at.offset + at.length).arrayBuffer());
      return parseHeifExifItem(item);
    }
    return parseExif(head);
  } catch {
    return EMPTY;
  }
}

// ── HEIC/HEIF ────────────────────────────────────────────────────────────────
// ISOBMFF 상자 구조: [크기 4][종류 4] … meta(FullBox) 안의 iinf(항목 목록)에서 종류가 'Exif' 인
// 항목 번호를 찾고, iloc(항목 위치)에서 그 번호의 파일 내 위치·길이를 읽는다.

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "avif"]);

/** 파일 앞머리가 HEIF 계열(ftyp)인가 — 확장자·MIME 을 믿지 않고 바이트로 본다. */
export function isHeif(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const typ = String.fromCharCode(b[4], b[5], b[6], b[7]);
  if (typ !== "ftyp") return false;
  const size = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  const end = Math.min(b.length, size || b.length);
  for (let o = 8; o + 4 <= end; o += 4) {
    if (o === 12) continue; // minor_version
    if (HEIF_BRANDS.has(String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]))) return true;
  }
  return false;
}

type Box = { type: string; start: number; body: number; end: number };
function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let o = from;
  while (o + 8 <= to) {
    let size = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    let body = o + 8;
    if (size === 1) {
      if (o + 16 > to) break;
      // 64비트 크기 — 사진 파일에서 2^53 을 넘을 일은 없어 곱셈으로 충분하다(BigInt 는 빌드 대상 밖).
      size = 0;
      for (let i = 8; i < 16; i++) size = size * 256 + b[o + i];
      body = o + 16;
    } else if (size === 0) {
      size = to - o;
    }
    if (size < 8) break;
    out.push({ type, start: o, body, end: Math.min(to, o + size) });
    o += size;
  }
  return out;
}

/** Exif 항목의 파일 내 위치. 앞머리(meta 가 들어 있는 범위)만 있으면 된다. 못 찾으면 null. */
export function locateHeifExif(b: Uint8Array): { offset: number; length: number } | null {
  const be = (o: number, n: number) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[o + i]; return v; };
  const meta = boxes(b, 0, b.length).find(x => x.type === "meta");
  if (!meta) return null;
  const kids = boxes(b, meta.body + 4, meta.end); // FullBox: version/flags 4바이트
  const iinf = kids.find(x => x.type === "iinf"), iloc = kids.find(x => x.type === "iloc");
  if (!iinf || !iloc) return null;

  // iinf → Exif 항목 번호
  const iv = b[iinf.body];
  const listFrom = iinf.body + 4 + (iv === 0 ? 2 : 4);
  let exifId: number | null = null;
  for (const e of boxes(b, listFrom, iinf.end)) {
    if (e.type !== "infe") continue;
    const v = b[e.body];
    if (v < 2) continue;
    const idLen = v === 2 ? 2 : 4;
    const id = be(e.body + 4, idLen);
    const t = e.body + 4 + idLen + 2;
    if (String.fromCharCode(b[t], b[t + 1], b[t + 2], b[t + 3]) === "Exif") { exifId = id; break; }
  }
  if (exifId === null) return null;

  // iloc → 그 항목의 첫 범위
  const lv = b[iloc.body];
  let o = iloc.body + 4;
  const offSize = b[o] >> 4, lenSize = b[o] & 15, baseSize = b[o + 1] >> 4, idxSize = lv >= 1 ? b[o + 1] & 15 : 0;
  o += 2;
  const count = lv < 2 ? be(o, 2) : be(o, 4); o += lv < 2 ? 2 : 4;
  for (let i = 0; i < count && o < iloc.end; i++) {
    const id = lv < 2 ? be(o, 2) : be(o, 4); o += lv < 2 ? 2 : 4;
    let method = 0;
    if (lv >= 1) { method = be(o, 2) & 15; o += 2; }
    o += 2; // data_reference_index
    const base = baseSize ? be(o, baseSize) : 0; o += baseSize;
    const extents = be(o, 2); o += 2;
    let first: { offset: number; length: number } | null = null;
    for (let x = 0; x < extents; x++) {
      if (lv >= 1 && idxSize) o += idxSize;
      const eo = offSize ? be(o, offSize) : 0; o += offSize;
      const el = lenSize ? be(o, lenSize) : 0; o += lenSize;
      if (x === 0) first = { offset: base + eo, length: el };
    }
    if (id === exifId) return method === 0 && first && first.length > 0 && first.length < 1_000_000 ? first : null;
  }
  return null;
}

/** HEIF Exif 항목 데이터: [TIFF 머리까지의 거리 4바이트][보통 "Exif\0\0"][TIFF…] */
export function parseHeifExifItem(item: Uint8Array): PhotoExif {
  if (item.length < 12) return EMPTY;
  const skip = ((item[0] << 24) | (item[1] << 16) | (item[2] << 8) | item[3]) >>> 0;
  const start = 4 + skip;
  if (start + 8 > item.length) return EMPTY;
  return parseTiff(item, start, item.length);
}

/** 순수 함수 — 테스트용으로 바이트를 직접 받는다. */
export function parseExif(b: Uint8Array): PhotoExif {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return EMPTY;
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return EMPTY;
    const marker = b[p + 1];
    if (marker === 0xda || marker === 0xd9) return EMPTY; // 영상 데이터 시작 — EXIF 없음
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2) return EMPTY;
    if (marker === 0xe1 && p + 10 <= b.length
        && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66 && b[p + 8] === 0 && b[p + 9] === 0) {
      return parseTiff(b, p + 10, Math.min(b.length, p + 2 + len));
    }
    p += 2 + len;
  }
  return EMPTY;
}

function parseTiff(b: Uint8Array, base: number, end: number): PhotoExif {
  if (base + 8 > end) return EMPTY;
  const le = b[base] === 0x49 && b[base + 1] === 0x49;
  const be = b[base] === 0x4d && b[base + 1] === 0x4d;
  if (!le && !be) return EMPTY;
  const u16 = (o: number) => (o + 2 > end ? -1 : le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) => (o + 4 > end ? -1 : le
    ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
    : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);

  type Entry = { tag: number; type: number; count: number; valueOff: number };
  const readIfd = (off: number): Entry[] => {
    const at = base + off;
    const n = u16(at);
    if (n < 0 || n > 512) return [];
    const out: Entry[] = [];
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > end) break;
      const type = u16(e + 2), count = u32(e + 4);
      const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] ?? 0;
      const valueOff = size * count <= 4 ? e + 8 : base + u32(e + 8);
      out.push({ tag: u16(e), type, count, valueOff });
    }
    return out;
  };
  const ascii = (e: Entry | undefined): string | null => {
    if (!e || e.type !== 2 || e.valueOff + e.count > end) return null;
    let s = "";
    for (let i = 0; i < e.count; i++) { const c = b[e.valueOff + i]; if (c === 0) break; s += String.fromCharCode(c); }
    return s;
  };
  const rationals = (e: Entry | undefined): number[] | null => {
    if (!e || e.type !== 5 || e.valueOff + e.count * 8 > end) return null;
    const v: number[] = [];
    for (let i = 0; i < e.count; i++) {
      const num = u32(e.valueOff + i * 8), den = u32(e.valueOff + i * 8 + 4);
      if (num < 0 || den <= 0) return null;
      v.push(num / den);
    }
    return v;
  };

  const ifd0Off = u32(base + 4);
  if (ifd0Off < 0) return EMPTY;
  const ifd0 = readIfd(ifd0Off);
  const exifPtr = ifd0.find(e => e.tag === 0x8769);
  const gpsPtr  = ifd0.find(e => e.tag === 0x8825);

  let date: string | null = null, time: string | null = null;
  const dtRaw = (exifPtr ? ascii(readIfd(u32(exifPtr.valueOff)).find(e => e.tag === 0x9003)) : null)
    ?? ascii(ifd0.find(e => e.tag === 0x0132));
  const m = dtRaw?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/);
  if (m && m[1] !== "0000") { date = `${m[1]}-${m[2]}-${m[3]}`; time = `${m[4]}:${m[5]}`; }

  let lat: number | null = null, lng: number | null = null;
  if (gpsPtr) {
    const gps = readIfd(u32(gpsPtr.valueOff));
    const latRef = ascii(gps.find(e => e.tag === 1)), lngRef = ascii(gps.find(e => e.tag === 3));
    const la = rationals(gps.find(e => e.tag === 2)), lo = rationals(gps.find(e => e.tag === 4));
    if (la && lo && la.length >= 3 && lo.length >= 3) {
      let y = la[0] + la[1] / 60 + la[2] / 3600;
      let x = lo[0] + lo[1] / 60 + lo[2] / 3600;
      if (latRef === "S") y = -y;
      if (lngRef === "W") x = -x;
      if (Number.isFinite(y) && Number.isFinite(x) && Math.abs(y) <= 90 && Math.abs(x) <= 180 && !(y === 0 && x === 0)) {
        lat = Math.round(y * 1e6) / 1e6; lng = Math.round(x * 1e6) / 1e6;
      }
    }
  }
  return { date, time, lat, lng };
}

/**
 * 여러 사진의 촬영 정보가 서로 다른가 — 다르면 화면이 "몇 번째 사진 기준" 인지 말한다.
 * 시각은 날짜가 다르거나 2시간 넘게 벌어지면, 위치는 300m 넘게 떨어지면 다르다고 본다.
 */
export function exifConflict(list: PhotoExif[]): { time: boolean; place: boolean } {
  const withTime = list.filter(e => e.date && e.time);
  const withGps  = list.filter(e => e.lat !== null && e.lng !== null);
  const mins = (e: PhotoExif) => {
    const [h, mi] = (e.time as string).split(":").map(Number);
    return Date.parse(`${e.date}T00:00:00Z`) / 60000 + h * 60 + mi;
  };
  let time = false;
  for (let i = 1; i < withTime.length; i++) if (Math.abs(mins(withTime[i]) - mins(withTime[0])) > 120) time = true;
  let place = false;
  for (let i = 1; i < withGps.length; i++) {
    const a = withGps[0], c = withGps[i];
    const dy = ((c.lat as number) - (a.lat as number)) * 111_000;
    const dx = ((c.lng as number) - (a.lng as number)) * 111_000 * Math.cos(((a.lat as number) * Math.PI) / 180);
    if (Math.hypot(dx, dy) > 300) place = true;
  }
  return { time, place };
}
