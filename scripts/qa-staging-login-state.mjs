// Staging 전용 로그인 상태 준비·확인 (Preview QA 용)
//
// 목적: Owner 가 Staging 시험용 Google 계정으로 **브라우저에서 직접 한 번** 로그인하고,
// 그 로그인 상태를 로컬 파일에 저장해 이후 자동 시험이 재사용하게 한다.
//  · 아이디·비밀번호는 이 스크립트가 받지 않는다(입력은 Owner 가 Chrome 창에서 직접).
//  · 저장 위치는 저장소 밖: %USERPROFILE%\.gokoreamate-qa\ (Git 에 들어갈 수 없다).
//  · 쿠키·토큰·이메일은 출력하지 않는다. 출력은 성공 여부·만료 시각·사용자 ID 앞 8자뿐.
//  · Production 주소에서는 동작하지 않는다(Preview 주소 + Staging 프로젝트만 허용).
//
// 사용:
//   node scripts/qa-staging-login-state.mjs capture   # Chrome 창이 열림 → Google 로그인 직접 완료 → 저장
//   node scripts/qa-staging-login-state.mjs check     # 저장된 상태가 유효한지(서버 API 1회, AI 호출 없음)
//
// 주의: 저장된 상태의 재사용은 "로그인 상태 재사용" 시험이다. Google OAuth 신규 로그인
// 자체의 성공은 capture 가 끝까지 통과했을 때만 기록한다(재사용으로 대신하지 않는다).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.QA_PREVIEW_BASE || "https://external-import-v2.korea-mate.pages.dev";
const STAGING_REF = "nimzhbntqoezqserujoc";
const DIR = join(homedir(), ".gokoreamate-qa");
const STATE = process.env.QA_STATE_FILE || join(DIR, "staging-preview-state.json");
const PROFILE = join(DIR, "chrome-profile");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const AUTH_KEY = `sb-${STAGING_REF}-auth-token`;

const host = new URL(BASE).hostname;
if (!/\.korea-mate\.pages\.dev$/.test(host) || /^(www\.)?gokoreamate\.com$/.test(host)) {
  console.error("Preview 주소(*.korea-mate.pages.dev)에서만 동작합니다."); process.exit(2);
}
if (resolve(DIR).toLowerCase().startsWith(resolve(process.cwd()).toLowerCase() + "\\")) {
  console.error("저장 위치가 저장소 안입니다 — 중단."); process.exit(2);
}
mkdirSync(DIR, { recursive: true });

const summarize = raw => {
  try {
    const s = JSON.parse(raw);
    return { user: String(s.user?.id ?? "").slice(0, 8), expires_at: s.expires_at ? new Date(s.expires_at * 1000).toISOString() : null };
  } catch { return null; }
};

async function capture() {
  // 자동화 표식 없는 일반 Chrome 을 전용 프로필로 연다 — Owner 가 이 창에서 직접 로그인한다.
  const chrome = spawn(CHROME, [`--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, "--no-first-run", `${BASE}/more/`], { stdio: "ignore", detached: false });
  let browser = null;
  for (let i = 0; i < 30 && !browser; i++) {
    await new Promise(r => setTimeout(r, 1000));
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`).catch(() => null);
  }
  if (!browser) { console.error("Chrome 연결 실패"); chrome.kill(); process.exit(1); }
  console.log(`Chrome 창에서 ${BASE} 의 Google 로그인을 직접 완료해 주세요(최대 10분 대기).`);
  const ctx = browser.contexts()[0];
  const deadline = Date.now() + 10 * 60_000;
  let found = null, wrongOrigin = null;
  while (Date.now() < deadline && !found) {
    await new Promise(r => setTimeout(r, 2000));
    for (const page of ctx.pages()) {
      const url = page.url();
      if (!url.startsWith("http")) continue;
      const origin = new URL(url).origin;
      const raw = await page.evaluate(k => localStorage.getItem(k), AUTH_KEY).catch(() => null);
      if (!raw) continue;
      if (origin !== new URL(BASE).origin) { wrongOrigin = origin; continue; }
      found = raw;
    }
  }
  if (!found) {
    console.log(wrongOrigin
      ? `로그인이 다른 주소(${wrongOrigin})로 돌아갔습니다 — Staging Auth Redirect URLs 에 ${BASE}/auth/callback 추가가 필요합니다.`
      : "로그인 상태를 찾지 못했습니다(시간 초과). 신규 로그인 = 미완료.");
    await browser.close().catch(() => {}); chrome.kill(); process.exit(1);
  }
  const state = await ctx.storageState();
  // 이 Preview origin 의 저장소만 남긴다(다른 사이트 쿠키는 버린다)
  const origin = new URL(BASE).origin;
  const slim = { cookies: state.cookies.filter(c => c.domain.endsWith(host)), origins: state.origins.filter(o => o.origin === origin) };
  writeFileSync(STATE, JSON.stringify(slim), { mode: 0o600 });
  const info = summarize(found);
  console.log(JSON.stringify({ oauth_new_login: "PASS", saved: true, user: info?.user, expires_at: info?.expires_at }));
  await browser.close().catch(() => {}); chrome.kill();
}

async function check() {
  if (!existsSync(STATE)) { console.log(JSON.stringify({ state: "대기(로그인 상태 없음)" })); return; }
  const b = await chromium.launch();
  const ctx = await b.newContext({ storageState: STATE });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/import/`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(4000); // 만료된 access token 은 supabase-js 가 refresh token 으로 갱신한다
  const raw = await p.evaluate(k => localStorage.getItem(k), AUTH_KEY);
  const tok = raw ? JSON.parse(raw).access_token : null;
  const r = tok ? await p.evaluate(async t => { const x = await fetch("/api/import/analyze", { headers: { Authorization: `Bearer ${t}` } }); return { status: x.status, body: await x.json().catch(() => null) }; }, tok) : null;
  // 갱신된 토큰을 다시 저장(refresh token 회전 — 옛 토큰 재사용 방지)
  const state = await ctx.storageState();
  writeFileSync(STATE, JSON.stringify({ cookies: state.cookies, origins: state.origins.filter(o => o.origin === new URL(BASE).origin) }), { mode: 0o600 });
  console.log(JSON.stringify({ state: r?.status === 200 ? "유효" : "무효", http: r?.status ?? null, free_remaining: r?.body?.balance?.free_remaining ?? null, session: summarize(raw ?? "") }));
  await b.close();
}

const mode = process.argv[2];
if (mode === "capture") await capture();
else if (mode === "check") await check();
else { console.log("사용: node scripts/qa-staging-login-state.mjs capture | check"); process.exit(2); }
