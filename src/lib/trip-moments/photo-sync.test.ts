/**
 * Memory 사진 서버 동기화 — 업로드 helper · addMomentDetailed · 재동기화 큐
 * Run: node --experimental-strip-types src/lib/trip-moments/photo-sync.test.ts
 *
 * localStorage·fetch·FormData·Blob·atob 을 최소 구현으로 주입해 브라우저 없이 검증한다.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── 브라우저 API 최소 스텁 (import 전에 설치) ────────────────────────────────
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as Record<string, unknown>).window = globalThis;

interface Call { url: string; method: string; isForm: boolean; body: unknown; headers: Record<string, string>; }
let calls: Call[] = [];
let responder: (c: Call) => { ok: boolean; status: number } = () => ({ ok: true, status: 200 });

const defaultFetch = async (url: string, init: Record<string, unknown> = {}) => {
  const body = init.body;
  const c: Call = {
    url,
    method: String(init.method ?? "GET"),
    isForm: typeof FormData !== "undefined" && body instanceof FormData,
    body,
    headers: (init.headers ?? {}) as Record<string, string>,
  };
  calls.push(c);
  const r = responder(c);
  return { ok: r.ok, status: r.status, json: async () => [] };
};
(globalThis as Record<string, unknown>).fetch = defaultFetch;

const {
  loadMoments, addMomentDetailed, resyncPendingMoments,
  uploadMomentPhoto, jpegDataUrlToBlob, loadMomentsFromServer,
} = await import("./storage.ts");
type TM = Awaited<ReturnType<typeof loadMoments>>[number];

const ITIN = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const DEV  = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
// 1x1 JPEG (유효한 base64)
const JPEG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");

function moment(over: Partial<TM> = {}): TM {
  return {
    moment_id: "cccccccc-3333-4333-8333-cccccccccccc",
    itinerary_id: ITIN, device_id: DEV, photo_data: JPEG, memo: "m",
    category: "random", lat: null, lng: null, location_label: "",
    captured_at: "2026-09-01T00:00:00.000Z", day_number: 1, synced: false,
    ...over,
  } as TM;
}
const seed = (list: TM[]) => store.set(`koreamate_moments_${ITIN}`, JSON.stringify(list));
const photoCalls = () => calls.filter(c => /\/photo$/.test(c.url));
const metaCalls  = () => calls.filter(c => c.url === "/api/trip-moments" && c.method === "POST");

beforeEach(() => {
  store.clear(); calls = [];
  responder = () => ({ ok: true, status: 200 });
  // 개별 테스트가 fetch 를 교체할 수 있으므로 매번 기본 스텁으로 되돌린다
  (globalThis as Record<string, unknown>).fetch = defaultFetch;
});

// ── data URL → Blob ──────────────────────────────────────────────────────────

test("jpegDataUrlToBlob: JPEG data URL 만 허용", () => {
  assert.ok(jpegDataUrlToBlob(JPEG));
  for (const bad of ["", "data:image/png;base64,AAAA", "https://evil.com/a.jpg",
                     "data:text/html;base64,AAAA", "data:image/jpeg;base64,!!!"]) {
    assert.strictEqual(jpegDataUrlToBlob(bad), null, bad.slice(0, 30));
  }
});

// ── 업로드 helper ────────────────────────────────────────────────────────────

test("uploadMomentPhoto: multipart 필드명 photo · x-device-id 전달", async () => {
  const ok = await uploadMomentPhoto("mid-1", JPEG, DEV);
  assert.strictEqual(ok, true);
  const c = photoCalls()[0]!;
  assert.match(c.url, /^\/api\/trip-moments\/mid-1\/photo$/);
  assert.strictEqual(c.method, "POST");
  assert.strictEqual(c.isForm, true);
  assert.strictEqual((c.body as FormData).get("photo") instanceof Blob, true);
  assert.strictEqual(c.headers["x-device-id"], DEV);
  // FormData 이므로 Content-Type 을 직접 지정하지 않는다 (boundary 파손 방지)
  assert.strictEqual(c.headers["Content-Type"], undefined);
});

test("uploadMomentPhoto: 서버 실패·네트워크 오류 → false, 예외 없음", async () => {
  responder = () => ({ ok: false, status: 500 });
  assert.strictEqual(await uploadMomentPhoto("m", JPEG, DEV), false);
  (globalThis as Record<string, unknown>).fetch = async () => { throw new Error("offline"); };
  assert.strictEqual(await uploadMomentPhoto("m", JPEG, DEV), false);
});

// ── addMomentDetailed ────────────────────────────────────────────────────────

test("메타 성공 → 사진 API 실제 호출, photo_data 는 JSON 에 없음", async () => {
  const r = await addMomentDetailed(ITIN, moment(), DEV);
  assert.deepStrictEqual(
    { l: r.localSaved, m: r.metaSynced, p: r.photoSynced },
    { l: true, m: true, p: true },
  );
  assert.strictEqual(metaCalls().length, 1);
  assert.strictEqual(photoCalls().length, 1);
  assert.ok(!String(metaCalls()[0]!.body).includes("photo_data"));
  assert.ok(!String(metaCalls()[0]!.body).includes("data:image"));
  const saved = loadMoments(ITIN)[0]!;
  assert.strictEqual(saved.synced, true);
  assert.strictEqual(saved.has_photo, true);
});

test("메타 실패 → 사진 API 미호출, 로컬은 유지(synced=false)", async () => {
  responder = (c) => ({ ok: c.url !== "/api/trip-moments", status: 500 });
  const r = await addMomentDetailed(ITIN, moment(), DEV);
  assert.strictEqual(r.localSaved, true);
  assert.strictEqual(r.metaSynced, false);
  assert.strictEqual(photoCalls().length, 0);
  const saved = loadMoments(ITIN)[0]!;
  assert.strictEqual(saved.synced, false);
  assert.strictEqual(saved.photo_data, JPEG);   // 로컬 Memory 를 지우지 않는다
});

test("사진 실패 → synced=true, has_photo=false, photo_data 유지", async () => {
  responder = (c) => ({ ok: !/\/photo$/.test(c.url), status: 500 });
  const r = await addMomentDetailed(ITIN, moment(), DEV);
  assert.strictEqual(r.metaSynced, true);
  assert.strictEqual(r.photoSynced, false);
  const saved = loadMoments(ITIN)[0]!;
  assert.strictEqual(saved.synced, true);
  assert.strictEqual(saved.has_photo, false);
  assert.strictEqual(saved.photo_data, JPEG);
});

test("사진 없는 텍스트 Memory 는 사진 API 를 부르지 않는다", async () => {
  const r = await addMomentDetailed(ITIN, moment({ photo_data: null }), DEV);
  assert.strictEqual(r.metaSynced, true);
  assert.strictEqual(photoCalls().length, 0);
});

// ── 재동기화 큐 ──────────────────────────────────────────────────────────────

test("A: synced=false → 메타데이터부터 재시도 후 사진까지", async () => {
  seed([moment({ synced: false })]);
  const r = await resyncPendingMoments(ITIN, DEV);
  assert.deepStrictEqual({ m: r.metaSynced, p: r.photoSynced }, { m: 1, p: 1 });
  const saved = loadMoments(ITIN)[0]!;
  assert.strictEqual(saved.synced, true);
  assert.strictEqual(saved.has_photo, true);
});

test("B: synced=true + has_photo 아님 → 사진만 재시도 (메타 재전송 없음)", async () => {
  seed([moment({ synced: true, has_photo: false })]);
  const r = await resyncPendingMoments(ITIN, DEV);
  assert.deepStrictEqual({ m: r.metaSynced, p: r.photoSynced }, { m: 0, p: 1 });
  assert.strictEqual(metaCalls().length, 0);
  assert.strictEqual(photoCalls().length, 1);
});

test("has_photo=true 는 재업로드하지 않는다", async () => {
  seed([moment({ synced: true, has_photo: true })]);
  const r = await resyncPendingMoments(ITIN, DEV);
  assert.deepStrictEqual({ m: r.metaSynced, p: r.photoSynced }, { m: 0, p: 0 });
  assert.strictEqual(photoCalls().length, 0);
});

test("모든 재시도가 순차 실행된다 (동시 진행 0)", async () => {
  seed([
    moment({ moment_id: "m1", synced: true, has_photo: false }),
    moment({ moment_id: "m2", synced: true, has_photo: false }),
    moment({ moment_id: "m3", synced: true, has_photo: false }),
  ]);
  let active = 0, maxActive = 0;
  (globalThis as Record<string, unknown>).fetch = async (url: string, init: Record<string, unknown> = {}) => {
    calls.push({ url, method: String(init.method ?? "GET"), isForm: true, body: init.body,
                 headers: (init.headers ?? {}) as Record<string, string> });
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(r => setTimeout(r, 5));
    active--;
    return { ok: true, status: 200, json: async () => [] };
  };
  await resyncPendingMoments(ITIN, DEV);
  assert.strictEqual(maxActive, 1, "병렬 업로드 발생");
  assert.strictEqual(photoCalls().length, 3);
});

test("한 항목 실패가 다음 항목을 막지 않는다", async () => {
  seed([
    moment({ moment_id: "bad",  synced: true, has_photo: false }),
    moment({ moment_id: "good", synced: true, has_photo: false }),
  ]);
  responder = (c) => ({ ok: !c.url.includes("/bad/"), status: 500 });
  const r = await resyncPendingMoments(ITIN, DEV);
  assert.strictEqual(r.photoSynced, 1);
  const byId = new Map(loadMoments(ITIN).map(m => [m.moment_id, m]));
  assert.strictEqual(byId.get("bad")!.has_photo, false);
  assert.strictEqual(byId.get("good")!.has_photo, true);
});

test("single-flight: 동시 실행 시 두 번째는 즉시 skip", async () => {
  seed([moment({ synced: true, has_photo: false })]);
  (globalThis as Record<string, unknown>).fetch = async (url: string, init: Record<string, unknown> = {}) => {
    calls.push({ url, method: String(init.method ?? "GET"), isForm: true, body: init.body,
                 headers: (init.headers ?? {}) as Record<string, string> });
    await new Promise(r => setTimeout(r, 20));
    return { ok: true, status: 200, json: async () => [] };
  };
  const [a, b] = await Promise.all([
    resyncPendingMoments(ITIN, DEV),
    resyncPendingMoments(ITIN, DEV),
  ]);
  assert.strictEqual(a.skipped + b.skipped, 1, "중복 실행 방지 실패");
  assert.strictEqual(photoCalls().length, 1);
});

test("재동기화는 moment_id 를 바꾸지 않는다 (행 중복 방지 근거)", async () => {
  seed([moment({ moment_id: "fixed-id", synced: false })]);
  await resyncPendingMoments(ITIN, DEV);
  assert.strictEqual(loadMoments(ITIN)[0]!.moment_id, "fixed-id");
  assert.ok(String(metaCalls()[0]!.body).includes("fixed-id"));
});

// ── 다른 기기 삭제 동기화 (2026-09-30) ─────────────────────────────────────────
test("다른 기기에서 지운 기록(synced)은 서버 목록에 없으면 되살리지 않는다 · 못 보낸 pending 은 남긴다 · 다른 여행 캐시는 그대로", async () => {
  const OTHER = "dddddddd-4444-4444-8444-dddddddddddd";
  const deleted = moment({ moment_id: "11111111-aaaa-4aaa-8aaa-111111111111", synced: true, memo: "지워진 기록" });
  const pending = moment({ moment_id: "22222222-aaaa-4aaa-8aaa-222222222222", synced: false, memo: "아직 못 보냄" });
  const kept    = moment({ moment_id: "33333333-aaaa-4aaa-8aaa-333333333333", synced: true, memo: "서버에 있음" });
  seed([deleted, pending, kept]);
  store.set(`koreamate_moments_${OTHER}`, JSON.stringify([moment({ itinerary_id: OTHER, synced: true })]));
  const prev = (globalThis as Record<string, unknown>).fetch;
  (globalThis as Record<string, unknown>).fetch = async () => ({ ok: true, status: 200, json: async () => [{
    moment_id: kept.moment_id, itinerary_id: ITIN, device_id: DEV, memo: "서버에 있음", captured_at: kept.captured_at, day_number: 1, has_photo: false,
  }] });
  try {
    const merged = await loadMomentsFromServer(ITIN, DEV);
    const ids = merged.map(m => m.moment_id).sort();
    assert.deepEqual(ids, [kept.moment_id, pending.moment_id].sort());
    assert.deepEqual(loadMoments(ITIN).map(m => m.moment_id).sort(), ids, "로컬 캐시에서도 빠진다");
    assert.equal(JSON.parse(store.get(`koreamate_moments_${OTHER}`)!).length, 1, "다른 여행 캐시는 건드리지 않는다");
  } finally { (globalThis as Record<string, unknown>).fetch = prev; }
});

test("서버를 못 읽으면(오류) 로컬을 그대로 쓴다 — 지우지 않는다", async () => {
  seed([moment({ moment_id: "44444444-aaaa-4aaa-8aaa-444444444444", synced: true })]);
  const prev = (globalThis as Record<string, unknown>).fetch;
  (globalThis as Record<string, unknown>).fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  try {
    assert.equal((await loadMomentsFromServer(ITIN, DEV)).length, 1);
  } finally { (globalThis as Record<string, unknown>).fetch = prev; }
});

// ── 추가 사진(2026-10-02 단독 수정): 정상 온라인 저장에서 추가 사진이 서버에 가지 않던 결함 · 공개 보호 서버에만 올림 ──
const { _setLatePhotoGuard } = await import("./storage.ts");
/** 서로 다른 사진(같은 사진은 대기 목록에서 함께 빠진다) */
const J = (n: number) => "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, n, 0xff, 0xd9]).toString("base64");
const extraCalls = () => calls.filter(c => /\/photos$/.test(c.url) && c.method === "POST");
/** /photos 응답에 공개 보호 머리글을 단(새 서버) 또는 달지 않은(옛 서버) fetch */
function serverWithGuard(guard: string | null, status = 201, listGuard: string | null = guard) {
  (globalThis as Record<string, unknown>).fetch = async (url: string, init: Record<string, unknown> = {}) => {
    calls.push({ url, method: String(init.method ?? "GET"), isForm: true, body: init.body, headers: {} });
    const extra = /\/photos$/.test(url);
    // 기록 목록(올리기 직전 확인)과 추가 사진 응답의 보호 머리글을 따로 정한다
    const h = extra ? guard : /\/api\/trip-moments\?/.test(url) ? listGuard : null;
    const headers = new Headers(h !== null ? { "x-gkm-late-photo-guard": h } : {});
    return { ok: extra ? status < 300 : true, status: extra ? status : 200, headers, json: async () => [] };
  };
}

test("새 서버(보호 머리글 1) — 첫 장 뒤 추가 사진을 바로 올리고 기기 대기 목록에서 뺀다", async () => {
  _setLatePhotoGuard(true); serverWithGuard("1");
  const r = await addMomentDetailed(ITIN, moment({ photo_data_extra: [JPEG, JPEG] }), DEV);
  assert.strictEqual(r.photoSynced, true);
  assert.strictEqual(photoCalls().length, 1);
  assert.strictEqual(extraCalls().length, 2);
  assert.deepStrictEqual(loadMoments(ITIN)[0]!.photo_data_extra ?? [], []);
});

test("첫 장이 이미 서버에 있어도 남은 추가 사진은 재동기화가 올린다(첫 장 재업로드 없음)", async () => {
  _setLatePhotoGuard(true); serverWithGuard("1");
  seed([moment({ synced: true, has_photo: true, photo_data_extra: [JPEG, JPEG] })]);
  const r = await resyncPendingMoments(ITIN, DEV);
  assert.strictEqual(photoCalls().length, 0);
  assert.strictEqual(extraCalls().length, 2);
  assert.strictEqual(r.photoSynced, 2);
});

test("공개 보호를 알리지 않은 서버(목록 머리글 없음)에는 추가 사진을 올리지 않는다 — 기기에 그대로", async () => {
  _setLatePhotoGuard(true); serverWithGuard("1", 201, null);
  seed([moment({ synced: true, has_photo: true, photo_data_extra: [JPEG, JPEG] })]);
  await resyncPendingMoments(ITIN, DEV);
  assert.strictEqual(extraCalls().length, 0);
  assert.strictEqual(loadMoments(ITIN)[0]!.photo_data_extra?.length, 2);
});

test("올리는 도중 옛 서버로 바뀌면(응답에 머리글 없음) 그 뒤 사진은 올리지 않는다", async () => {
  _setLatePhotoGuard(true); serverWithGuard(null, 201, "1");
  seed([moment({ synced: true, has_photo: true, photo_data_extra: [J(1), J(2), J(3)] })]);
  await resyncPendingMoments(ITIN, DEV);
  assert.strictEqual(extraCalls().length, 1, "첫 응답에서 보호 없음을 알고 멈춘다");
  assert.strictEqual(loadMoments(ITIN)[0]!.photo_data_extra?.length, 2);
  await resyncPendingMoments(ITIN, DEV);
  assert.strictEqual(extraCalls().length, 2, "다시 물으면(목록 1) 한 장 — 응답에 머리글이 없어 또 멈춘다");
});

test("운영 정지(머리글 0·503) — 사진은 기기에 남고 거짓 성공 없음", async () => {
  _setLatePhotoGuard(true); serverWithGuard("0", 503);
  seed([moment({ synced: true, has_photo: true, photo_data_extra: [JPEG, JPEG] })]);
  await resyncPendingMoments(ITIN, DEV);
  assert.strictEqual(loadMoments(ITIN)[0]!.photo_data_extra?.length, 2);
});

test("목록 응답의 머리글로 허용 여부를 정한다(1=허용 · 0·없음=금지)", async () => {
  for (const [h, want] of [["1", 2], ["0", 0], [null, 0]] as const) {
    store.clear(); calls = [];
    (globalThis as Record<string, unknown>).fetch = async (url: string, init: Record<string, unknown> = {}) => {
      calls.push({ url, method: String(init.method ?? "GET"), isForm: true, body: init.body, headers: {} });
      if (/\/api\/trip-moments\?/.test(url)) return { ok: true, status: 200, headers: new Headers(h === null ? {} : { "x-gkm-late-photo-guard": h }), json: async () => [{ moment_id: moment().moment_id, itinerary_id: ITIN, memo: "m", has_photo: true, captured_at: "2026-09-01T00:00:00.000Z", day_number: 1 }] };
      return { ok: true, status: 201, headers: new Headers({ "x-gkm-late-photo-guard": "1" }), json: async () => [] };
    };
    seed([moment({ synced: true, has_photo: true, photo_data_extra: [JPEG, JPEG] })]);
    await loadMomentsFromServer(ITIN, DEV);
    await resyncPendingMoments(ITIN, DEV);
    assert.strictEqual(extraCalls().length, want, `header ${h}`);
  }
});

test("열린 탭이 옛 서버로 되돌려지면(목록 머리글 없음) 이전에 허용을 받았어도 한 장도 올리지 않는다", async () => {
  _setLatePhotoGuard(true); serverWithGuard(null, 201, null);
  seed([moment({ synced: true, has_photo: true, photo_data_extra: [J(1), J(2)] })]);
  await resyncPendingMoments(ITIN, DEV);
  assert.strictEqual(extraCalls().length, 0);
  assert.strictEqual(loadMoments(ITIN)[0]!.photo_data_extra?.length, 2);
});

test("추가 사진이 한도로 거절되면 멈추고 이유를 남긴다 — 사진은 이 기기에 그대로(V2 거절 코드)", async () => {
  _setLatePhotoGuard(true);
  (globalThis as Record<string, unknown>).fetch = async (url: string, init: Record<string, unknown> = {}) => {
    calls.push({ url, method: String(init.method ?? "GET"), isForm: true, body: init.body, headers: {} });
    const lim = url.endsWith("/photos");
    // 새 서버: 목록·추가 사진 응답 모두 공개 보호 표시 1
    return { ok: !lim, status: lim ? 422 : 200, headers: new Headers({ "x-gkm-late-photo-guard": "1" }), json: async () => (lim ? { code: "ITINERARY_LIMIT" } : []) };
  };
  await addMomentDetailed(ITIN, moment({ photo_data_extra: [J(1), J(2)] }), DEV);
  const m = loadMoments(ITIN)[0]!;
  assert.strictEqual(extraCalls().length, 1, "첫 거절 뒤 남은 사진은 보내지 않는다");
  assert.strictEqual(m.photo_data_extra?.length, 2);
  assert.strictEqual(m.photo_sync_error, "ITINERARY_LIMIT");
});
