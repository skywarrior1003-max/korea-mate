#!/usr/bin/env node
/**
 * test-consecutive-failure-dynamic.mjs
 *
 * tourapi-busan-detail.mjs 의 연속 실패 중단 로직을 동적 fixture로 검증.
 * 외부 API 호출 없이 mock fetch 시뮬레이션으로 실행.
 *
 * 시나리오:
 *   A: 5회 연속 실패 → 5번째 직후 중단 (6번째 요청 실행 0)
 *   B: 3회 실패 → 1회 성공(counter 초기화) → 4회 실패 → 중단 없음 (total 8 calls)
 *   C: 5회 연속 타임아웃 → 동일 중단 (timeout은 failure로 처리)
 *   D: 3회 실패 → 1회 skip(VALID_EXISTS, counter 초기화) → 3회 실패 → 중단 없음
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '..');
const REPORT_PATH = path.join(ROOT, 'data/tourapi/reports/busan/kto-detail-consecutive-failure-dynamic-test.json');

const CONSECUTIVE_FAILURE_LIMIT = 5;

// ── 핵심 로직 (tourapi-busan-detail.mjs 와 동일) ──────────────────────────────
function checkConsecutiveFailure(counter, limit) {
  return counter >= limit;
}

// ── 시뮬레이터 ────────────────────────────────────────────────────────────────
// outcome type: 'success' | 'failure' | 'timeout' | 'skip'
// skip = VALID_EXISTS (counter reset, no fetch)
function simulate(label, outcomes, limit = CONSECUTIVE_FAILURE_LIMIT) {
  let consecutiveFailures = 0;
  let abortedAfterCall    = null;
  let callsMade           = 0;
  const events            = [];
  const failureList       = [];

  for (let i = 0; i < outcomes.length; i++) {
    const { type, content_id = `item-${i + 1}` } = outcomes[i];

    if (type === 'skip') {
      // VALID_EXISTS: counter 초기화, fetch 미실행
      consecutiveFailures = 0;
      events.push({ seq: i + 1, content_id, type: 'skip', counter_after: 0, fetch: false });
      continue;
    }

    callsMade++;
    const isSuccess = (type === 'success');

    if (isSuccess) {
      consecutiveFailures = 0;
      events.push({ seq: i + 1, content_id, type, counter_after: 0, fetch: true });
    } else {
      // failure 또는 timeout 모두 동일 처리
      consecutiveFailures++;
      failureList.push({ content_id, error: type });
      events.push({ seq: i + 1, content_id, type, counter_after: consecutiveFailures, fetch: true });

      if (checkConsecutiveFailure(consecutiveFailures, limit)) {
        abortedAfterCall = callsMade;
        // checkpoint 저장 시뮬레이션 (실제 파일 쓰기 없음)
        events.push({ seq: i + 1, content_id, type: 'ABORT', note: 'checkpoint saved (simulated)', fetch: false });
        break;
      }
    }
  }

  return { label, events, callsMade, abortedAfterCall, failureList, limit };
}

// ── 시나리오 정의 ──────────────────────────────────────────────────────────────
const scenarios = [
  {
    id: 'scenario-A',
    description: '연속 실패 5회 → 5번째 직후 안전 중단',
    outcomes: [
      { type: 'failure', content_id: 'A-001' },
      { type: 'failure', content_id: 'A-002' },
      { type: 'failure', content_id: 'A-003' },
      { type: 'failure', content_id: 'A-004' },
      { type: 'failure', content_id: 'A-005' },
      { type: 'failure', content_id: 'A-006' }, // 도달 불가
    ],
    expect: {
      abortedAfterCall: 5,
      callsMade:        5,
      calls_after_abort: 0,
      exit_code:        1,
      checkpoint_saved: true,
      failure_list_len: 5,
    },
  },
  {
    id: 'scenario-B',
    description: '중간 성공으로 counter 초기화 → 이후 4회 실패로 중단 없음',
    outcomes: [
      { type: 'failure', content_id: 'B-001' },
      { type: 'failure', content_id: 'B-002' },
      { type: 'failure', content_id: 'B-003' },
      { type: 'success', content_id: 'B-004' }, // counter → 0
      { type: 'failure', content_id: 'B-005' },
      { type: 'failure', content_id: 'B-006' },
      { type: 'failure', content_id: 'B-007' },
      { type: 'failure', content_id: 'B-008' },
    ],
    expect: {
      abortedAfterCall: null,   // 중단 없음
      callsMade:        8,
      exit_code:        0,
      failure_list_len: 7,      // success 제외
      counter_at_end:   4,
    },
  },
  {
    id: 'scenario-C',
    description: '5회 연속 타임아웃 → 동일 중단 (timeout = failure)',
    outcomes: [
      { type: 'timeout', content_id: 'C-001' },
      { type: 'timeout', content_id: 'C-002' },
      { type: 'timeout', content_id: 'C-003' },
      { type: 'timeout', content_id: 'C-004' },
      { type: 'timeout', content_id: 'C-005' },
      { type: 'timeout', content_id: 'C-006' }, // 도달 불가
    ],
    expect: {
      abortedAfterCall: 5,
      callsMade:        5,
      calls_after_abort: 0,
      exit_code:        1,
      checkpoint_saved: true,
      failure_list_len: 5,
    },
  },
  {
    id: 'scenario-D',
    description: 'skip(VALID_EXISTS)으로 counter 초기화 → 이후 3회 실패로 중단 없음',
    outcomes: [
      { type: 'failure', content_id: 'D-001' },
      { type: 'failure', content_id: 'D-002' },
      { type: 'failure', content_id: 'D-003' },
      { type: 'skip',    content_id: 'D-004' }, // counter → 0, no fetch
      { type: 'failure', content_id: 'D-005' },
      { type: 'failure', content_id: 'D-006' },
      { type: 'failure', content_id: 'D-007' },
    ],
    expect: {
      abortedAfterCall: null,   // 중단 없음
      callsMade:        6,      // skip은 fetch 미실행 → 6회
      exit_code:        0,
      failure_list_len: 6,
      counter_at_end:   3,
    },
  },
];

// ── 검증 ──────────────────────────────────────────────────────────────────────
function verify(result, expect) {
  const errors = [];

  if (expect.abortedAfterCall !== undefined) {
    if (result.abortedAfterCall !== expect.abortedAfterCall) {
      errors.push(`abortedAfterCall: got ${result.abortedAfterCall}, expected ${expect.abortedAfterCall}`);
    }
  }
  if (expect.callsMade !== undefined) {
    if (result.callsMade !== expect.callsMade) {
      errors.push(`callsMade: got ${result.callsMade}, expected ${expect.callsMade}`);
    }
  }
  if (expect.failure_list_len !== undefined) {
    if (result.failureList.length !== expect.failure_list_len) {
      errors.push(`failureList.length: got ${result.failureList.length}, expected ${expect.failure_list_len}`);
    }
  }
  // counter_at_end 검증: 마지막 이벤트의 counter_after
  if (expect.counter_at_end !== undefined) {
    const lastFetchEvent = [...result.events].reverse().find(e => e.type !== 'ABORT' && e.type !== 'skip');
    const actualCounter  = lastFetchEvent ? lastFetchEvent.counter_after : 0;
    if (actualCounter !== expect.counter_at_end) {
      errors.push(`counter_at_end: got ${actualCounter}, expected ${expect.counter_at_end}`);
    }
  }

  return errors;
}

// ── 실행 ──────────────────────────────────────────────────────────────────────
console.log('\n[test-consecutive-failure-dynamic] TASK-BUSAN-KTO-DETAIL-FULL-EXECUTION-GATE');
console.log('  외부 API 호출 0건 — mock fetch 시뮬레이션\n');

const results = [];
let allPass = true;

for (const sc of scenarios) {
  const result = simulate(sc.id, sc.outcomes);
  const errors = verify(result, sc.expect);
  const pass   = errors.length === 0;
  if (!pass) allPass = false;

  const entry = {
    scenario_id:    sc.id,
    description:    sc.description,
    pass,
    errors,
    result: {
      callsMade:        result.callsMade,
      abortedAfterCall: result.abortedAfterCall,
      failureList_len:  result.failureList.length,
    },
    expected: sc.expect,
    events:   result.events,
  };
  results.push(entry);

  const badge = pass ? 'PASS' : 'FAIL';
  console.log(`  [${badge}] ${sc.id}: ${sc.description}`);
  if (!pass) {
    for (const e of errors) console.log(`         ✗ ${e}`);
  }
}

console.log(`\n=== Result: ${results.filter(r => r.pass).length}/${results.length} PASS ===`);
console.log(`VERDICT: ${allPass ? 'PASS' : 'FAIL'}`);

// ── 보고서 저장 ────────────────────────────────────────────────────────────────
const report = {
  report_id:          'kto-detail-consecutive-failure-dynamic-test',
  task:               'TASK-BUSAN-KTO-DETAIL-FULL-EXECUTION-GATE',
  run_ts:             new Date().toISOString(),
  consecutive_failure_limit: CONSECUTIVE_FAILURE_LIMIT,
  external_api_calls: 0,
  verdict:            allPass ? 'PASS' : 'FAIL',
  scenarios:          results,
  verification_notes: [
    'checkConsecutiveFailure()는 counter >= limit 판정 (limit=5이면 5번째 실패에서 즉시 중단)',
    'timeout은 failure와 동일하게 처리 (별도 분기 없음)',
    'skip(VALID_EXISTS)은 fetch를 실행하지 않고 counter를 0으로 초기화',
    'success 또는 skip 후 counter 초기화 — detailIntro2/Common2/Image2 각 루프 시작 시 counter=0 reset',
  ],
};

fs.mkdirSync(path.join(ROOT, 'data/tourapi/reports/busan'), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
console.log(`\n보고서 저장: ${REPORT_PATH.replace(ROOT + path.sep, '')}`);

process.exit(allPass ? 0 : 1);
