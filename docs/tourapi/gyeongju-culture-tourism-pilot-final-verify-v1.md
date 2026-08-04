# TASK-GYEONGJU-CULTURE-TOURISM-PILOT-FINAL-VERIFY-V1 완료보고서

**Task:** TASK-GYEONGJU-CULTURE-TOURISM-PILOT-FINAL-VERIFY-V1  
**Branch:** data/gyeongju-culture-tourism-pilot-correction-v1  
**Base commit:** 2ca2d06 (TASK-GYEONGJU-CULTURE-TOURISM-PILOT-CORRECTION-V1 완료)  
**Verified at:** 2026-08-04  
**Report type:** 완료보고서 (검증 결과 포함)  
**Overall Verdict:** CONDITIONAL_PASS

---

## 판정 근거 요약

| 항목 | 상태 |
|------|------|
| 수정 태스크 산출물 7건 전체 | PASS — 존재·파싱·기록 수 정상 |
| 이달의 행사 7건 | PASS — 현재 4건·예정 3건, KTO 비중복 |
| 이달의 추천여행지 12건 | PASS — 2026년 8월 기준 정상 수집 |
| 여행코스 5개 | PASS — 전 코스 정거장 포함 수집 |
| Origin push 상태 | HOLD — 미push (로컬 브랜치만 존재) |
| 소스 우선순위 매트릭스 | FIXED — 이번 검증에서 6개 필드 보정 |
| 이미지 권리 (영상이미지 시스템) | HOLD — RIGHTS_UNCLEAR, 별도 확인 필요 |
| 세계유산 개별 수집 | PARTIAL — GJ01 is_unesco 10건 확인, 웹 전용 수집 미완료 |
| 문화관광해설 17개소 목록 | PARTIAL — 신청 안내 페이지만 접근, 개별 장소 미수집 |
| 관광지 20건 official_url | EXPECTED_HOLD — 수정 태스크 범위 외. 후속 태스크 필요 |

---

## 1. Git 상태

| 항목 | 값 |
|------|-----|
| 브랜치 | `data/gyeongju-culture-tourism-pilot-correction-v1` |
| HEAD commit | `2ca2d06` |
| 워크트리 상태 | CLEAN (미커밋 변경 없음, 수정 태스크 완료 시점 기준) |
| origin push | **NOT PUSHED** — origin 브랜치 미생성 (exit 128) |

> **주의:** origin push는 수집 파이프라인 진입 전 수동 push 필요. 이 보고서 파일을 포함한 최종 검증 커밋 완료 후 push 권장.

---

## 2. commit 2ca2d06 변경 파일 목록

수정 태스크(TASK-GYEONGJU-CULTURE-TOURISM-PILOT-CORRECTION-V1)에서 생성·변경된 파일 7건:

| # | 파일 | 크기 | SHA256 (앞16) |
|---|------|------|--------------|
| 1 | `gyeongju-culture-tourism-source-contract-v2.json` | 5,655B | `8c08b2f4c15a7667` |
| 2 | `gyeongju-event-pilot-v2.jsonl` | 7,556B | `3db1728b642e3447` |
| 3 | `gyeongju-recommendation-pilot-v1.jsonl` | 8,527B | `541e2f018c6d8993` |
| 4 | `gyeongju-course-pilot-v1.jsonl` | 6,696B | `c8cba2d2f478c4b5` |
| 5 | `gyeongju-event-currentness-audit-v2.jsonl` | 4,282B | `2c36e0efb77fe404` |
| 6 | `gyeongju-culture-tourism-pilot-correction-summary-v1.json` | 4,227B | `9241d54781f028c3` |
| 7 | `gyeongju-culture-tourism-source-contract-and-pilot-correction-v1.md` | 6,767B | `320d5b36afd0b149` |

모든 7건: 파일 존재 ✓, JSON/JSONL 파싱 ✓, Manifest 등록 ✓.

### 기존 파일 (수정 태스크에서 변경 없음)

| 파일 | 크기 | SHA256 (앞16) | 비고 |
|------|------|--------------|------|
| `gyeongju-culture-tourism-source-contract-v1.json` | 7,903B | `5e281edac4f8b3af` | v1 계약 — 히스토리 보존 |
| `gyeongju-tourism-place-pilot-v1.jsonl` | 23,297B | `5f72979209546f32` | 관광지 20건 |
| `gyeongju-event-pilot-v1.jsonl` | 17,659B | `c323324c9a641976` | KTO type15 24+1건 (v1) |
| `gyeongju-api-web-link-audit-v1.jsonl` | 16,794B | `6a22a9c30e8e88ed` | GJ01 vs KTO12 비교 |
| `gyeongju-candidate-link-audit-v1.jsonl` | 10,273B | `3d695985f55efd46` | 831건 candidate 연결 |
| `gyeongju-event-currentness-audit-v1.jsonl` | 11,981B | `7a9fcff0776ddfa3` | KTO 행사 최신성 감사 v1 |
| `gyeongju-image-description-rights-audit-v1.json` | 4,942B | `c86772d080e9e2ae` | 이미지 권리 감사 |
| `gyeongju-culture-tourism-pilot-summary-v1.json` | 7,595B | `64d8ad7a4595ad0d` | v1 요약 보고서 |
| `gyeongju-manifest-v1.json` | 19,888B | `63fb684b3bdba166` | Manifest (수정태스크 반영) |

---

## 3. 관광지 파일럿 20건

GJ01 공식 API 기반. 전 20건 `candidate_link: "HIGH_CONFIDENCE"`, `candidate_modified: false`.

| # | 이름 | 권역 | 좌표 | is_unesco | kto12 | 이미지 API |
|---|------|------|------|-----------|-------|-----------|
| 1 | 첨성대 | 시내권 | KTO12 | ✓ | ✓ | GJ03 |
| 2 | 동궁과 월지 | 시내권 | KTO12 | ✓ | ✓ | GJ03 |
| 3 | 대릉원 | 시내권 | KTO12 | ✓ | ✓ | GJ03 |
| 4 | 교촌마을 | 시내권 | MISSING | — | — | GJ03 |
| 5 | 포석정 | 남산권 | KTO12 | ✓ | ✓ | GJ05 |
| 6 | 삼릉 | 남산권 | KTO12 | ✓ | ✓ | GJ05 |
| 7 | 오릉 | 남산권 | MISSING | ✓ | — | GJ05 |
| 8 | 문무대왕릉 | 동해권 | KTO12 | — | ✓ | 없음 |
| 9 | 감포항 | 동해권 | KTO12 | — | ✓ | 없음 |
| 10 | 골굴사 | 동해권 | MISSING | — | — | 없음 |
| 11 | 경주 엑스포대공원 | 보문권 | KTO12 | — | ✓ | GJ04 |
| 12 | 보문관광단지 | 보문권 | MISSING | — | — | GJ04 |
| 13 | 경주 동궁원 | 보문권 | MISSING | — | — | GJ04 |
| 14 | 불국사 | 불국사권 | MISSING | ✓ | — | 없음 |
| 15 | 석굴암 | 불국사권 | MISSING | ✓ | — | 없음 |
| 16 | 경주 원성왕릉(괘릉) | 불국사권 | KTO12 | ✓ | ✓ | 없음 |
| 17 | 토함산 | 불국사권 | KTO12 | — | ✓ | 없음 |
| 18 | 무열왕릉 | 서악북부권 | MISSING | ✓ | — | 없음 |
| 19 | 양동마을 | 서악북부권 | KTO12 | ✓ | ✓ | 없음 |
| 20 | 옥산서원 | 서악북부권 | MISSING | ✓ | — | 없음 |

- 좌표 보유: 11/20건 (KTO12). 9건 MISSING (KTO 미수록).
- is_unesco=true: 10건.
- `official_url_gyeongju_web`: **전 20건 HOLD_DYNAMIC_CONTENT** — 수정 태스크 범위 외(GJ01 기반 파일럿 레코드 변경 금지). 후속 태스크에서 mnu_uid=2266 권역별 목록과 매칭하여 보강 가능.

---

## 4. API↔소스 비교 (gyeongju-api-web-link-audit-v1.jsonl)

**중요:** 파일명이 "api-web" 이지만 실제 비교 대상은 **GJ01 vs KTO12** (두 API 간 비교)다. 웹 vs API 비교는 아님.

| 구분 | 건수 |
|------|------|
| GJ01+KTO12 모두 있음 (WEB_AND_API_MATCH) | 9건 |
| GJ01만 있음 (API_ONLY, KTO12 미수록) | 11건 |
| 웹 접근 상태 (`web_access_status`) | 전 20건 HOLD_DYNAMIC_CONTENT (미갱신) |

> 파일명의 'web'은 v1 작성 시 웹 확인을 시도하려 했던 의도를 반영한 것으로, 실제 웹 데이터는 담겨 있지 않다. 후속 태스크에서 `mnu_uid=2266` 권역 목록과 대조하여 `web_access_status` 갱신 필요.

---

## 5. 이달의 추천여행지 12건 (gyeongju-recommendation-pilot-v1.jsonl)

- 수집 기준: 2026년 8월, `mnu_uid=4185`
- 테마: "8월 경주, 푸름에 머물다 — 숲과 바다 사이 쉼을 만나는 여행"
- **유효 범위:** 2026년 8월 한정 (월별 갱신). 연간 데이터가 아님.

| 카테고리 | 건수 | 대표 장소 |
|---------|------|---------|
| 항구·해안 (landscape) | 2 | 나정항, 수렴항 |
| 숲 속 피서 (nature) | 2 | 기림사–용연폭포, 건천 편백숲내음길 |
| 여름 미술관 (culture) | 3 | 우양미술관, 알천미술관, 경주문화관 1918 |
| 특별 이벤트 (event) | 1 | 2026 EX HORROR: 신라 X 좀비 |
| 공방 체험 (experience) | 2 | 왓츠녹, 스튜디오 소온 |
| 로컬 카페 (cafe) | 2 | 스윗문, 프로즌 브라이드 |
| **합계** | **12** | |

> 모든 12건은 추천 장소 단위 수집. 각 레코드에 category, description_ko, source_url 포함.

---

## 6. 여행코스 5개 (gyeongju-course-pilot-v1.jsonl)

| # | 코스명 | mnu_uid | 유형 | 정거장 수 | 주요 정보 |
|---|--------|---------|------|----------|---------|
| 1 | 경주 시내권 핵심 바이블 | 2297 | 도보/자동차 | 7 | 당일~1박 2일, 시내 반경 3km |
| 2 | 예인의 도시 경주 미술·문학기행 | 2298 | 자동차 | 6 | 건천~불국사권 장거리 |
| 3 | 달빛테라피 경주야경산책 | 2299 | 도보 | 7 | 4.75km, 황리단길→동궁과월지 |
| 4 | 삼릉가는 길 자전거 | 2300 | 자전거 | 7 | 12km, 월정교→삼릉 |
| 5 | 10번 버스타GO 알짜배기 경주여행 | 2301 | 버스 | 8 | 버스 10번, 35-45분 |

각 코스: `source_fact_id`, `stops[]` (순번·name_ko·description_ko), `mode`, `duration_note` 포함.

---

## 7. 세계유산(UNESCO) 및 문화관광해설

### 세계유산

- **GJ01 기반 확인:** is_unesco=true 10건 (경주역사유적지구·양동마을)
  - 경주역사유적지구: 2000년 등재. 첨성대, 동궁과월지, 대릉원, 포석정, 삼릉, 오릉, 불국사, 석굴암, 경주원성왕릉, 무열왕릉 포함
  - 양동마을: 2010년 등재. pilot #19
- **웹 전용 수집:** HOLD — 경주문화관광 웹사이트 세계유산 전용 mnu_uid 미발견. 후속 태스크 필요.
- **판정:** GJ01 is_unesco 필드로 기본 분류 가능. 세계유산 상세 설명 및 공식 경계 정보는 별도 수집 필요.

### 문화관광해설

- **접근 확인:** mnu_uid=2262 (STATIC_HTML_AVAILABLE) — 해설 신청 안내 및 일반 운영 정보 확인
- **미완료:** 17개 해설 장소 개별 목록 수집 미완료 (신청 안내 페이지에 목록 미노출)
- **판정:** 부분 수집(PARTIAL). 17개소 상세는 후속 태스크 필요.

---

## 8. 이달의 행사 7건 (gyeongju-event-pilot-v2.jsonl + audit-v2.jsonl)

### 행사 목록

| # | source_fact_id | 이름 | 기간 | 상태 | con_uid |
|---|----------------|------|------|------|---------|
| 1 | `gyeongju-GJTOUR-EVT-7746` | 2026 한수원아트페스티벌 특별전 | 2026-06-30~10-18 | CURRENT | 7746 ✓ |
| 2 | `gyeongju-GJTOUR-EVT-7752` | 경주문화관1918 특별전시 <어린왕자 인 경주> | 2026-07-15~09-30 | CURRENT | 7752 ✓ |
| 3 | `gyeongju-GJTOUR-EVT-7774` | [2026 공유] 안준모 <BLUE GIANT> | 2026-07-28~08-09 | CURRENT | 7774 ✓ |
| 4 | `gyeongju-GJTOUR-EVT-7763` | 경주예술의전당 공연 안내 | 2026-07-31~08-29 | CURRENT | 7763 ✓ |
| 5 | `gyeongju-GJTOUR-EVT-7775` | 2026 봉황대뮤직스퀘어 8월 | 2026-08-14~08-28 | UPCOMING | 7775 ✓ |
| 6 | `gyeongju-GJTOUR-EVT-7753` | 한수원 문화가 있는 날 <썸머나이트 지누션&디바> | 2026-08-26 | UPCOMING | 7753 ✓ |
| 7 | `gyeongju-GJTOUR-EVT-SEP-7753` | 퀸엘리자베스 콩쿠르 위너스 콘서트 in 경주 | 2026-09-13 | UPCOMING | **미확인** |

**감사 결과:**
- `opening_hours_misuse`: 전 7건 false
- `date_reversal`: 전 7건 false
- `existing_kto24_match`: 전 7건 false — KTO type15 24건과 완전히 별개의 신규 이벤트

**이벤트 #7 갭:**  
source_fact_id가 `SEP-7753` (인공 패턴). 9월 목록 페이지(`mnu_uid=2393&initYear=2026&initMonth=9`)에서 수집했으나 실제 con_uid 미확인. `source_url`이 목록 URL (`initMonth=9`)로 되어 있으며 개별 상세 URL이 없음. 수집 시 con_uid 확인 필요 — 후속 태스크에서 보정 가능.

**이벤트 #6과 #7 명칭 혼동 주의:**  
#6(GJTOUR-EVT-7753)은 8월 26일 썸머나이트 공연. #7(SEP-7753)은 9월 13일 콘서트. 두 이벤트는 별개이며 con_uid 7753은 #6의 확인된 ID. #7의 실제 con_uid는 미확인.

---

## 9. 이미지 권리 검증

### GJ03·GJ04·GJ05 이미지 API
- **판정:** OFFICIAL_API_IMAGE_USABLE — 이용허락범위 제한 없음
- 1,292건 이미지 (시내권·보문권·남산권)
- 장소-이미지 연결: 관광지명 기준 매칭 필요 (직접 ID 연결 키 없음)

### KTO 이미지
- Type1: KTO_IMAGE_USABLE (47건)
- Type3: HOLD (74건) — 저작권 조건 미확인
- rights unknown: HOLD (22건)

### 경주 영상이미지 다운로드 시스템 (gyeongju.go.kr/gyeongjuimage/index.do)
- **판정: RIGHTS_UNCLEAR**
- 저작권 문구: "Copyright(C) 2019 경주시 관광자원 영상이미지. All rights reserved."
- 공공누리 라이선스: NOT_FOUND
- 상업적 이용·출처 표기 규정: 별도 "콘텐츠 사용범위규정" 페이지 참조 — 해당 페이지 접근 불가 (WebFetch 실패)
- 문의처: 경주시 관광컨벤션과, 054-779-6832
- **조치:** 파이프라인 활용 전 관광컨벤션과 직접 확인 필요

---

## 10. 소스 우선순위 매트릭스 수정

수정 태스크(TASK-GYEONGJU-CULTURE-TOURISM-PILOT-CORRECTION-V1)에서 source-contract-v2.json을 통해 웹 접근 판정이 갱신됐으나, `gyeongju-source-priority-matrix-v1.json`은 갱신되지 않은 상태였다. 본 최종 검증 태스크에서 계약 보완 차원으로 6개 필드를 수정했다.

| 필드 | v1 상태 | → 수정 후 |
|------|---------|----------|
| `관광지_목록_및_공식_존재여부` (web_role) | HOLD_DYNAMIC_CONTENT | PARTIAL_STATIC_HTML (mnu_uid=2266) |
| `권역_district_gyeongju` (secondary) | 웹사이트 메뉴 구조 (HOLD) | mnu_uid=2266 (STATIC_HTML_AVAILABLE) |
| `이달의_추천여행지` (primary) | HOLD_DYNAMIC_CONTENT | mnu_uid=4185 (STATIC_HTML_AVAILABLE) |
| `여행코스` (primary) | HOLD_DYNAMIC_CONTENT | mnu_uid=2297~2301 (STATIC_HTML_AVAILABLE) |
| `문화관광해설` (primary) | HOLD_DYNAMIC_CONTENT | mnu_uid=2262 (STATIC_HTML_AVAILABLE — 부분적) |
| `행사_축제_현재_예정` (primary) | HOLD_DYNAMIC_CONTENT | mnu_uid=2393 (STATIC_HTML_AVAILABLE) |

> `운영시간`, `입장료`, `휴무일`: 개별 장소 상세 페이지 URL 패턴 미검증. HOLD 유지.  
> `세계유산_UNESCO`: 전용 mnu_uid 미발견. HOLD 유지.

---

## 11. 전체 수집 준비 상태

| 카테고리 | 상태 | 비고 |
|---------|------|------|
| 관광지 목록 (GJ01 20건) | READY | 좌표 9건 MISSING — KTO 보강 필요 |
| 관광지 이미지 (GJ03~05) | READY | 장소 연결은 명칭 매칭 |
| 이달의 행사 | READY — 월별 갱신 | mnu_uid=2393 |
| 이달의 추천여행지 | READY — 월별 갱신 | mnu_uid=4185 |
| 여행코스 | READY | 5개 코스 전부 수집 완료 |
| KTO 설명·이미지 Type1 | READY | overview, firstimage |
| 세계유산 상세 | PARTIAL — 후속 필요 | is_unesco 분류는 가능 |
| 문화관광해설 17개소 | PARTIAL — 후속 필요 | 신청 안내 접근만 확인 |
| 관광지 운영시간·입장료 | HOLD | 개별 상세 URL 미검증 |
| 영상이미지 시스템 | HOLD | RIGHTS_UNCLEAR |
| KTO Type3 이미지 | HOLD | 저작권 미확인 |
| Origin push | HOLD | 수동 push 필요 |

---

## 12. 후속 태스크 권장 목록

| 우선순위 | 내용 |
|---------|------|
| HIGH | origin push — `data/gyeongju-culture-tourism-pilot-correction-v1` 브랜치 |
| HIGH | 경주 영상이미지 사용범위규정 확인 (관광컨벤션과 054-779-6832) |
| MED | 관광지 20건 official_url_gyeongju_web 보강 (mnu_uid=2266 권역 목록 매칭) |
| MED | 이벤트 #7 (SEP-7753) con_uid 확인 — 9월 상세 페이지 재조회 |
| MED | 좌표 MISSING 9건 보강 (Google Maps API 또는 카카오 좌표 fallback) |
| LOW | 문화관광해설 17개소 개별 수집 |
| LOW | 세계유산 전용 mnu_uid 탐색 및 개별 설명 수집 |
| LOW | GJ06 야경명소·GJ07 전망포인트 실데이터 대체 (현재 placeholder) |

---

## 최종 판정

```
CONDITIONAL_PASS

수정 태스크 핵심 목표(JS 오판정 수정, 실데이터 수집) 달성.
7개 산출물 전부 정상. 행사·추천여행지·코스 실데이터 확보.
소스 우선순위 매트릭스 본 검증에서 보정 완료.

조건: origin push, 영상이미지 권리 확인, 이벤트 #7 con_uid 보정은
전체 수집 파이프라인 진입 전 처리 필요.
```

작업을 완료했습니다
