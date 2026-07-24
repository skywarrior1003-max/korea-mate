# 부산 데이터 파이프라인 최종 인수인계 문서

**작성일:** 2026-07-24  
**태스크:** TASK-DATA-BUSAN-FINAL-PACKAGE-11  
**상태:** PASS ✓

---

## 1. 개요

부산 도시 데이터 수집·정제·통합 파이프라인(TASK-01~10)이 완료됐습니다.  
이 문서는 메인 노트북이 추가 조사 없이 검증·선별·DB 반영 여부를 판단할 수 있도록 구성됩니다.

**핵심 숫자 요약**

| 항목 | 건수 |
|---|---|
| 전체 후보 (통합 파일) | **1,767건** |
| 활성 운영 후보 | **1,663건** |
| 수동 검토 필요 | 14건 |
| 병합 대기 | 12건 |
| 미확정 핵심 | 1건 (busan-VB-1859) |

---

## 2. 최종 후보 현황

### 2-1. 상태별 건수

| candidate_status | 건수 | 설명 |
|---|---|---|
| `existing_enriched` | 362 | canonical 기존 항목 + VB 보강 데이터 |
| `api_only_existing` | 990 | canonical 기존 항목 (VB 매칭 없음) |
| `web_only_new` | 311 | VB 신규 후보 (category 확정) |
| `course_reference` | 49 | VB 코스 구성 참조 (독립 spot 아님) |
| `reference_only` | 21 | 참조 전용 (이동형 투어·이벤트) |
| `merge_existing` | 12 | 기존 canonical에 VB 보강 필드 병합 대기 |
| `excluded` | 8 | 비장소 제외 (앱·웹 서비스·순수 콘텐츠) |
| `manual_review` | 14 | 수동 확인 필요 |
| **합계** | **1,767** | |

### 2-2. 활성 운영 후보 구성

```
활성 합계 1,663 =
  existing_enriched 362  (VB 보강 포함, 즉시 DB 업데이트 후보)
+ api_only_existing 990  (현 DB 내용 유지)
+ web_only_new      311  (신규 삽입 승인 대기)
```

> `web_only_new` 311건 내부:  
> - category_confirmed (TASK-07/08/09 검토 완료): 131건  
> - direct VB 매핑 (기존 비-unknown_allowed): 180건

---

## 3. 운영 반영 가이드

### 3-1. 즉시 적용 가능

| 대상 | 조건 | 적용 방식 |
|---|---|---|
| `existing_enriched` 362건 | hours·phone·external_url 보강 | 필드별 provenance 보존. 제목·좌표·카테고리 자동 덮어쓰기 금지 |
| `api_only_existing` 990건 | 변경 없음 | 현재 DB 내용 유지 |

### 3-2. 승인 후 적용

| 대상 | 조건 | 승인 요건 |
|---|---|---|
| `web_only_new` 311건 | 신규 city_spots 삽입 | 수동 검토 후 개별 승인. 자동 운영 승인 금지 |
| `merge_existing` 12건 | canonical에 VB 보강 연결 | 보강 필드(hours·phone·source_url)만 추가. 원본 덮어쓰기 금지 |

### 3-3. 운영 제외

| 대상 | 이유 |
|---|---|
| `course_reference` 49건 | VB 코스 묶음 참조용. 독립 city_spot 아님 |
| `reference_only` 21건 | 이동형 투어·생태 코스 프로그램. 고정 주소 없음 |
| `excluded` 8건 | 비장소 (앱·웹·순수 홍보 콘텐츠) |

---

## 4. 갱신 모드 및 실행 방법

향후 정기 업데이트는 3가지 모드로 운영합니다.

### 4-1. `update` 모드 (기본 갱신)
```bash
# 향후 구현 예정
node scripts/tourapi-busan-update.mjs --mode=update
```
- **범위:** existing_enriched 362건 + api_only_existing 990건
- **동작:** VB 원천 변경 감지, hours·phone·address·공식 URL 변경 탐지
- **자동 적용:** hours, phone (낮은 위험)
- **수동 확인:** 제목·좌표·카테고리 충돌
- **주기:** 주 1회 또는 VB 업데이트 감지 시

### 4-2. `discover` 모드 (신규 발굴)
```bash
# 향후 구현 예정
node scripts/tourapi-busan-update.mjs --mode=discover
```
- **범위:** 기존 미매칭 VB 콘텐츠, 신규 등록 항목
- **동작:** 신규 후보 탐지만 수행, 기존 항목 변경 없음
- **자동 적용:** 없음 (운영 승인 없이 자동 삽입 금지)
- **주기:** 신규 VB 콘텐츠 감지 시

### 4-3. `full` 모드 (전체 재점검)
```bash
# 향후 구현 예정
node scripts/tourapi-busan-update.mjs --mode=full
```
- **범위:** 1,767건 전체
- **동작:** 전체 후보 상태 재검토 + 신규 발굴
- **자동 적용:** 없음 (전체 수동 승인)
- **주기:** 분기 1회 또는 대규모 VB 재수집 시

### 4-4. 원천 소실 정책
```
원천 항목 소실 감지 →
  1회차: candidate_status = source_missing (소실 표시, 삭제 금지)
  2회차: manual_review 대상 이동
  수동 승인 후: 삭제 가능
```

---

## 5. 주요 파일 목록

### 5-1. 핵심 산출물

| 역할 | 경로 |
|---|---|
| 통합 후보 (CSV) | `data/tourapi/candidates/busan/busan-integrated-candidates.csv` |
| 통합 후보 (JSON) | `data/tourapi/candidates/busan/busan-integrated-candidates.json` |
| 수동 검토 목록 | `data/tourapi/candidates/busan/busan-integrated-manual-review.csv` |
| unknown category 검토 | `data/tourapi/candidates/busan/busan-unknown-category-review.csv` |
| 중복·수동 판정 | `data/tourapi/candidates/busan/busan-duplicate-manual-resolution.csv` |
| 최종 지표 요약 | `data/tourapi/reports/busan/busan-final-metrics.json` |
| 태스크별 지표 | `data/tourapi/reports/busan/busan-integrated-candidates-metrics.json` |
| 본 인수인계 문서 | `docs/tourapi/busan-final-handoff-11.md` |

### 5-2. 파이프라인 스크립트

| 태스크 | 스크립트 | 역할 |
|---|---|---|
| TASK-03 | `tourapi-busan-visitbusan-discovery-03.mjs` | VisitBusan 콘텐츠 수집 |
| TASK-05 | `tourapi-busan-visitbusan-match-05.mjs` | VB ↔ canonical 매칭 |
| TASK-06 | `tourapi-busan-integrated-candidates-06.mjs` | 통합 후보 생성 (1,767건) |
| TASK-07 | `tourapi-busan-unknown-category-review-07.mjs` | unknown category 173건 분류 |
| TASK-08 | `tourapi-busan-duplicate-manual-resolution-08.mjs` | 중복·수동검토 31건 판정 |
| TASK-10 | `tourapi-busan-integrated-candidates-finalize-10.mjs` | 통합 후보 최종 정리 |

---

## 6. manual_review 14건 목록

수동 확인이 필요한 항목입니다. 운영 DB 반영 전 개별 검토 후 상태를 결정해야 합니다.

### canonical 수동 검토 (4건)

| candidate_id | title_ko | category | 검토 사유 |
|---|---|---|---|
| busan-A-00105 | 송도용궁구름다리(한,영, 중간, 중번) | attraction | canonical_manual_review 상태 |
| busan-E-00028 | 부산푸드필름페스타(한, 영) | event | canonical_manual_review 상태 |
| busan-E-00032 | 별바다부산 나이트페스타(한)//영,중간,중번,일 | event | canonical_manual_review 상태 |
| **busan-K-00081** | **롯데호텔 부산** | **unknown** | **⚠ category=unknown 긴급 확인 필요** |

> busan-K-00081은 `category=unknown`으로 미분류 상태. accommodation으로 확정 예상이나 수동 확인 후 반영 필요.

### VBM 수동 검토 (9건) — geo-near 매칭

| candidate_id | title_ko | category | 유사도 | 검토 사유 |
|---|---|---|---|---|
| busan-VBM-1796 | 목련꽃 가득 안은 성암사 … | attraction | 0.818 | geo-near 매칭, 수동 canonical 확인 |
| busan-VBM-1322 | 복합문화공간 현대 모터스튜디오 부산 | attraction | 0.600 | geo-near 매칭 |
| busan-VBM-367  | 부산영화체험박물관 feat.씨네뮤지엄 | attraction | 0.667 | geo-near 매칭 |
| busan-VBM-346  | 신명천지 국립부산국악원 | attraction | 0.600 | geo-near 매칭 |
| busan-VBM-308  | 네 꿈을 펼쳐라! 부산시청자미디어센터 | attraction | 0.600 | geo-near 매칭 |
| busan-VBM-1523 | 삼락하동재첩국 | restaurant | 0.667 | geo-near + food 판별 필요 |
| busan-VBM-1516 | 부광돼지국밥 | restaurant | 0.625 | geo-near + food 판별 필요 |
| busan-VBM-2131 | 삼진어묵 | attraction | 0.600 | geo-near + food 판별 필요 |
| busan-VBM-1640 | 부산영화체험박물관 | attraction | 0.615 | 좌표 충돌(4m 차이) |

> VBM 항목은 유사도 0.6 경계값 인근으로, canonical과 동일 장소인지 별도 공간인지 수동 판단 필요.

### 미확정 (1건)

| candidate_id | title_ko | 사유 |
|---|---|---|
| busan-VB-1859 | K-POP 스타랑 동문 된 썰 푼다 | 공식 URL(sdkart.modoo.at) 2025-06-26 서비스 종료. 현장 방문 또는 대체 URL 확보 필요. |

---

## 7. merge_existing 12건 — 병합 대상 목록

아래 VB 항목의 보강 필드(hours·phone·source_url)를 canonical 대상에 연결합니다.  
**canonical 데이터 덮어쓰기 금지. 보강 필드 추가만 허용.**

| candidate_id | VB 콘텐츠 내용 | merge_target_id | 대상 유형 | 보강 필드 |
|---|---|---|---|---|
| busan-VB-399  | 국제시장 | busan-K-00058 | canonical | hours, phone, source_detail_url |
| busan-VB-412  | 자갈치시장 | busan-K-00057 | canonical | hours, phone, source_detail_url |
| busan-VB-400  | 부평깡통시장 | busan-K-00176 | canonical | hours, phone, source_detail_url |
| busan-VB-363  | 구포시장 | busan-K-00148 | canonical | hours, phone, source_detail_url |
| busan-VB-327  | 부전마켓타운 | busan-K-00055 | canonical | hours, phone, source_detail_url |
| busan-VB-300  | 남항시장 & 봉래시장 | busan-K-00190 | canonical | hours, phone, source_detail_url, address(봉래시장 추가) |
| busan-VB-1870 | 부산자원순환협력센터 | busan-K-00350 | canonical | hours, phone, source_detail_url |
| busan-VB-1858 | 파라다이스 호텔 부산 | busan-K-00078 | canonical | hours, phone, external_official_url, source_detail_url |
| busan-VB-1177 | 캐비네 드 쁘아송(아난티코브 내) | busan-K-00224 | canonical | source_detail_url |
| busan-VB-990  | 낙동강생태탐방선(자전거 추가) | busan-VB-336 | vb_candidate | source_detail_url (자전거 프로그램 추가) |
| busan-VB-481  | 쿠킹클래스(VB 중복) | busan-VB-518 | vb_candidate | source_detail_url |
| busan-VB-542  | 다누비열차 | busan-A-00004 | canonical | source_detail_url |

---

## 8. 태스크 01~10 핵심 결과 요약

| 태스크 | 내용 | 결과 |
|---|---|---|
| TASK-01~02 | TourAPI 부산 데이터 수집 + 파일럿 검증 | canonical 1,356건 확정 |
| TASK-03 | VisitBusan 웹 스크래핑 콘텐츠 수집 | web_only 411건 수집 (코스 포함) |
| TASK-04 | VisitBusan 콘텐츠 패치 · 언어 보완 | 한국어 필드 보강 |
| TASK-05 | VB ↔ canonical 지오·텍스트 매칭 | existing_enriched 362건 매칭 |
| TASK-06 | 통합 후보 생성 | 1,767건 CSV/JSON 생성 |
| TASK-07 | unknown category 173건 분류 | 116 ready / 19 dup / 18 ref / 12 manual / 8 excl |
| TASK-08 | 중복·수동검토 31건 판정 | merge 9 / ready 12 / ref 2 / unresolved 8 |
| TASK-09 (REVIEW-09) | 미확정 8건 최종 검토 | merge+3 / ready+3 / ref+1 / unresolved 1건 남음 |
| TASK-10 | unknown_allowed 173건 통합 후보 반영 | 173건 상태 확정, 1,663건 활성 운영 후보 확정 |
| TASK-11 | 최종 패키지 작성 | 본 문서 |

---

## 9. 이미지 관련 기록

| 항목 | 상태 |
|---|---|
| VisitBusan 이미지 | **미수집** — Vue.js 동적 로딩, 정적 HTML에서 추출 불가 |
| TourAPI/KTO 이미지 | existing_enriched 362건에 URL 보유 (image_url 필드) |
| 이미지 없는 항목 | placeholder 처리 (운영 반영 시 `image_url = null` 허용) |
| 후속 과제 | **Playwright 기반 VB 이미지 수집** — 별도 태스크로 기록 |

---

## 10. 기술적 한계 및 후속 과제

### 현재 한계

| 한계 | 영향 | 권장 조치 |
|---|---|---|
| VisitBusan 이미지 미수집 | web_only_new 311건 이미지 없음 | Playwright 수집 태스크 별도 추진 |
| busan-K-00081 category=unknown | 롯데호텔 부산 미분류 | 즉시 수동 확인 → accommodation 확정 |
| busan-VB-1859 미확정 | K-POP 동문 운영 여부 불명 | 현장 방문 또는 대체 URL 확보 |
| VBM 9건 geo-near 매칭 경계 | 유사도 0.6 수준, 오매칭 가능성 | 수동 canonical 대조 확인 |
| busan-K-00739 좌표 14m 차이 | existing_enriched 내 좌표 충돌 | 현장 좌표 확인 권장 |
| subcategory 미분류 | api_only 990건 + 일부 canonical subcategory=unknown | 향후 TourAPI 세부 분류 매핑 필요 |
| course_reference 49건 미분해 | 코스 내 개별 spot 미등록 | 고인기 코스 우선 분해 검토 |

### 후속 과제 목록

1. **[우선]** busan-K-00081 category 확정 (accommodation)
2. **[우선]** merge_existing 12건 보강 필드 canonical DB 반영 승인
3. **[권장]** web_only_new 311건 개별 운영 승인 프로세스 구축
4. **[중기]** Playwright VB 이미지 수집 태스크
5. **[장기]** update/discover 모드 스크립트 구현 (`tourapi-busan-update.mjs`)
6. **[장기]** subcategory 전체 분류 체계 확립 (api_only 990건 포함)
7. **[참고]** busan-VB-1859 — 현장 재확인 또는 최종 제외 결정

---

## 11. 검증 결과

| 검증 항목 | 결과 |
|---|---|
| 최종 상태별 합계 1,767 일치 | ✓ |
| 활성 후보 1,663건 일치 | ✓ |
| manual_review 14건 일치 | ✓ |
| merge_existing 12건 + 전체 병합 대상 누락 0 | ✓ |
| 입력 파일 누락 0 | ✓ |
| unknown_allowed 출신 활성 후보 subcategory=unknown 0 | ✓ |
| candidate_id 중복 0 | ✓ |
| 운영 DB·canonical 원본·migration 무변경 | ✓ |
| 새 수집·가공 스크립트 미생성 | ✓ |

---

TASK-DATA-BUSAN-FINAL-PACKAGE-11 부산 데이터 최종 패키지 완료.

---

## PRECOMMIT-12A: 커밋 전 사전 정리 결과

**날짜:** 2026-07-24  
**상태:** PASS ✓

### 작업 1 — 롯데호텔 부산 (busan-K-00081)

| 항목 | 이전 | 이후 |
|---|---|---|
| category | unknown | **accommodation** |
| subcategory | unknown | **hotel** |
| candidate_status | manual_review | **api_only_existing** |

공식 호텔로 확정. provenance(canonical 원천 KorService2:142998:ko) 및 좌표 유지.

### 작업 2 — VBM 경계 매칭 9건 최종 판정

| candidate_id | 제목 | 판정 | merge_target_id | 근거 |
|---|---|---|---|---|
| busan-VBM-1796 | 목련꽃 가득 안은 성암사 | **merge_existing** | busan-A-00139 | uc_seq=1796 동일, 주소 일치 |
| busan-VBM-1322 | 복합문화공간 현대 모터스튜디오 부산 | **merge_existing** | busan-A-00119 | uc_seq=1322 동일, 주소 일치 |
| busan-VBM-367 | 부산영화체험박물관 feat.씨네뮤지엄 | **merge_existing** | busan-A-00064 | uc_seq=367 동일, 주소+전화 일치 |
| busan-VBM-346 | 신명천지 국립부산국악원 | **merge_existing** | busan-A-00053 | uc_seq=346 동일, 주소 일치 |
| busan-VBM-308 | 네 꿈을 펼쳐라! 부산시청자미디어센터 | **merge_existing** | busan-A-00041 | uc_seq=308 동일, 주소+전화 일치 |
| busan-VBM-1523 | 삼락하동재첩국 | **merge_existing** | busan-F-00236 | uc_seq=1523 동일, 주소+전화 일치 |
| busan-VBM-1516 | 부광돼지국밥 | **merge_existing** | busan-F-00229 | uc_seq=1516 동일, 주소+전화 일치 |
| busan-VBM-2131 | 삼진어묵 | **merge_existing** | busan-F-00088 | 주소+전화 완전 일치 (2nd VB article) |
| busan-VBM-1640 | 부산영화체험박물관 | **merge_existing** | busan-A-00064 | 좌표 4m 이내, 주소+전화 일치 |

VBM 제목의 편집 접두어("신명천지", "네 꿈을 펼쳐라!" 등)를 제거한 실명과 uc_seq·주소·전화를 교차 확인.  
유사도 0.6 단독 기준 병합은 없음 — 모든 판정에 uc_seq 또는 주소+전화 복수 증거 사용.

### 변경 후 수치

| candidate_status | 이전 | 이후 |
|---|---|---|
| api_only_existing | 990 | **991** |
| merge_existing | 12 | **21** |
| manual_review | 14 | **4** |
| **활성 운영 후보** | 1,663 | **1,664** |
| 전체 | 1,767 | 1,767 |

### 잔존 manual_review 4건

| candidate_id | 사유 |
|---|---|
| busan-A-00105 | 송도용궁구름다리 — subcategory 미확정 (다국어 번역 필요) |
| busan-E-00028 | 부산푸드필름페스타 — subcategory 미확정 (다국어 번역 필요) |
| busan-E-00032 | 별바다부산 나이트페스타 — subcategory 미확정 (다국어 번역 필요) |
| busan-VB-1859 | K-POP 동문 — modoo.at 서비스 종료, 현장 확인 불가 (unresolved) |

subcategory 1,352건 분류 및 이미지 수집은 별도 후속 과제.

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| busan-integrated-candidates.csv | K-00081 category/subcategory 수정, VBM 9건 merge_existing 반영 |
| busan-integrated-candidates.json | 동일 갱신 |
| busan-integrated-manual-review.csv | 10건 제거 (K-00081 + VBM 9건), 4건 잔류 |
| busan-integrated-candidates-metrics.json | precommit_12a 섹션 추가 |
| busan-final-metrics.json | 수치 갱신 |

---

TASK-DATA-BUSAN-PRECOMMIT-REVIEW-12A 부산 1차 기준본 사전 정리 완료.
