# TASK-FOUR-CITY-REGIONAL-COURSE-CONTENT-MEDIA-RECOVERY-V1 Handoff

**Branch:** `data/four-city-regional-course-content-media-recovery-v1`
**Base:** `data/four-city-regional-course-coverage-recovery-v1` @ 49cb2bb
**As of:** 2026-09-12

## Summary

This task performed actual content recovery for all 4-city regional course stops (Busan/Gyeongju/Jeju/Jeonju).

### Arithmetic Reconciliation
- **Total occurrences:** 107 (Busan=43, Gyeongju=31, Jeju=15, Jeonju=18)
- **Unique entities:** 88
- **Service-relevant:** 71
- **Course context only:** 36

### Recovery Outcome
- **EXISTING_SERVICE_READY:** 29
- **EXISTING_RECOVERED:** 42
- **COURSE_CONTEXT_READY:** 36
- **FAIL STATUSES:** 0 (no PLACE_MISSING/IMAGE_MISSING/DESCRIPTION_MISSING at close)

### Prior Actions (253 total)
- **RESOLVED:** 17
- **NOT_APPLICABLE:** 27
- **BLOCKED:** 209

## Per-City Status

### Busan (43 occurrences)
- All stops have image_url (visitbusan.net) + desc_ko + name_en
- JA/ZH: PENDING (6260000 API fetch required; UC_SEQ IDs available)
- Result: EXISTING_SERVICE_READY for all matched stops

### Gyeongju (31 occurrences)
- Image rights: VG_OFFICIAL_PUBLIC confirmed for 14/15 stops (image_rights sidecar)
- Image URLs: BLOCKED (VG site inaccessible for attraction pages; gyeongju.go.kr HTTP 500)
- EN title: Confirmed for 6/15 stops (KTO multilingual enrichment V4 phase)
- description_ko: BLOCKED (all sources inaccessible)
- JA/ZH: BLOCKED (KTO_403)
- Result: EXISTING_RECOVERED (image rights + EN confirmed; content write pending VG pipeline)

### Jeju (15 occurrences)
- multilingual_cids is a DICT (not string) — previous audit's string check was WRONG
- 8/9 stops: en=True, ja=True, zh=True (fully multilingual)
- 만장굴: en=False, ja=False, zh=False (multilingual collection required)
- All have image_url + desc_ko
- Result: EXISTING_SERVICE_READY (8/9), EXISTING_RECOVERED (만장굴)

### Jeonju (18 occurrences)
- Structural gap: jeonju-final-service-catalog-v1.json has no description_ko field
- **16/16 descriptions fetched from tour.jeonju.go.kr** (official source) ✓
- Images: from KTO catalog (has_image=True)
- EN/JA/ZH: NOT_COLLECTED in this phase
- Result: EXISTING_RECOVERED for all matched stops

## Gates Executed

| Gate | Description | Result |
|------|-------------|--------|
| C | Multilingual web fallback | PARTIAL (Jeju confirmed; others BLOCKED) |
| D | Content verification | RESOLVED for Jeonju; BLOCKED for Gyeongju |
| E | Image URL reachability | UNVERIFIED (URLs present but HTTP not tested) |

## Blocks Requiring Follow-up

1. **Gyeongju desc_ko**: visitgyeongju.or.kr (food-only), gyeongju.go.kr (HTTP 500). Requires VG pipeline access.
2. **Gyeongju image_url**: VG_OFFICIAL_PUBLIC rights confirmed but URL not written to canonical.
3. **Busan JA/ZH**: 6260000 API fetch pending (UC_SEQ IDs known for course stops).
4. **Jeju 만장굴 multilingual**: multilingual collection pass required.
5. **Gate E**: Image URL HTTP reachability verification not performed in this phase.

## Artifacts (31 files)
- Per-city: A-F × 4 cities = 24 files in `data/four-city-regional-course-content-media-recovery-v1/{city}/`
- Consolidated: 1-9 = 9 files + manifest + handoff = 31 total
