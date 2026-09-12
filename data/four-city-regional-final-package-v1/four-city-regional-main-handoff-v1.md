# TASK-FOUR-CITY-REGIONAL-FINAL-PACKAGE-AND-MAIN-HANDOFF-V1

**Branch**: `data/four-city-regional-final-package-v1`
**Base**: `data/gyeongju-regional-15-ja-zh-hexid-probe-v1` @ 10dac24
**Date**: 2026-09-12
**Verdict**: PASS

---

## A. What to Import (DATA_INTAKE — 20 stops)

### Gyeongju (15 stops)
Import from `gyeongju-jeonju-regional-stops-final-closeout-v1` and `gyeongju-regional-15-ja-zh-hexid-probe-v1`:

| Field | Source | Notes |
|-------|--------|-------|
| desc_ko | gyeongju.go.kr (confirmed in canonical) | Supersedes TEMPORARY_SOURCE_FAILURE |
| image_url | gyeongju.go.kr official (HTTP_200) | Supersedes RUNTIME_ONLY_GAP |
| en_title | visitkorea / VG (14/15 confirmed) | GJ01-0099 remains SOURCE_NOT_AVAILABLE |
| ja_title/desc | gyeongju.museum.go.kr/jpn/ (GJ01-0009) | OFFICIAL_NATIVE_COMPLETE |
| ja_title | UNESCO list 736 (GJ01-0127) | OFFICIAL_TITLE_ONLY |
| zh_title/desc | gyeongju.museum.go.kr/chn/ (GJ01-0009) | OFFICIAL_NATIVE_COMPLETE |
| zh_title/desc | UNESCO list 736 zh (GJ01-0127) | OFFICIAL_NATIVE_COMPLETE |
| lat/lng | VWORLD_ROAD (all 15 confirmed) | Already in canonical |

### Jeonju — 4 image recovery stops
Import recovered official images from `jeonju-regional-4-image-closeout-v1.json`:

| canonical_id | name_ko | image_url | prev_status |
|-------------|---------|-----------|------------|
| OFF-16087 | 조경단 | https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/176345477549647.jpg | NO_IMAGE_FOUND |
| OFF-9772 | 덕진공원 | https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/177847702126840.jpg | NO_IMAGE_FOUND |
| OFF-9774 | 전주천 | https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/176344738297700.jpg | NO_IMAGE_FOUND |
| OFF-9780 | 전주한지박물관 | https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/173742841604995.jpg | NO_IMAGE_FOUND |

### 제주 — 만장굴
- KO description: ✓ (already present)
- Image: confirmed (CDN hotlink may require proxy in runtime)
- Multilingual: SOURCE_LOCALE_NOT_AVAILABLE for EN/JA/ZH (visitjeju.net has no data for this CID)

---

## B. What to Map (RUNTIME_MAPPING_REPAIR — 16 stops)

### Busan (13 stops)
JA/ZH data IS present from 6260000 AttractionService/FoodService. Runtime resolver not mapping course stop → multilingual record.

**Problem**: `regional_course_stop → canonical_id → multilingual` chain broken at resolver level.
**Fix**: Verify the service layer uses canonical_id to look up multilingual records for course stops.
**Affected locales**: JA + ZH for all 13 Busan service stops.

### Jeonju — 3 stops with RUNTIME_ONLY_GAP
- `OFF-16109` 전주한옥마을: ZH missing at runtime
- `OFF-16086` 청연루·남천교: JA+ZH missing at runtime
- `OFF-13964` 완산꽃동산: JA+ZH missing at runtime

---

## C. What Not to Change

- Existing canonical IDs (all 53 stops use existing IDs — 0 new canonical required)
- EN data for Busan/Jeju/Jeonju (already correct)
- KO data outside of Gyeongju intake scope
- City canonical data not in scope of this task

---

## D. Runtime Repair Details

The Busan course stops are the critical runtime repair case. The platform already has full EN/JA/ZH text for each canonical (from Busan6260000 service). The problem is that the regional course stop runtime resolver doesn't map correctly:

```
regional_course → stop_ref → canonical_id → [multilingual_lookup MISSING]
```

Expected: The platform resolves `canonical_id` from course stop, then queries multilingual table using that ID.

---

## E. Acceptance Criteria (after Main integration)

Regional course stops on each city page should show:
1. ✓ 장소명 (Korean name) — all 53 stops
2. ✓ 설명 (Korean description) — all 53 stops
3. ✓ 공식 이미지 (official image, not Unsplash/generic) — all 53 stops
4. ✓ 클릭/상세 연결 — all 53 stops
5. ✓ 좌표/NAV 가능 — all 53 stops
6. ✓ 선택 locale에서 사용 가능한 official text:
   - Busan: EN ✓ JA ✓ ZH ✓ (after resolver fix)
   - Gyeongju: EN 14/15 JA 2/15 ZH 2/15 (SOURCE_LOCALE_NOT_AVAILABLE for others = fallback policy)
   - Jeju: EN 8/9 JA 8/9 ZH 8/9 (만장굴=SNA → fallback)
   - Jeonju: EN 15/16 JA varies ZH varies (runtime fix for 3 stops)
7. ✓ 공식 locale 없으면 안전한 fallback 정책 적용 (KO 표시 또는 locale unavailable 표시)

---

## Course Universe Summary

| City | Courses | Service Occ | Context Occ | Unique Service Stops |
|------|---------|-------------|-------------|---------------------|
| Busan | 4 | 21 | 22 | 13 |
| Gyeongju | 4 | 24 | 7 | 15 |
| Jeju | 5 | 9 | 6 | 9 |
| Jeonju | 5 | 17 | 1 | 16 |
| **Total** | **18** | **71** | **36** | **53** |

Total stop occurrences: 107. Unique entities: ~88 (53 service + 35 context).

---

## Multilingual Scorecard

| Locale | Busan | Gyeongju | Jeju | Jeonju | Total |
|--------|-------|----------|------|--------|-------|
| EN | 13/13 | 14/15 | 8/9 | 15/16 | 50/53 |
| JA | 13/13 (runtime) | 2/15 | 8/9 | 12/16 | 34/53 |
| ZH | 13/13 (runtime) | 2/15 | 8/9 | 11/16 | 34/53 |

Notes:
- Busan JA/ZH=13 counts DATA_ALREADY_PRESENT (needs RUNTIME_MAPPING_REPAIR, not data intake)
- Gyeongju JA=2 includes 1 OFFICIAL_NATIVE_COMPLETE + 1 OFFICIAL_TITLE_ONLY
- SOURCE_LOCALE_NOT_AVAILABLE is not a required-data blocker

---

## Source Precedence Applied

1. **FINAL_TARGETED_CLOSEOUT** → gyeongju desc_ko confirmed (supersedes TEMPORARY_SOURCE_FAILURE)
2. **FINAL_TARGETED_CLOSEOUT** → jeonju image confirmed (supersedes NO_IMAGE_FOUND)
3. **MULTILINGUAL_SIDECAR** → GJ01-0009 JA/ZH, GJ01-0127 ZH from probe
4. **CONTENT_MEDIA_RECOVERY** → Busan/Jeju multilingual (DATA_ALREADY_PRESENT)

`NOT_IN_CURRENT_PATH != NOT_IN_PROJECT` — Gyeongju data was in canonical all along.

---

## Absolute Prohibitions (Remain in Effect)
- Production DB write 금지
- Main DB write 금지
- AI 번역 금지
- Google Translate 금지
- master/main merge/push 금지
- UI 코드 수정 금지
