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

test("083 — 시행 전 파기 0·알림 없이 파기 없음·selftest 202 후에만 활성화", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter(f => f.startsWith("083"));
  assert.equal(files.length, 1);
  const s = strip(read(`supabase/migrations/${files[0]}`));
  const daily = s.slice(s.indexOf("FUNCTION public.retention_purge_daily()"), s.indexOf("FUNCTION public.retention_purge_reconcile()"));
  // 관문 3개가 모두 첫 DELETE 앞에 있다
  const firstDelete = daily.indexOf("DELETE FROM");
  for (const g of ["'inactive'", "'blocked_no_alert'", "'blocked_alert_unverified'"]) {
    assert.ok(daily.indexOf(g) > 0 && daily.indexOf(g) < firstDelete, `${g} 관문이 삭제보다 먼저`);
  }
  assert.match(daily, /v_from IS NULL OR \(now\(\) AT TIME ZONE 'Asia\/Seoul'\)::date < v_from/);
  assert.match(daily, /NOT public\.retention_alert_configured\(\)/);
  assert.match(daily, /interval '36 hours'/);
  // 활성화는 selftest 응답 202 이후에만
  const act = s.slice(s.indexOf("FUNCTION public.retention_purge_activate"));
  assert.match(act, /status_code INTO v_code FROM net\._http_response/);
  assert.match(act, /IS DISTINCT FROM 202/);
  // 원장 확장에 원문 컬럼 없음, 082 파일은 그대로(함수 교체만)
  const ext = s.slice(s.indexOf("ALTER TABLE public.retention_purge_runs"), s.indexOf("DROP FUNCTION IF EXISTS"));
  assert.ok(!/email|message|note|reporter_key|name/i.test(ext.replace(/DROP CONSTRAINT IF EXISTS \w+|ADD CONSTRAINT \w+/g, "")));
  assert.ok(!/retention_purge_runs \(\s*id/.test(s), "082 원장을 다시 만들지 않는다");
  assert.match(s, /'gokoreamate-retention-alert-reconcile-v1',\s*'57 18 \* \* \*'/);
  for (const f of ["retention_purge_notify", "retention_purge_reconcile", "retention_alert_selftest", "retention_purge_activate"]) {
    assert.match(s, new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated`), f);
  }
});

test("알림 엔드포인트 — 발송 실패는 202 가 아니다·probe 는 메일 없음", () => {
  const a = read("functions/api/internal/retention-alert.ts");
  assert.match(a, /if \(r\.ok\) return json\(\{ accepted: true, sent: true \}, 202\)/);
  assert.match(a, /sent: false, reason: r\.reason[\s\S]{0,80}\}, 502\)/);
  assert.match(a, /const key = ctx\.env\.RETENTION_ALERT_KEY \|\| ctx\.env\.INTERNAL_KEY;/);
  const probe = a.slice(a.indexOf('kind === "probe"'), a.indexOf("buildRetentionAlert(kind"));
  assert.ok(!/sendAdminEmail/.test(probe), "probe 는 메일을 보내지 않는다");
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
  // 파기는 '지체 없이' + 방법(자동 작업 또는 운영자 직접 삭제) — 083 관문이 켜지기 전·후 모두 참인 문장(AUTH 통합 2026-09-29)
  for (const k of ["6개월 보관한 뒤 지체 없이 파기합니다", "they are then destroyed without delay", "6か月保管した後、遅滞なく破棄します", "之后及时销毁"]) assert.ok(p.includes(k), k);
  for (const k of ["자동 파기 작업 또는 운영자의 직접 삭제", "by an automatic job or directly by the operator", "自動処理または運営者による直接削除", "由自动任务或运营方直接删除"]) assert.ok(p.includes(k), k);
  assert.ok(p.includes("서비스가 정한 운영 기준"), "6개월은 운영 기준(법정 기간 아님)");
  assert.ok(p.includes("요청하신 이메일 주소로 알려드리며"), "결과 통지 방법");
  // 법 제30조①3의2(파기절차·방법)·4(위탁)·시행령 제31조①2(국외 이전) 대조분
  for (const k of ["How records are destroyed", "파기 절차와 방법", "破棄の手順と方法", "销毁程序与方法"]) assert.ok(p.includes(k), k);
  assert.equal((p.match(/Resend（|Resend\(|Resend \(/g) ?? []).length, 4, "4locale 처리자 목록에 메일 발송 서비스");
  // 법 제28조의8② 사실 항목(시기·방법·보유기간·거부 방법과 효과)은 4locale 반영.
  // L1(Owner 선택 B, 2026-09-29): 필수 처리(Supabase·Cloudflare)는 제3호 가목, GA 는 두 선택 동의 — 마커 해소
  assert.equal((p.match(/국외 이전의 법적 근거\(법 제28조의8제1항 중 해당 호/g) ?? []).length, 0, "L1 마커 해소");
  for (const k of ["Article 28-8(1)(3)(a)", "제28조의8제1항제3호가목", "第28条の8第1項第3号イ", "第28条之8第1款第3项甲目"]) assert.equal(p.split(k).length - 1, 1, k);
  for (const k of ["Article 28-8(1)(1)", "제28조의8제1항제1호", "第28条の8第1項第1号", "第28条之8第1款第1项"]) assert.equal(p.split(k).length - 1, 1, k);
  for (const k of ["How, when, and how long:", "처리 방법·시기·보유기간:", "処理の方法・時期・保存期間：", "处理方式、时间与保存期限："]) assert.ok(p.includes(k), k);
  for (const k of ["How to refuse and what happens:", "거부 방법과 효과:", "拒否の方法と影響：", "拒绝方式与后果："]) assert.ok(p.includes(k), k);
  for (const k of ["Supabase Pte. Ltd.", "Cloudflare, Inc.", "Plus Five Five, Inc."]) assert.equal(p.split(k).length - 1, 4, k);
  // Google LLC 는 처리자 목록 항목(— Google LLC) 4개 + GA 동의 문단(제8조)에도 나온다 — 목록 항목을 센다
  assert.equal((p.match(/—\s?Google LLC/g) ?? []).length, 4, "처리자 목록의 Google LLC");
  // 제13조: 코드 동작(만 14세 자기 확인·법정대리인 절차 없음)과 일치. L2(Owner 채택 2026-09-29) — 마커 해소, 삭제 문장 4locale
  for (const k of ["법정대리인 동의 절차를 제공하지 않습니다", "does not offer a parent or guardian consent process", "法定代理人の同意手続きは提供していません", "不提供法定代理人同意程序"]) assert.ok(p.includes(k), k);
  assert.equal((p.match(/제13조 문안 Owner 최종 확인 필요/g) ?? []).length, 0, "L2 마커 해소");
  for (const k of ["If we learn that an account was created by someone under 14, we delete that account and the information linked to it without delay.", "만 14세 미만의 이용자가 계정을 만든 사실을 알게 되면 해당 계정과 계정에 연결된 정보를 지체 없이 삭제합니다.", "満14歳未満の方がアカウントを作成したことが判明した場合、そのアカウントと連携する情報を遅滞なく削除します。", "如果我们得知有未满 14 周岁的用户创建了账户，将及时删除该账户及与其关联的信息。"]) assert.equal(p.split(k).length - 1, 1, k);
  const t = read("src/lib/legal/terms-content.ts");
  // 개인정보 요청 주소 = Owner 가 2026-09-26 제공·왕복 시험한 공개 주소(재요청 금지) — 처리방침은 제1조 담당 연락처+제16조, 약관은 제15조
  assert.equal(p.split("support@gokoreamate.com").length - 1, 8);
  assert.equal(t.split("support@gokoreamate.com").length - 1, 4);
  for (const f of [p, t]) {
    assert.ok(!f.includes("실제 수신 이메일 주소 확인 필요"));
    // 운영 주체: Owner 확정(2026-09-28) 개인사업자 케이이엔지·부산 남구 주소, 등록 한글 상호로 4locale 표시(영문 법적 명칭 없음)
    assert.ok(!f.includes("Owner 확인 1건"), "운영 주체 확인 마커 해소");
    assert.ok(f.split("부산시 남구 유엔로 96번길 26-31 (대연동)").length - 1 >= 4);
    assert.ok(!f.includes("비유피"), "근거 없는 운영 주체 후보 금지");
  }
  assert.ok(!p.includes("로그와 백업 보관기간 확인 필요"), "인프라 로그 사실 반영");
  for (const k of ["are not stored, and the database provider (Supabase) keeps API and database logs for 1 day", "실행 로그는 저장하지 않으며", "実行ログは保存せず", "运行日志不予保存"]) assert.ok(p.includes(k), k);
  // 준거법 = 대한민국 법(4locale). 관할은 L3=A(Owner 2026-09-29) — 마커 해소, 관계 법령상 관할 법원 문장은 아래 Owner 확정값 테스트가 고정
  for (const k of ["대한민국 법이 적용되며", "laws of the Republic of Korea", "大韓民国の法律が適用され", "适用大韩民国法律"]) assert.ok(t.includes(k), k);
  assert.ok(!t.includes("관할 법원(분쟁 해결 기준) — 법률 검토 필요"), "L3 마커 해소");
});

test("파기 상태 확인(/api/health/retention) — 알림과 독립·원문 없음·막힘 상태는 503", async () => {
  const a = read("functions/api/health/retention.ts");
  assert.ok(!/sendAdminEmail|net\.http_post|reporter_key/.test(a), "메일 경로·원문 의존 금지");
  assert.ok(!/select=[^`]*(email|message|note|error_code)/.test(a), "원장 원문·오류 문자열을 읽지 않는다");
  const { judgeRetentionHealth: j } = await import("../../../functions/api/health/retention.ts");
  const now = Date.parse("2026-10-20T00:00:00Z");
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const run = (h: number, status: string, probe: number | null = 200, alert: number | null = null) =>
    ({ run_at: at(h), status, alert_http_status: alert, probe_request_id: 1, probe_http_status: probe });
  const act = { effective_from: "2026-10-15", activated_at: at(200) };
  assert.deepEqual(j(null, [], now), { ok: true, state: "not_active" });
  assert.equal(j(act, [run(1, "ok", null), run(29, "ok")], now).state, "ok");
  assert.equal(j(act, [run(31, "ok")], now).state, "no_recent_run");
  assert.equal(j(act, [run(5, "blocked_no_alert", null)], now).state, "blocked_no_alert");
  assert.equal(j(act, [run(5, "blocked_alert_unverified")], now).state, "blocked_alert_unverified");
  assert.equal(j(act, [run(5, "failed", null, 202)], now).state, "last_run_failed");
  assert.equal(j(act, [run(1, "ok", null), run(29, "ok", 200, 502)], now).state, "alert_delivery_failed");
  assert.equal(j(act, [run(1, "ok", null), run(29, "ok", null)], now).state, "reconcile_missing");
  assert.equal(j(act, [run(1, "ok", null), run(29, "ok", 401)], now).state, "alert_path_unhealthy");
  assert.equal(j(act, [run(1, "inactive", null), run(29, "inactive")], now).state, "scheduled");
});

test("Owner 확정값(2026-09-28·29) — Resend Free=발송 기록 30일, 보호책임자 연락처(L5=A)·관할(L3=A) 확정", () => {
  const p = read("src/lib/legal/privacy-content.ts");
  for (const k of ["(Resend) are retained for 30 days", "(Resend)에 남는 발송 기록은 현재 요금제에서 그 서비스의 정책에 따라 30일간", "（Resend）に残る配信記録は、現在のプランでは同サービスの方針により30日間", "（Resend）保留的发送记录在当前套餐下依其政策保存 30 天"]) assert.ok(p.includes(k), k);
  // L5=A: 담당 부서 + 확인된 이메일(마커 해소). 전화번호는 새로 쓰지 않는다
  assert.equal(p.split("보호책임자 연락처 표시 — 이메일만으로").length - 1, 0, "L5 마커 해소");
  for (const k of ["Privacy contact: 케이이엔지 privacy team (개인정보보호 담당) · support@gokoreamate.com", "개인정보 보호 담당: 케이이엔지 개인정보보호 담당 · support@gokoreamate.com", "個人情報保護担当：케이이엔지 個人情報保護担当（개인정보보호 담당）・support@gokoreamate.com", "个人信息保护负责窗口：케이이엔지 个人信息保护负责（개인정보보호 담당）· support@gokoreamate.com"]) assert.equal(p.split(k).length - 1, 1, k);
  // L3=A: 관계 법령에 따른 관할 법원 — 특정 지역 법원 전속 지정 금지(약관법 제14조1호)
  const terms = read("src/lib/legal/terms-content.ts");
  assert.equal(terms.split("ownerInput:").length - 1, 0, "약관 마커 해소");
  for (const k of ["the court that has jurisdiction under the Civil Procedure Act and other applicable laws", "민사소송법 등 관계 법령에 따른 관할 법원", "民事訴訟法その他の関係法令に基づく管轄裁判所", "依《民事诉讼法》等相关法律向有管辖权的法院提起"]) assert.equal(terms.split(k).length - 1, 1, k);
  assert.ok(!/지방법원|전속\s*관할|exclusive jurisdiction|専属|专属/.test(terms), "특정 법원 전속 지정 없음");
});

test("Google Analytics 보관 설정(Owner 화면 확인 2026-09-29) — 이벤트 2개월·사용자 14개월·재활동 시 재설정, 4locale", () => {
  const p = read("src/lib/legal/privacy-content.ts");
  for (const k of ["event data is kept for 2 months and user data for 14 months", "이벤트 데이터는 2개월, 사용자 데이터는 14개월", "イベントデータは2か月、ユーザーデータは14か月", "事件数据保存 2 个月，用户数据保存 14 个月"]) assert.ok(p.includes(k), k);
  assert.ok(!p.includes("Google Analytics 데이터 보관기간 설정값(Owner 확인)"), "GA 보관기간 마커 해소");
});
