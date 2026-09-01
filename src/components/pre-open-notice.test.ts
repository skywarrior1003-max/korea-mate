// PreOpenNotice 계약 가드 (TASK-PREOPEN-…-V2 §14–15)
// 실행: node --experimental-strip-types src/components/pre-open-notice.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const SRC = read("src", "components", "PreOpenNotice.tsx");

test("Owner 문구가 4개 locale 에 그대로 있고 영어 하드코딩이 없다", () => {
  const expect: Record<string, [string, string]> = {
    ko: ["현재 GoKoreaMate는 정식 오픈 전 개선 중입니다.", "일부 화면 전환과 검색 기능, 디자인이 아직 완성되지 않아 이용이 다소 불편할 수 있습니다. 더 편리한 여행 경험을 위해 계속 개선하고 있습니다."],
    en: ["GoKoreaMate is currently being improved before its official launch.", "Some page transitions, search features, and parts of the design are not yet complete, so the site may feel less convenient to use. We’re continuing to improve the experience."],
    ja: ["GoKoreaMateは現在、正式公開に向けて改善中です。", "一部の画面遷移、検索機能、デザインはまだ調整中のため、ご利用の際に不便を感じる場合があります。より快適にご利用いただけるよう改善を続けています。"],
    zh: ["GoKoreaMate目前正在为正式上线进行完善。", "部分页面切换、搜索功能和界面设计仍在优化中，使用时可能会有些不便。我们正在持续改进，以提供更好的旅行体验。"],
  };
  for (const [loc, [title, body]] of Object.entries(expect)) {
    const m = JSON.parse(read("src", "messages", `${loc}.json`)) as { preopen: Record<string, string> };
    assert.equal(m.preopen.title, title, loc);
    assert.equal(m.preopen.body, body, loc);
    assert.ok(m.preopen.close.length > 0 && m.preopen.kicker.length > 0, loc);
  }
  // JSX 안에 사용자 노출 영문 리터럴이 없다 — 문구는 전부 t() 로만 나온다
  const jsx = SRC.slice(SRC.lastIndexOf("return (")).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/className="[^"]*"/g, "");
  assert.ok(!/>[^<{]*[A-Za-z]{3,}[^<{]*</.test(jsx), "hard-coded latin text in JSX");
});

test("session 단위로만 기억한다 — localStorage 영구 dismiss 없음, 스크롤 잠금 없음", () => {
  assert.ok(SRC.includes("sessionStorage"));
  assert.ok(!/localStorage\s*\./.test(SRC));
  assert.ok(!/overflow\s*=\s*["']hidden["']/.test(SRC));
  assert.ok(SRC.includes("data-preopen-notice") && SRC.includes("data-preopen-panel"));
  // 절반 정도를 가리는 sheet — 전체 화면 modal 이 아니다
  assert.ok(/min-h-\[4\dvh\]/.test(SRC) && /max-h-\[\d\dvh\]/.test(SRC));
});

test("Home 에 마운트된다", () => {
  const home = read("src", "app", "HomeClient.tsx");
  assert.ok(home.includes('import PreOpenNotice from "@/components/PreOpenNotice"'));
  assert.ok(home.includes("<PreOpenNotice />"));
});
