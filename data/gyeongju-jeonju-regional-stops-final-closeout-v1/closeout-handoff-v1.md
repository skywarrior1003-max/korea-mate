# Gyeongju–Jeonju Regional Stops Final Data Closeout — Handoff

**Task**: TASK-GYEONGJU-JEONJU-REGIONAL-RECOMMENDED-STOPS-FINAL-DATA-CLOSEOUT-V1
**Branch**: `data/gyeongju-jeonju-regional-stops-final-closeout-v1`
**Base**: `data/four-city-regional-course-remaining-data-closeout-v1` @ 8da597c
**Date**: 2026-09-12
**Status**: COMPLETE ✓

---

## Pass Condition

| Criterion | Result |
|-----------|--------|
| REGIONAL_RECOMMENDED_STANDALONE_PLACE_WITHOUT_REQUIRED_DATA_COUNT | **0** ✓ |
| Gyeongju 15/15 required data complete | **YES** ✓ |
| Jeonju 4/4 image found (standalone confirmed) | **YES** ✓ |
| All image URLs HTTP 200 verified | **YES** ✓ |
| AI translation used | NO ✓ |
| Unofficial content used | NO ✓ |

---

## Gyeongju (15 course stops)

### Key Discovery
The previous task (8da597c) classified Gyeongju stops as:
- desc_ko: TEMPORARY_SOURCE_FAILURE (gyeongju.go.kr sub-pages HTTP 500)
- image_url: RUNTIME_ONLY_GAP (VG rights confirmed but URL not collected)
- coords: TRUE_SOURCE_BLOCKER for 12/15 stops

**Root cause of mis-classification**: The canonical places file
`origin/data/gyeongju-targeted-completion-v1:data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl`
already contains ALL required data for 14/15 stops from a prior collection phase.

### Data Status After Closeout

| Dimension | Before (8da597c) | After (this task) |
|-----------|---------|------|
| desc_ko | TEMPORARY_SOURCE_FAILURE (15) | DATA_ALREADY_IN_CANONICAL_BRANCH (14) + DATA_OBTAINED_KTO_API (1) |
| image_url | RUNTIME_ONLY_GAP (14) + PRESENT (1) | ALL 15 HTTP 200 verified |
| coords | PRESENT (3) + TRUE_SOURCE_BLOCKER (12) | ALL 15 PRESENT in canonical branch |
| EN multilingual | DATA_ALREADY_PRESENT (6) | UNCHANGED (6/15 in gyeongju-multilingual-v1) |
| JA multilingual | TRUE_SOURCE_BLOCKER (15) | UNCHANGED |
| ZH multilingual | TRUE_SOURCE_BLOCKER (15) | UNCHANGED |

### Per-Stop Image URLs (all HTTP 200)

| ID | Name | Image URL |
|----|------|-----------|
| GJ01-0001 | 경주 계림 | https://www.gyeongju.go.kr/upload/content/thumb/20230714/44B01D320402476A94055E7C1B0B0C59.jpg |
| GJ01-0009 | 국립경주박물관 | https://www.gyeongju.go.kr/upload/content/thumb/20200629/993320EACA134DC08E92F1334742ABF9.jpg |
| GJ01-0014 | 대릉원 | https://www.gyeongju.go.kr/upload/content/thumb/20200317/8895315709E349B58265C80B06CC42E8.jpg |
| GJ01-0017 | 동궁과 월지 | https://www.gyeongju.go.kr/upload/content/thumb/20200629/9370955557CC4DA48BAA73BD4F75526A.jpg |
| GJ01-0022 | 분황사 | https://www.gyeongju.go.kr/upload/content/thumb/20200629/158557B5A66444E5AC70D98EB306223C.jpg |
| GJ01-0033 | 월정교 | https://www.gyeongju.go.kr/upload/content/thumb/20200629/7B2082F410284F07B0982F143557FEFD.jpg |
| GJ01-0036 | 첨성대 | https://www.gyeongju.go.kr/upload/content/thumb/20200629/6C6D79E125724E088BD9985A8663CBF9.jpg |
| GJ01-0042 | 황리단길 | https://www.gyeongju.go.kr/upload/content/thumb/20200629/F5DADBA4F4374AA8A21778E70B8CF116.jpg |
| GJ01-0049 | 나정 | https://www.gyeongju.go.kr/upload/content/thumb/20200630/75C82E3B6F674B8CBE83EC792F2EC028.jpg |
| GJ01-0054 | 삼릉 | https://www.gyeongju.go.kr/upload/content/thumb/20200630/975B7B0592D040A4B9E1B5467BEC6BB2.jpg |
| GJ01-0056 | 오릉 | https://www.gyeongju.go.kr/upload/content/thumb/20200630/15B10BA4F78B424582CD599D800F9CDF.jpg |
| GJ01-0062 | 포석정 | https://www.gyeongju.go.kr/upload/content/thumb/20200630/B154A8B8B6264B52B7B0E048FBA69B1D.jpg |
| GJ01-0099 | 보문 물레방아 광장 | https://www.gyeongju.go.kr/upload/content/thumb/20200116/FB2B5F1067CD49159D3E142C812AE4AD.jpg |
| GJ01-0127 | 석굴암 | https://www.gyeongju.go.kr/upload/content/thumb/20200626/118F9E4548034621938977744E7FBDE3.jpg |
| KTO12-128634 | 경주 배동 삼릉 | http://tong.visitkorea.or.kr/cms/resource/96/3575896_image2_1.jpg |

### KTO12-128634 Description (obtained this session)

**Source**: KTO KorService2 API (`detailCommon2`, contentId=128634)
**Provider**: 국가유산청 (Cultural Heritage Administration)
**Length**: 554 chars

```
경주 배동 삼릉은 경주 남산의 서쪽 기슭에 동서로 3개의 왕릉이 나란히 있어 붙여졌다. 밑으로부터 신라 8대 아달라왕, 53대 신덕왕, 54대 경명왕 등 박씨 3왕의 무덤이라 전하고 있다. 무덤은 모두 원형으로 흙을 쌓아 올린 형태를 하고 있다.
신덕왕릉이라 전해오는 가운데의 무덤은 1953년과 1963년에 도굴당하여... (출처 : 국가유산청)
```

---

## Jeonju (4 image-gap stops)

### Standalone vs Context Classification

All 4 stops are **STANDALONE** (stop_class=MATCH_EXISTING in course audit).
- OFF-9774 (전주천): classified AREA_CONTEXT in multilingual gaps file — this applies to **multilingual eligibility only**, not to standalone course stop status.

### Images Found

Source: `origin/data/jeonju-final-closeout-prep-v2:data/main-intake/five-city-reflection-recovery-v1/jeonju-images-master-v2.jsonl`
Match method: `page_url dataSid` lookup
Rights: `VISITJEONJU_OFFICIAL` (tour.jeonju.go.kr)

| ID | Name | Image URL | HTTP |
|----|------|-----------|------|
| OFF-16087 | 조경단 | https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/176345477549647.jpg | 200 |
| OFF-9772 | 덕진공원 | https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/177847702126840.jpg | 200 |
| OFF-9774 | 전주천 | https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/176344738297700.jpg | 200 |
| OFF-9780 | 전주한지박물관 | https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/173742841604995.jpg | 200 |

---

## Next Actions for Main Laptop Intake

### Gyeongju

1. **Update canonical places** (`gyeongju-canonical-places-v1.jsonl`) for KTO12-128634:
   - Add `description_ko` from KTO KorService2 (content in this handoff)
   - Add `description_source = "KTO_KorService2"`
   - Source branch already has 14/15 stops with desc_ko; KTO12-128634 is the only gap

2. **Image URL intake**: All 14 gyeongju.go.kr image URLs are already in canonical branch. KTO CDN URL also present. No new URLs needed.

3. **Coord intake**: All 15 coords already in canonical branch. No supplement needed.

4. **JA/ZH multilingual**: hexID pipeline required for GJ01-series (TRUE_SOURCE_BLOCKER, unchanged).

### Jeonju

1. **Update canonical records** for 4 stops with image_url from jeonju-images-master-v2:
   - OFF-16087: https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/176345477549647.jpg
   - OFF-9772: https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/177847702126840.jpg
   - OFF-9774: https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/176344738297700.jpg
   - OFF-9780: https://tour.jeonju.go.kr/upload_data/board_data/BBS_0000003/173742841604995.jpg

2. **Image rights**: VISITJEONJU_OFFICIAL (same policy as other Jeonju images in master).

---

## Absolute Prohibitions (Remain in Effect)

- Production DB write 금지
- Main DB write 금지
- migration 금지
- master/main merge/push 금지
- AI 번역 금지
- Google Translate 금지
- unofficial blog/reviewer content 금지
- `git add .` / `git add -A` 금지
- UI 코드 수정 금지
