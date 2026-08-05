# TASK-GYEONGJU-WEB-RAW-COLLECTION-V3 완료보고서

**완료일**: 2026-08-05  
**기반 브랜치**: `data/gyeongju-web-collector-nav-fix-v1` HEAD `a448aa7`  
**작업 브랜치**: `data/gyeongju-web-raw-collection-v3`  
**결과**: **PASS** — 9/9 ASSERT 전원 통과

---

## 1. 검증 결과 (실행 전)

### 전제 조건 확인

| 항목 | 결과 |
|---|---|
| 기반 브랜치 HEAD `a448aa7` | ✅ 확인 |
| 수집기 v2.1.0 (B-MR1·B-MR2·B-NEM 해결) | ✅ 확인 |
| Dry-run 6종 content-type | ✅ 전원 정상 |
| Dry-run visitgyeongju 5 locale | ✅ 정상 |

### Preflight 발견 사항

**P1 — SEMANTIC_DL_FIELD 불일치 (경미한 결함)**

태스크 명세 Section 0: `<dt>` 의미 필드 추출 시 `SEMANTIC_DL_FIELD` 사용 요구.  
현재 `extract_name_from_detail()`: `DETAIL_ENTITY_HEADING` 반환 (method-selector 불일치: selector=`dt[skip_list]`인데 method=heading).

처리: Preflight 최소 수정 후 계속. `DETAIL_ENTITY_HEADING` → `SEMANTIC_DL_FIELD` 변경, docstring 갱신, v2.1.0 → v2.2.0.

**P2 — Heritage parent/child 필드 미존재 (경미한 결함)**

`collect_heritage()`가 페이지 메타데이터만 저장, `child_pages`·`related_attractions` 미추출.  
태스크는 "세계유산 parent/child audit" 요구.

처리: Preflight 최소 수정 — `extract_links()` 활용하여 `child_pages`(동일 도메인 mnu_uid 링크)와 `related_attractions`(area_uid + cmd=2 링크) 추출 추가.

**차단 블로커**: 없음. 두 결함 모두 태스크 자체 "경미한 결함 → 최소 수정 후 계속" 규칙 적용.

---

## 2. Preflight 수정 내용 (v2.2.0)

### P1 — SEMANTIC_DL_FIELD

**파일**: `scripts/gyeongju_culture_web_collect.py` (v2.1.0 → v2.2.0)

```python
# BEFORE (v2.1.0):
return {
    "name": name,
    "name_extract_method": "DETAIL_ENTITY_HEADING",
    ...
}

# AFTER (v2.2.0):
return {
    "name": name,
    "name_extract_method": "SEMANTIC_DL_FIELD",
    ...
}
```

근거: `<dt>` 태그는 정의 목록(definition list) 의미론적 요소이므로 heading element와 구분해야 함. visitgyeongju의 `<h2>/<h1>` 기반 추출은 계속 `CONTENT_HEADING`/`DETAIL_ENTITY_HEADING`을 유지.

### P2 — Heritage 링크 추출

```python
# collect_heritage() 에 추가:
child_pages = []
attraction_links = []
for href, text in extract_links(body):
    if "mnu_uid=" in href:
        # 알려진 heritage mnu_uid 또는 텍스트 있는 링크만 child로 수집
        child_pages.append({"mnu_uid": child_mnu, "link_text": text, "href": ...})
    if "area_uid=" in href and "cmd=2" in href:
        attraction_links.append({"area_uid": area_uid, "detail_url": ...})

rec["child_pages"] = child_pages
rec["related_attraction_count"] = len(attraction_links)
rec["related_attractions"] = attraction_links
```

---

## 3. 수집 실행 결과

### gyeongju.go.kr (6종)

| content-type | 수집 건수 | 주요 지표 |
|---|---|---|
| attractions | 159건 | 4개 권역 전수 / SEMANTIC_DL_FIELD 100% |
| monthly-recommendations | 유효 7건 / 거부 6건 | 5개 유효 월, NOT_MONTHLY_REC 6건 |
| courses | 5종 | 웨이포인트 29개 추출 |
| heritage | 5페이지 | 관련관광지 33건 링크 |
| cultural-guides | 17개소 | 동적 추출 17/17 |
| events | 10건 (7고유) | 2026-08~10, 장기행사 교차월 3건 |

**특이 사항**:
- 이달의추천여행지 2026-05 중복 3건 (mnu_uid 4185, 4172, 4367): 동일 월 다중 테마 페이지. 모두 유효한 월별 추천 데이터이므로 수집 보존, 정규화 단계에서 대표 레코드 결정.
- 신규 발견: mnu_uid=4306 (2026-06, 19장소) — 이전 회귀 테스트 대비 +1건 (6→7유효).
- 행사 con_uid=7746 (2026 한수원아트페스티벌, 2026-06-30~2026-10-18): 3개월 목록에 모두 노출. 교차월 중복 처리 규칙은 정규화 단계 결정.

### visitgyeongju.or.kr (2종 × 5언어)

| content-type | 수집 건수 | 언어 분류 |
|---|---|---|
| restaurants | 84건 | 420/420 VALID_TRANSLATED_DETAIL (100%) |
| souvenirs | 8건 | 40/40 VALID_TRANSLATED_DETAIL (100%) |

---

## 4. ASSERT 검증 결과

| # | ASSERT | 결과 |
|---|---|---|
| 1 | SEMANTIC_DL_FIELD 사용됨 (attractions) | ✅ PASS (159/159) |
| 2 | DETAIL_ENTITY_HEADING 잔류 0건 | ✅ PASS |
| 3 | 관광지 name_ko=None 0건 | ✅ PASS |
| 4 | mnu_uid=4085 거부 목록에 있음 | ✅ PASS |
| 5 | 거부 감사 6/6 NOT_MONTHLY_REC+month=None | ✅ PASS |
| 6 | 문화해설 17개소 | ✅ PASS |
| 7 | visitgyeongju 식당 84/84 수집 | ✅ PASS |
| 8 | visitgyeongju 기념품 8/8 수집 | ✅ PASS |
| 9 | visitgyeongju 엔티티명 VISIT_GYEONGJU 오추출 0 | ✅ PASS |

**전체**: 9/9 PASS ✅

---

## 5. 특이 사항 / 제한

| 항목 | 내용 |
|---|---|
| Heritage child_pages 총 645건 | 페이지 내 모든 mnu_uid 링크 포함 (내비게이션 포함). 정규화 단계에서 HERITAGE_PAGES mnu_uid 목록 기준 필터링 필요. |
| 필터 인벤토리 0건 | visitgyeongju 상세 페이지는 필터 태그 HTML 미노출. 기존 6그룹/59옵션 감사가 여전히 유효. |
| 이달의추천여행지 2026-05 중복 3건 | 사이트 구조상 동일 월 다중 페이지. 수집은 보존, 정규화 결정 보류. |
| HTTP 실패 URL 0건 | 전체 요청 성공 |

---

## 6. 산출물 (32개 신규 파일)

### Raw 수집 파일 (17개)

| 파일 | 내용 |
|---|---|
| `web-raw-v3/attractions/attractions-raw.jsonl` | 관광지 159건 |
| `web-raw-v3/attractions/attractions-snapshot-summary.json` | 수집 요약 |
| `web-raw-v3/monthly-recommendations/monthly-recommendations-raw.jsonl` | 유효 7건 |
| `web-raw-v3/monthly-recommendations/monthly-recommendations-rejected.jsonl` | 거부 6건 |
| `web-raw-v3/monthly-recommendations/monthly-recommendations-snapshot-summary.json` | 수집 요약 |
| `web-raw-v3/courses/courses-raw.jsonl` | 코스 5종 |
| `web-raw-v3/courses/courses-snapshot-summary.json` | 수집 요약 |
| `web-raw-v3/heritage/heritage-raw.jsonl` | 세계유산 5페이지 |
| `web-raw-v3/heritage/heritage-snapshot-summary.json` | 수집 요약 |
| `web-raw-v3/cultural-guides/cultural-guides-raw.jsonl` | 해설 17개소 |
| `web-raw-v3/cultural-guides/cultural-guides-snapshot-summary.json` | 수집 요약 |
| `web-raw-v3/events/events-raw.jsonl` | 행사 10건 |
| `web-raw-v3/events/events-snapshot-summary.json` | 수집 요약 |
| `web-raw-v3/restaurants/restaurants-raw.jsonl` | 식당 84건 × 5언어 |
| `web-raw-v3/restaurants/restaurants-snapshot-summary.json` | 수집 요약 |
| `web-raw-v3/souvenirs/souvenirs-raw.jsonl` | 기념품 8건 × 5언어 |
| `web-raw-v3/souvenirs/souvenirs-snapshot-summary.json` | 수집 요약 |

### 감사 파일 (15개)

| 파일 | 내용 |
|---|---|
| `audits/gyeongju-web-raw-v3-http-status-audit.json` | HTTP 상태 감사 |
| `audits/gyeongju-web-raw-v3-failed-urls.jsonl` | 실패 URL 0건 |
| `audits/gyeongju-web-raw-v3-attractions-audit.json` | 관광지 수집 감사 |
| `audits/gyeongju-web-raw-v3-monthly-rec-relation-audit.jsonl` | 추천여행지 장소 관계 |
| `audits/gyeongju-web-raw-v3-monthly-rec-rejection-audit.jsonl` | 거부 감사 |
| `audits/gyeongju-web-raw-v3-courses-relation-audit.jsonl` | 코스 관계 감사 |
| `audits/gyeongju-web-raw-v3-heritage-parent-child-audit.jsonl` | 세계유산 parent/child |
| `audits/gyeongju-web-raw-v3-cultural-guide-reconciliation.json` | 문화해설 조정 |
| `audits/gyeongju-web-raw-v3-events-audit.jsonl` | 행사 월별 감사 |
| `audits/gyeongju-web-raw-v3-visitgyeongju-id-reconciliation.json` | ID 조정 |
| `audits/gyeongju-web-raw-v3-visitgyeongju-name-audit.jsonl` | 엔티티명 감사 |
| `audits/gyeongju-web-raw-v3-visitgyeongju-multilingual-audit.jsonl` | 다국어 분류 감사 |
| `audits/gyeongju-web-raw-v3-filter-inventory.jsonl` | 필터 인벤토리 (0건) |
| `audits/gyeongju-web-raw-v3-filter-audit-comparison.json` | 필터 감사 비교 |
| `audits/gyeongju-web-raw-v3-summary.json` | 전체 수집 요약 |

### 기타 (1개)

| 파일 | 내용 |
|---|---|
| `data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json` | 97 → 129개 파일로 갱신 |

---

## 7. 스크립트 변경 (v2.1.0 → v2.2.0)

**파일**: `scripts/gyeongju_culture_web_collect.py`

| 변경 | 내용 |
|---|---|
| `extract_name_from_detail()` return | `DETAIL_ENTITY_HEADING` → `SEMANTIC_DL_FIELD` |
| Docstring | method 근거 설명 추가 |
| `collect_heritage()` | `child_pages` + `related_attractions` 필드 추가 |
| `VERSION` | `"2.1.0"` → `"2.2.0"` |

`scripts/visitgyeongju_collect.py`: 변경 없음 (v2.1.0 유지).

---

## 8. 미수정 확인

| 항목 | 결과 |
|---|---|
| 기존 canonical 831건 수정 | 미수정 ✅ |
| 기존 KTO 행사 24건 수정 | 미수정 ✅ |
| 웹 이미지 다운로드 | 없음 ✅ |
| DB/migration/배포 | 없음 ✅ |
| `src/`·`functions/`·`supabase/` 수정 | 없음 ✅ |
| 비밀값 출력/커밋 | 없음 ✅ |

---

## 9. 다음 단계

```
경주 웹 raw 수집 완료. 다음 단계:
  - 정규화: raw → canonical entity 변환
  - 이달의추천여행지 중복 월(2026-05 × 3) 대표 레코드 정책 결정
  - Heritage child_pages 필터링 (HERITAGE_PAGES mnu_uid 기준)
  - 행사 교차월 중복 처리 정책 결정
  - filter_inventory 확보 방법 검토 (목록 페이지 태그 추출 vs 기존 감사 유지)
```

작업을 완료했습니다
