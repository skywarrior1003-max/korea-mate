import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cityVisual, citiesWithVisual } from "./city-visual.ts";

const ROOT = process.cwd();

test("★5개 도시 모두 자기 이미지를 갖는다", () => {
  assert.deepEqual(citiesWithVisual(), ["busan", "gyeongju", "jeju", "jeonju", "seoul"]);
});

test("★도시별 이미지가 서로 겹치지 않는다 — 교차 노출 0", () => {
  const srcs = citiesWithVisual().map(c => cityVisual(c)!.src);
  assert.equal(new Set(srcs).size, srcs.length, "같은 파일을 두 도시가 쓰고 있다");
});

test("★파일명에 그 도시 이름이 들어 있다 — 잘못 연결하면 여기서 잡힌다", () => {
  for (const c of citiesWithVisual()) {
    assert.match(cityVisual(c)!.src, new RegExp(c, "i"), c);
  }
});

test("★참조하는 이미지 파일이 실제로 있다", () => {
  for (const c of citiesWithVisual()) {
    const p = join(ROOT, "public", cityVisual(c)!.src.replace(/^\//, ""));
    assert.ok(existsSync(p), `${c}: ${cityVisual(c)!.src} 없음`);
  }
});

test("★지원하지 않는 도시는 null — 다른 도시 사진으로 메우지 않는다", () => {
  for (const c of ["daegu", "incheon", "tokyo", "", "  ", null, undefined, 42 as unknown as string]) {
    assert.equal(cityVisual(c as string), null, String(c));
  }
});

test("대소문자·공백 차이를 흡수한다", () => {
  assert.equal(cityVisual("Seoul")!.src,   cityVisual("seoul")!.src);
  assert.equal(cityVisual(" JEJU ")!.src,  cityVisual("jeju")!.src);
});

test("★layout shift 방지용 크기가 모두 있다", () => {
  for (const c of citiesWithVisual()) {
    const v = cityVisual(c)!;
    assert.ok(v.w > 0 && v.h > 0, c);
    assert.match(v.objectPosition, /^\S+ \S+$/, `${c} objectPosition`);
  }
});

test("★KTO 관광 자산과 분리돼 있다 — 프록시·외부 호스트를 쓰지 않는다", () => {
  for (const c of citiesWithVisual()) {
    const src = cityVisual(c)!.src;
    assert.ok(src.startsWith("/images/"), `${c}: ${src}`);
    assert.ok(!src.includes("/img/cover/"), `${c}: KTO 프록시`);
    assert.ok(!/^https?:/.test(src), `${c}: 외부 URL`);
  }
});

test("★신규 도시 이미지를 KTO manifest 에 넣지 않았다 — 허위 출처 0", () => {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, "data/trip-cover/busan-v1-assets.json"), "utf8"),
  ) as { assets: Array<Record<string, string>> };
  for (const a of manifest.assets) {
    assert.equal(a.city, "busan", "KTO manifest 는 부산 전용 그대로여야 한다");
    assert.ok(!/city-(seoul|gyeongju|jeju|jeonju)-v1/.test(a.image_url ?? ""), a.asset_id);
  }
});
