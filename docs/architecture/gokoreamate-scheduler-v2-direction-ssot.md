# GoKoreaMate Scheduler V2 — Product & Architecture Direction SSOT

- **Status: OWNER-APPROVED DIRECTION**
- **Scope:** Scheduler / Map / Place Quality / Trip Intelligence
- **This document is direction SSOT, not implementation-complete evidence.**
- **Last updated:** 2026-08-30
- **Git commit (base):** `02d202a` on `feature/my-trip-planning-final-v1` (origin/master `0a47358`)
- **Do not confuse Owner-approved direction with actual implementation state.** Every statement below carries one of the labels in §0. Where a label says `PLANNED`, nothing in the repo implements it yet. Where it says `CURRENT_IMPLEMENTATION`, a file/test is named as evidence.
- Machine-readable companion: `docs/architecture/gokoreamate-scheduler-v2-decision-ledger.json` (same ids as the `D-xx` markers here).
- Existing contracts this document does **not** override: `docs/rule-based-scheduler-design.md` (v1 engine), `docs/architecture/gokoreamate-data-contract-v1.md` (place data), `docs/product/gokoreamate-my-places-trip-ai-ssot-2026-08-13.md` (This Trip input contract, My Places AI, style library). Conflicts are resolved by the Owner, not by this document.

## 0. Labels (anti-hallucination rule)

| Label | Meaning |
|---|---|
| `OWNER_DECISION` | Direction the Owner has approved (2026-08 Owner ↔ GPT discussions, recorded here). |
| `CURRENT_IMPLEMENTATION` | Verified in the repo at the base commit — file/test named as evidence. |
| `PARTIAL` | Some of the capability exists; the gap is stated. |
| `PLANNED` | Owner approved the direction; not implemented. |
| `PROPOSAL` | Reasonable idea; **no** Owner implementation approval yet. |
| `EXTERNAL_INSPIRATION` | Publicly observable principle of another product (Gemini, GPT/OpenAI, Booking, Omio…). Never a claim about their private internals. |
| `UNKNOWN_OR_REVERIFY` | Evidence is missing or stale; must be re-verified before relying on it. |

Rules: `PLANNED` is never written as `CURRENT_IMPLEMENTATION`; `PROPOSAL` is never promoted to `OWNER_DECISION` by an AI; no sentence presents private internal behavior of Gemini/GPT as fact.

## 1. Product definition — `OWNER_DECISION` (D-01)

GoKoreaMate is **not** "an AI that writes a plausible-looking itinerary". The target is:

> A Korea travel **execution engine**: verified Korean places and locations, realistic time/movement constraints, the user's intent and fixed conditions → an itinerary that can actually be executed, and that adapts to change during the trip.

Role separation (D-02, `OWNER_DECISION`):

| Layer | Owns |
|---|---|
| AI | natural-language intent, taste, candidate/semantic scoring support, interpreting change requests, explaining recommendations/placements |
| GoKoreaMate Scheduler | dates, fixed constraints, stay, arrival/departure, Day assignment, ordering, feasibility, route quality, confidence |
| Place / Data | canonical identity, real places, coordinates, address, source/provenance, stable vs dynamic facts |
| Map / Movement | real spatial relations, real-world movement validation; user navigation stays on external Naver/Google links |

**AI never fabricates coordinates, real travel times, or opening hours as facts** (D-03, `OWNER_DECISION`). Production AI stays OFF until separately approved (existing contract; `functions/api/trip/personalize.ts` is mode-gated with retry 0).

## 2. Scheduler V2 integrated structure (22 components)

Format per row: purpose · input → output · status · priority (P0 now / P1 pre-launch / P2 right after launch / P3 next / P4 long-term, per §24).

| # | Component | Purpose | Input → Output | Status | Priority |
|---|---|---|---|---|---|
| 1 | Intent Compiler | Turn free text into structured scheduler intent/constraints | text → pace, walking tolerance, priorities, daily stop target | `PLANNED` (D-06) | P2 |
| 2 | Persistent Trip Context | Never re-ask what the user already gave; Confirmed Anchor / Flexible / Suggested | TripDraft, This Trip, fixed → typed context | `PARTIAL` — TripDraft (`src/lib/trip-draft`), This Trip cart, fixed (`CartFixed`) persist; the three-tier classification is not modeled (D-07) | P2 |
| 3 | Canonical Place Identity | One place = one identity across surfaces | `city_spots.id` / `sourceKey` → identity | `CURRENT_IMPLEMENTATION` — `src/lib/place-identity.ts` (`citySpotSourceKey`, `userSpotSourceKey`), dedup guards | P0 |
| 4 | Coordinate / Data Confidence Gate | Only trustworthy coordinates feed auto-scheduling | place row → HIGH/MEDIUM/LOW, `schedule_eligible` | `PLANNED` (D-08); today only null-check + bbox (`isValidCoordinate`, `plan.ts` bbox) | P1 |
| 5 | Temporal Feasibility Gate | Opening hours, closures, entry cutoff, check-in/out, fixed times | place facts + times → feasible / impossible | `PARTIAL` — HC-1..HC-9 exist (`src/lib/scheduler/constraint-validator.ts`); **HC-2 opening hours is a stub that always passes** (opening_hours NULL in data) (D-09) | P2 |
| 6 | Anchor-first Scheduling | Fixed / arrival / departure / stay / reservations before AI picks | anchors → placed first, flexible stops fill gaps | `CURRENT_IMPLEMENTATION` — `anchor-placer.ts`, `placeFixedEvents`, `planDayAnchors` (page), HC-5/HC-9; unplaceable → `unplacedPicks` / `fixedOutOfWindow` (D-10) | P0/P1 |
| 7 | Neighborhood Clustering | Group by area first, then Day, then order | places → clusters → Day | `PARTIAL` — distance zones from the day start (Zone 1/2/3 = 3 km/7 km, `src/lib/near-me/zone-classifier.ts`, `ZoneTracker` same-zone bonus / reverse penalty). **Named neighborhoods (부산역·남포, 서면…) are not modeled** (D-11) | P1 |
| 8 | Day Assignment | Which places go to which Day | multi-day picks → per-Day sets | `PARTIAL` — sequential per-Day calls with `exclude_place_ids` and cart-hint deferral (`mergeDayHints`); no global multi-day assignment | P1 |
| 9 | Within-Day Route Optimization | Order inside a Day | Day set → order | `CURRENT_IMPLEMENTATION` (v1 greedy + priority queue + `consecutiveDistancePenalty`, `engine.ts`) — quality not audited (see #13) | P0 |
| 10 | Multimodal Travel Cost | Walk / transit / taxi cost model | pair → minutes/cost per mode | `PLANNED` (D-12); today a distance-threshold table (`travel-time-estimator.ts`, `TRAVEL_TIME_TABLE`) | P3 |
| 11 | Naver Real-world Validation | Validate good candidates with real travel time | route → validated minutes | `PLANNED` (D-12); no Naver Directions call exists | P2 |
| 12 | Experience Scoring | Beyond shortest path: pace, fatigue, meal timing, scenic, indoor/outdoor, local character | Day → experience score | `PARTIAL` — meal windows (`meal-opportunity.ts`), pace stay tables, profile bias; no fatigue/scenic/indoor-outdoor model (D-14) | P3 |
| 13 | Route Quality / Backtracking Audit | Check a generated Day before returning it | Day → distances, total movement, re-entry, backtracking, cause (fixed vs scheduler) | `PLANNED` (D-13); today only scoring-time penalties, no post-generation audit | P1 |
| 14 | Constraint Negotiator | Impossible request → explicit alternatives, user chooses | conflict → 1–2 options | `PARTIAL` — 409 conflict + `HC-*` codes and unplaced notices exist; no alternative generation (D-15) | P2 |
| 15 | Schedule Confidence Gate | "Generated" ≠ "good enough to show" | Day/trip → internal score → recompute / substitute / unplaced / ask | `PLANNED` (D-16) | P1 (minimal) |
| 16 | Multiple Internal Candidates | Compare A move-min / B balanced / C variety internally | inputs → several schedules → pick | `PLANNED` (D-17) | P2 |
| 17 | Backup Place Set | Substitutes per stop for closure / weather / skip | stop → alternates | `PLANNED` (D-18) | P2 |
| 18 | My Trip | The user-facing itinerary product (Planning · Edit · Today · Story) | scheduler output → My Trip | `CURRENT_IMPLEMENTATION` — `src/app/itinerary/page.tsx` (Timeline B, edit, unplaced store, Today NOW/NEXT, PlaceModal, map markers) | P0 |
| 19 | Partial Replanning | Lock done + fixed, reorder the remainder from current position | live state → remaining Day | `PLANNED` (D-18); Today Trip is read-only NOW/NEXT (`execution-core.ts`) | P4 |
| 20 | User Edit Learning | Repeated edits → weak preference signals | edit history → signals | `PLANNED` (D-19) | P4 |
| 21 | Explain Why / Placement Reason | Internal reason per placement, for users and QA | placement → reason codes | `PLANNED` (D-20); scheduler emits codes only for conflicts (`HC-*`) | P3 |
| 22 | Stable vs Dynamic Facts | Don't freeze dynamic facts into static fields | data model split | `PARTIAL` — `city_spots` holds stable fields; `opening_hours` exists but is NULL-heavy; no dynamic layer (D-21) | P3 |

## 3. Intent Compiler — `PLANNED` (D-06)

Example input: "부모님과 가고 많이 걷지 않으면서 맛집과 부산다운 풍경을 보고 싶다." → structured intent: `pace`, `walking_tolerance`, `food_priority`, `scenic_priority`, `local_character_priority`, `daily_stop_target`. The AI produces intent/constraints for the scheduler; it does **not** decide final order. Existing related but different thing: `/api/trip/personalize` (whole-trip weight profile, AI OFF by default, mock profile only) — not an intent compiler.

## 4. Persistent Trip Context — `OWNER_DECISION` direction (D-07), `PARTIAL` today

Already-given inputs (arrival, departure, stay, travelers, pace, reservations, shows, fixed meals) are not re-asked. Three tiers: **Confirmed Anchor** (hard) · **Flexible Preference** (soft) · **Suggested Preference** (system-suggested; **never** treated as a user hard constraint). Today: TripDraft/cart/fixed persist per city on the device; tiers are not modeled.

## 5. Coordinate Quality Gate — `OWNER_DECISION` direction (D-08), `PLANNED`

Trigger case (2026-08-30 READ-ONLY audit): 9 published Busan `city_spots` rows render in the sea south of Haeundae — ids 272, 386, 395, 397, 400, 1133, 1135, 1138, 1167 (source `busan_enrichment_v1` / `canonical`) — plus id 7 Igidae (suspect) (D-27, `UNKNOWN_OR_REVERIFY` until corrected). Rendering uses DB lat/lng unchanged; the defect is data. Existence of lat/lng must no longer be the only eligibility test.

Future fields (names indicative, schema **not** yet designed): `coordinate_source`, `coordinate_confidence`, `coordinate_verified_at`, `address_coordinate_match`, `schedule_eligible`.
Policy example: HIGH → auto-schedule; MEDIUM → limited use / confirm; LOW → excluded from auto-fill and scheduler candidates.
Principle: *fixing a few coordinates is not the end — future bad data must fail the Scheduler Quality Gate.* Authoritative coordinates are corrected by the Owner (data), never overwritten by code.

## 6. Temporal Feasibility — `OWNER_DECISION` direction (D-09), `PARTIAL`

Checks: opening hours, closures, event times, reservation times, entry cutoff, check-in/check-out, fixed times. Evaluation order: (1) feasible? (2) route good? (3) experience good? A hard feasibility violation is an **impossible state**, not a low score. Today: HC-3/4/5/6/8/9 are real; **HC-2 opening hours is a pass-through stub** because `opening_hours` is NULL for the new Busan restaurants (`meal-opportunity.ts` comment).

## 7. Anchor-first Scheduling — `OWNER_DECISION` (D-10), `CURRENT_IMPLEMENTATION` core

Owner fixed / arrival / departure / stay / reservations outrank AI recommendations; anchors are placed first, flexible stops fill the windows. The scheduler never silently moves a fixed item (D-05); impossible → unplaced / conflict (`409` + `HC-*`) / negotiation. Evidence: `anchor-placer.ts`, `fixed-pair-feasibility.test.ts`, `mandatory-first-pass.test.ts`, page `planDayAnchors` + `fixedOutOfWindowNames` + `unplacedPicks`. Stay check-in is a second pass on Day 1 only when a confirmed coordinate exists (`planCheckin`).

## 8. Neighborhood Clustering — `OWNER_DECISION` direction (D-11), `PARTIAL`

Hierarchical: neighborhood → Day → in-Day order, to cut backtracking. Busan examples (부산역·남포 / 서면·전포 / 광안리 / 해운대·동백 / 청사포·송정 / 기장) are **illustrative, not a permanent hard-coded cluster list**. Today: concentric distance zones around the day start, not named neighborhoods.

## 9. Route / Movement Quality — `OWNER_DECISION` (D-12)

AI does not guess travel times. Phase 1: coordinate-based fast estimate (today: threshold table). Phase 2: validate only good candidates with real travel time — in Korea, **Naver-based travel-time validation is the first option to evaluate** (`PLANNED`). User navigation stays on Naver/Google external links; GoKoreaMate does not become a turn-by-turn navigation product.

## 10. Route Quality Audit — `OWNER_DECISION` direction (D-13), `PLANNED`

Before returning a generated Day: stop-to-stop distances, total daily movement, large jumps, same-area re-entry, backtracking, relation to the stay, whether a round trip is forced by a fixed item, coordinate confidence. Example pattern to judge: 해운대 → 송정 → 해운대 → 청사포 — required by a fixed item, or a scheduler quality problem?
**`UNKNOWN_OR_REVERIFY` (D-26):** the route quality of the real 10-day Busan itinerary has **not** been audited; do not record it as verified.

## 11. Experience Scoring — `OWNER_DECISION` direction (D-14), `PARTIAL`

Long-term score inputs: route cost, backtracking, pace, fatigue, category repetition, meal timing, scenic value, indoor/outdoor balance, local character, user preference. Distance optimization and travel-experience optimization are evaluated separately.

## 12. Constraint Negotiator — `OWNER_DECISION` direction (D-15), `PARTIAL`

Physically impossible requests are never silently altered by AI. Scheduler declares impossibility; AI explains 1–2 realistic alternatives (adjust the fixed time, move a place to another Day, leave some unplaced); the **user** chooses.

## 13. Schedule Confidence — `OWNER_DECISION` direction (D-16), `PLANNED`

Internal quality score per trip: coordinate confidence, temporal feasibility, route quality, backtracking, fixed feasibility, data freshness. Below threshold → recompute / substitute / unplaced / ask the user. "Generated" and "good enough to show the user" are different states.

## 14. Multiple Candidates — `OWNER_DECISION` direction (D-17), `PLANNED`

Internally compute e.g. A move-minimal / B balanced / C experience-diverse and compare confidence/objective. Showing all three to the user is **not** implied.

## 15. Backup Place / Partial Replanning — `OWNER_DECISION` direction (D-18), `PLANNED`

Substitutes per stop for closure / weather / delay / skip. During the trip: completed stops LOCK, fixed LOCK, reorder only the remainder from the current position — never regenerate the whole trip. Today Trip today is NOW/NEXT display from schedule time only (no GPS, no replanning).

## 16. User Edit Learning — `OWNER_DECISION` direction (D-19), `PLANNED`

Repeated deletions / cafe additions / later mornings / fewer stops may become preference signals — never silent hard constraints; low-confidence inferred preferences are weak; explicit This Trip / fixed always win.

## 17. Explain Why — `OWNER_DECISION` direction (D-20), `PLANNED`

Placement reasons (same neighborhood, fits before fixed dinner, closing time, less backtracking, pace fit) kept internally → user-facing "why today?" later; also QA/debugging.

## 18. Stable vs Dynamic Facts — `OWNER_DECISION` direction (D-21), `PARTIAL`

Stable: canonical identity, base address, coordinates, base category. Dynamic: opening hours, temporary closure, events, price, promotions, weather, traffic, reservation availability. Dynamic facts are not forced into permanent static fields.

## 19. Principles referenced from Gemini / Google — `EXTERNAL_INSPIRATION` (D-22)

Observed in public product/developer features: real-world grounding, Maps/place identity, persistent personal/trip context, neighborhood-oriented planning, dynamic information integration, natural-language itinerary revision.
**Google/Gemini's private internal scheduler algorithm is not public. This document references only principles observable in public product/developer features. Nothing here claims to replicate Gemini's internal implementation.**

## 20. Principles referenced from GPT / OpenAI — `EXTERNAL_INSPIRATION` (D-23)

Intent compilation, natural-language constraint extraction, reasoning over structured + unstructured data, semantic smart filters, conversational itinerary editing, constraint negotiation, external travel inventory/system integration, and the possibility of general-purpose AI as a distribution channel into GoKoreaMate.
**OpenAI is not assumed to provide a proprietary public map-routing scheduler algorithm.** Division: general AI = intent/conversation; GoKoreaMate = Korea travel execution.

## 21. Implementation priority — `OWNER_DECISION` (D-24)

| Tier | Items |
|---|---|
| **P0 — stabilize now** | targeted correction of the known bad coordinates (Owner data action); Day-by-Day route-quality audit of the real 10-day itinerary; root-cause of round trips; close current My Trip release blockers |
| **P1 — pre-launch Scheduler V2 Minimum** | Coordinate Quality Gate; Anchor-first validation; Neighborhood clustering; Backtracking detection; Route Quality Audit; Minimal Schedule Confidence |
| **P2 — right after launch** | Naver actual travel-time validation; opening-hours/closure feasibility; Intent Compiler; Constraint Negotiator; Backup Place; multiple candidate comparison |
| **P3 — next** | Multimodal Travel Cost; fatigue/meal/experience scoring; weather adaptation; dynamic fact layer; Explain Why |
| **P4 — long-term** | Partial Replanning; User Edit Learning; automatic reservation anchors; persistent personal trip intelligence; ChatGPT/Gemini distribution integration |

## 22. Rough effort — planning estimate, **not a deadline or guarantee** (D-25, `PROPOSAL`-grade numbers)

| Stage | Estimate |
|---|---|
| Current stabilization | ~4–7 working days; 1–2 weeks if data issues widen |
| Scheduler V2 Minimum | ~7–12 working days; ~2 weeks incl. QA |
| From now to first mobile launch | fast ~2 weeks · realistic ~3 weeks · ~4 weeks if QA/data issues persist |
| V2.1 (right after launch) | ~3–5 weeks |
| V2.5 | ~4–7 weeks |
| Long-term advanced | 6–12+ weeks |
| Full advanced scheduler, 1 person + AI coding assistance | ~3–5 months; 4–6 months with external API/data/ops variables |

## 23. Current implementation vs future direction (verified at `02d202a`)

| Capability | Status | Evidence / Note | Priority |
|---|---|---|---|
| This Trip only scheduler input (Saved/My Places never auto-inserted) (D-04) | `CURRENT_IMPLEMENTATION` | `plan.ts` `cart_coord_hints` → score 999 candidates; Saved only as `liked_place_ids` scoring signal; guard `planner-stage-a-guard.test.ts` | P0 |
| Fixed constraints | `CURRENT_IMPLEMENTATION` | `CartFixed` → `fixed_events`/`anchors`, HC-5/HC-9, `fixed-pair-feasibility.test.ts`; unplaceable → `fixedOutOfWindow` notice | P0 |
| Stay | `PARTIAL` | area/exact stay in TripDraft; check-in second pass Day 1 only with confirmed coordinate (`planCheckin`); no stay-relative route scoring | P1 |
| Arrival / departure | `CURRENT_IMPLEMENTATION` | `hardStart`/`hardEnd`, `departureDestination` fixed event, airport-evening filter (TASK-060-E2) | P0 |
| Pace | `CURRENT_IMPLEMENTATION` | `pace` stay tables + `trip_pace` candidate scoring (`slot-allocator.ts`, `profile-bias.ts`) | P0 |
| Existing scheduler (v1) | `CURRENT_IMPLEMENTATION` | `src/lib/scheduler/engine.ts` 7-module pipeline (Anchor → Event → Greedy → Affiliate → Timeline), HC-1..9, meal windows, zone tracker | P0 |
| Generation performance | `CURRENT_IMPLEMENTATION` | 10-day Busan 160 s+ → 4–7 s after `02d202a` (affiliate placeholder-client timeout removed); `[plan-timing]` log | P0 |
| Coordinate confidence | `PLANNED` | only null/bbox checks today; 9+1 bad Busan rows pending Owner data correction | P1 |
| Neighborhood clustering | `PARTIAL` | distance zones (3 km / 7 km) around the day start; no named-neighborhood model | P1 |
| Backtracking audit | `PARTIAL` | `ZoneTracker` reverse-zone penalty and consecutive-distance penalty at scoring time; **no post-generation audit** | P1 |
| Route quality audit | `PLANNED` | none; real 10-day itinerary **not audited** (`UNKNOWN_OR_REVERIFY`) | P1 |
| Schedule confidence | `PLANNED` | none | P1 |
| Naver validation | `PLANNED` | no Directions/route API call; travel time = distance-threshold table | P2 |
| Opening hours feasibility | `PARTIAL` | HC-2 defined but always passes; `opening_hours` NULL-heavy | P2 |
| Intent Compiler | `PLANNED` | `/api/trip/personalize` is a weight profile with AI OFF, not intent compilation | P2 |
| Partial replanning | `PLANNED` | Today Trip = schedule-time NOW/NEXT only (`execution-core.ts`) | P4 |
| User preference learning | `PLANNED` | none | P4 |
| Map marker → place info | `CURRENT_IMPLEMENTATION` | numbered marker click → PlaceModal (`ItineraryDayMap`/`NaverMap` `onDayPlaceClick`, `02d202a`) | P0 |
| KO locale resolver | `CURRENT_IMPLEMENTATION` | `src/lib/place-display-name.ts` across Explore/Picks/My Trip/PlaceModal/`/place`; ingest-annotation display strip (data still to be corrected) | P0 |
| Today Trip weather | `PARTIAL` | honest KMA link chip only; no forecast source in repo | P3 |

## 24. Things easy to confuse

- "Zones" in the v1 scheduler are **distance rings**, not neighborhoods (#7).
- HC-2 exists as a code but **does nothing** (#5).
- `personalize` ≠ Intent Compiler (#1); Production AI is OFF.
- The 14 s/day generation delay was an affiliate placeholder-client timeout, not scheduler cost; scheduler compute is ~1–7 ms per Day.
- Sea markers are **data** (DB coordinates), not a rendering bug; correction is an Owner data action.
- The unplaced store (`koreamate_unplaced_v1`) is per-trip local storage, not the itinerary record.
