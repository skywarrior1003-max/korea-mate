// S0-A 검증 — Explore 지도 split → full-screen → split 반복 시
// 지도 wrapper가 매번 뷰포트 전체 폭을 차지하고 (오른쪽 공백 버그 감시),
// 복귀 후에도 사이드 패널 폭으로 정상 복원되는지 확인한다.
// Naver SDK 타일 렌더는 API 키·referrer에 의존하므로 여기서는 컨테이너 기하학을 검증한다.

import { test, expect } from "@playwright/test";

test("전체화면 토글 3회 반복 — 컨테이너 기하 안정", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop 전용 (split 레이아웃)");

  await page.goto("/explore/busan");
  const toggle = page.getByTitle(/Full screen map|Exit full screen/).first();
  await expect(toggle).toBeVisible({ timeout: 15_000 });

  const viewport = page.viewportSize()!;

  for (let i = 1; i <= 3; i++) {
    // → 전체화면
    await toggle.click();
    await expect(page.getByTitle("Exit full screen")).toBeVisible();
    await page.waitForTimeout(500); // ResizeObserver + rAF + relayout 완료 대기
    const fullBox = await toggle.locator("xpath=ancestor::div[contains(@class,'fixed')]").first().boundingBox();
    expect(fullBox, "full-screen wrapper boundingBox").not.toBeNull();
    expect(Math.round(fullBox!.width), `${i}회차 전체화면 폭`).toBeGreaterThanOrEqual(viewport.width - 2);

    // → split 복귀
    await page.getByTitle("Exit full screen").click();
    await expect(page.getByTitle("Full screen map")).toBeVisible();
    await page.waitForTimeout(500);
  }

  // 복귀 후 사이드 패널 (460px) 확인
  const sideMap = page.getByTitle("Full screen map").locator("xpath=ancestor::div[contains(@class,'lg:w-')]").first();
  const sideBox = await sideMap.boundingBox();
  expect(sideBox).not.toBeNull();
  expect(Math.round(sideBox!.width), "복귀 후 사이드 패널 폭").toBeLessThan(viewport.width / 2);
});
