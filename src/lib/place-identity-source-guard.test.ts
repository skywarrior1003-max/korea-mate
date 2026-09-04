// local/static 장소 소스가 canonical city_spot 키를 만들지 못하게 막는 정적 가드
// 실행: node --experimental-strip-types src/lib/place-identity-source-guard.test.ts
//
// 왜 이 파일이 있나
//   Home 은 local-info.json 의 파일 ID 를 citySpotSourceKey() 에 그대로 넣고
//   있었다. Haeundae Beach 는 파일 ID 6 인데 canonical 6 번은 Jangsan Mountain
//   Trail 이라, 저장하고 상세로 들어가면 다른 산이 열렸다. 부산 71 건 중 65 건이
//   다른 장소를, 6 건이 존재하지 않는 행을 가리켰다.
//
//   `place-identity.test.ts` 는 "DB 24 와 local-info 24 는 다른 identity 다" 를
//   이미 단언하고 있었다. 규칙은 있었지만 규칙을 어긴 호출부를 아무도 보지
//   않았다. 그래서 여기서는 값이 아니라 **호출부**를 본다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

/** 주석은 규칙 대상이 아니다 — 같은 길이의 공백으로 지워 줄 번호를 보존한다 */
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  return noBlock.replace(/\/\/[^\n]*/g, m => " ".repeat(m.length));
}

test("★Home/Planner 는 local-info 장소 카드를 더 이상 들지 않는다 — canonical 키 오염 경로 0", () => {
  // RELEASE-CLEANUP/SEPARATION 으로 Home 의 V1 장소 디렉토리 자체가 제거됐다.
  // 원 invariant("local-info 파일 ID 로 canonical 키를 만들지 않는다")는
  // 소비처가 사라진 지금 "그 호출부가 되살아나지 않는다" 로 지킨다.
  for (const f of [["src", "app", "HomeClient.tsx"], ["src", "app", "planner", "PlannerClient.tsx"]]) {
    const src = stripComments(read(...f));
    assert.doesNotMatch(src, /citySpotSourceKey\s*\(/, `${f.join("/")}: canonical 키 생성 금지`);
    assert.doesNotMatch(src, /local-info\.json/, `${f.join("/")}: V1 목록 재소비 금지`);
  }
});

test("★Explore 의 staticSpots fallback 은 canonical 키를 만들지 않는다", () => {
  const src = stripComments(read("src", "components", "ExploreCity.tsx"));
  // Supabase 결과와 staticSpots 를 한 map 에서 같은 키로 처리하면 fallback 이
  // 걸릴 때마다 Version 1 파일 ID 가 canonical 인 척하게 된다.
  assert.doesNotMatch(
    src, /\(\s*deduped\.length\s*>\s*0\s*\?\s*deduped\s*:\s*city\.staticSpots\s*\)\s*\.\s*map\s*\(\s*s\s*=>\s*\(\{[^}]*citySpotSourceKey/,
    "canonical 과 staticSpots 를 한 map 에서 같은 sourceKey 규칙으로 처리하고 있다",
  );
  assert.match(
    src, /localInfoSourceKey\s*\(\s*city\.name\s*,\s*s\.id\s*\)/,
    "staticSpots fallback 은 local_info 네임스페이스를 써야 한다",
  );
});

test("★canonical 경로는 그대로 city_spot 키를 만든다", () => {
  // 실제 city_spots 행에서 만드는 키까지 막으면 Place Detail 저장이 깨진다.
  //
  // 키를 만드는 곳은 canonical adapter 하나다. Place Detail 은 저장할 때 그
  // adapter 를 거치므로 직접 부르지 않아도 같은 키가 나온다.
  assert.match(stripComments(read("src", "lib", "place-detail", "place-detail-core.ts")),
    /citySpotSourceKey\s*\(/, "canonical 경로가 사라졌다");
  assert.match(stripComments(read("src", "app", "place", "[id]", "PlaceDetailClient.tsx")),
    /toItineraryEvent\(spot, text\)/, "Place Detail 이 canonical adapter 를 거치지 않는다");
});

test("★Version 1 정적 목록과 canonical id 는 서로 다른 공간이다", () => {
  // busan.ts staticSpots 의 id 가 city_spots 1~7 처럼 보이는 값으로 바뀌면
  // 위 가드를 지나도 다시 헷갈리기 시작한다. 파일 ID 라는 사실을 고정한다.
  const src = read("src", "data", "cities", "busan.ts");
  const ids = [...src.matchAll(/id:\s*(\d+),\s*\n\s*name:\s*"/g)].map(m => Number(m[1]));
  assert.ok(ids.length > 0, "busan.ts staticSpots 를 읽지 못했다");
  // V1 legacy-retirement(2026-09-01) 이후 13/14/15 는 은퇴했다 — 남은 4건.
  assert.deepEqual(
    ids, [6, 7, 8, 12],
    "staticSpots 의 id 는 local-info.json 파일 ID 다. 값을 바꾸려면 소비처의 " +
    "sourceKey 규칙부터 확인해야 한다",
  );
});
