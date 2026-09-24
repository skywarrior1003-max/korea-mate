import type { NextConfig } from "next";

// 환경 분리 가드 (V2-PRELAUNCH-ENVIRONMENT-ISOLATION-V1)
// Local 의 `next dev`/`next build` 가 Production Supabase 를 가리키면(또는 판정
// 불가면) 여기서 즉시 실패한다. Cloudflare CI(CF_PAGES=1)의 Production/Preview
// 빌드만 통과한다. Next 는 config 평가 전에 .env.local 을 process.env 로 로드한다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertLocalDataEnv } = require("./scripts/env-guard/data-env.cjs") as {
  assertLocalDataEnv: (env: NodeJS.ProcessEnv, opts?: { source?: string }) => string;
};
assertLocalDataEnv(process.env, { source: "next.config" });

const isStaticExport = process.env.STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  // Static export only when STATIC_EXPORT=true (used by the deploy script).
  // Plain `next build` / `next dev` omit this so API routes work normally.
  ...(isStaticExport ? { output: "export", trailingSlash: true } : {}),
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "tong.visitkorea.or.kr" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
