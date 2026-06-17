#!/usr/bin/env node

/**
 * GoKoreaMate Agent Verification Script
 *
 * Purpose:
 *   - Verify that an AI agent is working on a safe feature branch.
 *   - Warn if forbidden files are modified or staged.
 *   - Run TypeScript type check.
 *   - Run Next.js production build.
 *
 * Usage:
 *   node scripts/agent-verify.mjs
 *   npm run agent:verify
 *
 * Rules enforced:
 *   - Must NOT be on master branch.
 *   - Must NOT have forbidden files staged.
 *   - TypeScript must pass.
 *   - Build must pass.
 */

import { spawn } from "node:child_process";

// ─────────────────────────────────────────────
// Forbidden file patterns
// ─────────────────────────────────────────────
const FORBIDDEN_PATTERNS = [
  ".env.local",
  "supabase/.temp/",
  "supabase/.temp/",
  "package-lock.json",
  "supabase/migrations/",
];

// ─────────────────────────────────────────────
// Helper: Run a command, inherit stdio (shows output live)
// ─────────────────────────────────────────────
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ Running: ${command} ${args.join(" ")}`);

    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`✔ Passed: ${command} ${args.join(" ")}`);
        resolve();
      } else {
        reject(
          new Error(
            `Command failed (exit ${code}): ${command} ${args.join(" ")}`
          )
        );
      }
    });
  });
}

// ─────────────────────────────────────────────
// Helper: Get command output as string
// ─────────────────────────────────────────────
function getOutput(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed: ${command} ${args.join(" ")}\n${stderr.trim()}`));
      }
    });
  });
}

// ─────────────────────────────────────────────
// Step 1: Check git branch (must not be master)
// ─────────────────────────────────────────────
async function checkBranch() {
  console.log("\n[STEP 1] Checking git branch...");

  const branch = await getOutput("git", ["branch", "--show-current"]);
  console.log(`  Current branch: ${branch}`);

  if (branch === "master") {
    throw new Error(
      [
        "⛔ UNSAFE BRANCH: master",
        "",
        "Agents must NOT work directly on master.",
        "Please create a feature branch first:",
        "  git checkout -b feature/TASK-001-short-name",
      ].join("\n")
    );
  }

  const featureBranchPattern = /^feature\/TASK-\d{3,}[-a-zA-Z0-9_]*$/;
  if (!featureBranchPattern.test(branch)) {
    console.warn(
      `  ⚠ Warning: Branch name "${branch}" does not match expected format.`
    );
    console.warn(`  Expected format: feature/TASK-001-short-name`);
  } else {
    console.log("  ✔ Branch name OK.");
  }

  return branch;
}

// ─────────────────────────────────────────────
// Step 2: Show git status
// ─────────────────────────────────────────────
async function showGitStatus() {
  console.log("\n[STEP 2] Git status...");

  const status = await getOutput("git", ["status", "--short"]);
  const diffStat = await getOutput("git", ["diff", "--stat"]).catch(() => "");
  const changedFiles = await getOutput("git", ["diff", "--name-only"]).catch(() => "");

  if (status) {
    console.log("\n  Changed files (git status --short):");
    status.split("\n").forEach((line) => console.log(`    ${line}`));
  } else {
    console.log("  Working tree is clean.");
  }

  if (diffStat) {
    console.log("\n  Diff summary (git diff --stat):");
    diffStat.split("\n").forEach((line) => console.log(`    ${line}`));
  }

  if (changedFiles) {
    console.log("\n  Modified files (git diff --name-only):");
    changedFiles.split("\n").forEach((line) => console.log(`    ${line}`));
  }
}

// ─────────────────────────────────────────────
// Step 3: Check for forbidden files
// ─────────────────────────────────────────────
async function checkForbiddenFiles() {
  console.log("\n[STEP 3] Checking for forbidden files...");

  const status = await getOutput("git", ["status", "--short"]);
  const lines = status ? status.split("\n") : [];
  const allFiles = lines.map((line) => line.trim().replace(/^[MADRCU?!]{1,2} +/, ""));

  const violations = [];

  for (const file of allFiles) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (file.startsWith(pattern) || file === pattern) {
        violations.push(`  ⛔ FORBIDDEN FILE DETECTED: ${file}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("\n  Forbidden file violations found:");
    violations.forEach((v) => console.error(v));
    throw new Error(
      "Forbidden files are modified or staged. Do NOT commit until resolved."
    );
  }

  console.log("  ✔ No forbidden files detected.");
}

// ─────────────────────────────────────────────
// Step 4: TypeScript check
// ─────────────────────────────────────────────
async function runTypeCheck() {
  console.log("\n[STEP 4] TypeScript check (tsc --noEmit)...");
  await runCommand("npx", ["tsc", "--noEmit"]);
}

// ─────────────────────────────────────────────
// Step 5: Next.js build
// ─────────────────────────────────────────────
async function runBuild() {
  console.log("\n[STEP 5] Next.js production build...");
  await runCommand("npm", ["run", "build"]);
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  console.log("\n══════════════════════════════════════");
  console.log("  GoKoreaMate Agent Verification");
  console.log("══════════════════════════════════════");

  try {
    await checkBranch();
    await showGitStatus();
    await checkForbiddenFiles();
    await runTypeCheck();
    await runBuild();

    console.log("\n══════════════════════════════════════");
    console.log("  ✔ [VERIFY SUCCESS]");
    console.log("  All checks passed.");
    console.log("  Safe to create a local commit.");
    console.log("══════════════════════════════════════\n");

    process.exit(0);
  } catch (error) {
    console.error("\n══════════════════════════════════════");
    console.error("  ✖ [VERIFY FAILED]");
    console.error("══════════════════════════════════════");
    console.error(error instanceof Error ? error.message : String(error));
    console.error("\n  ─ Do NOT commit.");
    console.error("  ─ Do NOT push.");
    console.error("  ─ Do NOT deploy.");
    console.error("  ─ Report this failure to the user.\n");

    process.exit(1);
  }
}

main();
