# VisitSeoul Inventory Collector — 설계 문서 v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| TASK | TASK-SEOUL-VISITSEOUL-INVENTORY-COLLECTOR-DRYRUN-V1 |
| 생성일 | 2026-08-10 |
| branch | data/seoul-collection-v1 |
| 스크립트 | `scripts/run-visitseoul-inventory-collector-v1.py` |
| 상태 | DRY-RUN VALIDATED |

---

## 1. 설계 원칙

### 1-A. API 특성 (실측 확인)

| 특성 | 확인값 |
|---|---|
| Base URL | `https://api-call.visitseoul.net/api/v1` |
| Auth | `VISITSEOUL-API-KEY` 헤더 (값 출력/로깅/저장 금지) |
| contents/list 응답 키 | `data` (array) — `contents` 아님 |
| contents/info 응답 키 | `data` (dict) — list와 달리 단일 dict |
| paging 키 | `paging.total_count`, `paging.page_no`, **`paging.page_size`** (num_of_rows 아님) |
| 좌표 위치 | `data.traffic.map_position_x/y` |
| 주소 위치 | `data.traffic.new_adres` / `data.traffic.adres` |
| 전체 카테고리 경로 | `data.cate_depth` (예: " 쇼핑 > 전문매장/상가") |
| 카테고리 코드 | `data.com_ctgry_sn` (예: "Cn0t1e0") |
| 빈 keyword 동작 | total_count=3765 + 전체 콘텐츠 반환 (full inventory 가능) |
| category_code API param | **사용 불가 / 무시됨** → LOCAL FILTER만 사용 |
| keyword API param 역할 | 빈 문자열 = 전체 inventory. keyword 검색은 primary discovery 금지. |
| 총 콘텐츠 | 3,765건 (ko, 2026-08-10 기준) |
| 총 페이지 | 76 pages (page_size=50) |

### 1-B. 수집 방법 (확정)

```
1. contents/list pagination (empty keyword)
   → 전체 CID inventory 수집
   → 이벤트 포함 전체 응답에서 LOCAL FILTER 적용

2. Local category routing (LOCAL FILTER)
   → com_ctgry_sn 코드 → 알려진 코드면 즉시 매핑
   → 미등록 코드 → cate_depth 텍스트 fallback 매핑
   → CATEGORY_CODE_MAP 지속 업데이트

3. Retained CIDs만 contents/info targeted detail
   → PLACE_CORE_CANDIDATE, PLACE_CONDITIONAL_REVIEW 우선
   → EVENT/RESTAURANT/ACCOMMODATION는 각 track으로 PRESERVE

4. Eligibility gate (별도 task, inventory 단계에서 미확정)

5. KTO cross-check (credential 확보 후 별도 task)
```

### 1-C. 안전 설계

| 원칙 | 구현 |
|---|---|
| 기본값 = dry-run | CLI 기본값, `--allow-full` 없으면 full 불가 |
| API key 노출 금지 | env에서만 읽음, print/log/commit/serialize 전부 차단 |
| Seoul BULK 금지 | `allow_full=True` 실행 시 즉시 sys.exit(1) |
| git add . 금지 | 스크립트 책임 없음, commit rule은 사용자가 enforce |
| SECRET_LEAK | 0 (description HTML secret pattern scan + redact) |

---

## 2. CLI 인터페이스

```bash
# 기본 dry-run (권장)
python scripts/run-visitseoul-inventory-collector-v1.py

# 명시적 dry-run + 옵션
python scripts/run-visitseoul-inventory-collector-v1.py \
  --dry-run \
  --page-limit 5 \
  --detail-limit 20 \
  --as-of 2026-08-10 \
  --output-dir data/seoul-source-audit

# 특정 페이지 샘플링
python scripts/run-visitseoul-inventory-collector-v1.py \
  --dry-run \
  --page-set 1,2,38,75,76

# Self-test (API 호출 없음)
python scripts/run-visitseoul-inventory-collector-v1.py --self-test

# Full bulk (미승인 — 이 TASK에서 금지)
# python scripts/run-visitseoul-inventory-collector-v1.py --allow-full
```

| Flag | 기본값 | 설명 |
|---|---|---|
| `--dry-run` | True (항상) | dry-run 모드 |
| `--allow-full` | False | **FORBIDDEN in dryrun task** — future MAIN approval 필요 |
| `--self-test` | False | local fixture 기반 self-test (API 호출 없음) |
| `--lang` | ko | 언어 코드 (RU/MS 이 TASK에서 금지) |
| `--page-size` | 50 | 페이지당 레코드 수 |
| `--page-limit` | 5 | dry-run 최대 샘플 페이지 수 |
| `--page-set` | None | 쉼표 구분 페이지 번호 직접 지정 |
| `--max-records` | 250 | dry-run 최대 레코드 수 |
| `--detail-limit` | 20 | 최대 targeted detail 호출 수 |
| `--as-of` | today UTC | 출처 레이블 날짜 (API 결과를 필터링하지 않음) |
| `--output-dir` | `data/seoul-source-audit` | 출력 디렉토리 |

---

## 3. Local Category Filter

### Category Code Map (확인된 코드)

| Code | 카테고리 경로 | Track |
|---|---|---|
| `Ch5t7s7` | 역사관광 > 역사유적지 > 고궁 | PLACE_CORE_CANDIDATE |
| `Co2n1h7` | 역사관광 > 역사유적지 > 성/문 | PLACE_CORE_CANDIDATE |
| `Ci7i9i6` | 역사관광 > 역사유적지 > 근대건축물 | PLACE_CORE_CANDIDATE |
| `Cr0q2v2` | 문화관광 > 전시시설 > 박물관 | PLACE_CORE_CANDIDATE |
| `Ce9z7g9` | 문화관광 > 도시공원 | PLACE_CORE_CANDIDATE |
| `Cu5u8d4` | 자연관광 > 자연경관(산) | PLACE_CORE_CANDIDATE |
| `Cn7z1h7` | 쇼핑 > 시장 | PLACE_CORE_CANDIDATE |
| `Ct9t6m8` | 문화관광 > 전시시설 > 미술관/화랑 | PLACE_CONDITIONAL_REVIEW |
| `Cg1x6l1` | 문화관광 > 전시시설 | PLACE_CONDITIONAL_REVIEW |
| `Cw1i3e4` | 역사관광 > 종교성지 | PLACE_CONDITIONAL_REVIEW |
| `Ca0o2d4` | 문화관광 | PLACE_CONDITIONAL_REVIEW |
| `Ct4h4b7` | 문화관광 > 기타문화관광지 | PLACE_CONDITIONAL_REVIEW |
| `Cq9d5v0` | 체험관광 > 산사체험 | TEMPLE_STAY_CANDIDATE |
| `Cl8f8q1` | 체험관광 > 기타체험 | EXPERIENCE_CANDIDATE |
| `Cn0t1e0` | 쇼핑 > 전문매장/상가 | SHOPPING_REVIEW |
| `Cx0t8m5` | 음식 > 카페/찻집 | RESTAURANT_TRACK |
| `Cz9d1h6` | 음식 > 한식 | RESTAURANT_TRACK |
| `Ck6n0w6` | 음식 > 주점 | RESTAURANT_TRACK |
| `Cd4y5u1` | 축제/공연/행사 > 축제 | EVENT_TRACK |
| `Cu9u5z7` | 축제/공연/행사 > 행사 > 전시회 | EVENT_TRACK |
| `Cv7s8m5` | 축제/공연/행사 | EVENT_TRACK |

> **CATEGORY_CODE_MAP 업데이트 정책**: dry-run에서 UNRESOLVED로 나온 코드를 조사하여 다음 실행 전 추가.

### Track 정의

| Track | 의미 | 다음 단계 |
|---|---|---|
| PLACE_CORE_CANDIDATE | 고품질 관광 장소 (고궁·박물관·시장·공원·랜드마크) | targeted detail → eligibility gate |
| PLACE_CONDITIONAL_REVIEW | 미술관·종교지·기타문화관광지 — 검토 후 판단 | targeted detail → USER_REVIEW |
| SHOPPING_REVIEW | 쇼핑 전문매장/상가 — flagship 여부 검토 필수 | targeted detail → USER_REVIEW |
| RESTAURANT_TRACK | 음식/카페 — **PRESERVED**, 별도 후속 track | 별도 restaurant collector |
| EVENT_TRACK | 축제/공연/행사 — **PRESERVED**, 별도 event track | 별도 event collector |
| GENERAL_ACCOMMODATION_EXCLUDE | 일반 숙박 — curated place에서 제외 | DROP (place collection에서) |
| EXPERIENCE_CANDIDATE | 체험관광 — 전통체험/기타체험 | targeted detail → USER_REVIEW |
| TEMPLE_STAY_CANDIDATE | 산사체험 — AI=CONDITIONAL | targeted detail → CONDITIONAL eligibility |
| UNRESOLVED_CATEGORY | 알 수 없는 카테고리 코드 | 코드 조사 후 CATEGORY_CODE_MAP 추가 |

### Temple Stay 예외 규칙

```
Temple Stay(Cq9d5v0 또는 텍스트 매칭) → TEMPLE_STAY_CANDIDATE
  ≠ GENERAL_ACCOMMODATION_EXCLUDE

확인: self-test "temple_stay_text→TEMPLE_STAY (not ACCOMMODATION)" PASS
```

---

## 4. Inventory 레코드 스키마 (list 단계)

```json
{
  "cid": "KOP000072",
  "lang_code_id": "ko",
  "post_sj": "경복궁",
  "sumry": "...",
  "com_ctgry_sn": "Ch5t7s7",
  "cate_depth": "역사관광 > 역사유적지 > 고궁",
  "multi_lang_list": "ko:KOP000072,en:ENP000072,...",
  "main_img": "https://...",
  "creat_dt_text": "2015.12.29",
  "updt_dt_text": "2026.07.30",
  "routing_track": "PLACE_CORE_CANDIDATE",
  "eligibility_stage": "INVENTORY_PRELIMINARY",
  "routing_reason": "code_match:Ch5t7s7:역사관광 > 역사유적지 > 고궁",
  "review_required": false,
  "kto_crosscheck_required": true,
  "kto_candidate_id": null,
  "kto_candidate_status": "NOT_CHECKED",
  "provenance": {
    "source": "visitseoul",
    "endpoint": "contents/list",
    "page_no": 1,
    "page_size": 50,
    "fetched_at": "2026-08-10T...",
    "as_of": "2026-08-10",
    "collector_version": "v1.0.0"
  }
}
```

## 5. Detail 레코드 스키마 (contents/info 단계)

```json
{
  "cid": "KOP000072",
  "title": "경복궁",
  "category_code": "Ch5t7s7",
  "cate_depth": "역사관광 > 역사유적지 > 고궁",
  "addr": "서울 종로구 사직로 161",
  "coords": {"lat": "37.579617", "lng": "126.977041"},
  "has_coords": true,
  "has_image": true,
  "has_description": true,
  "description_note": "HTML_CONTENT — sanitize before render",
  "multi_lang_list": "ko:KOP000072,en:ENP000072,...",
  "multi_lang_available": true,
  "homepage": "https://royal.khs.go.kr/...",
  "phone": "02-3700-3900",
  "opening_hours": "...",
  "subway_access": "지하철 5호선 광화문역 2번 출구...",
  "detail_verified": true,
  "provenance": {...}
}
```

---

## 6. Snapshot / Mutation Guard

| 조건 | 처리 |
|---|---|
| 수집 중 total_count 변화 | `SOURCE_MUTATED_DURING_RUN=YES` manifest 기록, silent success 금지 |
| 빈 페이지 (total_count>0) | `EMPTY_PAGE` 경고 출력 |
| records > page_size | `PAGE_OVERFLOW` 경고 출력 |
| 같은 CID 중복 출현 | `DUPLICATE_CID` 기록 + duplicate_records 목록 |
| HTTP error | attempt status=FAILED, failed_pages 기록 |

---

## 7. KTO 연결 설계 포인트

inventory 레코드에 다음 필드 포함:

- `kto_crosscheck_required` (boolean)
- `kto_candidate_id` (null until resolved)
- `kto_candidate_status` ("NOT_CHECKED" → 향후 VERIFIED/COLLISION/WRONG_ENTITY)

**KTO_TARGETED_DETAIL = DEFERRED** (credential 없음)

**COLLISION 자동 assign 금지:**
- 264337: 창덕궁(no.2) AND N서울타워(no.16)
- 264491: 인사동(no.27) AND 홍대(no.30)

---

## 8. Multi-lang 설계

- `multi_lang_list` = multilingual linkage SSOT
- CID suffix 자동 생성 금지
- Dry-run 확인: **100% 레코드에 multi_lang_list 존재** (215/215)
- 다국어 detail bulk는 이 TASK에서 금지. 통계만 산출.
- ZH_VARIANT_DECISION = PENDING (zh-CN vs zh-TW 선택 미결)

---

## 9. 산출물

| 파일 | 위치 | 설명 |
|---|---|---|
| `seoul-visitseoul-inventory-dryrun-v1.jsonl` | `data/seoul-source-audit/` | dry-run 수집 레코드 (215건) |
| `seoul-visitseoul-inventory-attempts-v1.jsonl` | `data/seoul-source-audit/` | API 호출 시도 기록 |
| `seoul-visitseoul-detail-dryrun-v1.jsonl` | `data/seoul-source-audit/` | targeted detail 샘플 (16건) |
| `seoul-visitseoul-inventory-manifest-v1.json` | `data/seoul-source-audit/` | run manifest + QA flags |
| 이 문서 | `docs/data-collection/seoul/` | 설계 문서 |
| `seoul-visitseoul-inventory-dryrun-summary-v1.md` | `docs/data-collection/seoul/` | 실행 결과 요약 |

---

## 10. 향후 Full-run 승인 체크리스트

Full bulk 실행 전 MAIN 결정 필요:

- [ ] `--allow-full` 명시적 flag 사용 (기본값 dry-run으로는 불가)
- [ ] CATEGORY_CODE_MAP 추가 코드 확인 완료 (UNRESOLVED 0건 목표)
- [ ] Restaurant/Event track 후속 collector 설계 완료
- [ ] Eligibility gate 구현 완료
- [ ] KTO credential 확보 (collision 해소 포함)
- [ ] Full-run API calls estimate: ~76 list + ~700~1700 detail = ~800~1800 calls (ESTIMATE_ONLY)
- [ ] MAIN 결정: SEOUL_BULK_COLLECTION 승인
