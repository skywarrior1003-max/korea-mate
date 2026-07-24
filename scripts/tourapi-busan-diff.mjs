#!/usr/bin/env node
/**
 * tourapi-busan-diff.mjs — 저장공간 관리·스냅샷·변경분 비교 헬퍼
 *
 * 금지: DB 수정 / upsert / commit / push / 비밀값 출력 / 자동 삭제
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export const COMPARE_FIELDS = ['title', 'address', 'latitude', 'longitude', 'image_url', 'description', 'venue', 'event_period_raw'];

// ── 디스크 여유 공간 확인 ─────────────────────────────────────────────────────
export function checkDiskSpace(checkPath, minBytes = 2 * 1024 * 1024 * 1024) {
  try {
    const stat = fs.statfsSync(checkPath);
    const free = stat.bfree * stat.bsize;
    return { free, ok: free >= minBytes, method: 'statfs' };
  } catch {
    try {
      const drive = path.parse(path.resolve(checkPath)).root.slice(0, 2);
      const out = execSync(
        `wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /value`,
        { encoding: 'utf8', timeout: 5000 }
      );
      const m = out.match(/FreeSpace=(\d+)/);
      if (m) {
        const free = parseInt(m[1], 10);
        return { free, ok: free >= minBytes, method: 'wmic' };
      }
    } catch {}
  }
  return { free: null, ok: true, method: 'skip' };
}

// ── Raw 저장소 통계 및 cleanup 후보 ──────────────────────────────────────────
export function rawStorageStats(rawBusanDir, cutoffDays = 14) {
  const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);
  let totalFiles = 0, totalBytes = 0, candidateFiles = 0, candidateBytes = 0;
  const candidates = [];

  if (!fs.existsSync(rawBusanDir)) {
    return { totalFiles, totalBytes, candidateFiles, candidateBytes, candidates };
  }

  const dateDirs = fs.readdirSync(rawBusanDir)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  for (const dir of dateDirs) {
    const batchDir = path.join(rawBusanDir, dir, 'batch');
    if (!fs.existsSync(batchDir)) continue;

    const files = fs.readdirSync(batchDir).filter(f => f.endsWith('.json'));
    let dirBytes = 0;

    for (const f of files) {
      const size = fs.statSync(path.join(batchDir, f)).size;
      totalFiles++;
      totalBytes += size;
      dirBytes += size;
    }

    if (new Date(dir) < cutoff) {
      candidateFiles += files.length;
      candidateBytes += dirBytes;
      candidates.push({ dir, file_count: files.length, bytes: dirBytes });
    }
  }

  return { totalFiles, totalBytes, candidateFiles, candidateBytes, candidates };
}

// ── 최신 정상 스냅샷 탐색 ────────────────────────────────────────────────────
export function findPreviousSnapshot(snapshotBase) {
  if (!fs.existsSync(snapshotBase)) return null;

  const dateDirs = fs.readdirSync(snapshotBase)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();

  for (const dateDir of dateDirs) {
    const datePath = path.join(snapshotBase, dateDir);
    const runDirs = fs.readdirSync(datePath)
      .filter(d => /^run-\d{3}$/.test(d))
      .sort()
      .reverse();

    for (const runDir of runDirs) {
      const metaPath = path.join(datePath, runDir, 'snapshot-meta.json');
      const dataPath = path.join(datePath, runDir, 'busan-batch-normalized.json');
      if (!fs.existsSync(metaPath) || !fs.existsSync(dataPath)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.status === 'completed' && meta.normalized_count > 0) {
          return { dataPath, meta, label: `${dateDir}/${runDir}` };
        }
      } catch {}
    }
  }
  return null;
}

// ── 스냅샷 저장 ───────────────────────────────────────────────────────────────
export function saveSnapshot(records, metricsInfo, snapshotBase, date) {
  const datePath = path.join(snapshotBase, date);
  fs.mkdirSync(datePath, { recursive: true });

  const existingRuns = fs.readdirSync(datePath)
    .filter(d => /^run-\d{3}$/.test(d))
    .map(d => parseInt(d.slice(4), 10))
    .sort((a, b) => b - a);
  const runNum = existingRuns.length > 0 ? existingRuns[0] + 1 : 1;
  const runDirName = `run-${String(runNum).padStart(3, '0')}`;
  const runDir = path.join(datePath, runDirName);
  fs.mkdirSync(runDir, { recursive: true });

  fs.writeFileSync(
    path.join(runDir, 'busan-batch-normalized.json'),
    JSON.stringify(records, null, 2),
    'utf8'
  );

  const meta = {
    date, run_number: runNum, status: 'completed',
    normalized_count: records.length,
    generated_at: new Date().toISOString(),
    metrics: metricsInfo,
  };
  fs.writeFileSync(
    path.join(runDir, 'snapshot-meta.json'),
    JSON.stringify(meta, null, 2),
    'utf8'
  );

  return { runDir, runLabel: `${date}/${runDirName}`, runNum, meta };
}

// ── 변경분 비교 ───────────────────────────────────────────────────────────────
export function buildDiff(current, previous, compareFields = COMPARE_FIELDS) {
  const prevMap = new Map(previous.map(r => [r.source_key, r]));
  const currKeys = new Set(current.map(r => r.source_key));
  const result = { new: [], changed: [], missing_once: [], unchanged: [] };

  for (const rec of current) {
    if (!prevMap.has(rec.source_key)) {
      result.new.push({ source_key: rec.source_key, language: rec.source_language, title: rec.title });
      continue;
    }
    const prev = prevMap.get(rec.source_key);
    const changedFields = compareFields
      .filter(f => String(rec[f] ?? '') !== String(prev[f] ?? ''))
      .map(f => ({ field: f, before: prev[f] ?? null, after: rec[f] ?? null }));

    if (changedFields.length > 0) {
      result.changed.push({
        source_key: rec.source_key, language: rec.source_language,
        title: rec.title, changes: changedFields,
      });
    } else {
      result.unchanged.push(rec.source_key);
    }
  }

  for (const rec of previous) {
    if (!currKeys.has(rec.source_key)) {
      result.missing_once.push({ source_key: rec.source_key, language: rec.source_language, title: rec.title });
    }
  }

  return result;
}

function csvRow(cells) {
  return cells.map(c => {
    const s = String(c ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

// ── Diff CSV + metrics 저장 ───────────────────────────────────────────────────
export function saveDiffResults(diff, candDir, rptDir, date, prevLabel) {
  const rows = [csvRow(['source_key', 'change_type', 'language', 'field', 'before', 'after', 'title'])];

  for (const r of diff.new) {
    rows.push(csvRow([r.source_key, 'new', r.language, '', '', '', r.title]));
  }
  for (const r of diff.missing_once) {
    rows.push(csvRow([r.source_key, 'missing_once', r.language, '', '', '', r.title]));
  }
  for (const r of diff.changed) {
    for (const ch of r.changes) {
      rows.push(csvRow([r.source_key, 'changed', r.language, ch.field, ch.before, ch.after, r.title]));
    }
  }

  const csvPath = path.join(candDir, 'busan-batch-diff.csv');
  fs.writeFileSync(csvPath, rows.join('\n'), 'utf8');

  const metrics = {
    run_date: date,
    compared_against: prevLabel,
    new: diff.new.length,
    changed: diff.changed.length,
    missing_once: diff.missing_once.length,
    unchanged: diff.unchanged.length,
    compare_fields: COMPARE_FIELDS,
    generated_at: new Date().toISOString(),
  };
  const metricsPath = path.join(rptDir, 'busan-batch-diff-metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');

  return { csvPath, metricsPath, metrics };
}
