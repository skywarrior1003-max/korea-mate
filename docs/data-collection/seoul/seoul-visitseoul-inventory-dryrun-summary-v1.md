# VisitSeoul Inventory Dry-Run 실행 결과 요약 v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-VISITSEOUL-INVENTORY-COLLECTOR-DRYRUN-V1 |
| 실행일 | 2026-08-10 |
| branch | data/seoul-collection-v1 |
| HEAD 시작 | bc40972 |
| as_of | 2026-08-10 |
| 실행 모드 | DRY-RUN (--allow-full 미사용) |

---

## A. API 발견 사항

**실측 확인된 API 구조 수정:**

| 항목 | 기존 가정 | 실측값 |
|---|---|---|
| list 응답 키 | `contents` | **`data`** |
| detail 응답 키 | `content` | **`data`** (dict, 단일 아이템) |
| paging 키 | `num_of_rows` | **`page_size`** |
| 좌표 위치 | 최상위 | **`traffic.map_position_x/y`** |
| 주소 위치 | 최상위 | **`traffic.new_adres`** |
| 카테고리 경로 | 없음 | **`cate_depth`** 필드 (예: " 쇼핑 > 전문매장/상가") |
| 빈 keyword 동작 | 미확인 | **전체 inventory 반환** — full pagination 가능 확인 |

---

## B. Dry-Run 실행 결과

### 페이지 수집

| 항목 | 값 |
|---|---|
| 전체 total_count | **3,765건** |
| 전체 max_page | **76 pages** (page_size=50) |
| 샘플 페이지 | [1, 2, 38, 75, 76] |
| 수집 레코드 | **215건** |
| 유니크 CID | **215** (중복 없음) |
| 중복 CID | **0** |
| SOURCE_MUTATED | **NO** (total_count 불변) |
| list API calls | **5** |
| 500 오류 | **0** |

### Category Routing (Local Filter 결과)

| Track | 건수 | 비율 |
|---|---|---|
| EVENT_TRACK | 47 | 21.9% |
| PLACE_CONDITIONAL_REVIEW | 38 | 17.7% |
| RESTAURANT_TRACK | 35 | 16.3% |
| SHOPPING_REVIEW | 32 | 14.9% |
| UNRESOLVED_CATEGORY | 27 | 12.6% |
| PLACE_CORE_CANDIDATE | 22 | 10.2% |
| EXPERIENCE_CANDIDATE | 14 | 6.5% |
| GENERAL_ACCOMMODATION_EXCLUDE | 0 | 0% |
| TEMPLE_STAY_CANDIDATE | 0 | 0% |

> **주의**: sample distribution ≠ full population distribution.
> 최신 페이지(1-2) vs 오래된 페이지(75-76) 카테고리 분포 차이 관찰.

### 페이지별 분포 (중요 발견)

| 페이지 | 특성 | 주요 track |
|---|---|---|
| p1 (최신) | 상업성↑ | SHOPPING(18), RESTAURANT(13), CONDITIONAL(11) |
| p2 | 상업성↑ | RESTAURANT(19), SHOPPING(7), CONDITIONAL(10) |
| p38 (중간) | 이벤트↑ | **EVENT(34!)**, UNRESOLVED(5) |
| p75 (구버전) | 장소↑ | CONDITIONAL(13), **CORE(12)**, UNRESOLVED(13) |
| p76 (최구버전) | 장소↑ | **CORE(6)**, UNRESOLVED(5), CONDITIONAL(1) |

**핵심**: 오래된 페이지에 PLACE_CORE 비율이 높다. Full-run은 **반드시 ALL 76 pages** 수집 필요.

### UNRESOLVED 분석 (해결됨)

| Code | 카테고리 | 건수 | 조치 |
|---|---|---|---|
| `Cg1x6l1` | 문화관광 > 전시시설 | 22 | → PLACE_CONDITIONAL_REVIEW (코드맵 추가) |
| `Ce9z7g9` | 문화관광 > 도시공원 | 9 | → PLACE_CORE_CANDIDATE (코드맵 추가) |
| `Cw1i3e4` | 역사관광 > 종교성지 | 7 | → PLACE_CONDITIONAL_REVIEW (코드맵 추가) |
| `Cl8f8q1` | 체험관광 > 기타체험 | 7 | → EXPERIENCE_CANDIDATE (코드맵 추가) |
| `Cd4y5u1` | 축제/공연/행사 > 축제 | 18 | → EVENT_TRACK (코드맵 추가) |
| 기타 미확인 | (소수) | ~5 | 향후 확인 |

> 총 21개 category code → CATEGORY_CODE_MAP 추가 완료. 다음 실행에서 UNRESOLVED 크게 감소 예상.

---

## C. Detail 품질 검증 (16 CIDs)

### Detail 호출 결과

| CID | 제목 | Track | 비고 |
|---|---|---|---|
| KOP5pejiz | 63 스카이피크닉 | EXPERIENCE | 체험형 액티비티 |
| KOP51dofx | 남대문꽃종합상가 | PLACE_CORE | 시장 sub-entry (market 유형) |
| KOP034149 | 서울도시건축전시관 | PLACE_CONDITIONAL | 전시시설 |
| KOPc3g5o6 | 서울, 세계와 노래하다 | EVENT | 이벤트 — track 분리 확인 |
| KOPzy336c | 카우스: 친구, 그리고 이웃 | EVENT | 전시회 이벤트 |
| KOPgdf9ry | 파인캐릭터 2026 | EVENT | 전시회 이벤트 |
| KOPmwrtiq | 뉴뉴하우스 성수역점 | SHOPPING | 성수 trendy shop |
| KOPkptqaw | 치이카와샵 아이파크몰 용산점 | SHOPPING | 캐릭터 굿즈 chain |
| KOP2ckakp | 이색 카페 '티키룸' | RESTAURANT | 카페 — track 보존 확인 |
| KOPnpz0q2 | 여기인가 (서촌카페) | RESTAURANT | 카페 — track 보존 확인 |
| KOPuuvdzi | 아르테파인 용산(모터사이클 렌탈샵) | UNRESOLVED | 렌탈샵 — 관광 목적 불명확 |
| KOPuz5pe1 | 한강유람선 이랜드크루즈 | EXPERIENCE | 크루즈 투어 |
| KOP92zc2g | 서울 흥천사 | UNRESOLVED | 종교성지 → Cw1i3e4 코드맵 추가로 해결 |
| KOPwd3ohy | 아뜰리에 광화 | UNRESOLVED | 문화관광 → Ca0o2d4 코드맵 추가로 해결 |
| KOPqn2nrl | DDP 바캉스: 뮤직 페스티벌 | EVENT | 이벤트 — CID KOP이나 이벤트 |
| KOP2ckakp | 2026 서울썸머비치 | EVENT | 이벤트 |

### Detail 품질 플래그

| 플래그 | 결과 |
|---|---|
| 좌표 확인 (traffic.map_position_x/y) | PASS (has_coords=True 확인) |
| HTML description | CONFIRMED (모든 post_desc = HTML 형식) |
| HTML sanitize 필요 | YES — MAIN 구현 필요 |
| multi_lang_list in detail | CONFIRMED |
| Secret redaction | PASS (0 redacted) |
| event track 분리 | CONFIRMED (이벤트 detail ≠ place 수집) |

---

## D. Multi-lang

| 항목 | 값 |
|---|---|
| multi_lang_list 보유율 (list) | **100% (215/215)** |
| multi_lang_list 형식 확인 | `ko:CID,en:CID,ja:CID,zh-CN:CID,zh-TW:CID,...` |
| CID suffix 동일 | 100% (이미 확인) |
| CID suffix 자동 생성 | NO (금지 — multi_lang_list SSOT 사용) |
| ZH_VARIANT_DECISION | PENDING (zh-CN vs zh-TW 선택 미결) |
| 다국어 bulk detail | 이 TASK에서 금지 |

---

## E. Projected Full-Run (ESTIMATE_ONLY)

> **주의**: sample(5 pages, 215 records)에서 추정. actual distribution과 다를 수 있음.

| 항목 | 추정값 | 비고 |
|---|---|---|
| 전체 list API calls | **76 pages** | 확정 (3765/50 = 75.3) |
| 예상 PLACE_CORE | ~384건 | 10.2% × 3765, ESTIMATE_ONLY |
| 예상 PLACE_CONDITIONAL | ~666건 | 17.7% × 3765, ESTIMATE_ONLY |
| targeted detail (CORE+COND) | **~1050~1715건** | ESTIMATE_ONLY |
| 예상 EVENT_TRACK | ~823건 | 21.9%, ESTIMATE_ONLY |
| 예상 RESTAURANT_TRACK | ~612건 | 16.3%, ESTIMATE_ONLY |
| 예상 SHOPPING_REVIEW | ~561건 | 14.9%, ESTIMATE_ONLY |

> **페이지 분포 불균형 주의**: p38은 EVENT 68% → 실제 place 비율은 추정보다 낮을 수 있음.
> Older pages have significantly more PLACE_CORE than recent pages.

---

## F. Safety 체크

| QA 플래그 | 결과 |
|---|---|
| VISITSEOUL_API_KEY_AVAILABLE | YES |
| API_KEY_EXPOSED | **NO** |
| COLLECTOR_IMPLEMENTED | YES |
| DEFAULT_SAFE_MODE | YES |
| FULL_RUN_REQUIRES_EXPLICIT_FLAG | YES (--allow-full) |
| DRYRUN_LIST_PAGES | **5** (≤ 5 ✅) |
| DRYRUN_LIST_RECORDS | **215** (≤ 250 ✅) |
| DRYRUN_DETAIL_CALLS | **16** (≤ 20 ✅) |
| CATEGORY_PARAMETER_USED | **NO** |
| LOCAL_CATEGORY_ROUTING | PASS |
| DUPLICATE_DETECTION | PASS (0 found) |
| PAGE_OVERLAP_DETECTION | PASS |
| SOURCE_MUTATION_GUARD | PASS (no mutation) |
| RESTAURANT_TRACK_PRESERVED | YES |
| EVENT_TRACK_PRESERVED | YES |
| GENERAL_ACCOMMODATION_EXCLUDED | YES |
| TEMPLE_STAY_EXCEPTION_PRESERVED | YES |
| MULTILINGUAL_LINK_PRIMARY | multi_lang_list |
| CID_SUFFIX_AUTOGENERATION | NO |
| SEOUL_BULK_COLLECTION | NOT_STARTED |
| VISITSEOUL_FULL_INVENTORY | NOT_STARTED |
| DB_CHANGE | 0 |
| SRC_CHANGE | 0 |
| SECRET_LEAK | 0 |
| KTO_TARGETED_DETAIL | DEFERRED |
| KTO_COLLISION_AUTOASSIGN | NO |

---

## G. API 호출 누계

| 세션 단계 | calls |
|---|---|
| VISITSEOUL-LIVE-QUALITY-VALIDATION-V1 | 109 |
| API 구조 진단 probe | 7 |
| DRYRUN-V1 실행 | 21 |
| **세션 총계** | **137 / 350** |

---

## H. 결론

**VISITSEOUL_INVENTORY_COLLECTOR_READY = YES**  
**VISITSEOUL_DRYRUN_VALIDATED = YES**  
**FULL_BULK_READY_FOR_USER_APPROVAL = YES** (MAIN 승인 후 `--allow-full` 사용 가능)  
**SEOUL_BULK_COLLECTION = NOT_STARTED**
