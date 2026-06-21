#!/usr/bin/env npx tsx
/**
 * scripts/import-spots.ts
 * GoKoreaMate 스팟 CSV 일괄 업로드 스크립트
 *
 * 사용법:
 *   npx tsx scripts/import-spots.ts <csv파일경로>
 *   npx tsx scripts/import-spots.ts data/busan-hiking.csv
 *
 * 필수 .env.local 설정:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  (Supabase > Settings > API > service_role)
 *
 * ──────────────────────────────────────────────────────────────
 * CSV 헤더 규격 (Google Sheets 첫 행에 그대로 복붙):
 *
 * city, name, category, district, address, description, why_it_matters,
 * image_url, map_url, naver_map_url, lat, lng, duration_minutes, best_time_slot,
 * opening_hours_open, opening_hours_close, tags, solo_friendly,
 * foreign_card_accepted, cash_only, official_url, affiliate_url,
 * affiliate_provider, entry_fee, difficulty, source_type, external_id, rating
 *
 * 필수: city, name, category
 * tags 구분자: | (파이프) — 예: #Hiking|#Free|#Forest
 * boolean: true / false (소문자)
 * category: attraction | restaurant | nature | event | accommodation
 * difficulty: easy | moderate | hard  (하이킹만)
 * affiliate_provider: agoda | booking | klook
 * opening_hours: open/close 컬럼을 분리해서 입력 — 예: 09:00 / 18:00
 * ──────────────────────────────────────────────────────────────
 */

import fs   from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// ── .env.local 로드 ──────────────────────────────────────────────────────────

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ── CSV 파서 (따옴표 안의 쉼표 처리 포함) ──────────────────────────────────

function parseLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      result.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split("\n").map(l => l.trimEnd()).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? "").trim()]));
  });
}

// ── CSV 행 → DB 행 매핑 ───────────────────────────────────────────────────

type SpotInsert = {
  city: string; name: string; name_l10n: null;
  category: string; district: string | null; address: string | null;
  description: string | null; desc_l10n: null;
  why_it_matters: string | null; why_l10n: null;
  image_url: string | null; map_url: string | null; naver_map_url: string | null;
  lat: number | null; lng: number | null;
  duration_minutes: number | null; best_time_slot: string | null;
  opening_hours: { open: string; close: string } | null;
  tags: string[] | null;
  solo_friendly: boolean; foreign_card_accepted: boolean; cash_only: boolean;
  source_type: string; external_id: string | null; rating: number | null;
  official_url: string | null; affiliate_url: string | null;
  affiliate_provider: string | null; entry_fee: string | null;
  difficulty: string | null; updated_at: string;
};

function mapRow(row: Record<string, string>): SpotInsert {
  const s  = (k: string) => row[k]?.trim() || null;
  const b  = (k: string, def = true) => row[k]?.trim() ? row[k].trim().toLowerCase() === "true" : def;
  const n  = (k: string) => row[k]?.trim() ? parseFloat(row[k]) : null;
  const ni = (k: string) => row[k]?.trim() ? parseInt(row[k])   : null;

  const open  = s("opening_hours_open");
  const close = s("opening_hours_close");

  return {
    city:                 s("city")!,
    name:                 s("name")!,
    name_l10n:            null,
    category:             s("category") ?? "attraction",
    district:             s("district"),
    address:              s("address"),
    description:          s("description"),
    desc_l10n:            null,
    why_it_matters:       s("why_it_matters"),
    why_l10n:             null,
    image_url:            s("image_url"),
    map_url:              s("map_url"),
    naver_map_url:        s("naver_map_url"),
    lat:                  n("lat"),
    lng:                  n("lng"),
    duration_minutes:     ni("duration_minutes"),
    best_time_slot:       s("best_time_slot"),
    opening_hours:        open && close ? { open, close } : null,
    tags:                 s("tags") ? row["tags"].split("|").map(t => t.trim()).filter(Boolean) : null,
    solo_friendly:        b("solo_friendly", true),
    foreign_card_accepted: b("foreign_card_accepted", true),
    cash_only:            b("cash_only", false),
    source_type:          s("source_type") ?? "manual",
    external_id:          s("external_id"),
    rating:               n("rating"),
    official_url:         s("official_url"),
    affiliate_url:        s("affiliate_url"),
    affiliate_provider:   s("affiliate_provider"),
    entry_fee:            s("entry_fee"),
    difficulty:           s("difficulty"),
    updated_at:           new Date().toISOString(),
  };
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal();

  const csvFile = process.argv[2];
  if (!csvFile) {
    console.error("사용법: npx tsx scripts/import-spots.ts <csv파일>");
    process.exit(1);
  }

  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) {
    console.error("❌ .env.local에 NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음");
    console.error("   Supabase Dashboard > Settings > API > service_role 키를 .env.local에 추가하세요");
    process.exit(1);
  }

  const supabase = createClient(url, svcKey);

  const filePath = path.resolve(csvFile);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 파일 없음: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const rows    = parseCSV(content);

  const valid   = rows.filter(r => r.city?.trim() && r.name?.trim());
  const skipped = rows.length - valid.length;
  if (skipped > 0) console.warn(`⚠️  city/name 누락으로 ${skipped}행 건너뜀`);
  if (valid.length === 0) { console.error("❌ 유효한 행 없음"); process.exit(1); }

  const spots = valid.map(mapRow);
  console.log(`\n📦 ${spots.length}개 스팟 업로드 시작 (upsert 기준: city + name)\n`);

  const CHUNK = 50;
  let success = 0;
  let failed  = 0;

  for (let i = 0; i < spots.length; i += CHUNK) {
    const chunk = spots.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("city_spots")
      .upsert(chunk, { onConflict: "city,name" });

    if (error) {
      console.error(`❌ [${i + 1}~${Math.min(i + CHUNK, spots.length)}] ${error.message}`);
      failed += chunk.length;
    } else {
      success += chunk.length;
      console.log(`✅ ${Math.min(i + CHUNK, spots.length)} / ${spots.length}`);
    }
  }

  console.log(`\n${"─".repeat(40)}`);
  console.log(`완료: ✅ 성공 ${success}개  ❌ 실패 ${failed}개`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
