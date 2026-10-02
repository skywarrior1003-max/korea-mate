// 가져오기 실패 정산·안내 계약 (2026-10-02)
// node --experimental-strip-types --test src/lib/url-import/import-settle-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const AN = read("functions", "api", "import", "analyze.ts").replace(/\r\n/g, "\n");

test("형식 오류(MAX_TOKENS 등)는 사용량과 함께 돌려주고 회사 원장은 실비 committed", () => {
  assert.match(AN, /if \(!analysis\) return \{ ok: false, error: "analyze_failed", sent: true,[^\n]*usage \};/);
  assert.match(AN, /const billedUsage = ai\.usage && \(ai\.usage\.inTok !== null \|\| ai\.usage\.outTok !== null\) \? ai\.usage : null;/);
  assert.match(AN, /if \(billedUsage\) \{\s*await aiOpsSettle\([^)]*"committed"/);
  // 사용량이 없는 실패는 예전 규칙 그대로(보낸 뒤 실패 = unknown_billed, 보내기 전 = released)
  assert.match(AN, /ai\.sent \? "unknown_billed" : "released"/);
});

test("어떤 분석 실패든 사용자 횟수는 되돌린다", () => {
  const fail = AN.slice(AN.indexOf("if (!ai.ok) {"), AN.indexOf("// 회사 원장 — 실제 토큰으로 정산"));
  assert.match(fail, /await release\(\);/);
  assert.doesNotMatch(fail, /quotaSettle\([^)]*"committed"/);
});

test("서버가 횟수를 되돌린 실패는 화면이 '차감되지 않았어요'를 말한다(4개 언어)", () => {
  const re: Record<string, RegExp> = { ko: /차감되지 않았어요/, en: /didn['’]t count as a use/, ja: /回数は減っていません/, zh: /未计次数/ };
  for (const l of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(read("src", "messages", `${l}.json`)).importer as Record<string, string>;
    for (const k of ["errPaused", "errNoText", "errTooLarge", "errTimeout", "errAnalyze", "errFetchFailed"]) {
      assert.match(m[k], re[l], `${l}.importer.${k}`);
    }
    // 연결이 끊긴 경우(서버가 끝냈을 수 있음)는 '차감 없음'이라고 단정하지 않고 재시도 무중복을 말한다
    assert.doesNotMatch(m.errNetwork, re[l], `${l}.importer.errNetwork 는 단정하지 않는다`);
  }
  const ui = read("src", "components", "importer", "ImportClient.tsx");
  assert.match(ui, /client_timeout: "errNetwork"/);
  assert.match(ui, /fetch_failed: "errFetchFailed"/);
});
