# gyeongju Culture Tourism Source Contract and Pilot — Correction v1

**Task:** TASK-GYEONGJU-CULTURE-TOURISM-PILOT-CORRECTION-V1  
**Branch:** data/gyeongju-culture-tourism-pilot-correction-v1  
**Base:** data/gyeongju-culture-tourism-pilot-v1 (HEAD 24aaea6)  
**Verified:** 2026-08-04  
**Overall Verdict:** PASS — v1 HOLD 판정 오류 수정 완료. 행사 7건·추천여행지 12건·코스 5개 실데이터 수집.

---

## 수정 배경

v1(TASK-GYEONGJU-CULTURE-TOURISM-SOURCE-CONTRACT-AND-PILOT-V1)에서 `gyeongju.go.kr/tour`를 `FULL_JS_RENDERING → HOLD_DYNAMIC_CONTENT`로 판정한 것은 메인 인덱스 URL만 확인했기 때문이다. 실제로 하위 페이지(`/tour/page.do?mnu_uid=XXXX`)는 정적 HTML을 반환하며 WebFetch로 파싱 가능하다.

---

## 1. 재검증 결과: URL 패턴별 접근 판정

| URL 패턴 | 예시 mnu_uid | v1 판정 | v2 판정 |
|---------|-------------|---------|---------|
| `/tour/index.do` | — | HOLD | HOLD (SPA 셸) |
| `/tour/page.do?mnu_uid=2393&initYear=2026&initMonth=8` | 이달의 행사 | HOLD | **STATIC_HTML** |
| `/tour/page.do?mnu_uid=4185` | 이달의 추천여행지 2026 | HOLD | **STATIC_HTML** |
| `/tour/page.do?mnu_uid=2266` | 권역별 관광지 메인 | HOLD | **STATIC_HTML** |
| `/tour/page.do?mnu_uid=2292&code_uid=1012` | 시내권 관광지 | HOLD | **STATIC_HTML** |
| `/tour/page.do?mnu_uid=2297` | 핵심 여행코스 | HOLD | **STATIC_HTML** |
| `/tour/page.do?mnu_uid=2298` | 문화예술 코스 | HOLD | **STATIC_HTML** |
| `/tour/page.do?mnu_uid=2299` | 야경 도보 코스 | HOLD | **STATIC_HTML** |
| `/tour/page.do?mnu_uid=2300` | 자전거 코스 | HOLD | **STATIC_HTML** |
| `/tour/page.do?mnu_uid=2301` | 버스 코스 | HOLD | **STATIC_HTML** |
| `/tour/page.do?mnu_uid=2262` | 문화관광해설신청 | HOLD | **STATIC_HTML** |

**robots.txt 수정:**  
- v1: `UNVERIFIED_DUE_TO_JS_RENDERING`  
- v2: `COLLECTION_ALLOWED` — `https://www.gyeongju.go.kr/robots.txt`: `User-agent: * Allow: /`

---

## 2. 행사 파일럿 수정 (v1→v2)

### v1 결과 (오류)
- KTO type15 24건 전부 과거 또는 날짜 미확인
- 경주문화관광 웹 JS 렌더링으로 신규 이벤트 수집 불가 → **현재·예정 행사 0건**

### v2 결과 (수정)
웹사이트 `mnu_uid=2393` (이달의 축제 및 행사) 정적 HTML 접근 확인. 실제 데이터:

| # | 이름 | 유형 | 기간 | 장소 | 상태 |
|---|------|------|------|------|------|
| 1 | 2026 한수원아트페스티벌 특별전 <한국 미술, 조선 후기부터 현대까지> | 전시 | 2026-06-30 ~ 10-18 | 경주예술의전당 알천미술관 갤러리해 (4F) | CURRENT |
| 2 | 경주문화관1918 특별전시 <어린왕자 인 경주> | 전시 | 2026-07-15 ~ 09-30 | 경주문화관 1918 (구 경주역) | CURRENT |
| 3 | [2026 공유] 안준모 <BLUE GIANT> | 전시 | 2026-07-28 ~ 08-09 | 경주예술의전당 알천미술관 갤러리스달 (B1) | CURRENT |
| 4 | <2026 공연예술 관람료 지원 사업> 경주예술의전당 공연 안내 | 공연 | 2026-07-31 ~ 08-29 | 경주예술의전당 화랑홀·원화홀 | CURRENT |
| 5 | 2026 봉황대뮤직스퀘어 8월 | 공연 | 2026-08-14 ~ 08-28 | 경주 봉황대광장 특설무대 | UPCOMING |
| 6 | 한국수력원자력 문화가 있는 날 <썸머나이트 지누션&디바> | 공연 | 2026-08-26 | 경주예술의전당 화랑홀 | UPCOMING |
| 7 | 한수원과 함께하는 문화가 있는 날 <2026 퀸엘리자베스 콩쿠르 위너스 콘서트 in 경주> | 공연 | 2026-09-13 | 경주예술의전당 화랑홀 | UPCOMING |

**KTO 24건 수정: 0건** (신규 이벤트와 KTO 24건은 별개. KTO는 연례 축제 날짜 미확인, 웹은 2026 실제 전시·공연)

---

## 3. 이달의 추천여행지 수정 (신규 수집)

- v1: `HOLD_DYNAMIC_CONTENT` (0건)
- v2: 12건 수집 (`mnu_uid=4185`, 2026년 8월 "8월 경주, 푸름에 머물다")

| 카테고리 | 건수 | 대표 항목 |
|---------|------|---------|
| 항구·해안 | 2 | 나정항, 수렴항 |
| 숲 속 피서 | 2 | 기림사–용연폭포, 건천 편백숲내음길 |
| 여름 미술관 | 3 | 우양미술관, 알천미술관, 경주문화관 1918 |
| 특별 이벤트 | 1 | 2026 EX HORROR: 신라 X 좀비 |
| 공방 체험 | 2 | 왓츠녹, 스튜디오 소온 |
| 로컬 카페 | 2 | 스윗문, 프로즌 브라이드 |
| **합계** | **12** | |

---

## 4. 여행코스 수정 (신규 수집)

- v1: 4종 모두 `HOLD_DYNAMIC_CONTENT`
- v2: 5개 코스 전부 수집

| 코스명 | mnu_uid | 유형 | 주요 정보 |
|--------|---------|------|---------|
| 경주 시내권 핵심 바이블 | 2297 | 도보/자동차 | 7개소, 당일~1박 2일 |
| 예인의 도시 경주 미술·문학기행 | 2298 | 자동차 | 6개소, 건천~불국사권 장거리 |
| 달빛테라피 경주야경산책 | 2299 | 도보 | 7개소, 4.75km |
| 삼릉가는 길 (두바퀴로 누비는 경주) | 2300 | 자전거 | 7개소, 12km |
| 10번 버스타GO 알짜배기 경주여행 | 2301 | 버스 | 8개소, 버스 10번 |

---

## 5. 신규 발견: 경주관광영상이미지 다운로드 시스템

- **URL:** https://www.gyeongju.go.kr/gyeongjuimage/index.do  
- **운영:** 경주시 관광컨벤션과 (054-779-6832)  
- **내용:** 경주 권역별·축제별·문화재별 이미지/동영상 무료 다운로드  
- **판정:** `RIGHTS_REVIEW_REQUIRED` — 무료 다운로드 명시이나 공공누리 등 이용허락 조건 별도 확인 필요

---

## 6. v1에서 변경 없는 항목

| 항목 | 유지 이유 |
|------|---------|
| 관광지 파일럿 20건 | GJ01 API 기반. 웹 재수집 범위 외 |
| 831건 candidate 연결 결과 | 수정 필요 근거 없음 |
| KTO 24건 이벤트 | 과거/날짜미확인 판정 유지. 수정 불가 데이터 |
| GJ01 좌표 미제공 결함 | 미해결 — 후속 태스크 필요 |
| KTO Type3 이미지 HOLD | 미해결 |

---

## 7. 산출물

| # | 파일 |
|---|------|
| 1 | `data/tourapi/contracts/gyeongju/gyeongju-culture-tourism-source-contract-v2.json` |
| 2 | `data/tourapi/pilot/gyeongju/gyeongju-culture-tourism/gyeongju-event-pilot-v2.jsonl` |
| 3 | `data/tourapi/pilot/gyeongju/gyeongju-culture-tourism/gyeongju-recommendation-pilot-v1.jsonl` |
| 4 | `data/tourapi/pilot/gyeongju/gyeongju-culture-tourism/gyeongju-course-pilot-v1.jsonl` |
| 5 | `data/tourapi/validation/gyeongju/gyeongju-culture-tourism/gyeongju-event-currentness-audit-v2.jsonl` |
| 6 | `data/tourapi/reports/gyeongju/gyeongju-culture-tourism-pilot-correction-summary-v1.json` |
| 7 | `docs/tourapi/gyeongju-culture-tourism-source-contract-and-pilot-correction-v1.md` (this file) |

---

## TASK-GYEONGJU-CULTURE-TOURISM-PILOT-CORRECTION-V1 완료보고서

작업을 완료했습니다
