# TASK-FOUR-CITY-REGIONAL-COURSE-COVERAGE-AND-RECOVERY-V1
## Main Intake Handoff Document

**Date**: 2026-09-12  
**Branch**: data/four-city-regional-course-coverage-recovery-v1  
**Schema**: four-city-regional-course-coverage-v1  

---

## Task Summary

Audited Regional recommended course surfaces for Busan, Gyeongju, Jeju, Jeonju.
Cross-referenced all course stops against city canonical data.
Identified content gaps, structural gaps, and canonicalization dropout.

## Grand Totals

| Metric | Value |
|--------|-------|
| Total stop occurrences (all cities) | 107 |
| Stops matched to canonical | 71 |
| Runtime OK (all content present) | 0 (0.0%) |
| Stops with content gaps | 71 |
| Canonicalization dropout | 0 |
| Total recovery actions queued | 253 |

## Per-City Results

### BUSAN
- Courses: 4 | Stops: 43
- Matched: 21 | Runtime OK: 0 (0.0%)
- Gap stops: 21 | Dropout: 0
- Actions queued: 42

### GYEONGJU
- Courses: 4 | Stops: 31
- Matched: 24 | Runtime OK: 0 (0.0%)
- Gap stops: 24 | Dropout: 0
- Actions queued: 116

### JEJU
- Courses: 5 | Stops: 15
- Matched: 9 | Runtime OK: 0 (0.0%)
- Gap stops: 9 | Dropout: 0
- Actions queued: 27

### JEONJU
- Courses: 5 | Stops: 18
- Matched: 17 | Runtime OK: 0 (0.0%)
- Gap stops: 17 | Dropout: 0
- Actions queued: 68

## Structural Gaps (cross-city)

These are schema-level gaps, not individual place dropout:

- **JEONJU**: canonical has no `description_ko` field — all 14 matched stops show DESCRIPTION_MISSING
- **JEONJU/BUSAN/GYEONGJU**: JA/ZH multilingual not in canonical files (structural gap)
- **BUSAN**: only EN multilingual from 6260000 API; JA/ZH not collected
- **GYEONGJU**: limited EN; JA/ZH multilingual collection outstanding

## Seoul Lessons Applied

Gates A–F from `docs/data-collection/four-city-data-completion-gates-from-seoul-v1.md` were applied.

| Gate | Applied | Findings |
|------|---------|----------|
| A (SOURCE→CANONICAL dropout) | ✓ | dropout=0 across all cities |
| B (Image coverage) | ✓ | per-city image gap counts documented |
| C (API_EMPTY→web fallback) | PENDING | multilingual web fallback not yet executed |
| D (FETCH_STATUS→content verify) | PENDING | requires active fetch cycle |
| E (HAS_IMAGE→IMAGE_CONFIRMED) | PENDING | image URL reachability not checked |
| F (COURSE_STOP→canonical) | ✓ | all stops classified; dropout identified |

## Artifacts

Per-city (A–F × 4 cities = 24 files):
- A: `{city}-regional-course-stop-audit-v1.jsonl`
- B: `{city}-regional-course-gap-summary-v1.json`
- C: `{city}-regional-course-stop-content-gaps-v1.jsonl`
- D: `{city}-regional-course-canonical-xref-v1.jsonl`
- E: `{city}-regional-course-recovery-actions-v1.jsonl`
- F: `{city}-regional-course-audit-summary-v1.md`

Consolidated:
1. `four-city-regional-course-coverage-matrix-v1.jsonl`
2. `four-city-regional-course-recovery-actions-v1.jsonl`
3. `four-city-regional-course-gap-consolidated-v1.json`
4. `four-city-regional-course-audit-manifest-v1.json`
5. `four-city-regional-course-main-handoff-v1.md` (this file)

Docs:
- `docs/data-collection/four-city-data-completion-gates-from-seoul-v1.md`

---
_TASK-FOUR-CITY-REGIONAL-COURSE-COVERAGE-AND-RECOVERY-V1 complete — 2026-09-12_