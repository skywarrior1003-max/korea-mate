# TASK-GYEONGJU-REGIONAL-15-JA-ZH-HEXID-PROBE-V1 — Main Handoff

**Branch**: `data/gyeongju-regional-15-ja-zh-hexid-probe-v1`
**Base**: `data/gyeongju-regional-15-multilingual-closeout-v1` @ a7420ef
**Date**: 2026-09-12
**Verdict**: PASS

---

## Summary

This task exhaustively probed JA and ZH official native sources for all 15 Gyeongju regional course stops.

### Key Findings

1. **VisitGyeongju (VG) attraction hexID route**: VG has `/jp/` locale prefix working for cuisine (confirmed from prior food pipeline). **VG does NOT have attraction pages** — VG sitemap (500 URLs) contains 334 cuisine, 20 map, 0 attraction pages. VG is primarily a food/dining portal, not an attraction database. Attraction hexID pipeline is not applicable for these stops.

2. **KTO JpnService2 / ChsService2**: HTTP 403 (confirmed in prior session; no API key available this session).

3. **VisitKorea JA/ZH websites**: Both `japanese.visitkorea.or.kr` and `chinese.visitkorea.or.kr` return **ENGLISH content** for all Gyeongju attraction vcontsIds and cids tested. No native JA/ZH from VisitKorea for any of the 15 stops.

4. **Gyeongju National Museum official website** (`gyeongju.museum.go.kr/jpn/` and `/chn/`): **Native JA and ZH content confirmed** for GJ01-0009 (국립경주박물관).

5. **UNESCO World Heritage Centre** (`whc.unesco.org/ja/list/736/` and `/zh/list/736/`): **JA title + partial description** and **ZH complete description** for GJ01-0127 (석굴암) confirmed. UNESCO entry covers Seokguram Grotto and Bulguksa Temple jointly.

---

## JA Results (15 stops)

| stop_id | title_ko | ja_status | source |
|---------|----------|-----------|--------|
| GJ01-0001 | 경주 계림 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0009 | 국립경주박물관 | **OFFICIAL_NATIVE_COMPLETE** | gyeongju.museum.go.kr/jpn/ |
| GJ01-0014 | 대릉원 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0017 | 동궁과 월지 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0022 | 분황사 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0033 | 월정교 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0036 | 첨성대 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0042 | 황리단길 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0049 | 나정 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0054 | 삼릉 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0056 | 오릉 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0062 | 포석정 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0099 | 보문 물레방아 광장 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0127 | 석굴암 | **OFFICIAL_TITLE_ONLY** | whc.unesco.org/ja/list/736/ |
| KTO12-128634 | 경주 배동 삼릉 | SOURCE_LOCALE_NOT_AVAILABLE | — |

### GJ01-0009 JA Content
- **Title**: 国立慶州博物館
- **Description**: 新羅千年の首都「慶州」に位置する国立慶州博物館は、新羅の文化遺産が一同に集結した韓国を代表する博物館です。
- **Source**: http://gyeongju.museum.go.kr/jpn/ (official museum JA website)

### GJ01-0127 JA Content (OFFICIAL_TITLE_ONLY)
- **Title**: 石窟庵と仏国寺
- **Description snippet**: 吐含山の山上の石窟庵は、石窟の円形空間に阿弥陀如来坐像を主仏として配している。 (one sentence within Bulguksa description)
- **Source**: https://whc.unesco.org/ja/list/736/ (UNESCO WHC JA, attribution NFUAJ)
- **Note**: OFFICIAL_TITLE_ONLY — description primarily covers Bulguksa Temple, with one sentence specific to Seokguram.

---

## ZH Results (15 stops)

| stop_id | title_ko | zh_status | source |
|---------|----------|-----------|--------|
| GJ01-0001 | 경주 계림 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0009 | 국립경주박물관 | **OFFICIAL_NATIVE_COMPLETE** | gyeongju.museum.go.kr/chn/ |
| GJ01-0014 | 대릉원 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0017 | 동궁과 월지 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0022 | 분황사 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0033 | 월정교 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0036 | 첨성대 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0042 | 황리단길 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0049 | 나정 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0054 | 삼릉 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0056 | 오릉 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0062 | 포석정 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0099 | 보문 물레방아 광장 | SOURCE_LOCALE_NOT_AVAILABLE | — |
| GJ01-0127 | 석굴암 | **OFFICIAL_NATIVE_COMPLETE** | whc.unesco.org/zh/list/736/ |
| KTO12-128634 | 경주 배동 삼릉 | SOURCE_LOCALE_NOT_AVAILABLE | — |

### GJ01-0009 ZH Content
- **Title**: 国立庆州博物馆
- **Description**: 位于新罗千年首都庆州的国立庆州博物馆是可以纵观新罗文化遗产的韩国代表性博物馆。
- **Locale**: zh-CN (Simplified Chinese confirmed: 庆州, 博物馆)
- **Source**: http://gyeongju.museum.go.kr/chn/ (official museum ZH website)

### GJ01-0127 ZH Content
- **Title**: 石窟庵和佛国寺
- **Description**: 石窟庵建于公元8世纪，位于吐含山的斜坡上，石窟庵内有一尊纪念佛像，该佛像以普密斯帕莎穆德拉姿势面朝着大海。佛像周围有各种神仙、菩萨和信徒的雕像，这些雕像惟妙惟肖，工艺细腻，采用了深浅浮雕的方式，堪称远东地区佛教艺术杰作。佛国寺（建于公元774年）和石窟庵一起构成了一处具有重大意义的宗教建筑群。
- **Locale**: zh-CN (Simplified Chinese)
- **Source**: https://whc.unesco.org/zh/list/736/ (UNESCO WHC ZH)
- **Note**: Entry covers Seokguram + Bulguksa jointly. ZH description primarily describes Seokguram first.

---

## Route Discovery Summary

| Route | Status | Detail |
|-------|--------|--------|
| VG /jp/cuisine/view/{hexID} | EXISTS | JA cuisine works; confirmed from food pipeline |
| VG /jp/tour/{hexID} or attraction | NOT_EXIST | No attraction pages in VG sitemap; VG is food portal |
| Museum /jpn/ | WORKS | HTTP 200 native JA |
| Museum /chn/ | WORKS | HTTP 200 native ZH |
| UNESCO /ja/list/736/ | WORKS | HTTP 200 native JA (Seokguram-Bulguksa) |
| UNESCO /zh/list/736/ | WORKS | HTTP 200 native ZH (Seokguram-Bulguksa) |
| KTO JpnService2 | HTTP_403 | API blocked |
| KTO ChsService2 | HTTP_403 | API blocked |
| VisitKorea JA/ZH vcontsId | EN_FALLBACK | Returns English for Gyeongju stops |
| gyeongju.go.kr/japan | HTTP_500 | Server error |
| KCHA heritage.go.kr langCode=ja | NO_CONTENT | JS-rendered SPA, langCode param ignored |

---

## Source Breakdown

| Source Type | JA_confirmed | ZH_confirmed |
|-------------|-------------|-------------|
| VisitGyeongju (VG) | 0 | 0 |
| KTO official multilingual API | 0 (403) | 0 (403) |
| Operator/public official native (Museum) | 1 | 1 |
| UNESCO WHC | 1 (title_only) | 1 (complete) |
| **Total** | **1+1(title)** | **2** |

---

## Regression Checks

| Check | Count |
|-------|-------|
| KO_DATA_CHANGED | 0 |
| EN_DATA_CHANGED | 0 |
| IMAGE_DATA_CHANGED | 0 |
| COORD_DATA_CHANGED | 0 |
| IDENTITY_CHANGED | 0 |
| FOOD_105_CHANGED | 0 |
| DB_CHANGED | 0 |
| PRODUCTION_CHANGED | 0 |
| MASTER_CHANGED | 0 |

---

## Next Steps

- **GJ01-0009 JA/ZH**: Ready for main laptop intake from `gyeongju.museum.go.kr/jpn/` and `/chn/`
- **GJ01-0127 ZH**: Ready for main laptop intake from UNESCO ZH (Seokguram description)
- **GJ01-0127 JA**: OFFICIAL_TITLE_ONLY — UNESCO JA title available; full JA description for Seokguram alone not found
- **13 stops (JA) + 13 stops (ZH) = 26 slots**: SOURCE_LOCALE_NOT_AVAILABLE confirmed after exhaustive probe
- **JA/ZH TRUE_SOURCE_BLOCKER for 13 stops**: No official source exists. Not resolvable without: (a) KTO JA/ZH API access (currently 403), or (b) VG attraction hexID pipeline (VG has no attraction pages)
- **Next task**: FOUR-CITY-REGIONAL-FINAL-PACKAGE-AND-MAIN-HANDOFF

---

## Absolute Prohibitions (Remain in Effect)
- Production DB write 금지
- Main DB write 금지
- migration 금지
- master/main merge/push 금지
- AI 번역 금지
- Google Translate 금지
- `git add .` / `git add -A` 금지
- UI 코드 수정 금지
