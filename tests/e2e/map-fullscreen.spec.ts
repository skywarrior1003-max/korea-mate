// S0-A 검증 — Explore 지도 split → full-screen → split 반복 시
// ① 지도 wrapper가 매번 뷰포트 전체 폭을 차지 (오른쪽 공백 버그 감시)
// ② uncaught pageerror 0건 — 특히 "relayout is not a function" 재발 금지
// ③ Naver SDK가 로드된 환경에서는 지도 내부 렌더 영역(타일/pane)도 전체 폭 확인
// Naver 타일 실렌더는 API 키·referrer 의존 — 로컬에서 SDK 미인증이면 ③은 조건부 skip.

import { test, expect } from "@playwright/test";

test("전체화면 토글 3회 반복 — 기하 안정 + pageerror 0건", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop 전용 (split 레이아웃)");

  const pageErrors: string[] = [];
  page.on("pageerror", err => pageErrors.push(err.message));

  await page.goto("/explore/busan");
  const toggle = page.getByTitle(/Full screen map|Exit full screen/).first();
  await expect(toggle).toBeVisible({ timeout: 15_000 });

  const viewport = page.viewportSize()!;

  for (let i = 1; i <= 3; i++) {
    // → 전체화면
    await toggle.click();
    await expect(page.getByTitle("Exit full screen")).toBeVisible();
    await page.waitForTimeout(600); // ResizeObserver + rAF + setSize 완료 대기
    const fullBox = await toggle.locator("xpath=ancestor::div[contains(@class,'fixed')]").first().boundingBox();
    expect(fullBox, "full-screen wrapper boundingBox").not.toBeNull();
    expect(Math.round(fullBox!.width), `${i}회차 전체화면 wrapper 폭`).toBeGreaterThanOrEqual(viewport.width - 2);

    // SDK 로드 환경이면 지도 내부 렌더 영역도 전체 폭인지 확인 (타일 pane)
    const innerWidth = await page.evaluate(() => {
      const wrap = document.querySelector("div.fixed");
      if (!wrap) return null;
      // Naver v3는 map div 안에 position:absolute pane들을 생성한다
      const pane = wrap.querySelector("div[style*='position: absolute'][style*='z-index']");
      return pane ? Math.round(pane.getBoundingClientRect().width) : null;
    });
    if (innerWidth !== null && innerWidth > 0) {
      expect(innerWidth, `${i}회차 지도 내부 렌더 폭`).toBeGreaterThanOrEqual(viewport.width - 4);
    }

    // → split 복귀
    await page.getByTitle("Exit full screen").click();
    await expect(page.getByTitle("Full screen map")).toBeVisible();
    await page.waitForTimeout(600);
  }

  // 복귀 후 사이드 패널 (460px) 확인
  const sideMap = page.getByTitle("Full screen map").locator("xpath=ancestor::div[contains(@class,'lg:w-')]").first();
  const sideBox = await sideMap.boundingBox();
  expect(sideBox).not.toBeNull();
  expect(Math.round(sideBox!.width), "복귀 후 사이드 패널 폭").toBeLessThan(viewport.width / 2);

  // uncaught pageerror 0건 — relayout 오류 재발 금지 포함
  const relayoutErrors = pageErrors.filter(m => m.includes("relayout"));
  expect(relayoutErrors, "relayout 오류 재발").toHaveLength(0);
  expect(pageErrors, `uncaught pageerrors: ${pageErrors.join(" | ")}`).toHaveLength(0);
});
