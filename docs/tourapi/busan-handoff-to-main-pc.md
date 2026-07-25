# 부산 데이터 파이프라인 — 메인 컴퓨터 인수인계

**작성일:** 2026-07-25 (최초 2026-07-24, TASK-15 야간 보강 반영 업데이트)  
**작성:** 보조 데스크탑 (Claude Code)  
**수신:** 메인 컴퓨터

---

## 한 줄 요약

부산 관광지 데이터 수집·정제·통합 파이프라인 TASK-01~15가 완료됐습니다.  
결과물은 GitHub `research/tourapi-nightly-20260722` 브랜치에 push됐습니다.  
**야간 보강(TASK-13B~15)으로 category 정규화, subcategory 분류, 이미지 318건이 추가됐습니다.**  
운영 DB 반영 전에 이 문서를 끝까지 읽어주세요.

---

## 1. 브랜치 가져오기

```bash
git fetch origin
git checkout research/tourapi-nightly-20260722
```

최초 commit: `2df92651cf924402b28da3aabb354bed07c888a5`  
직전 HEAD: `86b411b` (Add Busan TourAPI repeat automation)  
**야간 보강(TASK-13B~15), 분류 보정(TASK-17B), metrics 동기화(TASK-18B) 결과는 TASK-DATA-BUSAN-FINAL-BUNDLE-COMMIT-PUSH-19 연구 브랜치 커밋에 포함된다. 운영 반영 여부는 메인 노트북 검증 후 결정한다.**

---

## 1-A. 야간 보강 요약 (TASK-13B~15, 2026-07-25)

| TASK | 내용 | 결과 |
|---|---|---|
| TASK-13B | busan-K-* 665건 category 정규화 (contentTypeId 기반) | 활성 후보 1,664 → 1,642 (여행코스 22건 → course_reference) |
| TASK-14 (PHASE 1) | 전체 1,642건 subcategory 분류 (규칙 기반) | 분류 완료 1,627건, manual_review 15건 |
| TASK-15 PHASE 4-5 | VisitBusan 이미지 URL 318건 수집·적용 | 이미지 보유율 91.4% (1,501/1,642) |
| TASK-17B | 분류 정확성 결함 4건 패치 (교회·향교·사찰 재분류 + CSV image_source 열 추가) | temple 38, cultural_site 28, historic_site 24 |

---

## 2. 핵심 파일 위치

| 목적 | 파일 |
|---|---|
| **현행 기준본 (정본)** | `data/tourapi/candidates/busan/busan-integrated-candidates.csv` |
| subcategory 수동 검토 대상 | `data/tourapi/candidates/busan/busan-subcategory-manual-review.csv` |
| 기존 수동 검토 대상 | `data/tourapi/candidates/busan/busan-integrated-manual-review.csv` |
| 지표 (전 태스크 통합) | `data/tourapi/reports/busan/busan-integrated-candidates-metrics.json` |
| 인수인계 전문 | `docs/tourapi/busan-final-handoff-11.md` |
| Git 분석 보고서 | `docs/tourapi/busan-commit-analysis-12.md` |

---

## 3. 최종 수치 (TASK-15 야간 보강 후)

| candidate_status | 건수 | 의미 |
|---|---|---|
| existing_enriched | **362** | TourAPI canonical + VB 보강 완료 |
| api_only_existing | **969** | TourAPI canonical only (VB 미매칭), -22 여행코스 제외 |
| web_only_new | **311** | VisitBusan 신규 발굴, DB 미등록 |
| merge_existing | 21 | canonical에 VB 소스 연결 대기 |
| reference_only | 21 | 고정 장소 아님 (투어·코스 참조) |
| course_reference | **71** | VB 코스 묶음 + 여행코스(contentTypeId=25) 22건 추가 |
| manual_review | 4 | 별도 확인 필요 |
| excluded | 8 | 장소 아님 제외 (앱·웹 서비스) |
| **활성 운영 후보** | **1,642** | existing_enriched + api_only + web_only |
| **전체** | **1,767** | |

### subcategory 분포 (1,642건 기준)

| category | 주요 subcategory | 기타(other_*) | manual_review |
|---|---|---|---|
| attraction (717) | park:63, museum:53, village:51, landmark:48, temple:38, … | other_attraction:202 | — |
| restaurant (721) | korean_food:117, seafood:90, cafe:25, international_food:23, bar:22, … | other_restaurant:429 | — |
| event (72) | festival:45, seasonal_event:7, performance:5, exhibition:2, … | other_event:13 | — |
| accommodation (82) | hotel:42, pension:8, guesthouse:3, hostel:1, resort:1 | other_accommodation:27 | — |
| nature (50) | outdoor_activity:12, trail:8, mountain:4, forest:1, … | other_nature:6 | 13 (camping·이동형) |

**manual_review 15건:**
- camping_in_nature:10 — category=nature지만 캠핑/글램핑/카라반 → accommodation/camping 권장
- mobile_program:5 — 서핑학교·요트투어 (고정 장소 없음) → 제외 여부 결정 필요

### 이미지 보유 현황

| 항목 | 건수 |
|---|---|
| 이미지 있음 (전체 활성) | **1,501 / 1,642 (91.4%)** |
| visitbusan 이미지 (이번 추가) | **318건** |
| 이미지 없음 | 141건 |

---

## 4. DB 반영 — 즉시 가능한 작업

### 4-1. existing_enriched 362건 — VB 보강 필드 업데이트

기존 DB 항목에 VisitBusan 데이터를 보강합니다.

**자동 적용 가능:**
- `hours` (운영시간)
- `phone` (전화번호)

**수동 확인 후 적용:**
- `title_ko` — 충돌 시 canonical 원본 우선
- `latitude`, `longitude` — 좌표 충돌 시 canonical 우선
- `category`, `address` — 절대 자동 덮어쓰기 금지

**특수 사항:**
- `busan-K-00739`: 좌표 14m 차이 → 수동 확인 권장
- field_provenance 열에 각 필드의 출처가 기록됨

### 4-2. api_only_existing 969건 — 현재 유지

변경 없음. 다음 VB 수집 사이클에서 매칭 재시도.

---

## 5. DB 반영 — 승인 필요

### 5-1. web_only_new 311건 — 신규 city_spots 삽입

VisitBusan에서 발굴한 신규 장소입니다. **자동 운영 삽입 금지.**  
개별 검토 후 삽입 여부를 결정해주세요.

| 구분 | 건수 |
|---|---|
| category_confirmed (category/subcategory 확정) | 131건 |
| direct 매핑 (attraction 임시 배정) | 180건 |

city_spots 허용 카테고리: `attraction` / `restaurant` / `nature` / `event` / `accommodation`

### 5-2. merge_existing 21건 — canonical VB 필드 연결

| merge_target_id 유형 | 건수 |
|---|---|
| canonical (busan-K/A/F) 대상 | 19건 |
| VB 후보 (busan-VB) 대상 | 2건 |

각 항목의 `merge_target_id` 열에 대상 canonical_id가 기록됨.  
보강 필드(`hours`, `phone`, `source_detail_url`)만 연결, 원본 덮어쓰기 금지.

---

## 6. 수동 확인 필요 4건

`data/tourapi/candidates/busan/busan-integrated-manual-review.csv` 참조.

| candidate_id | 제목 | 사유 |
|---|---|---|
| busan-A-00105 | 송도용궁구름다리 | subcategory 미확정 (다국어 번역 필요) |
| busan-E-00028 | 부산푸드필름페스타 | subcategory 미확정 (다국어 번역 필요) |
| busan-E-00032 | 별바다부산 나이트페스타 | subcategory 미확정 (다국어 번역 필요) |
| busan-VB-1859 | K-POP 스타랑 동문 된 썰 푼다 | sdkart.modoo.at 2025-06-26 서비스 종료 → 현장 확인 필요 |

---

## 7. 알려진 제약·한계

| 항목 | 내용 |
|---|---|
| VisitBusan 이미지 | TASK-15에서 318건 수집 완료. 나머지 141건은 VisitBusan 미연결 또는 이미지 없음. |
| other_* subcategory | attraction:206건, restaurant:429건이 other_* 상태. 키워드 분류 한계 — 필요 시 수동 보완. |
| subcategory manual_review 15건 | camping_in_nature 10건(accommodation/camping 권장), mobile_program 5건(제외 여부 결정 필요). `data/tourapi/candidates/busan/busan-subcategory-manual-review.csv` 참조. |
| course_reference 71건 | VB 코스 내 개별 spot 매핑 미완료 |
| busan-K-00739 | 좌표 14m 차이 (KTO↔VB) → 수동 확인 |
| 이미지 license | visitbusan 이미지는 `all_rights_reserved_visitbusan` — 상업 사용 전 권리 확인 필요 |

---

## 8. 운영 DB 반영 시 절대 금지

- 자동 승인 및 일괄 INSERT 금지
- title_ko, latitude, longitude, category, address 자동 덮어쓰기 금지
- canonical 원본 데이터 삭제·변경 금지
- source_missing 항목 즉시 삭제 금지 (2회 연속 미탐지 후 manual_review 이동)
- merge_existing 항목의 canonical 원본 필드 덮어쓰기 금지 (보강 필드만 추가)

---

## 9. 향후 업데이트 사이클 (참고)

| 모드 | 대상 | 주기 |
|---|---|---|
| update | existing_enriched 362 + api_only_existing 969 | 주 1회 또는 VB 변경 감지 시 |
| discover | web_only_new 신규 발굴 | 신규 VB 콘텐츠 감지 시 |
| full | 전체 1,767건 재점검 | 분기 1회 |

자동화 스크립트는 향후 `scripts/tourapi-busan-update.mjs` 구현 예정.

---

## 10. 파이프라인 스크립트 목록

| TASK | 스크립트 | 역할 |
|---|---|---|
| TASK-03 | tourapi-busan-visitbusan-discovery-03.mjs | VisitBusan 콘텐츠 수집 |
| TASK-05 | tourapi-busan-visitbusan-match-05.mjs | VB↔canonical 매칭 |
| TASK-06 | tourapi-busan-integrated-candidates-06.mjs | 통합 후보 생성 |
| TASK-07 | tourapi-busan-unknown-category-review-07.mjs | unknown 173건 분류 |
| TASK-08 | tourapi-busan-duplicate-manual-resolution-08.mjs | 중복 판정 |
| TASK-10 | tourapi-busan-integrated-candidates-finalize-10.mjs | 최종 통합 반영 |
| TASK-12A | tourapi-busan-precommit-review-12a.mjs | 커밋 전 정리 |
| TASK-13B | tourapi-busan-category-normalize-13b.mjs | busan-K-* 665건 category 정규화 |
| TASK-14/15 P1 | tourapi-busan-subcategory-classify-14.mjs | 전체 1,642건 subcategory 분류 |
| TASK-15 P5 | tourapi-busan-image-apply-15.mjs | VisitBusan 이미지 URL 318건 적용 |

**야간 도구 (레포 외부):**
- `C:/기본저장/나의 프로젝트/KoreaMate/.tools/playwright-visitbusan/collect-images.mjs` — Playwright 이미지 수집기
- 결과 파일: `.tools/playwright-visitbusan/image-results.json` (작업 완료 후 보관)

---

이상입니다. 추가 질문은 `docs/tourapi/busan-final-handoff-11.md` 또는 각 태스크 보고서를 참조해주세요.
