// S0 shell smoke — 390px/tablet/desktop 3개 뷰포트에서 기본 셸이 렌더되고
// uncaught page error가 없는지 확인한다. (기존 페이지 회귀 감시)

import { test, expect, type Page } from "@playwright/test";

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(err.message));
  return errors;
}

test("Home 셸 렌더 + uncaught error 없음", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  await expect(page.locator("header").first()).toBeVisible();
  await expect(page.getByText("korea", { exact: false }).first()).toBeVisible();
  expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toHaveLength(0);
});

test("Explore(Busan) 셸 렌더 + 지도 컨테이너 존재 + uncaught error 없음", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/explore/busan");
  await expect(page.locator("h1")).toBeVisible();
  // 지도 wrapper (NaverMap 루트 div) — SDK 로드 여부와 무관하게 컨테이너는 존재해야 함
  await expect(page.getByTitle(/Full screen map|Exit full screen/).first()).toBeVisible({ timeout: 15_000 });
  expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toHaveLength(0);
});

test("My Trips 셸 렌더 + uncaught error 없음", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/my-trips");
  await expect(page.locator("body")).toBeVisible();
  expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toHaveLength(0);
});
