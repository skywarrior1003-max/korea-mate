# TASK-DATA-IMAGE-MISSING-AUDIT-21N — 완료 보고서

**상태**: 완료 (stage·commit·push 미실행)
**실행일**: 2026-07-27
**대상**: busan-image-status-21h-rev2.csv에서 image_status=image_missing 5건

---

## 검증 결과

전항목 PASS:

| 항목 | 결과 |
|---|---|
| 대상 5건 전부 조회 완료 | ✓ |
| KTO·VB 이미지 존재 여부 확인 | ✓ (전건 없음) |
| PhotoGallery 명칭 매칭 후보 확인 | ✓ |
| 위치 정합성 검증 | ✓ (아미산 이격 확인) |
| 신규 API 호출·외부 웹 조사 없음 | ✓ (기존 파일 전용) |
| 출력 CSV 5행 | ✓ |

---

## 감사 결과 요약

| candidate_id | 장소명 | verdict | 상태 권고 |
|---|---|---|---|
| busan-F-00289 | 고스락 | no_existing_candidate | source_exhausted |
| busan-K-00058 | 국제시장 | ambiguous_candidate | image_missing 유지 |
| busan-K-00109 | 아미산 | place_identity_issue | image_missing 유지 |
| busan-K-00119 | 다원 | no_existing_candidate | source_exhausted |
| busan-K-00306 | 천마산하늘전망대 | ambiguous_candidate | image_missing 유지 |

---

## 개별 판정 근거

### busan-F-00289 — 고스락 (restaurant, 기장군)

- **candidate_status**: api_only_existing
- **KTO 이미지**: 없음 (batch-normalized src=1577, busan provider, image_url 공란)
- **VB 이미지**: 없음 (rights 파일 미수록)
- **PG 명칭 매칭**: 0건 (match CSV)
- **place-summary pg_manual_count**: 22 — 현재 파일 내에서 해당 사진 추적 불가 (match CSV 0건, integrated JSONL 지리 근접 0건)
- **판정**: `no_existing_candidate` — 기존 자료 내 재매칭 후보 없음
- **권고**: image_missing → **source_exhausted** 전환

### busan-K-00058 — 국제시장 (attraction/market, 중구)

- **candidate_status**: api_only_existing
- **KTO 이미지**: 없음 (batch-normalized src=132191, image_url 공란)
- **VB 이미지**: 없음 (rights 파일 미수록)
- **PG 명칭 매칭**: 37건 — 제목 "부산국제시장", confidence=manual_review, score=65
- **판정**: `ambiguous_candidate` — score 65로 자동 threshold 미달이나 장소명 일치
- **권고**: image_missing **유지**. 37건 수동 검증 후 image_partial 상향 여부 결정

### busan-K-00109 — 아미산 (restaurant, 해운대구)

- **candidate_status**: api_only_existing
- **KTO 이미지**: 없음 (batch-normalized src=688610, content_type=39(restaurant), image_url 공란)
- **VB 이미지**: 없음 (rights 파일 미수록)
- **PG 명칭 매칭**: 11건 — 제목 "아미산둘레길", confidence=manual_review, score=95
- **위치 검증 결과**: 이 레스토랑(해운대, 35.1581°N 129.1485°E)과 아미산 산악지역(서구, 35.0527°N 128.9607°E) 간 거리 약 **20km**. PG 매칭된 사진들은 아미산 등산로 관련 사진으로 이 레스토랑과 무관.
- **판정**: `place_identity_issue` — 레스토랑명 "아미산"이 아미산 산(山)과 명칭 혼동을 일으켜 PG가 잘못 매칭함. 기존 PG 후보 11건 사용 불가.
- **권고**: image_missing **유지**. 레스토랑 실존 여부 별도 수동 확인 권장.

### busan-K-00119 — 다원 (restaurant, 부산진구 서면)

- **candidate_status**: api_only_existing
- **KTO 이미지**: 없음 (batch-normalized src=850217, image_url 공란)
- **VB 이미지**: 없음 (rights 파일 미수록)
- **PG 명칭 매칭**: 0건 (match CSV)
- **place-summary pg_manual_count**: 31 — 현재 파일 내에서 해당 사진 추적 불가 (match CSV 0건, integrated JSONL 지리 근접 0건)
- **판정**: `no_existing_candidate` — 기존 자료 내 재매칭 후보 없음
- **권고**: image_missing → **source_exhausted** 전환

### busan-K-00306 — 천마산하늘전망대 (attraction/observatory, 서구)

- **candidate_status**: api_only_existing
- **KTO 이미지**: 없음 (batch-normalized src=2721158, image_url 공란)
- **VB 이미지**: 없음 (rights 파일 미수록)
- **PG 명칭 매칭**: 4건 — 제목 "천마산", confidence=manual_review, score=80
- **위치 검증**: photo_latitude/longitude 공란 — 지리 검증 불가
- **판정**: `ambiguous_candidate` — score 80, 전망대 명칭 부분 일치. 위치 불확인이나 가능성 있음.
- **권고**: image_missing **유지**. 4건 수동 검증 후 image_partial 상향 여부 결정.

---

## 출력 파일

`data/tourapi/reports/busan/busan-image-missing-audit-21n.csv` — 5행

컬럼: candidate_id, title_ko, category, subcategory, address, candidate_status, vb_image_found, pg_named_match_count, pg_named_match_title, pg_named_match_score, verdict, status_recommendation, audit_note

---

## image_status 변경 권고 요약

| 변경 대상 | 현재 | 권고 |
|---|---|---|
| busan-F-00289 고스락 | image_missing | source_exhausted |
| busan-K-00119 다원 | image_missing | source_exhausted |
| busan-K-00058 국제시장 | image_missing | 유지 (수동 검증 대기) |
| busan-K-00109 아미산 | image_missing | 유지 (place_identity 플래그) |
| busan-K-00306 천마산하늘전망대 | image_missing | 유지 (수동 검증 대기) |

status_exhausted 전환 2건, 수동 검증 대기 2건, 장소 확인 필요 1건.

---

## 특이 발견 사항

**아미산 (busan-K-00109) 명칭 혼동**: PG 명칭 매칭 score 95는 높은 수준이나 실제 매칭된 사진들은 아미산 산악 지역의 사진으로, 해운대 소재 레스토랑과 20km 이격. 향후 PG 매칭 시 좌표 검증을 필수화하거나 명칭 유사도만으로 high_score 처리되지 않도록 주의 필요.

**pg_manual_count 불일치 (고스락·다원)**: place-summary 21D-REV2에 pg_manual_count 22/31이 기재되어 있으나 match CSV에 0건. 현재 파일 내에서 출처를 추적할 수 없어 해당 수치의 신뢰도 불명확. 실제 PG 보충 시 재확인 필요.

---

TASK-DATA-IMAGE-MISSING-AUDIT-21N 완료 — 이미지 누락 5건 감사 완료, 보충 실행 여부 결정 대기.
