// 전주 776(메르밀진미집 본점) 정체성 재오염 방지 가드
// (JEONJU-776-PLACE-IDENTITY-CORRECTION-V1 · 2026-09-24)
// 실행: node --experimental-strip-types src/lib/data-guards/jeonju-776-identity-guard.test.ts
//
// 이 파일이 막는 재오염 경로
//  · intake artifact(OFF-17463)에는 오염값(향교길 11 주소·display_eligible:false
//    침대 이미지·시청 전화)이 그대로 남아 있다 — Final 은 Data Track 소유라
//    여기서 고치지 않는다. 대신 **재반입 기준서**(correction 기록)가 존재하고
//    오염값이 무엇인지 명문화됐음을 고정한다. 향후 776 을 다시 쓰는 어떤
//    데이터 작업도 이 가드와 correction 기록을 통과해야 한다.
//  · repo 정적 데이터·운영 SQL 이 오염값을 canonical 로 되살리는 것을 막는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/** 검증 완료된 canonical 정체성(2+ 원천) — 값이 바뀌면 재검증과 함께 갱신할 것 */
export const JEONJU_776_CANONICAL = {
  id: 776,
  name: "메르밀진미집 본점",
  category: "restaurant",
  address: "전북특별자치도 전주시 완산구 전주천동로 94",
  // 트리플·식신과 ±4m 일치 — 기존 DB 좌표가 실제 음식점 위치다
  lat: 35.8111035497203,
  lng: 127.150406207841,
  phone_for_future_column: "063-288-4020",
} as const;

/** 확인된 오염값 — 어떤 경로로도 776 에 재도입 금지 */
export const JEONJU_776_CONTAMINATED = {
  address: "향교길 11",                      // 다나하루 게스트하우스 주소
  image: "2570942_image2_1.jpg",             // KTO 숙박 계열 침대 이미지
  deferredPhone: "063-222-1000",             // 전주시청 대표번호
} as const;

test("교정 SQL — 조건부 1행·이미지 NULL 유지·오염 주소를 새 값으로 쓰지 않는다", () => {
  const sql = read("docs/operations/jeonju-776-identity-fix-2026-09-24.sql");
  assert.match(sql, /WHERE id = 776/);
  assert.match(sql, /SET address = '전북특별자치도 전주시 완산구 전주천동로 94'/);
  assert.match(sql, /AND address = '전북특별자치도 전주시 완산구 향교길 11'/, "조사 시점 원값 조건");
  assert.match(sql, /AND image_url IS NULL/, "직전 릴리스의 NULL 상태를 전제로 한다");
  assert.match(sql, /AND lat = 35\.8111035497203/, "좌표 불변 전제 고정");
  // 침대 이미지 복원 문이 없다
  assert.ok(!/SET[^;]*image_url\s*=\s*'http/.test(sql), "이미지 복원 금지");
});

test("correction 기록 — Data Track 전달물이 존재하고 오염·검증값을 담는다", () => {
  const p = "data/main-intake/five-city-core-v3/corrections/candidate-corrections-jeonju-776-identity-v1.json";
  assert.ok(existsSync(path.join(ROOT, p)));
  const rec = JSON.parse(read(p)) as {
    target_id: number; canonical_id: string;
    contamination: Record<string, string>; verified_identity: { address_road: string; phone: string };
  };
  assert.equal(rec.target_id, 776);
  assert.equal(rec.canonical_id, "OFF-17463");
  assert.ok(rec.contamination.address.includes(JEONJU_776_CONTAMINATED.address));
  assert.ok(rec.contamination.image_url.includes(JEONJU_776_CONTAMINATED.image));
  assert.ok(rec.verified_identity.address_road === JEONJU_776_CANONICAL.address);
  assert.ok(rec.verified_identity.phone.includes(JEONJU_776_CANONICAL.phone_for_future_column));
});

test("intake 원본 — OFF-17463 이미지의 display_eligible:false 가 유지된다(반입 차단 근거)", () => {
  // v1~v3 세 세대 모두 같은 행을 담는다 — display_eligible 이 true 로 바뀌면
  // 누군가 차단 근거를 지운 것이므로 실패시킨다(Final 무수정 감시).
  for (const gen of ["five-city-core-v1", "five-city-core-v2", "five-city-core-v3"]) {
    const p = `data/main-intake/${gen}/five-city-core-images-v1.jsonl`;
    if (!existsSync(path.join(ROOT, p))) continue;
    const line = read(p).split("\n").find(l => l.includes("OFF-17463"));
    assert.ok(line, `${gen}: OFF-17463 이미지 행`);
    const row = JSON.parse(line!) as { display_eligible: boolean; image_url: string };
    assert.equal(row.display_eligible, false, `${gen}: display_eligible 이 완화됐다`);
    assert.ok(row.image_url.includes(JEONJU_776_CONTAMINATED.image));
  }
});

test("repo 정적 데이터 — 776 을 오염 주소·이미지와 함께 되살리는 파일이 없다", () => {
  // canonical 재수화는 DB 이므로, repo 에서 감시할 것은 regional seed 와 src/data.
  const targets: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (f.isDirectory()) walk(`${dir}/${f.name}`);
      else if (/\.(json|ts)$/.test(f.name)) targets.push(`${dir}/${f.name}`);
    }
  };
  walk("src/data/regional");
  for (const p of targets) {
    const s = read(p);
    if (!s.includes("776")) continue;
    assert.ok(!s.includes(JEONJU_776_CONTAMINATED.address), `${p}: 오염 주소 재도입`);
    assert.ok(!s.includes(JEONJU_776_CONTAMINATED.image), `${p}: 오염 이미지 재도입`);
  }
});

test("좌표 sanity — canonical 좌표가 전주 한옥마을 인근 유효 범위다", () => {
  const { lat, lng } = JEONJU_776_CANONICAL;
  assert.ok(lat > 35.80 && lat < 35.83 && lng > 127.13 && lng < 127.17);
  // 다나하루 좌표(≈35.81179,127.15026)와 같은 지점으로 오인하지 않는다 —
  // 두 지점은 ≈77m 떨어져 있고, canonical 은 트리플·식신과 ±4m 다.
  const danaLat = 35.8117868, danaLng = 127.1502589;
  const meters = Math.hypot((lat - danaLat) * 111320, (lng - danaLng) * 90400);
  assert.ok(meters > 30, `다나하루와의 거리 ${meters.toFixed(1)}m — 30m 이하면 재검증 필요`);
});
