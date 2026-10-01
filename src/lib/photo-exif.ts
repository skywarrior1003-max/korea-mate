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
    const buf = await file.slice(0, HEAD_BYTES).arrayBuffer();
    return parseExif(new Uint8Array(buf));
  } catch {
    return EMPTY;
  }
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
