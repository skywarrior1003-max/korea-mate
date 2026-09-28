// LEGAL-RETENTION-IMPLEMENTATION-V1 — 보관·파기·알림·시행일 계약 가드
// 실행: node --experimental-strip-types src/lib/legal/retention-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  LEGAL_EFFECTIVE_DATE, TERMS_VERSION, PRIVACY_VERSION, AGE_GATE_VERSION,
} from "../auth/consent-contract.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/^\s*--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("082 — 6개월 기준·예외·원장·권한·멱등 스케줄", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter(f => f.startsWith("082"));
  assert.equal(files.length, 1);
  const s = strip(read(`supabase/migrations/${files[0]}`));
  // 신고: 종결 상태 + resolved_at + 6개월 / 처리 중은 파기 대상 아님
  assert.match(s, /resolved_at <= now\(\) - interval '6 months'/);
  assert.ok(!/DELETE FROM public\.place_reports[\s\S]{0,200}'pending'/.test(s), "처리 중 신고 파기 금지");
  // 문의: created_at + 6개월, 유효한 예외(검토일 미도래)는 보류
  assert.match(s, /created_at <= now\(\) - interval '6 months'/);
  assert.match(s, /retention_hold_until IS NULL OR retention_hold_until < current_date/);
  // 중복 실행 안전·사전 계수·실패 롤백·원문 없는 원장
  assert.match(s, /pg_advisory_xact_lock\(hashtext\('retention_purge_daily'\)\)/);
  assert.match(s, /count_mismatch/);
  assert.match(s, /EXCEPTION WHEN OTHERS/);
  const ledger = s.slice(s.indexOf("CREATE TABLE IF NOT EXISTS public.retention_purge_runs"), s.indexOf("ALTER TABLE public.retention_purge_runs"));
  assert.ok(!/email|message|note|reporter_key|name/i.test(ledger), "원장에 원문 컬럼 금지");
  // 권한·RLS
  assert.match(s, /SECURITY DEFINER SET search_path = public/);
  assert.match(s, /REVOKE ALL ON FUNCTION public\.retention_purge_daily\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(s, /ENABLE ROW LEVEL SECURITY/);
  // 알림은 Vault 설정으로만, 비어 있으면 건너뜀
  assert.match(s, /vault\.decrypted_secrets WHERE name = 'retention_alert_url'/);
  assert.match(s, /skipped_no_config/);
  // 매일 1회, 076 과 같은 멱등 등록
  assert.match(s, /'gokoreamate-retention-purge-daily-v1',\s*'27 18 \* \* \*'/);
  assert.match(s, /cron\.unschedule\(v_id\)/);
});

test("문의 알림 메일 — 개인정보 원문 없음·관리자 화면 경유", () => {
  const c = read("functions/api/contact.ts");
  const b = c.slice(c.indexOf("export function buildInquiryNotification"));
  assert.ok(b.length > 0);
  assert.ok(!/name|email|message|relatedPlace|relatedPage/i.test(b.replace(/Inquiry ID|admin dashboard|details are shown only there/g, "")), "알림 본문에 원문 금지");
  assert.match(b, /korea-mate-admin\/inquiries\/detail\?id=/);
  assert.match(c, /sendAdminEmail\(env, \{ id, type \}\)/);
});

test("내부 알림 엔드포인트 — 내부 키 상수시간 비교·원문 없음", () => {
  const a = read("functions/api/internal/retention-alert.ts");
  assert.match(a, /x-internal-auth/);
  assert.match(a, /keysMatch/);
  assert.match(a, /d \|= x\[i\] \^ y\[i\]/);
  assert.match(a, /return json\(\{ error: "unauthorized" \}, 401\)/);
  assert.ok(!/email|message|reporter/i.test(a.slice(a.indexOf("export function buildRetentionAlert"), a.indexOf("export async function onRequestPost"))));
});

test("관리자 문의 보관 예외 — 사유·책임자·1년 이내 검토일 필수", () => {
  const a = read("functions/api/admin/contact-inquiries.ts");
  assert.match(a, /retentionHold/);
  assert.match(a, /until < today \|\| until > max/);
  assert.match(a, /reason\.length < 5/);
  assert.match(a, /retention_hold_by/);
  assert.match(a, /checkAdminAuth/);
});

test("시행일 단일 원천 — 동의 버전 3종·Legal effectiveDate 가 한 값에서", () => {
  if (LEGAL_EFFECTIVE_DATE === null) {
    // 게시 전 — 정확한 문자열은 consent-activation-guard 가 고정한다(여기 하드코딩 금지)
    assert.ok(TERMS_VERSION.startsWith("preview-") && AGE_GATE_VERSION.startsWith("preview-"));
  } else {
    assert.match(LEGAL_EFFECTIVE_DATE, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(TERMS_VERSION, `legal-${LEGAL_EFFECTIVE_DATE}-v1`);
    assert.equal(PRIVACY_VERSION, `legal-${LEGAL_EFFECTIVE_DATE}-v1`);
    assert.equal(AGE_GATE_VERSION, `age-14-${LEGAL_EFFECTIVE_DATE}-v1`);
  }
  for (const f of ["src/lib/legal/privacy-content.ts", "src/lib/legal/terms-content.ts"]) {
    const s = read(f);
    assert.equal((s.match(/effectiveDate: LEGAL_EFFECTIVE_DATE,/g) ?? []).length, 4, f);
    assert.ok(!/effectiveDate: "/.test(s), `${f}: 시행일 하드코딩 금지`);
  }
});

test("Legal 문안 — 6개월 운영 기준·자동 파기·법정 기한·원문 없는 알림(4locale)", () => {
  const p = read("src/lib/legal/privacy-content.ts");
  for (const k of ["6 months", "6개월", "6か月", "6 个月"]) assert.ok(p.includes(k), k);
  for (const k of ["매일 자동으로 파기", "destroyed automatically by a daily job", "毎日の自動処理で破棄", "每日自动任务销毁"]) assert.ok(p.includes(k), k);
  assert.ok(p.includes("서비스가 정한 운영 기준"), "6개월은 운영 기준(법정 기간 아님)");
  assert.ok(p.includes("요청하신 이메일 주소로 알려드리며"), "결과 통지 방법");
  const t = read("src/lib/legal/terms-content.ts");
  for (const k of ["대한민국 법을 따릅니다", "laws of the Republic of Korea", "大韓民国の法律に準拠", "受大韩民国法律管辖"]) assert.ok(t.includes(k), k);
  assert.ok(t.includes("관할 법원(분쟁 해결 기준) — 법률 검토 필요"), "관할은 법률 검토 표시로 남김");
});
