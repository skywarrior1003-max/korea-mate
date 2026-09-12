# Four-City Data Completion Gates — Lessons from Seoul Core Recovery
_Derived from TASK-SEOUL-CORE-ATTRACTION-CANONICAL-MERGE-V1 (commit 1b91333)_
_As of: 2026-09-12_

## Purpose

This document codifies the data completion gates discovered during the Seoul Core Recovery
pipeline. Each gate is a named failure mode: a condition that appeared "done" but was actually
incomplete at a different layer. These gates now serve as mandatory pre-flight checks for all
regional content pipelines across the four-city system.

---

## Gate A — SOURCE_EXISTS ≠ CANONICAL_EXISTS

**Failure pattern**: A place appears in a source data collection (e.g., TourAPI, visitseoul.net)
but was never written to the canonical. The source is "there" but the canonical is silent.

**Seoul instance**: 286 places confirmed in core-experience audit existed in source data but had
zero representation in the 1,838-row canonical. The pipeline treated "collected" as "canonicalized."

**Check**: `len(source_universe) == len(canonical_entries)` — if source > canonical, you have dropout.

**Gate action**: After any source collection phase, run a CID cross-reference between source CIDs
and canonical CIDs. Any source CID not in canonical is a CANONICALIZATION_DROPOUT.

---

## Gate B — IMAGE_COVERAGE ≠ UNIVERSE_COMPLETE

**Failure pattern**: Image coverage is measured against "currently known" canonical rows, not
against the full source universe. Rows outside the canonical are never checked for image presence.

**Seoul instance**: The 286 dropout places all had images in the source (`has_main_img=True`), but
because they weren't in the canonical, they were invisible to image coverage reports.

**Check**: Run image coverage against the full source universe, not the canonical subset.

**Gate action**: Image QA must join on source universe, not canonical. Any place in source without
a resolved image is an IMAGE_COVERAGE_GAP, even if it lacks a canonical entry.

---

## Gate C — API_EMPTY ≠ OFFICIAL_LOCALE_NOT_AVAILABLE

**Failure pattern**: A multilingual API call returns empty/null and the system records
`locale_status=MISSING`. But the empty result may mean "API has no data" not "no official locale exists."
Official pages (e.g., visitseoul.net/place/{id}/en) may have content the API doesn't expose.

**Seoul instance**: Several places had en/ja/zh content on the official web page but the
TourAPI multilingual endpoint returned empty. A FETCH_STATUS=API_EMPTY was conflated with
OFFICIAL_LOCALE_NOT_AVAILABLE.

**Check**: For any `FETCH_STATUS=API_EMPTY`, check if the official detail page has locale tabs.

**Gate action**: API_EMPTY → trigger web-locale fallback before marking as OFFICIAL_NOT_AVAILABLE.

---

## Gate D — FETCH_STATUS ≠ MULTILINGUAL_COMPLETE

**Failure pattern**: FETCH_STATUS=HTTP_200 does not mean the fetched content is multilingual-complete.
A 200 response may return the Korean content with locale-switching failing silently.

**Seoul instance**: Some locale fetches returned HTTP 200 with Korean content (not the requested
locale). These were counted as "multilingual present" when they were actually Korean-only fallbacks.

**Check**: After locale fetch, validate that fetched content differs from the KO baseline.
If `fetched_locale_content ≈ ko_content`, treat as FETCH_FAIL not FETCH_OK.

**Gate action**: Post-fetch language detection step. Flag any locale fetch where content similarity
to KO exceeds 80% as LOCALE_FALLBACK_SUSPECTED.

---

## Gate E — HAS_IMAGE ≠ IMAGE_CONFIRMED

**Failure pattern**: A canonical record has `image_url` set, but the URL may be broken, expired,
or pointing to a placeholder/thumbnail. `has_image=True` does not mean `image_display_ready=True`.

**Seoul instance**: Some image URLs from older TourAPI calls were CDN paths that had rotated.
The canonical showed `has_image=True` but runtime image display failed.

**Check**: `image_url` present → HTTP HEAD check for 200/CDN reachable.
Separate `image_url` from `image_display_ready`.

**Gate action**: Image confirmation pipeline: status=`IMAGE_RESOLVED` (URL present + accessible)
vs `IMAGE_URL_PRESENT` (URL present, not verified) vs `IMAGE_MISSING`.

---

## Gate F — COURSE_STOP ≠ STANDALONE_PLACE

**Failure pattern**: A place appears only as a course stop (no standalone canonical entry).
Course-level data (name, image, description) is not propagated back to the canonical.
Result: the stop exists in course data but is invisible in the place discovery flow.

**Seoul instance**: Some course stops in regional recommendations had no corresponding canonical
entry. Runtime course display worked (stop name shown), but standalone place lookup failed.

**Check**: For every course stop with a `canonical_id`, verify the canonical exists and is ACTIVE.
For stops without `canonical_id`, assess if a canonical entry is needed.

**Gate action**: Course stop canonical audit → classify each stop as MATCH_EXISTING,
NEW_PLACE_CANDIDATE, COURSE_CONTEXT_ONLY, or CANONICALIZATION_DROPOUT.

---

## Application to Four-City Regional Pipelines

These gates apply directly to the Busan/Gyeongju/Jeju/Jeonju regional course audit:

| Gate | Four-City Check |
|------|----------------|
| A    | Does every course stop `canonical_id` exist in city canonical? (dropout detection) |
| B    | Do all matched canonical entries have `image_url` confirmed? |
| C    | Where API returned no EN/JA/ZH, is official locale page checked? |
| D    | Where multilingual CIDs exist, is content confirmed non-KO? |
| E    | Are image URLs in canonicals verified accessible? |
| F    | Stops without canonical_id — do they need NEW_PLACE_CANDIDATE escalation? |

_Document generated by TASK-FOUR-CITY-REGIONAL-COURSE-COVERAGE-AND-RECOVERY-V1_
