# TASK-GYEONGJU-WEB-COLLECTOR-UPGRADE-V1 완료보고서

- **작업 유형**: 완료보고서 (검증 포함)
- **작업 일시**: 2026-08-05
- **브랜치**: `data/gyeongju-web-collector-upgrade-v1`
- **전임 작업**: TASK-GYEONGJU-WEB-RAW-COLLECTION-V1 (EXECUTION_HOLD — 블로커 6개 식별)
- **후속 작업**: TASK-GYEONGJU-WEB-RAW-COLLECTION-V2

---

## 1. 작업 개요

TASK-GYEONGJU-WEB-RAW-COLLECTION-V1 검증 결과(`docs/tourapi/gyeongju-web-raw-collection-v1-verification.md`) 에서 발견된 블로커 B1~B6 및 개선사항 I7~I9를 해소하기 위해 두 수집기를 v1.0.0 → v2.0.0으로 업그레이드한다.

### 검증 선행 내용 (TASK-GYEONGJU-WEB-RAW-COLLECTION-V1 검증보고서 재확인)

| 항목 | 내용 |
|------|------|
| 블로커 | B1(관광지 상세 미수집), B2(행사 날짜·장소 누락), B3(문화해설 하드코딩), B4(추천여행지 미파싱), B5(언어분류 2단계), B6(visitgyeongju 명칭 오추출) |
| 개선사항 | I7(수 오기 수정), I8(로케일별 Accept-Language), I9(주소 다국어 추출) |
| 분기 전제 오류 | GPT가 `data/gyeongju-web-raw-collection-v1`을 시작 브랜치로 명시했으나, 실제 검증보고서 브랜치는 `data/gyeongju-web-collector-foundation-v1` — 의도 명확하므로 비차단 처리 |

---

## 2. 검증 (본 작업 착수 전)

본 작업 지침(TASK-GYEONGJU-WEB-COLLECTOR-UPGRADE-V1 프롬프트)을 검증한 결과:

- **근본적 블로커 없음**: 6개 블로커 모두 구체적이고 달성 가능한 성공 기준 포함
- **표본 한도 적절**: 관광지 5건, 행사 4~6건, 식당 5건 × 5언어 — 전수 수집 방지
- **분기 전제 오류**: 문서 오류 수준 (비차단)

**판정: EXECUTE**

---

## 3. HTML 구조 분석 (사전 조사)

스크립트 작성 전 WebFetch로 5개 페이지 유형의 실제 HTML을 확인했다.

| 페이지 유형 | 핵심 발견 |
|------------|-----------|
| **관광지 상세** | 명칭: 4번째 `<dt>` (UI 라벨 3개 이후). 주소/전화: `<li><span>라벨</span>값</li>`. 시간: 요약정보 dd 자유텍스트 |
| **행사 상세** | 기간: `YYYY. M. DD.(요일) ~ YYYY. M. DD.(요일)` 형식. 장소·주최: `<li><span>` 구조 |
| **문화관광해설** | `<th scope="row">장소명</th>` — `<td>` 아님. 17개 행. colspan/rowspan 있음 |
| **추천여행지** | 장소명: `<h3>/<h4>` 아티클형. 내비게이션: mnu_uid 파라미터 링크로 타 월 접근 |
| **visitgyeongju** | 명칭: `<h2>` (OG title 아님). sitemap: `/cuisine/view/HEX_ID` (tour/restaurant 아님) |

---

## 4. 업그레이드 내용

### 4-1. gyeongju_culture_web_collect.py v1.0.0 → v2.0.0

#### 신규 함수

| 함수 | 역할 |
|------|------|
| `extract_label_value(html, label)` | 라벨-값 추출. 우선순위: `<li><span>` → dt/dd → th/td → 콜론 패턴 |
| `extract_name_from_detail(html)` | `<dt>` 순서 기반 명칭 추출 (UI 라벨 3개 건너뜀). `"경주"` 포함 허용 |
| `parse_korean_date(text)` | `2026. 6. 30.(화)` → `2026-06-30` |
| `parse_attraction_detail(html_bytes)` | name_ko, address, phone, hours, admission, closed, parking, homepage |
| `parse_event_detail(html_bytes)` | name_ko, start_date, end_date, venue, organizer, contact, external_url |
| `parse_cultural_guide_sites(html_bytes)` | `<th scope="row">` 파싱. 캡션 폴백 |
| `parse_monthly_rec_content(html_bytes, …)` | year, month, theme, places, navigation_months |
| `discover_monthly_rec_nav(html_bytes)` | 타 월 mnu_uid 링크 발견 |

#### 수정된 수집 함수

| 함수 | 변경 내용 |
|------|----------|
| `collect_attractions()` | 상세 URL fetch + `parse_attraction_detail()` → `detail_fetched=True` (B1) |
| `collect_events()` | 상세 URL fetch + `parse_event_detail()` → 날짜·장소·주최 추출 (B2) |
| `collect_cultural_guides()` | `KNOWN_GUIDE_SITES` 하드코딩 제거, `parse_cultural_guide_sites()` 동적 추출 (B3) |
| `collect_monthly_recommendations()` | `parse_monthly_rec_content()` + 내비게이션 다중월 수집 (B4) |

#### 실제 발견된 추가 버그 (검증 중 수정)

| 버그 | 내용 | 수정 |
|------|------|------|
| `extract_name_from_detail()` h1/h2/h3 접근 | 사이트 헤더만 있음; 명칭은 4번째 dt에 위치 | dt 순서 기반으로 재작성 |
| `SKIP_PATTERNS = ["경주", …]` | "경주 동궁원" 등 모든 경주 지명 필터링 | 삭제 |
| `extract_label_value()` 패턴 누락 | `<li><span>주소</span>값</li>` 형식 미지원 | 패턴 0으로 추가 |
| `parse_cultural_guide_sites()` td 탐색 | 명칭 셀이 `<th scope="row">` — td 아님 | th[scope=row] 탐색으로 교체 |
| 전화 전역 regex 폴백 | 페이지 상단 대표전화 픽업 오류 | 전역 regex 폴백 제거 |

### 4-2. visitgyeongju_collect.py v1.0.0 → v2.0.0

#### 수정 사항

| 항목 | 변경 전 | 변경 후 | 근거 |
|------|---------|---------|------|
| 식당 경로 | `/tour/restaurant/` | `/cuisine/view/` | sitemap 실제 확인 |
| 기념품 경로 | `/tour/souvenir/` | `/souvenir/view/` | sitemap 실제 확인 |
| 식당 known_count | 96 (v1.0.0) | 85 (sitemap 실측) | I7 |
| 기념품 known_count | 9 (v1.0.0) | 8 (sitemap 실측) | I7 |
| sitemap 파싱 | ElementTree (namespace 오류) | regex `<loc>` 추출 | namespace `xsi:` 오류 해소 |
| Accept-Language | 전 로케일 `ko,en;q=0.9` | 로케일별 | I8 |
| 주소 추출 | 한국어 `경주시` 패턴만 | 영·일·중 패턴 추가 | I9 |
| 엔티티명 추출 | OG title 우선 → `VISIT GYEONGJU` 반환 | h2 → h1 → LD+JSON → title → OG | B6 |
| 언어 분류 | HTTP 상태 + 단어수 2단계 | 6단계 분류 | B5 |

#### 6단계 언어 분류 (B5)

```
VALID_TRANSLATED_DETAIL   — 페이지 존재, 로케일 텍스트, 엔티티 식별 가능
KOREAN_FALLBACK           — 페이지 존재하나 한글 비율 > 60% & 한국어 필드 > 50%
EMPTY_TEMPLATE            — 페이지 존재하나 단어 수 < 50
PARTIAL_TRANSLATION       — 엔티티명 존재하나 한국어 필드 > 40%
DETAIL_NOT_FOUND          — HTTP 404
HTTP_ERROR                — 기타 HTTP 오류
```

---

## 5. 표본 검증 결과

### 5-1. 관광지 상세 (5건, 보문관광단지권)

| area_uid | name_ko | addr | phone | hours | detail_fetched | HTTP |
|----------|---------|------|-------|-------|----------------|------|
| 43575 | 한수원기업홍보관SSNC | ✓ | ✓ | ✓ | True | 200 |
| 25 | 경주 동궁원 | ✓ | ✓ | ✓ | True | 200 |
| 43574 | 경주 라원 | ✓ | ✓ | ✓ | True | 200 |
| 43572 | 코스믹리조트 | ✓ | ✓ | ✓ | True | 200 |
| 26 | 보문호 수상레저 | ✓ | ✓ | ✓ | True | 200 |

**ASSERT: detail_fetched=True 5/5, name_ko≠null 5/5, HTTP 200 5/5 ✅**

### 5-2. 행사 상세 (5건, 2026-08)

| con_uid | name_ko | start_date | venue |
|---------|---------|------------|-------|
| 7746 | 2026 한수원아트페스티벌 특별전 | 2026-06-30 | ✓ |
| 7752 | 경주문화관1918 특별전시 | 2026-07-15 | ✓ |
| 7774 | [2026 공유] 안준모 | (미기재) | ✓ |
| 7763 | 공연예술 관람료 지원 사업 | (미기재) | ✓ |
| 7775 | 2026 봉황대뮤직스퀘어 8월 | (미기재) | ✓ |

- 날짜 미기재 사유: 해당 상세 페이지에 날짜 필드 없음 (공연 안내 등)
- **ASSERT: detail_fetched=True 5/5, name_ko 5/5, venue_or_date 5/5 ✅**

### 5-3. 문화관광해설 동적 추출

- 발견 수: **17/17** (기준 17)
- 추출 방법: `<th scope="row">` — 하드코딩 없음
- **ASSERT: discovered_count=17 ✅, ASSERT_no_hardcoded_names=True ✅**

발견된 사이트 (17개): 대릉원, 불국사, 석굴암, 양동마을, 분황사, 첨성대, 동궁과월지, 옥산서원, 김유신묘, 무열왕릉, 포석정지, 원성왕릉, 오릉, 감은사지, 동리목월문학관, 향교 외 1개

### 5-4. 이달의 추천여행지

| mnu_uid | year | month | places | nav_months |
|---------|------|-------|--------|------------|
| 4185 | 2026 | 5 | 12 | 12 |
| 4085 | 2019 | - | 1 | - |

- mnu_uid=4185 기준 페이지: 12개 장소명 파싱, 12개월 내비게이션 발견
- **ASSERT: primary_parsed=True ✅, nav_discovered=True ✅, places_extracted=True ✅**

### 5-5. visitgyeongju 식당 (5건 × 5언어)

| 번호 | name_ko | name_en | name_ja | name_zh_cn | name_zh_tw | 분류(전 로케일) |
|------|---------|---------|---------|------------|------------|----------------|
| 1 | 향화정 | Hyanghwajeong | ヒャンファジョン | 乡花亭 | 鄉花亭 | VALID_TRANSLATED_DETAIL |
| 2 | 촘촘 경주황리단길점 | Chom chom… | チョムチョム… | CHOM CHOM庆州… | CHOM CHOM慶州… | VALID_TRANSLATED_DETAIL |
| 3 | 마조르 | Major | MAJOR | MAJOR | MAJOR | VALID_TRANSLATED_DETAIL |
| 4 | 외가 | Wae Ga… | ウェガ | WAE GA皇理团路… | WAE GA皇理團路… | VALID_TRANSLATED_DETAIL |
| 5 | 황리화덕가 | Hwangri Hwadeokga | ファンニファドク家 | 皇理火炉家 | 皇理烤窯家 | VALID_TRANSLATED_DETAIL |

**ASSERT: VALID_TRANSLATED_DETAIL 25/25 (5건 × 5언어) ✅**

### 5-6. visitgyeongju 기념품 (3건 × 5언어)

| name_ko | name_en | name_ja | name_zh_cn | 분류(전 로케일) |
|---------|---------|---------|------------|----------------|
| 대릉원 예술창고 | Daereungwon Art Warehouse | 大陵苑芸術倉庫 | 大陵苑艺术仓库 | VALID_TRANSLATED_DETAIL |
| 경주기념품상점 | Gyeongju Souvenir Shop | 慶州おみやげショップ | 庆州纪念品店 | VALID_TRANSLATED_DETAIL |
| 너나들이 | Neonadeuri | ノナドゥリ | Neonadeuri | VALID_TRANSLATED_DETAIL |

**ASSERT: VALID_TRANSLATED_DETAIL 15/15 (3건 × 5언어) ✅**

---

## 6. 산출물 목록

| 파일 | 유형 | 크기 |
|------|------|------|
| `scripts/gyeongju_culture_web_collect.py` | 수집기 v2.0.0 | 업그레이드 |
| `scripts/visitgyeongju_collect.py` | 수집기 v2.0.0 | 업그레이드 |
| `data/tourapi/validation/gyeongju/gyeongju-attraction-detail-parser-regression-v1.jsonl` | 검증 | 5건 |
| `data/tourapi/validation/gyeongju/gyeongju-event-detail-parser-regression-v1.jsonl` | 검증 | 5건 |
| `data/tourapi/validation/gyeongju/gyeongju-cultural-guide-dynamic-extraction-v1.json` | 검증 | 17사이트 |
| `data/tourapi/validation/gyeongju/gyeongju-monthly-recommendation-parser-v1.json` | 검증 | 2페이지 |
| `data/tourapi/validation/gyeongju/visitgyeongju-entity-name-regression-v1.jsonl` | 검증 | 8건 |
| `data/tourapi/validation/gyeongju/visitgyeongju-language-classification-regression-v1.jsonl` | 검증 | 40건 |
| `docs/tourapi/gyeongju-web-collector-upgrade-v1.md` | 본 완료보고서 | — |
| `data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json` | manifest 갱신 | — |

---

## 7. 해소된 블로커 / 개선사항 요약

| ID | 분류 | 내용 | 해소 여부 |
|----|------|------|----------|
| B1 | 블로커 | 관광지 상세 페이지 미수집 | ✅ 해소 |
| B2 | 블로커 | 행사 날짜·장소 누락 | ✅ 해소 |
| B3 | 블로커 | 문화해설 하드코딩 | ✅ 해소 |
| B4 | 블로커 | 추천여행지 콘텐츠 미파싱 | ✅ 해소 |
| B5 | 블로커 | 언어분류 2단계만 | ✅ 해소 (6단계) |
| B6 | 블로커 | visitgyeongju 명칭 = "VISIT GYEONGJU" | ✅ 해소 |
| I7 | 개선 | 식당 96건/기념품 9건 오기 | ✅ 수정 (85/8) |
| I8 | 개선 | Accept-Language 단일값 | ✅ 로케일별 설정 |
| I9 | 개선 | 주소 한국어 패턴만 | ✅ 다국어 확장 |

---

## 8. 다음 단계

TASK-GYEONGJU-WEB-COLLECTOR-UPGRADE-V1 완료로 TASK-GYEONGJU-WEB-RAW-COLLECTION-V1의 `EXECUTION_HOLD`가 해제된다.

권장 후속 작업: **TASK-GYEONGJU-WEB-RAW-COLLECTION-V2** (v2.0.0 스크립트 기반 전수 수집)

---

작업을 완료했습니다.
