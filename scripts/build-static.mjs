/**
 * build-static.mjs — Cross-platform static export build
 * Usage: node scripts/build-static.mjs
 *
 * Sets STATIC_EXPORT=true and runs `next build`.
 * Exits with the child process exit code so npm && chaining works correctly.
 */
import { spawnSync } from "node:child_process";

process.env.STATIC_EXPORT = "true";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
