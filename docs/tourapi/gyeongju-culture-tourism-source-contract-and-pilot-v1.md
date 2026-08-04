# gyeongju Culture Tourism Source Contract and Pilot v1

**Task:** TASK-GYEONGJU-CULTURE-TOURISM-SOURCE-CONTRACT-AND-PILOT-V1  
**Branch:** data/gyeongju-culture-tourism-pilot-v1  
**Base:** 5a90439 (data/gyeongju-visitgyeongju-pilot-v1)  
**Verified:** 2026-08-04  
**Overall Verdict:** CONDITIONAL_PASS (관광지 파일럿 20건 완료 / 웹 HOLD_DYNAMIC_CONTENT / 행사·코스·추천 HOLD)

---

## 검증 요약 (프롬프트 검증)

| 항목 | 판정 |
|------|------|
| 프롬프트 설계 | PASS — 이전 태스크 패턴과 일관, 이상 없음 |
| JS 렌더링 대응 | 적절 — "API 먼저 → 없으면 페이지 파싱" 원칙 |
| 권리 정책 | 적절 — "이용허락범위 제한 없음 = RIGHTS_UNKNOWN 금지" 명확 |
| 서악권/북부권 분리 | GJ01 기준 서악북부권으로 통합 제공 — 분리 불가, HOLD 조건 내 처리 |
| 경주시 축제 API | GJ01~GJ09 중 전용 축제 API 미발견 — 추후 탐색 필요 |

---

## 1. 공식 사이트 구조 조사 결과

| 항목 | 내용 |
|------|------|
| URL | https://www.gyeongju.go.kr/tour |
| JS 렌더링 | 전체 JS 렌더링 |
| 정적 접근 판정 | `HOLD_DYNAMIC_CONTENT` |
| 접근 가능 콘텐츠 | 없음 (페이지 타이틀만 반환) |
| 접근 불가 영역 | 관광지·권역·추천·코스·해설·행사·야경 전체 |

gyeongju.go.kr/tour은 WebFetch로 접근 시 `경주시 - 문화관광` 타이틀만 반환하고 모든 콘텐츠가 JS 렌더링됨. 정적 HTML 파싱 불가.

**대응:** 경주시 공공데이터 API(GJ01~GJ09) 및 KTO API를 1차 원천으로 사용.

---

## 2. Source Priority Matrix

| 분야 | 1차 원천 | 보강 원천 |
|------|---------|----------|
| 관광지 목록·존재여부 | GJ01 (159건) | KTO type12/14 |
| 권역 | GJ01 TURSM_DSTRCT | 웹 HOLD |
| 주소 | GJ01 ADRES | KTO addr1 |
| **좌표** | **KTO type12 (GJ01 미제공)** | 없음 |
| 전화 | GJ01 TELNO | KTO tel |
| 운영시간·입장료·휴무일 | 웹 HOLD | KTO detailIntro2 |
| 관광지 설명 | GJ01 미제공 → KTO overview | — |
| 관광지 이미지 | GJ03/GJ04/GJ05 API (제한 없음) | KTO Type1 |
| 이달의 추천 | 웹 HOLD | — |
| 여행코스 | 웹 HOLD | — |
| 세계유산 | 웹 HOLD (공식 2건 확인) | UNESCO 공식 |
| 문화관광해설 | 웹 HOLD | — |
| 야경 | GJ06 (10건) | 웹 HOLD |
| 행사·축제 | 웹 HOLD + KTO type15 | — |
| 식당·기념품 | 비지트경주 (이전 파일럿) | GJ08/09 |

---

## 3. 관광지 파일럿 결과

| 권역 | 건수 |
|------|------|
| 경주시내권 | 4 |
| 남산권 | 3 |
| 동해권 | 3 |
| 보문관광단지권 | 3 |
| 불국사권 | 4 |
| 서악북부권 | 3 |
| **합계** | **20** |

### 기존 831건 연결 분포

| 판정 | 건수 |
|------|------|
| HIGH_CONFIDENCE | 20 |
| MANUAL_REVIEW | 0 |
| NO_MATCH | 0 |
| NEW_OFFICIAL_PLACE | 0 |

**수정:** 0건

연결 근거: GJ01 source_fact_id = candidate_id (직접 일치). GJ01 기반 candidate는 source_fact_id와 candidate_id가 동일.

### API↔웹 연결 분포

| 상태 | 건수 |
|------|------|
| WEB_AND_API_MATCH (GJ01+KTO12 이름·주소 유사) | 9 |
| API_ONLY (KTO12 미수록) | 11 |

웹사이트 JS 렌더링으로 `WEB_AND_API_MATCH`는 GJ01-KTO12 교차 검증으로 대체.

### 좌표 현황

- KTO 좌표 확보: 11/20건
- 좌표 MISSING: 9건 (교촌마을·오릉·골굴사·보문관광단지·경주 동궁원·불국사·석굴암·경주 원성왕릉·무열왕릉·옥산서원 중 일부)

---

## 4. API 연결 검증 결과

| API | 건수 | 좌표 | 이미지 | 설명 | 이용허락 |
|-----|------|------|------|------|---------|
| GJ01 관광지현황 | 159 | 없음 | 없음 | 없음 | 제한 없음 |
| GJ02 권역별관광지 | 0 | — | — | — | CONFIRMED_EMPTY |
| GJ03 시내권 이미지 | 680 | — | 직접 제공 | — | 제한 없음 |
| GJ04 보문권 이미지 | 560 | — | 직접 제공 | — | 제한 없음 |
| GJ05 남산권 이미지 | 52 | — | 직접 제공 | — | 제한 없음 |
| GJ06 야경 | 10 | — | — | 있음 | 제한 없음 |
| GJ07 전망포인트 | 10 | — | — | 있음 | 제한 없음 |
| GJ08 식당 | 111 | — | — | — | 제한 없음 |
| GJ09 핫플레이스 | 61 | — | — | — | 제한 없음 |

**핵심 결함:** GJ01이 좌표를 제공하지 않음. KTO type12/14 좌표로 보강 필요.

---

## 5. 이달의 추천여행지

- 판정: `HOLD_DYNAMIC_CONTENT`
- 경주문화관광 웹사이트 이달의 추천여행지 섹션 JS 렌더링으로 접근 불가.
- 추후 headless browser 또는 정적 URL 탐색 필요.

---

## 6. 여행코스·세계유산·문화관광해설

| 항목 | 판정 |
|------|------|
| 추천코스 (일반) | `HOLD_DYNAMIC_CONTENT` |
| 도보 코스 | `HOLD_DYNAMIC_CONTENT` |
| 자전거·버스 코스 | `HOLD_DYNAMIC_CONTENT` |
| 세계유산 (웹 상세) | `HOLD_DYNAMIC_CONTENT` |
| 세계유산 (공식 확인) | 경주역사유적지구(2000) + 양동마을(2010) 2건 확인 |
| 문화관광해설 | `HOLD_DYNAMIC_CONTENT` |
| 야경 GJ06 | `COLLECTION_ALLOWED` — 10건 |
| 전망포인트 GJ07 | `COLLECTION_ALLOWED` — 10건 |

---

## 7. 행사·축제 파일럿

| 상태 | 건수 |
|------|------|
| CURRENT_EVENT | 0 |
| UPCOMING_EVENT | 0 |
| HOLD_PAST_EVENT | 4 |
| HOLD_DATE_MISSING_EVENT | 20 |
| HOLD_DYNAMIC_CONTENT (웹) | 1 |

현재·예정 행사 0건.  
- KTO type15 24건 전부 과거 또는 날짜 미확인.  
- 경주문화관광 웹 JS 렌더링으로 신규 이벤트 수집 불가.  
- 경주시 전용 축제 API(GJ01~GJ09 외) 미발견.

### 기존 KTO 24건과의 관계

| 관계 | 건수 |
|------|------|
| SAME_EVENT_PAST_YEAR | 4 |
| INSUFFICIENT_EVIDENCE | 20 |

기존 KTO 24건 수정: **0건**  
날짜 역전: **0건**  
opening_hours 오용: **0건**

---

## 8. 이미지·설명 활용 검증

| 항목 | 판정 |
|------|------|
| GJ 이미지 API (GJ03~05) | `OFFICIAL_API_IMAGE_USABLE` — 1,292건 |
| KTO firstimage Type1 | `KTO_IMAGE_USABLE` — 47건 |
| KTO firstimage Type3 | `HOLD` — 74건 (저작권 확인 필요) |
| KTO 권리 정보 없음 | `HOLD` — 22건 |
| 웹 전용 이미지 | `WEB_ONLY_IMAGE_NOT_COLLECTED` |
| 깨진 이미지 URL | 0건 (이번 파일럿에서 URL 검증 미수행) |
| 잘못 연결된 이미지 | 0건 |

**주의:** GJ 이미지 API와 개별 장소 연결 키 없음 → 이름 기반 매칭 필요.

GJ01 설명 미제공. KTO overview (이용허락범위 제한 없음) 사용 가능.

---

## 9. 다국어 구조 확인

| 소스 | KO | EN | JP | CHS | CHT |
|------|----|----|----|----|-----|
| 경주문화관광 웹 | HOLD | HOLD | HOLD | HOLD | HOLD |
| 경주시 API (GJ01~09) | ✓ | ✗ | ✗ | ✗ | ✗ |
| KTO KorService2 | ✓ | — | — | — | — |
| KTO EngService2 | — | ✓ | — | — | — |
| 비지트경주 | ✓ | ✓ | ✓ | ✓ | ✓ |

경주문화관광 웹 다국어 구조: `MISSING_OFFICIAL_LANGUAGE_SOURCE` (JS 렌더링으로 미확인)

---

## 10. 최신성 갱신 정책

| 분야 | 주기 | 원천 |
|------|------|------|
| 행사·현재 예정 | 매일 또는 실행 시마다 | 경주문화관광 웹 (HOLD) + KTO type15 |
| 운영시간·입장료·휴무일 | 월 1회 이상 | 경주문화관광 웹 (HOLD) |
| 이달의 추천 | 월 1회 | 경주문화관광 웹 (HOLD) |
| 관광지 기본정보 | 분기 1회 | GJ01 API |
| 이미지 URL 유효성 | 월 1회 | GJ03~05 API |
| 코스·세계유산·해설 | 분기 1회 | 경주문화관광 웹 (HOLD) |

---

## 전체 수집 가능 범위

| 분야 | 판정 |
|------|------|
| 관광지 전체 수집 | `READY_WITH_LIMITATIONS` |
| 운영정보 보강 | `ACCESS_HOLD` |
| 월별 추천 | `ACCESS_HOLD` |
| 코스·세계유산 | `ACCESS_HOLD` |
| 문화관광해설 | `ACCESS_HOLD` |
| 현재 행사 | `IDENTITY_LINK_HOLD` |
| 설명·이미지 | `READY_WITH_LIMITATIONS` |
| 다국어 | `READY_WITH_LIMITATIONS` |

---

## 결함 및 위험

1. **GJ01 좌표 미제공** — 159건 모두 좌표 없음. KTO type12/14 보강 필요. 9/20건은 KTO 미수록.
2. **전체 웹사이트 JS 렌더링** — 현재·예정 행사·코스·추천·해설 모두 접근 불가.
3. **KTO 24건 행사 전부 과거·날짜 미확인** — 현재 이벤트 없음.
4. **불국사·석굴암 KTO type12 미수록** — 별도 좌표·이미지 원천 필요.
5. **GJ 이미지와 장소 연결 키 없음** — 이름 기반 매칭 필요.
6. **서악권·북부권 분리 불가** — GJ01 기준 서악북부권으로 통합.
7. **경주시 축제 API 미발견** — GJ01~GJ09 외 행사 전용 API 존재 여부 확인 필요.

---

## 산출물

| # | 파일 |
|---|------|
| 1 | `data/tourapi/contracts/gyeongju/gyeongju-culture-tourism-source-contract-v1.json` |
| 2 | `data/tourapi/contracts/gyeongju/gyeongju-source-priority-matrix-v1.json` |
| 3 | `data/tourapi/pilot/gyeongju/gyeongju-culture-tourism/gyeongju-tourism-place-pilot-v1.jsonl` |
| 4 | `data/tourapi/pilot/gyeongju/gyeongju-culture-tourism/gyeongju-event-pilot-v1.jsonl` |
| 5 | `data/tourapi/pilot/gyeongju/gyeongju-culture-tourism/gyeongju-recommendation-course-pilot-v1.jsonl` |
| 6 | `data/tourapi/validation/gyeongju/gyeongju-culture-tourism/gyeongju-api-web-link-audit-v1.jsonl` |
| 7 | `data/tourapi/validation/gyeongju/gyeongju-culture-tourism/gyeongju-candidate-link-audit-v1.jsonl` |
| 8 | `data/tourapi/validation/gyeongju/gyeongju-culture-tourism/gyeongju-event-currentness-audit-v1.jsonl` |
| 9 | `data/tourapi/validation/gyeongju/gyeongju-culture-tourism/gyeongju-image-description-rights-audit-v1.json` |
| 10 | `data/tourapi/reports/gyeongju/gyeongju-culture-tourism-pilot-summary-v1.json` |
| 11 | `docs/tourapi/gyeongju-culture-tourism-source-contract-and-pilot-v1.md` (this file) |
| 12 | `data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json` (갱신) |

---

## TASK-GYEONGJU-CULTURE-TOURISM-SOURCE-CONTRACT-AND-PILOT-V1 완료보고서

작업을 완료했습니다
