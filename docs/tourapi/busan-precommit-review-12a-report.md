# TASK-DATA-BUSAN-PRECOMMIT-REVIEW-12A 완료 보고서

**날짜:** 2026-07-24  
**상태:** **PASS ✓**

---

## 검증 결과 (실행 전)

| 항목 | 결과 |
|---|---|
| 프롬프트 안전성 | 순수 데이터 수정, commit·push·DB 조작 없음 ✓ |
| accommodation: city_spots 허용 카테고리 | ✓ (5종 중 하나) |
| VBM 검증 방법 | uc_seq, 주소, 전화 교차 확인 — 충분한 근거 확보 가능 ✓ |
| 자동 병합 방지 조건 | 명시적 canonical_id 필수, 유사도 단독 불가 ✓ |

---

## 작업 1 — 롯데호텔 부산 (busan-K-00081)

### 원천 확인

| 항목 | 값 |
|---|---|
| 정식 명칭 | 롯데호텔 부산 |
| 주소 | 부산광역시 부산진구 가야대로 772 (부전동) |
| 원천 ID | KorService2:142998:ko |
| 좌표 | 35.1573337296, 129.0559892441 |

롯데호텔 부산은 롯데그룹 계열 5성급 호텔. category=accommodation, subcategory=hotel 판정에 이견 없음.

### 변경 결과

| 필드 | 이전 | 이후 |
|---|---|---|
| category | unknown | **accommodation** |
| subcategory | unknown | **hotel** |
| candidate_status | manual_review | **api_only_existing** |
| category_compatibility_method | canonical_only | category_confirmed |

provenance 필드(canonical) 및 기존 원천 ID(KorService2:142998:ko) 유지.

---

## 작업 2 — VBM 경계 매칭 9건 최종 판정

### 교차 검증 방법론

각 VBM 항목에 대해 3단계 교차 확인:
1. **uc_seq 일치:** VBM uc_seq = canonical의 linked_source_keys 내 contentId
2. **주소 일치:** VBM address = canonical address (행정구역 포함)
3. **전화 일치:** 전화번호(해당 시) 비교

### 최종 판정표

| candidate_id | 제목 (VBM 편집 제목) | 판정 | merge_target_id | 근거 |
|---|---|---|---|---|
| busan-VBM-1796 | 목련꽃 가득 안은 성암사, 나만 알고 싶은 부산 봄꽃 성지 | **merge_existing** | busan-A-00139 | uc_seq=1796 동일, 남구 진남로 210번길 58-15 일치 |
| busan-VBM-1322 | 복합문화공간 현대 모터스튜디오 부산 | **merge_existing** | busan-A-00119 | uc_seq=1322 동일, 수영구 구락로123번길 20 일치 |
| busan-VBM-367 | 부산영화체험박물관 feat.씨네뮤지엄 | **merge_existing** | busan-A-00064 | uc_seq=367 동일, 중구 대청로126번길 12, 0507-1377-4201 일치 |
| busan-VBM-346 | 신명천지 국립부산국악원 | **merge_existing** | busan-A-00053 | uc_seq=346 동일, 부산진구 국악로2, 051-811-0114 일치 |
| busan-VBM-308 | 네 꿈을 펼쳐라! 부산시청자미디어센터 | **merge_existing** | busan-A-00041 | uc_seq=308 동일, 해운대구 센텀중앙로 42, 051-749-9500 일치 |
| busan-VBM-1523 | 삼락하동재첩국 | **merge_existing** | busan-F-00236 | uc_seq=1523 동일, 사상구 낙동대로1518번길 33, 051-301-7200 일치 |
| busan-VBM-1516 | 부광돼지국밥 | **merge_existing** | busan-F-00229 | uc_seq=1516 동일, 중구 대청로 141번길 15-1, 051-466-1708 일치 |
| busan-VBM-2131 | 삼진어묵 | **merge_existing** | busan-F-00088 | 영도구 태종로99번길 36, 051-715-5865 완전 일치 (VB 2nd article) |
| busan-VBM-1640 | 부산영화체험박물관 | **merge_existing** | busan-A-00064 | 좌표 4m 이내, 중구 대청로126번길 12, 0507-1377-4201 일치 |

**merge_existing 판정 사유:**
- VBM-1796~1516: VBM uc_seq = canonical linked_source_keys의 ContentId → 동일 TourAPI 엔티티의 VBM 에디토리얼 버전
- VBM-2131: VisitBusan food(uc_seq=1065) 및 shopping(uc_seq=2131) 두 아티클이 동일 물리 장소(삼진어묵 본점) 참조
- VBM-1640: 경험 콘텐츠 아티클(uc_seq=1640)과 어트랙션(uc_seq=367)이 동일 박물관(부산영화체험박물관/씨네뮤지엄)

**자동 병합 적용 없음:** 유사도 0.6 단독으로 병합된 항목 0건. 모든 판정에 uc_seq 또는 주소+전화 복수 증거 사용.

---

## 검증 조건

| 조건 | 결과 |
|---|---|
| 롯데호텔 category=accommodation 반영 | ✓ |
| 롯데호텔 subcategory=hotel 반영 | ✓ |
| VBM 9건 전부 추적 | ✓ (9/9) |
| 상태별 합계 9건 (merge_existing) | ✓ |
| 잘못된 자동 병합 0 | ✓ (uc_seq/주소/전화 교차 확인) |
| 활성 후보 수치 일치 | ✓ (1,664) |
| manual_review 최종 수치 일치 | ✓ (4건) |
| 총 행 수 유지 | ✓ (1,767) |
| merge target 모두 CSV에 존재 | ✓ |
| 기존 원천 파일·운영 DB 무변경 | ✓ |
| 이미지 수집·subcategory 분류 미실행 | ✓ |
| commit·push·migration 미실행 | ✓ |

---

## 변경 후 최종 수치

| candidate_status | 이전 | 이후 |
|---|---|---|
| existing_enriched | 362 | 362 |
| api_only_existing | 990 | **991** |
| web_only_new | 311 | 311 |
| course_reference | 49 | 49 |
| reference_only | 21 | 21 |
| merge_existing | 12 | **21** |
| excluded | 8 | 8 |
| manual_review | 14 | **4** |
| **합계** | **1,767** | **1,767** |
| **활성 운영 후보** | **1,663** | **1,664** |

### 잔존 manual_review 4건

| candidate_id | 사유 |
|---|---|
| busan-A-00105 | 송도용궁구름다리 — subcategory 미확정 (다국어) |
| busan-E-00028 | 부산푸드필름페스타 — subcategory 미확정 (다국어) |
| busan-E-00032 | 별바다부산 나이트페스타 — subcategory 미확정 (다국어) |
| busan-VB-1859 | K-POP 동문 — modoo.at 서비스 종료, 현장 확인 필요 (unresolved) |

---

## 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `data/tourapi/candidates/busan/busan-integrated-candidates.csv` | K-00081 category/subcategory/status 수정, VBM 9건 merge_existing 반영, merge_target_id 추가 |
| `data/tourapi/candidates/busan/busan-integrated-candidates.json` | 동일 갱신 |
| `data/tourapi/candidates/busan/busan-integrated-manual-review.csv` | 10건 제거 (K-00081 + VBM 9건), 4건 잔류 |
| `data/tourapi/reports/busan/busan-integrated-candidates-metrics.json` | precommit_12a 섹션 추가 |
| `data/tourapi/reports/busan/busan-final-metrics.json` | api_only_existing 991, merge_existing 21, manual_review 4, active 1664 반영 |
| `docs/tourapi/busan-final-handoff-11.md` | PRECOMMIT-12A 섹션 추가 |
| `scripts/tourapi-busan-precommit-review-12a.mjs` | 신규 생성 |

---

TASK-DATA-BUSAN-PRECOMMIT-REVIEW-12A 부산 1차 기준본 사전 정리 완료.
