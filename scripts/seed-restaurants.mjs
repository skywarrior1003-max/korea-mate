/**
 * restaurants.json → Supabase restaurants 테이블 Upsert
 * 실행: node scripts/seed-restaurants.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── env 로딩 ───────────────────────────────────────────────────────────────────
try {
  const envPath = resolve(__dir, '../.env.local');
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  });
} catch {}

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY       = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ACCESS_TOKEN   = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF    = SUPABASE_URL?.match(/\/\/([^.]+)\./)?.[1] ?? '';

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 미설정');
  process.exit(1);
}

const restaurants = JSON.parse(
  readFileSync(resolve(__dir, '../public/data/restaurants.json'), 'utf8')
);

console.log(`🍽️  Supabase 시딩 시작 — ${restaurants.length}개 레스토랑`);

// ── PostgREST /rest/v1 Upsert (배치 20개씩) ──────────────────────────────────
const BATCH = 20;
let inserted = 0;
let errors   = 0;

for (let i = 0; i < restaurants.length; i += BATCH) {
  const batch = restaurants.slice(i, i + BATCH);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/restaurants`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey':        ANON_KEY,
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });

    if (res.status === 201 || res.status === 200) {
      inserted += batch.length;
      process.stdout.write(`  ✅ ${Math.min(i + BATCH, restaurants.length)}/${restaurants.length} 삽입 완료\r`);
    } else {
      const errText = await res.text();
      // RLS 권한 오류 시 Management API로 폴백
      if ((res.status === 403 || res.status === 401) && ACCESS_TOKEN) {
        console.log(`\n  ⚠️  anon 권한 거부 (${res.status}) — Management API 폴백 시도`);
        const sql = `INSERT INTO restaurants (${Object.keys(batch[0]).join(',')}) VALUES ${
          batch.map(row =>
            `(${Object.values(row).map(v =>
              v === null ? 'NULL' :
              Array.isArray(v) ? `ARRAY[${v.map(t=>`'${t.replace(/'/g,"''")}'`).join(',')}]` :
              typeof v === 'boolean' ? v :
              typeof v === 'number' ? v :
              `'${String(v).replace(/'/g,"''")}'`
            ).join(',')})`
          ).join(',')
        } ON CONFLICT (id) DO UPDATE SET ${
          Object.keys(batch[0]).filter(k=>k!=='id').map(k=>`${k}=EXCLUDED.${k}`).join(',')
        };`;
        const mgmtRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: sql }),
        });
        if (mgmtRes.status === 201 || mgmtRes.status === 200) {
          inserted += batch.length;
          process.stdout.write(`  ✅ [MgmtAPI] ${Math.min(i + BATCH, restaurants.length)}/${restaurants.length} 삽입\r`);
        } else {
          const e2 = await mgmtRes.text();
          console.error(`\n  ❌ MgmtAPI 오류 (${mgmtRes.status}): ${e2.slice(0,100)}`);
          errors += batch.length;
        }
      } else {
        console.error(`\n  ❌ 배치 오류 (${res.status}): ${errText.slice(0,100)}`);
        errors += batch.length;
      }
    }
  } catch (err) {
    console.error(`\n  ❌ 네트워크 오류: ${err.message}`);
    errors += batch.length;
  }
}

process.stdout.write('\n');
console.log(`\n📊 시딩 결과: 성공 ${inserted}개 / 오류 ${errors}개`);
if (errors === 0) {
  console.log('🎉 Supabase restaurants 테이블 이식 완료!');
} else {
  process.exit(1);
}
