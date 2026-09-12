# Gyeongju 15-Stop Multilingual Closeout — Handoff

**Task**: TASK-GYEONGJU-REGIONAL-15-MULTILINGUAL-CLOSEOUT-V1
**Branch**: `data/gyeongju-regional-15-multilingual-closeout-v1`
**Base**: `data/gyeongju-jeonju-regional-stops-final-closeout-v1` @ 1f727be
**Date**: 2026-09-12
**Verdict**: **PASS**

---

## Pass Criteria

| Criterion | Result |
|-----------|--------|
| All 15 stop status clear | ✓ YES |
| Max official native content collected | ✓ YES |
| Wrong-language text = 0 | ✓ YES |
| AI/Google Translation used | ✓ NONE |

---

## EN Coverage (14/15 ✓)

| Stop ID | Title (KO) | EN Title | Source | Desc Len |
|---------|------------|----------|--------|----------|
| GJ01-0001 | 계림 | Gyeongju Gyerim Forest | VK_EN vcontsId=92252 | 1669 |
| GJ01-0009 | 국립경주박물관 | Gyeongju National Museum | KTO cid=268141 | 393 |
| GJ01-0014 | 대릉원 | Cheonmachong Tomb (Daereungwon)* | KTO cid=264117 | 1211 |
| GJ01-0017 | 동궁과 월지 | Donggung Palace and Wolji Pond | KTO cid=264367 | 1774 |
| GJ01-0022 | 분황사 | Bunhwangsa Temple | KTO cid=1320354 | 579 |
| GJ01-0033 | 월정교 | Woljeonggyo Bridge | KTO cid=2669812 | 855 |
| GJ01-0036 | 첨성대 | Cheomseongdae Observatory | KTO cid=264256 | 878 |
| GJ01-0042 | 황리단길 | Gyeongju Hwangnidan Street | KTO cid=2992224 | 746 |
| GJ01-0049 | 나정 | Gyeongju Najeong Well | VK_EN vcontsId=92218 | 949 |
| GJ01-0054 | 삼릉 | Gyeongju Bae-dong Samneung Royal Tombs | VK_EN vcontsId=78399 | 1499 |
| GJ01-0056 | 오릉 | Gyeongju Five Royal Tombs | KTO cid=1696365 | 527 |
| GJ01-0062 | 포석정지 | Gyeongju Poseokjeong Pavilion Site | VK_EN vcontsId=111044 | 843 |
| GJ01-0099 | 보문 물레방아 광장 | — | SOURCE_NOT_AVAILABLE | — |
| GJ01-0127 | 석굴암 | Gyeongju Seokguram Grotto [UNESCO] | KTO cid=264260 | 407 |
| KTO12-128634 | 경주 배동 삼릉 | Gyeongju Bae-dong Samneung Royal Tombs | VK_EN vcontsId=78399 | 1499 |

*GJ01-0014 entity note: KTO registered as 천마총(대릉원); description primarily covers 대릉원 (Daereungwon Ancient Tombs complex). Accepted as valid official source.

### EN Sources Used
- **KTO EngService2 API** (9 stops): Official KTO multilingual API `apis.data.go.kr/B551011/EngService2/`
- **VisitKorea EN website** (5 stops): `english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=` and `rgnContentsView.do?vcontsId=`

### EN GJ01-0099 Note
보문 물레방아 광장 has no dedicated official English description. The Bomun Tourist Complex overall (KTO cid=264264) has EN but does not specifically describe the water mill feature. Korean desc_ko (83 chars, source=gyeongju.go.kr) is the only official description available.

---

## JA Coverage (0/15 — SOURCE_NOT_AVAILABLE)

**Blockers (exhausted):**
1. KTO JpnService2 API: HTTP 403 (both KOR_TOUR_API_KEY and TOUR_API_KEY)
2. VisitKorea Japanese (japanese.visitkorea.or.kr): English-language fallback only — confirmed JA? = False
3. VisitGyeongju JA (visitgyeongju.or.kr/ja/): 0 hexIDs in static HTML, JS-rendered listing, hexID pipeline not built for attractions
4. No other accessible official JA source found

**Resolution**: Build VG attraction hexID pipeline OR re-issue KTO JpnService2 API key

---

## ZH Coverage (0/15 — SOURCE_NOT_AVAILABLE)

**Blockers (exhausted):**
1. KTO ChsService2 API: HTTP 403 (both keys)
2. VisitKorea Chinese (chinese.visitkorea.or.kr): English-language fallback only
3. VisitGyeongju ZH (visitgyeongju.or.kr/zh-cn/): hexID pipeline not built for attractions
4. No other accessible official ZH source found

**Resolution**: Same as JA

---

## Regression Checks

| Check | Result |
|-------|--------|
| KO_DATA_CHANGED | **0** ✓ |
| IMAGE_DATA_CHANGED | **0** ✓ |
| COORD_DATA_CHANGED | **0** ✓ |
| IDENTITY_CHANGED | **0** ✓ |
| FOOD_105_CHANGED | **0** ✓ |
| AI_TRANSLATION_USED | **0** ✓ |
| WRONG_LANGUAGE_TEXT | **0** ✓ |

---

## API Discovery Notes

| Service | Status |
|---------|--------|
| KTO EngService2/detailCommon2 | **WORKS** (with contentId only — no defaultYN/overviewYN params) |
| KTO EngService2/searchKeyword2 | WORKS (area-level search; sigungu filter returns 0) |
| KTO JpnService2 | HTTP 403 |
| KTO ChsService2 | HTTP 403 |
| VisitKorea EN vcontsId | **WORKS** (rgnContentsView and contentsView) |
| VisitKorea JA vcontsId | English fallback only |
| VisitGyeongju sitemap | 0 tour hexIDs (cuisine=334, map=20, tema=61) |
| VG attraction pages | JS-rendered, hexIDs not available via static fetch |

---

## Artifacts

| ID | File | Rows | Description |
|----|------|------|-------------|
| A | gyeongju-15-en-multilingual-v1.jsonl | 15 | EN data |
| B | gyeongju-15-ja-multilingual-v1.jsonl | 15 | JA status |
| C | gyeongju-15-zh-multilingual-v1.jsonl | 15 | ZH status |
| D | gyeongju-15-source-audit-v1.jsonl | 15 | Source audit |
| E | gyeongju-15-multilingual-gap-v1.jsonl | 31 | Gaps/blockers |
| F | gyeongju-15-multilingual-coverage-v1.json | — | Coverage summary |
| G | gyeongju-15-multilingual-scorecard-v1.json | — | Scorecard |
| H | gyeongju-15-multilingual-manifest-v1.json | — | Manifest |
| I | gyeongju-15-multilingual-handoff-v1.md | — | This document |

---

## Absolute Prohibitions (Remain in Effect)
- Production DB write 금지
- Main DB write 금지
- migration 금지
- master/main merge/push 금지
- AI 번역 금지 ✓ COMPLIED
- Google Translate 금지 ✓ COMPLIED
- `git add .` / `git add -A` 금지
- UI 코드 수정 금지
