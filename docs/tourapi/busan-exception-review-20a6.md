# 부산 예외 후보 검토 보고서

**작성일:** 2026-07-26
**작성:** TASK-DATA-BUSAN-EXCEPTION-REVIEW-20A-6
**목적:** manual_review 15건 + busan-A-00064 병합 권고

---

## 1. manual_review 15건 집계

| 구분 | 건수 |
|---|---|
| 전체 manual_review | **15** |
| subcategory=unknown | **13** (busan-K-* 13건) |
| subcategory=other_nature | **2** (busan-VB-* 2건) |
| camping 계열 (캠핑·글램핑·카라반·야영장) | **10** |
| mobile_program 계열 (서핑·요트) | **5** |

---

## 2. 권고 결과 분포

| 권고 | 건수 |
|---|---|
| reclassify | **15** |
| keep | **0** |
| exclude | **0** |
| insufficient_evidence | **0** |

| 자동 반영 가능 여부 | 건수 |
|---|---|
| possible | **12** |
| manual_confirm_recommended | **3** |

---

## 3. camping 계열 10건 권고

모두 **reclassify → accommodation/camping**.

| candidate_id | 현재 subcategory | 시설명 | 근거 요약 |
|---|---|---|---|
| busan-K-00309 | unknown | 부산항힐링야영장 | 야영장, 고정 주소 확인 |
| busan-K-00311 | unknown | 대저캠핑장 | 캠핑장 명시 |
| busan-K-00315 | unknown | 초원숲속캠핑장 | 캠핑장 명시 |
| busan-K-00316 | unknown | 장안캠프 | 캠프=캠핑 시설 |
| busan-K-00317 | unknown | 화명오토캠핑장 | 오토캠핑장 명시 |
| busan-K-00320 | unknown | 제이스글램핑 | 글램핑=캠핑 변형 |
| busan-K-00321 | unknown | 임랑카라반파크 | 카라반=캠핑 시설 |
| busan-K-00325 | unknown | 더무빙 카라반 | 카라반 명시 |
| busan-VB-2142 | other_nature | 천성항 노지 캠핑장 | 캠핑장 명시, VB experience 중복 등재 |
| busan-VB-1852 | other_nature | 부산항 힐링야영장 | 야영장 명시, VB experience 중복 등재 |

**자동 반영:** 10건 모두 possible (시설명 키워드+고정 주소 확인).

---

## 4. mobile_program 계열 5건 권고

모두 **reclassify → nature/outdoor_activity**.

자동 분류기가 "mobile_program:no_fixed_spot"으로 분류했으나, 전 항목에 고정 주소가 존재하며 관광객이 직접 방문하는 레저시설입니다.

| candidate_id | 시설명 | 주소 | 비고 |
|---|---|---|---|
| busan-K-00378 | 서프마린 | 수영구 광안해변로 125 | 서핑 스쿨, 고정 위치 |
| busan-K-00383 | 송정서핑학교 | 해운대구 송정해변로 34-8 | 서핑 스쿨, 고정 위치 |
| busan-K-00422 | 부산요트투어 3355마린 | 해운대 해변로 84 | **동일 주소 3건 주의** |
| busan-K-00688 | 부산요트투어 고고요트 | 해운대 해변로 84 | **동일 주소 3건 주의** |
| busan-K-00708 | 부산 요트투어 요트야 | 해운대 해변로 84 | **동일 주소 3건 주의** |

**요트투어 3건 주의:** 동일 주소(해운대 마리나)를 공유하는 별개 운영사. DB 반영 시 중복 여부 메인 노트북에서 수동 확인 권고. 자동 반영: **manual_confirm_recommended**.

---

## 5. busan-A-00064 병합 감사

### 비교 대상

| 항목 | busan-A-00064 | busan-VBM-367 | busan-VBM-1640 |
|---|---|---|---|
| 시설명 | 부산영화체험박물관/씨네뮤지엄 | 부산영화체험박물관 feat.씨네뮤지엄 | 부산영화체험박물관 |
| 주소 | 중구 대청로126번길 12 | 중구 대청로126번길 12 | 중구 대청로126번길 12 |
| content_type | (없음) | attraction | experience |
| candidate_status | api_only_existing | merge_existing | merge_existing |

### 판정

**same_place — 신뢰도: high**

- 세 항목 모두 동일 주소
- VBM-367(attraction)·VBM-1640(experience)은 동일 시설을 VisitBusan에서 두 카테고리로 중복 등재한 것
- 씨네뮤지엄은 부산영화체험박물관 내부 전시관 — 별도 시설이 아님

### 권고 처치

| 항목 | 권고 |
|---|---|
| busan-A-00064 | 유지. VBM-367의 hours·phone·source_detail_url로 보강 가능 |
| busan-VBM-367 | 보강 후 canonical 흡수 (merge_existing 처리) |
| busan-VBM-1640 | 중복 제거 권고 |
| 자동 병합 | **금지** — 메인 노트북 수동 확인 후 진행 |

---

## 6. 정본 파일 무변경 확인

- busan-integrated-candidates.json: ✓ 무변경
- busan-subcategory-manual-review.csv: ✓ 무변경

---

## 7. 산출물

| 파일 | 설명 |
|---|---|
| `data/tourapi/reports/busan/busan-manual-review-decisions.csv` | 15건 권고 CSV |
| `docs/tourapi/busan-exception-review-20a6.md` | 이 보고서 |

git add·commit·push: 미실행
