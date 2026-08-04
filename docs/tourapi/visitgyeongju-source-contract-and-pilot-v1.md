# visitgyeongju Source Contract and Pilot v1

**Task:** TASK-GYEONGJU-VISITGYEONGJU-SOURCE-CONTRACT-AND-PILOT-V1  
**Branch:** data/gyeongju-visitgyeongju-pilot-v1  
**Base:** 44b2c4f (data/gyeongju-reproducibility-finalize-v1)  
**Verified:** 2026-08-04  
**Overall Verdict:** CONDITIONAL_PASS (식당·기념품 파일럿 완료 / 이벤트·테마 HOLD_DYNAMIC_CONTENT / 관광지 NOT_IN_SCOPE)

---

## 1. 소스 개요

| 항목 | 내용 |
|------|------|
| 공식명 | VISIT GYEONGJU |
| 운영사 | 경상북도 경주시 / HICO (경주화백컨벤션뷰로) |
| URL | https://visitgyeongju.or.kr |
| 초점 | 식당·기념품·테마·행사 포털 (관광지·숙박 DB 별도 없음) |
| 언어 | KO · EN · JP · CHS · CHT |

---

## 2. 접근 및 이용 조건

| 항목 | 판정 |
|------|------|
| robots.txt | `COLLECTION_ALLOWED` (User-agent: * Allow: /) |
| 구조화 메타데이터 | `METADATA_ONLY_ALLOWED` |
| 이미지 | `RIGHTS_REVIEW_REQUIRED` (© 2025 All rights reserved) |
| 설명 전문 | `RIGHTS_REVIEW_REQUIRED` |
| 로그인 필요 | 없음 |
| JS 의존도 | SIGNIFICANT — 이벤트·테마 목록은 정적 HTML 접근 불가 |
| 이메일 수집 | 명시적 금지 (정보통신망법) |

이미지와 설명 전문은 공공누리 등 별도 허락 표시가 없으므로 권리 확인 전 저장 금지.  
구조화 메타데이터(ID·URL·주소·전화·운영시간·필터 태그)는 수집 가능 판정.

---

## 3. 5개 언어 URL 구조

| 언어 | prefix | 식당 상세 예시 |
|------|--------|---------------|
| KO | `/kr` | `/kr/cuisine/view/{hexID}` |
| EN | `/`  | `/cuisine/view/{hexID}` |
| JP | `/jp`| `/jp/cuisine/view/{hexID}` |
| CHS | `/zh`| `/zh/cuisine/view/{hexID}` |
| CHT | `/tw`| `/tw/cuisine/view/{hexID}` |

**hexID:** 34자 16진수 문자열 (예: `535f4040060509400a4903494651464c4d`)  
**핵심 발견:** 동일 hexID가 5개 언어 prefix에서 모두 동작. 언어 전환 = prefix 변경만.

### 검증 (향화정)

| 언어 | 이름 | 주소 번역 | 서비스 태그 |
|------|------|----------|------------|
| KO | 향화정 | ✓ | ✓ |
| EN | Hyanghwajeong | ✓ | ✓ |
| JP | ヒャンファジョン | ✓ | ✓ |
| CHS | 乡花亭 | ✓ | ✓ |
| CHT | 鄉花亭 | ✓ | ✓ |

---

## 4. 식당 필터 구조

필터 그룹 6개, 총 옵션 59종:

| 그룹 | 옵션 수 | 타입 |
|------|--------|------|
| 메뉴 | 9 | 다중 선택 카테고리 |
| 지역 | 4 | 다중 선택 카테고리 |
| 분위기 | 8 | 다중 선택 카테고리 |
| 서비스 | 24 | 다중 선택 boolean |
| 트렌딩 | 7 | 다중 선택 카테고리 |
| 이용 목적 (상세 전용) | 7 | 다중 선택 카테고리 |

태스크에서 언급한 "27종"은 서비스 필터 24종의 근사치로 추정.  
서비스 필터 24종 전수 확인 완료. `VALIDATED_MAPPING` 21종, `PROVISIONAL_MAPPING` 12종, `MEANING_REVIEW_REQUIRED` 1종.

### 주의 — 비즈니스 태그

원천에 "비즈니스" 레이블만 있고 정의 없음.  
`business_friendly=true`로 자동 확정 금지 → `MEANING_REVIEW_REQUIRED` 상태 유지.

### 이용 목적 태그 (상세 페이지 전용)

검색 필터 목록에 없고 개별 상세 페이지에만 표시됨:  
가족 · 모임 · 데이트 · 어린이 · 비즈니스 · 회식 · 기념일

수집 시 detail page fetch 필수.

---

## 5. 파일럿 수집 결과

| 콘텐츠 유형 | 목표 | 실제 | 비고 |
|------------|------|------|------|
| 식당 (상세) | 20 | 10 | 필터 다양성 확보 |
| 식당 (목록만) | — | 10 | hexID·제목·권역만 |
| 기념품 | — | 1 (상세) | 포스트카드오피스 |
| 행사 | 10 | 0 | HOLD_DYNAMIC_CONTENT |
| 테마·스토리 | 10 | 0 | HOLD_DYNAMIC_CONTENT |
| 관광지 | 10 | 0 | NOT_IN_SCOPE |

**좌표 수집 불가:** 사이트가 좌표를 직접 제공하지 않음. Naver·Google·Kakao Maps 링크만 제공.

---

## 6. 기존 831개 candidate 연결 결과

파일럿 식당 10건 대상:

| 판정 | 건수 |
|------|------|
| HIGH_CONFIDENCE | 5 |
| MANUAL_REVIEW | 1 |
| NO_MATCH | 4 |
| 합계 | 10 |

**HIGH_CONFIDENCE 매칭 예:**
- 향화정 → GJ08-7128 (이름+주소 완전 일치)
- 맷돌순두부 → KTO39-403847 (이름+주소 완전 일치)
- 진수성찬 → KTO39-2736679 (이름+주소 완전 일치)
- 교동쌈밥경주 → KTO39-2762860 (주소 완전 일치, 이름 "경주" 접미어 차이)
- 페이지나인 → GJ09-15 (이름+주소 완전 일치)

**MANUAL_REVIEW:**
- 요석궁식당 ↔ GJ08-7510 "요석궁1779" (동일 주소, 이름 불일치)

기존 candidate 수정: **0건**.

---

## 7. 전체 수집 가능성

| 항목 | 판정 |
|------|------|
| 전체 수집 | `READY_WITH_LIMITATIONS` |
| 식당·기념품 정적 수집 | 가능 |
| 이벤트·테마 | HOLD (headless browser 필요) |
| 이미지·설명 전문 | RIGHTS_HOLD (권리 확인 필요) |
| 관광지 | NOT_IN_SCOPE |
| 좌표 | 간접 추출 방안 필요 |

---

## 8. 발견 결함 및 위험

1. **좌표 미제공** — 지도 링크만 있어 직접 좌표 수집 불가
2. **이벤트·테마 JS 렌더링** — headless browser 없이 목록 ID 수집 불가
3. **이미지·설명 저작권** — © All rights reserved, 공공누리 표시 없음
4. **비즈니스 태그 의미 불명** — 추가 확인 필요
5. **최신성 보장 미확인** — 증분 갱신 방식 미검증

---

## 9. 산출물

| # | 파일 |
|---|------|
| 1 | `data/tourapi/contracts/gyeongju/visitgyeongju-source-contract-v1.json` |
| 2 | `data/tourapi/contracts/gyeongju/visitgyeongju-multilingual-contract-v1.json` |
| 3 | `data/tourapi/contracts/gyeongju/visitgyeongju-restaurant-attribute-mapping-v1.json` |
| 4 | `data/tourapi/pilot/gyeongju/visitgyeongju/visitgyeongju-pilot-records-v1.jsonl` |
| 5 | `data/tourapi/validation/gyeongju/visitgyeongju/visitgyeongju-language-link-audit-v1.jsonl` |
| 6 | `data/tourapi/validation/gyeongju/visitgyeongju/visitgyeongju-candidate-link-audit-v1.jsonl` |
| 7 | `data/tourapi/validation/gyeongju/visitgyeongju/visitgyeongju-filter-audit-v1.json` |
| 8 | `data/tourapi/reports/gyeongju/visitgyeongju-pilot-summary-v1.json` |
| 9 | `docs/tourapi/visitgyeongju-source-contract-and-pilot-v1.md` (this file) |
