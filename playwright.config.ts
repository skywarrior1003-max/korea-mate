// GoKoreaMate — Playwright smoke 설정 (S0)
// dev 전용. 산출물(test-results/, playwright-report/)은 커밋하지 않는다 (.gitignore).

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  expect: { timeout: 20_000 }, // dev 서버 최초 컴파일 지연 흡수
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  // chromium만 설치 — 디바이스 프리셋(webkit 요구) 대신 뷰포트만 지정
  projects: [
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "tablet",     use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop",    use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
