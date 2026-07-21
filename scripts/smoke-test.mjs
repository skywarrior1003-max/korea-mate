/**
 * PHASE 0 Smoke Test — Node.js, no extra deps
 * Usage: node scripts/smoke-test.mjs [http://localhost:3000]
 *
 * Tests 19 scenarios against the local dev server.
 * Does NOT touch production DB or real user data.
 * Direct DB lockdown QA (scenario 12) requires 017 applied — skipped here.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";

// ── helpers ──────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    results.push({ name, ok: true });
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    results.push({ name, ok: false, error: err.message });
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function api(method, path, { body, deviceId, rawBody } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (deviceId) headers["x-device-id"] = deviceId;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : (body ? JSON.stringify(body) : undefined),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

// ── sample days payload (v2 format) ──────────────────────────────────────────

const sampleDays = {
  __v: 2,
  scheduled: [
    {
      date: "2025-10-01",
      dayNumber: 1,
      places: [
        {
          name: "Haeundae Beach",
          category: "beach",
          location: "Haeundae, Busan",
          time: "09:00",
          duration: "2h",
          tips: "Visit early",
          googleMapsUrl: "https://maps.google.com",
          slot: "morning",
        },
      ],
    },
  ],
  unscheduled: [],
};

// ── test device IDs ──────────────────────────────────────────────────────────

const DEVICE_A  = uuid();
const DEVICE_B  = uuid();
const ITIN_ID   = uuid();
const SHARED_ID = uuid(); // doesn't exist in DB

// ── run tests ────────────────────────────────────────────────────────────────

console.log(`\nPHASE 0 Smoke Tests → ${BASE}\n`);

// 1. generate-itinerary endpoint responds (just verifies server is up)
await test("1. generate-itinerary endpoint responds", async () => {
  const res = await api("POST", "/api/generate-itinerary", {
    body: {
      city: "busan",
      startDate: "2025-10-01",
      endDate:   "2025-10-03",
      travelers: "2",
      travelStyle: "food",
      mock: true,
    },
  });
  assert(res.status < 600, `Unexpected status ${res.status}`);
});

// 2. New INSERT succeeds
await test("2. New itinerary INSERT succeeds (POST)", async () => {
  const { status } = await api("POST", "/api/itinerary", {
    body: { id: ITIN_ID, city: "busan", start_date: "2025-10-01", end_date: "2025-10-03", travelers: "2", travel_style: "food", days: sampleDays },
    deviceId: DEVICE_A,
  });
  assert(status === 201, `Expected 201, got ${status}`);
});

// 3. Duplicate ID INSERT → 409
await test("3. Duplicate ID INSERT → 409", async () => {
  const { status } = await api("POST", "/api/itinerary", {
    body: { id: ITIN_ID, city: "busan", start_date: "2025-10-01", end_date: "2025-10-03", travelers: "2", travel_style: "food", days: sampleDays },
    deviceId: DEVICE_A,
  });
  assert(status === 409, `Expected 409, got ${status}`);
});

// 4. Owner fetches own itinerary (no device_id in response)
await test("4. Owner fetch returns itinerary (200, no device_id exposed)", async () => {
  const { status, json } = await api("GET", `/api/itinerary/${ITIN_ID}`, { deviceId: DEVICE_A });
  assert(status === 200, `Expected 200, got ${status}`);
  assert(json?.id === ITIN_ID, "Missing id");
  assert(!("device_id" in (json ?? {})), "device_id must never appear in GET response");
});

// 5. Non-owner fetch → 404 (information leakage prevention)
await test("5. Non-owner GET → 404", async () => {
  const { status } = await api("GET", `/api/itinerary/${ITIN_ID}`, { deviceId: DEVICE_B });
  assert(status === 404, `Expected 404, got ${status}`);
});

// 6. Missing x-device-id on GET → 400
await test("6. GET without x-device-id header → 400", async () => {
  const res = await fetch(`${BASE}/api/itinerary/${ITIN_ID}`, {
    headers: { "Content-Type": "application/json" },
  });
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

// 7. Malformed device UUID on GET → 400
await test("7. GET with malformed x-device-id → 400", async () => {
  const { status } = await api("GET", `/api/itinerary/${ITIN_ID}`, { deviceId: "not-a-uuid" });
  assert(status === 400, `Expected 400, got ${status}`);
});

// 8. Owner UPDATE succeeds
await test("8. Owner conditional UPDATE succeeds (PUT)", async () => {
  const { status } = await api("PUT", `/api/itinerary/${ITIN_ID}`, {
    body: { days: sampleDays, city: "busan" },
    deviceId: DEVICE_A,
  });
  assert(status === 200, `Expected 200, got ${status}`);
});

// 9. Non-owner UPDATE → 404
await test("9. Non-owner PUT → 404", async () => {
  const { status } = await api("PUT", `/api/itinerary/${ITIN_ID}`, {
    body: { days: sampleDays, city: "busan" },
    deviceId: DEVICE_B,
  });
  assert(status === 404, `Expected 404, got ${status}`);
});

// 10. Title PATCH succeeds
await test("10. Owner title PATCH succeeds", async () => {
  const { status } = await api("PATCH", `/api/itinerary/${ITIN_ID}`, {
    body: { trip_title: "Smoke Test Trip" },
    deviceId: DEVICE_A,
  });
  assert(status === 200, `Expected 200, got ${status}`);
});

// 11. Non-owner PATCH → 404
await test("11. Non-owner PATCH → 404", async () => {
  const { status } = await api("PATCH", `/api/itinerary/${ITIN_ID}`, {
    body: { trip_title: "Hijacked Title" },
    deviceId: DEVICE_B,
  });
  assert(status === 404, `Expected 404, got ${status}`);
});

// 12. Missing x-device-id on POST → 400
await test("12. POST without x-device-id header → 400", async () => {
  const res = await fetch(`${BASE}/api/itinerary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: uuid(), city: "busan", days: sampleDays }),
  });
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

// 13. Oversized body → 413
await test("13. Oversized body → 413", async () => {
  const huge = { id: uuid(), city: "busan", days: sampleDays, _pad: "x".repeat(3 * 1024 * 1024) };
  const { status } = await api("POST", "/api/itinerary", {
    body: huge,
    deviceId: DEVICE_A,
  });
  assert(status === 413, `Expected 413, got ${status}`);
});

// 14. Invalid JSON body → 400
await test("14. Invalid JSON body → 400", async () => {
  const res = await fetch(`${BASE}/api/itinerary`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-id": DEVICE_A },
    body: "{ this is: not json }",
  });
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

// 15. DELETE — wrong device fails
await test("15a. Non-owner DELETE → 404", async () => {
  // Re-insert for delete tests (ITIN_ID was not deleted yet)
  const { status } = await api("DELETE", `/api/itinerary/${ITIN_ID}`, { deviceId: DEVICE_B });
  assert(status === 404, `Expected 404, got ${status}`);
});

await test("15b. Owner DELETE succeeds", async () => {
  const { status } = await api("DELETE", `/api/itinerary/${ITIN_ID}`, { deviceId: DEVICE_A });
  assert(status === 200, `Expected 200, got ${status}`);
});

// 16. My Trips list by device
await test("16. My Trips list by device", async () => {
  const { status, json } = await api("GET", "/api/itineraries", { deviceId: DEVICE_A });
  assert(status === 200, `Expected 200, got ${status}`);
  assert(Array.isArray(json), "Expected array");
});

// 17. Popular Trips
await test("17. Popular Trips returns array", async () => {
  const { status, json } = await api("GET", "/api/trips/popular?limit=3");
  assert(status === 200, `Expected 200, got ${status}`);
  assert(Array.isArray(json), "Expected array");
});

// 18. Invalid UUID path → 400
await test("18. Non-UUID itinerary ID in path → 400", async () => {
  const { status } = await api("GET", "/api/itinerary/not-a-uuid", { deviceId: DEVICE_A });
  assert(status === 400, `Expected 400, got ${status}`);
});

// 19. Shared page is reachable (bot path unchanged — 200 if itinerary exists, 404 if not)
await test("19. Shared page responds (bot OG path not broken)", async () => {
  const res = await fetch(`${BASE}/shared/${SHARED_ID}`, {
    headers: { "user-agent": "facebookexternalhit/1.1" },
  });
  // 404 for nonexistent UUID is correct; 200 when itinerary exists
  assert([200, 404].includes(res.status), `Unexpected status ${res.status}`);
});

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailed:");
  results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}: ${r.error}`));
  process.exit(1);
} else {
  console.log("All smoke tests passed.\n");
}
