// S1 — 신규 화면 smoke: /saved 2-탭, 전역 BottomNav(모바일), Food Guide 타이틀.
// /place/[id]는 DB id 의존이라 여기서 단언하지 않는다 —
// 빌드 시 86페이지 SSG(렌더 오류 시 빌드 실패)와 시각 QA 스크립트가 커버.

import { test, expect, type Page } from "@playwright/test";

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(err.message));
  return errors;
}

test("/saved — 2-탭 렌더 + uncaught error 없음", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/saved");
  await expect(page.getByRole("tab").first()).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(2);
  // My Places 탭 전환
  await page.getByRole("tab").nth(1).click();
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  expect(errors, `uncaught: ${errors.join(" | ")}`).toHaveLength(0);
});

test("전역 BottomNav — 모바일에서 5개 탭 표시", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "모바일 전용");
  const errors = collectPageErrors(page);
  await page.goto("/");
  const nav = page.locator("nav[aria-label='Primary']");
  await expect(nav).toBeVisible();
  await expect(nav.locator("a")).toHaveCount(5);
  expect(errors, `uncaught: ${errors.join(" | ")}`).toHaveLength(0);
});

test("Food Guide — 'Top 100' 제거·새 타이틀", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/restaurants");
  await expect(page.getByRole("heading", { name: "2026 Busan Food Guide", exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Top 100")).toHaveCount(0);
  expect(errors, `uncaught: ${errors.join(" | ")}`).toHaveLength(0);
});
