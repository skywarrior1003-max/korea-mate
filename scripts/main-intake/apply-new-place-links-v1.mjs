// apply-new-place-links v1 — 신규/복구 장소의 코스 연결을 external_id·고정 ID 로 적용.
// (DISCOVERY-COMMERCE-AND-CONTENT-REPAIR-V1, 2026-09-17)
//
// DB 를 쓰지 않는다 — READ 로 발급 ID 를 조회해 regional-trips-v1.json 만 수정한다.
// 운영·격리 공용: 운영은 기본(.env.local), 격리는 --base-url http://127.0.0.1:54321 로 실행.
// 격리 발급 숫자 ID 를 하드코딩하지 않기 위한 도구다.
//
// 사용: node scripts/main-intake/apply-new-place-links-v1.mjs [--base-url URL] [--plan seoul-six|haeridan|retired|all]
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const planName = argOf("--plan") ?? "all";

const env = Object.fromEntries(readFileSync(`${ROOT}/.env.local`, "utf8")
  .split(/\r?\n/).filter(l => l.includes("=") && !l.startsWith("#")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const BASE = argOf("--base-url") ?? env.NEXT_PUBLIC_SUPABASE_URL.trim();
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim();

// 연결 계획 — external_id(신규 발급 행) 또는 고정 id(기존 행 복구). 라벨은 계보 기록.
const PLANS = {
  "seoul-six": [
    { trip: "seoul-C-001", stopName: "경복궁 (광화문)", external_id: "kto:126508", linkage: "IDENTITY_LINK_RECOVERY_V2" },
    { trip: "seoul-C-001", stopName: "국립민속박물관", external_id: "kto:2608977", linkage: "IDENTITY_LINK_RECOVERY_V2" },
    { trip: "seoul-C-002", stopName: "북촌한옥마을 (가회동 일원)", external_id: "kto:126537", linkage: "IDENTITY_LINK_RECOVERY_V2" },
    { trip: "seoul-C-002", stopName: "인사동", external_id: "kto:264353", linkage: "IDENTITY_LINK_RECOVERY_V2" },
    { trip: "seoul-C-003", stopName: "국립중앙박물관 내부", external_id: "kto:129703", linkage: "IDENTITY_LINK_RECOVERY_V2" },
    { trip: "seoul-C-003", stopName: "이촌한강공원", external_id: "kto:970636", linkage: "IDENTITY_LINK_RECOVERY_V2" },
  ],
  haeridan: [
    { trip: "busan-C-003", stopName: "해리단길", external_id: "kto:2783306", linkage: "IDENTITY_LINK_RECOVERY_V2" },
  ],
  retired: [
    { trip: "busan-C-002", stopName: "이기대해안산책로", fixedId: 7, linkage: "IDENTITY_LINK_RECOVERY_V2" },
    { trip: "busan-C-003", stopName: "청사포다릿돌전망대", fixedId: 39, linkage: "IDENTITY_LINK_RECOVERY_V2" },
  ],
};
const plan = planName === "all" ? Object.values(PLANS).flat() : PLANS[planName];
if (!plan) { console.error("unknown plan:", planName); process.exit(1); }

// external_id → id 조회 (published 만 — 공개 전 연결 금지 가드)
const exts = plan.filter(p => p.external_id).map(p => p.external_id);
const byExt = new Map();
if (exts.length) {
  const r = await fetch(`${BASE}/rest/v1/city_spots?select=id,external_id,is_published&external_id=in.(${exts.join(",")})`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  for (const row of await r.json()) byExt.set(row.external_id, row);
}
// 고정 id 공개 상태 확인
const fixed = plan.filter(p => p.fixedId).map(p => p.fixedId);
const byId = new Map();
if (fixed.length) {
  const r = await fetch(`${BASE}/rest/v1/city_spots?select=id,is_published&id=in.(${fixed.join(",")})`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  for (const row of await r.json()) byId.set(Number(row.id), row);
}

const jp = `${ROOT}/src/data/regional/regional-trips-v1.json`;
const j = JSON.parse(readFileSync(jp, "utf8"));
let applied = 0, skipped = [];
for (const p of plan) {
  const trip = j.trips.find(t => t.id === p.trip);
  const stop = trip?.stops.find(s => s.name === p.stopName);
  if (!stop) { skipped.push(`${p.trip} ${p.stopName}: stop 미발견`); continue; }
  const row = p.external_id ? byExt.get(p.external_id) : byId.get(p.fixedId);
  if (!row) { skipped.push(`${p.trip} ${p.stopName}: DB 행 미발견(${p.external_id ?? p.fixedId})`); continue; }
  if (!row.is_published) { skipped.push(`${p.trip} ${p.stopName}: 비공개(공개 결정 전 연결 금지)`); continue; }
  if (stop.spotId !== null && stop.spotId !== Number(row.id)) { skipped.push(`${p.trip} ${p.stopName}: 이미 다른 연결(${stop.spotId})`); continue; }
  stop.spotId = Number(row.id);
  stop.linkage = p.linkage;
  applied++;
}
writeFileSync(jp, JSON.stringify(j, null, 1) + "\n");
console.log(`적용 ${applied} · 스킵 ${skipped.length}`);
skipped.forEach(s => console.log("  skip:", s));
