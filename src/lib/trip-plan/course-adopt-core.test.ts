// 코스 → My Trip 직접 생성 계약 (Owner 2026-09-12)
import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptCourseDays, adoptDayCount, type AdoptSpotFacts } from "./course-adopt-core.ts";

const SPOTS = new Map<number, AdoptSpotFacts>([
  [1, { id: 1, name: "해운대해수욕장", category: "attraction", district: "Haeundae-gu", lat: 35.158, lng: 129.160, image: "/img/1.jpg", mapUrl: "https://maps.example/1" }],
  [2, { id: 2, name: "국제시장", category: "attraction", district: "Jung-gu" }],
]);

const stops = [
  { name: "해운대해수욕장", spotId: 1 },
  { name: "동래읍성", spotId: null },     // 미연결 — 이름만
  { name: "국제시장", spotId: 2 },
  { name: "태종대", spotId: 999 },        // id 가 카탈로그에 없음 → 미연결 취급
  { name: "오륙도", spotId: null },
];

test("★날짜 검증 — 형식/역전/30일 초과는 null", () => {
  assert.equal(adoptDayCount("2026-10-01", "2026-10-03"), 3);
  assert.equal(adoptDayCount("2026-10-01", "2026-10-01"), 1);
  assert.equal(adoptDayCount("2026-10-03", "2026-10-01"), null);
  assert.equal(adoptDayCount("2026-13-01", "2026-10-03"), null);
  assert.equal(adoptDayCount("2026-10-01", "2026-11-05"), null, "30일 초과");
});

test("★순서 보존 + 앞날 우선 균등 배분", () => {
  const days = adoptCourseDays(stops, SPOTS, "2026-10-01", "2026-10-02")!;
  assert.equal(days.length, 2);
  // 5개 → 3+2, 코스 순서 그대로
  assert.deepEqual(days[0]!.places.map(p => p.name), ["해운대해수욕장", "동래읍성", "국제시장"]);
  assert.deepEqual(days[1]!.places.map(p => p.name), ["태종대", "오륙도"]);
  assert.equal(days[0]!.date, "2026-10-01");
  assert.equal(days[1]!.date, "2026-10-02");
  assert.equal(days[1]!.dayNumber, 2);
});

test("★연결 stop 만 카탈로그 사실 복사, 미연결은 이름뿐 — 발명 0", () => {
  const days = adoptCourseDays(stops, SPOTS, "2026-10-01", "2026-10-01")!;
  const [linked, unlinked, partial, missing] = [days[0]!.places[0]!, days[0]!.places[1]!, days[0]!.places[2]!, days[0]!.places[3]!];
  assert.equal(linked.place_id, "1");
  assert.equal(linked.source, "city_spot");
  assert.equal(linked.category, "attraction");
  assert.equal(linked.lat, 35.158);
  assert.equal(linked.image, "/img/1.jpg");
  assert.deepEqual(Object.keys(unlinked), ["name"], "미연결 stop 에 발명 필드");
  assert.equal(partial.place_id, "2");
  assert.equal(partial.lat, undefined, "좌표 없는 spot 에 좌표 발명");
  assert.deepEqual(Object.keys(missing), ["name"], "카탈로그 밖 id 를 임의 매칭");
});

test("★시각/소요시간을 지어내지 않는다 — time/duration/slot 키 자체가 없다", () => {
  const days = adoptCourseDays(stops, SPOTS, "2026-10-01", "2026-10-02")!;
  for (const d of days) for (const p of d.places) {
    for (const banned of ["time", "duration", "slot", "tips", "timeSource"]) {
      assert.ok(!(banned in p), `${p.name} 에 ${banned}`);
    }
  }
});

test("★stop 이 날 수보다 적으면 뒷날은 빈 Day — 억지 채움 없음", () => {
  const days = adoptCourseDays(stops.slice(0, 2), SPOTS, "2026-10-01", "2026-10-04")!;
  assert.equal(days.length, 4);
  assert.deepEqual(days.map(d => d.places.length), [1, 1, 0, 0]);
});

test("★빈 코스는 null", () => {
  assert.equal(adoptCourseDays([], SPOTS, "2026-10-01", "2026-10-02"), null);
  assert.equal(adoptCourseDays([{ name: "  " }], SPOTS, "2026-10-01", "2026-10-02"), null);
});
