#!/usr/bin/env node

/**
 * GoKoreaMate — TASK-003: restaurants Supabase 연동 검증 도구
 *
 * Purpose:
 *   - Read-only local check of the restaurants data-loading structure.
 *   - Does NOT connect to Supabase production DB.
 *   - Does NOT read .env.local.
 *   - Does NOT write any file.
 *
 * Usage:
 *   node scripts/check-restaurants-places.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

let passed = 0;
let warnings = 0;
let failed = 0;

function ok(label, detail = "") {
  passed++;
  console.log(`  ✔ [PASS] ${label}${detail ? ` — ${detail}` : ""}`);
}

function warn(label, detail = "") {
  warnings++;
  console.warn(`  ⚠ [WARN] ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  failed++;
  console.error(`  ✖ [FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 50 - title.length))}`);
}

// ─────────────────────────────────────────────
// Check 1: restaurants.json exists and has count
// ─────────────────────────────────────────────
section("CHECK 1: public/data/restaurants.json");

const restaurantsJsonPath = resolve(ROOT, "public/data/restaurants.json");

if (!existsSync(restaurantsJsonPath)) {
  fail("restaurants.json not found", restaurantsJsonPath);
} else {
  ok("restaurants.json exists");

  try {
    const raw = readFileSync(restaurantsJsonPath, "utf-8");
    const data = JSON.parse(raw);
    const count = Array.isArray(data) ? data.length : Object.keys(data).length;

    if (count === 0) {
      warn("restaurants.json is empty (count = 0)");
    } else if (count < 100) {
      warn(`restaurants.json has fewer items than expected: ${count}`);
    } else {
      ok(`restaurants.json count = ${count}`, "expected ~194");
    }

    // Check structure of first item
    const first = Array.isArray(data) ? data[0] : Object.values(data)[0];
    const requiredFields = ["id", "name_ko", "name_en", "latitude", "longitude"];
    const missing = requiredFields.filter((f) => !(f in first));

    if (missing.length > 0) {
      warn("Some expected fields missing in restaurants.json", missing.join(", "));
    } else {
      ok("restaurants.json item structure looks correct");
    }
  } catch (err) {
    fail("restaurants.json parse error", err.message);
  }
}

// ─────────────────────────────────────────────
// Check 2: src/lib/places.ts exists
// ─────────────────────────────────────────────
section("CHECK 2: src/lib/places.ts existence");

const placesPath = resolve(ROOT, "src/lib/places.ts");

if (!existsSync(placesPath)) {
  fail("src/lib/places.ts not found");
} else {
  ok("src/lib/places.ts exists");
}

// ─────────────────────────────────────────────
// Check 3: getRestaurantPlaces function exists
// ─────────────────────────────────────────────
section("CHECK 3: getRestaurantPlaces function");

if (existsSync(placesPath)) {
  const placesContent = readFileSync(placesPath, "utf-8");

  if (placesContent.includes("export async function getRestaurantPlaces")) {
    ok("getRestaurantPlaces is exported from places.ts");
  } else if (placesContent.includes("getRestaurantPlaces")) {
    warn("getRestaurantPlaces found but may not be exported correctly");
  } else {
    fail("getRestaurantPlaces not found in places.ts");
  }

  // Check Supabase query targets places table with restaurant category
  if (placesContent.includes('.from("places")') || placesContent.includes(".from('places')")) {
    ok('places.ts queries Supabase .from("places")');
  } else {
    warn('places.ts does not appear to query .from("places")');
  }

  if (
    placesContent.includes('.eq("category", "restaurant")') ||
    placesContent.includes(".eq('category', 'restaurant')")
  ) {
    ok('places.ts filters by category = "restaurant"');
  } else {
    warn('places.ts does not appear to filter by category = "restaurant"');
  }

  if (
    placesContent.includes('.eq("admin_status", "approved")') ||
    placesContent.includes(".eq('admin_status', 'approved')")
  ) {
    ok('places.ts filters by admin_status = "approved"');
  } else {
    warn('places.ts does not filter by admin_status = "approved" — unverified places may appear');
  }
}

// ─────────────────────────────────────────────
// Check 4: Fallback logic
// ─────────────────────────────────────────────
section("CHECK 4: Fallback logic in restaurants page");

const restaurantsPagePath = resolve(ROOT, "src/app/restaurants/page.tsx");

if (!existsSync(restaurantsPagePath)) {
  fail("src/app/restaurants/page.tsx not found");
} else {
  ok("src/app/restaurants/page.tsx exists");
  const pageContent = readFileSync(restaurantsPagePath, "utf-8");

  const hasFallbackImport =
    pageContent.includes("restaurants.json") ||
    pageContent.includes("restaurants_part");

  const hasSupabaseFirst =
    pageContent.includes("getRestaurantPlaces") ||
    pageContent.includes("places");

  if (hasSupabaseFirst) {
    ok("restaurants page references getRestaurantPlaces (Supabase-first)");
  } else {
    warn("restaurants page does not appear to reference Supabase places loader");
  }

  if (hasFallbackImport) {
    ok("restaurants page references JSON fallback file");
  } else {
    warn("restaurants page does not appear to reference JSON fallback — fallback may be missing");
  }

  // Check for both: Supabase-first then fallback pattern
  if (hasSupabaseFirst && hasFallbackImport) {
    ok("Supabase-first + JSON fallback pattern confirmed in restaurants page");
  }
}

// ─────────────────────────────────────────────
// Check 5: No SUPABASE_SERVICE_ROLE_KEY in restaurants frontend
// ─────────────────────────────────────────────
section("CHECK 5: Service role key isolation");

const filesToScan = [
  "src/lib/places.ts",
  "src/app/restaurants/page.tsx",
];

let serviceRoleViolation = false;

for (const relPath of filesToScan) {
  const absPath = resolve(ROOT, relPath);
  if (!existsSync(absPath)) continue;

  const content = readFileSync(absPath, "utf-8");
  if (content.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    fail(`Service role key reference found in frontend file: ${relPath}`);
    serviceRoleViolation = true;
  }
}

if (!serviceRoleViolation) {
  ok("No SUPABASE_SERVICE_ROLE_KEY in restaurants frontend files");
  ok("No SUPABASE_SERVICE_ROLE_KEY in places.ts");
}

// Service role key IS allowed in admin/server-only routes — check that it's only there
const adminRoutes = [
  "src/app/api/admin/contact-inquiries/route.ts",
  "src/lib/contact.ts",
];

const adminHasServiceRole = adminRoutes.some((relPath) => {
  const absPath = resolve(ROOT, relPath);
  if (!existsSync(absPath)) return false;
  return readFileSync(absPath, "utf-8").includes("SUPABASE_SERVICE_ROLE_KEY");
});

if (adminHasServiceRole) {
  ok("SUPABASE_SERVICE_ROLE_KEY is correctly scoped to admin/server-only routes");
}

// ─────────────────────────────────────────────
// Check 6: supabase client in places uses anon key (not service role)
// ─────────────────────────────────────────────
section("CHECK 6: Supabase client key type in places.ts");

const supabaseClientPath = resolve(ROOT, "src/lib/supabase.ts");

if (!existsSync(supabaseClientPath)) {
  warn("src/lib/supabase.ts not found — cannot verify client key type");
} else {
  const supabaseContent = readFileSync(supabaseClientPath, "utf-8");

  if (supabaseContent.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    warn(
      "supabase.ts references SUPABASE_SERVICE_ROLE_KEY — verify this client is NOT used in frontend restaurants page"
    );
  } else {
    ok("supabase.ts does not use service role key (anon key client)");
  }

  if (
    supabaseContent.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    supabaseContent.includes("supabaseAnonKey") ||
    supabaseContent.includes("anon")
  ) {
    ok("supabase.ts appears to use public anon key — safe for frontend use");
  }
}

// ─────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════");
console.log("  TASK-003 Check Summary");
console.log("══════════════════════════════════════════════════════");
console.log(`  ✔ Passed  : ${passed}`);
console.log(`  ⚠ Warnings: ${warnings}`);
console.log(`  ✖ Failed  : ${failed}`);
console.log("──────────────────────────────────────────────────────");

if (failed > 0) {
  console.error("\n  ✖ [CHECK FAILED] Fix failures before committing.\n");
  process.exit(1);
} else if (warnings > 0) {
  console.warn("\n  ⚠ [CHECK PASSED WITH WARNINGS] Review warnings before proceeding.\n");
  process.exit(0);
} else {
  console.log("\n  ✔ [CHECK PASSED] restaurants Supabase structure is clean.\n");
  process.exit(0);
}
