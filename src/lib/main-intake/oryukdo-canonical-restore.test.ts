// Oryukdo Skywalk (id 28) current-canonical restore — correction artifact consistency guard
// 실행: node --experimental-strip-types src/lib/main-intake/oryukdo-canonical-restore.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const art = JSON.parse(readFileSync(path.join(ROOT, "data", "main-intake", "five-city-core-v3", "corrections", "candidate-corrections-oryukdo-skywalk-current-canonical-v1.json"), "utf8")) as {
  target_id: number; classification: string; after: Record<string, unknown>; before: Record<string, unknown>; sql: { file: string; sha256: string; writes: Record<string, number> }; image: { city_spot_images_insert: number };
};

test("single-exception artifact targets id 28 only, republishes, no image insert, no delete", () => {
  assert.equal(art.target_id, 28);
  assert.equal(art.classification, "OWNER_APPROVED_SINGLE_EXCEPTION_CURRENT_CANONICAL_RESTORE");
  assert.equal(art.before.is_published, false);
  assert.equal(art.after.is_published, true);
  assert.equal(art.after.image_url, null);
  assert.equal(art.image.city_spot_images_insert, 0);
  assert.deepEqual(art.sql.writes, { "city_spots UPDATE": 1, "city_spot_images INSERT": 0, DELETE: 0 });
  assert.match(String(art.after.naver_map_url), /^https:\/\/map\.naver\.com\/p\/entry\/place\/\d+$/);
  assert.equal(art.after.subcategory, "Viewpoint");
  assert.equal(art.after.district, "Nam-gu");
});

test("4-locale content present with the same facts (free · glass · cliff · Galmaet-gil)", () => {
  const d = art.after.desc_l10n as Record<string, string>; const w = art.after.why_l10n as Record<string, string>; const n = art.after.name_l10n as Record<string, string>;
  for (const l of ["ko", "en", "ja", "zh"]) { assert.ok(d[l] && d[l].length > 40, l); assert.ok(w[l] && w[l].length > 10, l); assert.ok(n[l], l); }
  assert.match(d.ko, /무료/); assert.match(d.en, /Free admission/); assert.match(d.ja, /無料/); assert.match(d.zh, /免费/);
  assert.match(d.ko, /갈맷길/); assert.match(d.en, /Galmaet-gil/);
  for (const l of ["ko", "en", "ja", "zh"]) assert.ok(!/최고|반드시|must-visit|best in/i.test(d[l] + w[l]), "no superlatives " + l);
});

test("static duplicate spot-busan-010 stays removed and the V1 lists do not re-add the card", () => {
  const ev = JSON.parse(readFileSync(path.join(ROOT, "public", "data", "events.json"), "utf8")) as Array<{ id: string; name: string }>;
  assert.ok(!ev.some(e => e.id === "spot-busan-010" || e.name === "Oryukdo Skywalk"));
  const home = readFileSync(path.join(ROOT, "src", "app", "HomeClient.tsx"), "utf8"); const busan = readFileSync(path.join(ROOT, "src", "data", "cities", "busan.ts"), "utf8");
  assert.ok(!home.includes('name: "Oryukdo Skywalk"') && !busan.includes('name: "Oryukdo Skywalk"'));
});
