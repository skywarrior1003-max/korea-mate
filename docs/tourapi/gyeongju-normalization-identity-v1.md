# TASK-GYEONGJU-NORMALIZATION-AND-IDENTITY-V1 완료보고서

**완료일**: 2026-08-05  
**기반 브랜치**: `data/gyeongju-web-raw-collection-v3` HEAD `2c6756a`  
**작업 브랜치**: `data/gyeongju-normalization-identity-v1`  
**결과**: **PASS** — Run1 = Run2 22/22 BYTE_IDENTICAL

---

## 1. 검증 결과 (실행 전)

### 전제 조건 확인

| 항목 | 결과 |
|---|---|
| 기반 브랜치 HEAD `2c6756a` | ✅ 확인 |
| baseline 831 candidates JSONL | ✅ 확인 |
| source facts 907 JSONL | ✅ 확인 |
| web-raw-v3 전체 9종 JSONL | ✅ 확인 |
| pilot audits 4종 (api-web/candidate/vg-cand/vg-lang) | ✅ 확인 |
| filter audit JSON | ✅ 확인 |

### 설계 검토 결과

**차단 블로커**: 없음.  
**개선 아이디어**: 없음 (현 설계 최적).  
**결정**: EXECUTE

---

## 2. 데이터 사전 분석 결과

### 2.1 관광지 Identity 예측 (159건)

| 근거 | 방법 | 건수 |
|---|---|---|
| area_uid → pilot audit → gj01_sfid → candidate | PILOT_AUDIT_AREA_UID_MATCH | ~20 |
| 이름 → GJ01 SF → candidate | GJ01_SF_NAME_MATCH_WITH_CANDIDATE | ~110 |
| 이름 → GJ01 SF, candidate 없음 | GJ01_SF_NAME_MATCH_NO_CANDIDATE | ~15 |
| 이름 → candidate 직접 | CAND_NAME_MATCH | ~4 |
| 근거 없음 | NO_LINKABLE_EVIDENCE | ~10 |

**실제 결과**: HIGH_CONFIDENCE 145 / MANUAL_REVIEW 4 / NEW_OFFICIAL_PLACE 10

### 2.2 식당 Identity 예측 (84건)

| 근거 | 건수 |
|---|---|
| pilot HIGH_CONFIDENCE (hex_id → candidate) | 5 |
| 이름 → candidate | MANUAL_REVIEW 13 |
| 매칭 없음 (신규) | NEW_OFFICIAL_PLACE 66 |

**실제 결과**: HIGH_CONFIDENCE 5 / MANUAL_REVIEW 13 / NEW_OFFICIAL_PLACE 66

### 2.3 특이사항 (실행 중 발견)

**monthly-rec `places` 필드 = UI 탭 레이블**  
V3 collector가 monthly-rec 상세페이지에서 추출한 `places` 리스트는  
실제 관광지명이 아니라 각 관광지 카드 내 정보 탭 레이블  
("BEST", "주차 정보", "관람시간", "휴관일" 등)임이 확인됨.  
→ `place_links` (area_uid 기반, mnu_uid=4134에만 8건 추출됨)를 실제 관계 데이터로 사용.  
→ 나머지 6건은 `PLACE_LINKS_NOT_FOUND`로 기록; V4 수집 시 area_uid 추출 개선 권고.

---

## 3. 스크립트

**파일**: `scripts/gyeongju_normalize_full_v1.py` v1.0.0

**입력 인수**:
```
--baseline data/tourapi/enriched/gyeongju/gyeongju-enriched-candidates-v1.jsonl
--source-facts data/tourapi/candidates/gyeongju/gyeongju-source-facts-v1.jsonl
--web-raw-root data/tourapi/gyeongju/web-raw-v3
--out data/tourapi/normalized/gyeongju
--as-of 2026-08-05T04:08:00Z
```

**결정성 보장**:
- `datetime.now()` 결과물 파일에 불포함 (`generated_at_log_only` 이름으로 콘솔만 출력)
- 모든 JSONL 출력: `sort_keys=True` + 고정 기준 정렬
- `as_of` = V3 manifest 기준시각 고정

---

## 4. 정규화 실행 결과

### 4.1 Source Facts (Phase 3)

| 출처 | 건수 |
|---|---|
| 기존 API source facts (907건 정규화) | 907 |
| 신규 — 웹 관광지 (gyeongju-WEB-ATT-XXXXX) | 159 |
| 신규 — visitgyeongju 식당 (gyeongju-VG-REST-) | 84 |
| 신규 — visitgyeongju 기념품 (gyeongju-VG-SOUV-) | 8 |
| **합계** | **1,158** |

### 4.2 관광지 Identity (Phase 4 — 159건)

| verdict | 건수 | 설명 |
|---|---|---|
| HIGH_CONFIDENCE | 145 | area_uid audit 또는 이름-GJ01SF-candidate 연결 확인 |
| MANUAL_REVIEW | 4 | 이름 직접 매칭 또는 전화번호 충돌 |
| NEW_OFFICIAL_PLACE | 10 | GJ01 SF 미존재, 신규 후보 등록 필요 |

### 4.3 식당 Identity (Phase 5 — 84건)

| verdict | 건수 | 설명 |
|---|---|---|
| HIGH_CONFIDENCE | 5 | pilot audit HIGH_CONFIDENCE 인계 |
| MANUAL_REVIEW | 13 | 이름 매칭, 주소/전화 교차확인 필요 |
| NEW_OFFICIAL_PLACE | 66 | 기존 candidate 미존재, 신규 공식 장소 |

### 4.4 기념품 분류 (Phase 6 — 8건)

| place_type | 건수 | 설명 |
|---|---|---|
| PHYSICAL_PLACE | 8 | 전원 실물 장소 (소재지 주소 또는 알려진 상호) |

### 4.5 다국어 엔티티 (Phase 7 — 92건 × 5언어)

| 콘텐츠 유형 | 건수 | 5언어 커버리지 |
|---|---|---|
| restaurant | 84 | 420/420 VALID_TRANSLATED_DETAIL |
| souvenir | 8 | 40/40 VALID_TRANSLATED_DETAIL |

### 4.6 행사 정규화 (Phase 8)

- 목록: 10건 (3개월 교차 포함)
- 고유 엔티티: 7건 (con_uid 기준)
- 장기행사 con_uid=7746: 3개월 목록에 모두 노출 → 1개 entity, 3개 listing_relation으로 정리

### 4.7 컬렉션 (Phase 9)

| 유형 | 건수 | 관계 건수 |
|---|---|---|
| 이달의추천여행지 | 7 collections | 14 place_relations |
| 여행코스 | 5 entities | 29 waypoints |
| 세계문화유산 | 5 entities | 53 relations (parent/child + related_attractions) |
| 문화관광해설 | — | 17 relations |

### 4.8 Full-v1 Candidate 결과 (Phase 11)

| 출처 | 건수 |
|---|---|
| 기존 baseline | 831 |
| 신규 — 웹 관광지 NEW_OFFICIAL_PLACE | 10 |
| 신규 — visitgyeongju 식당 NEW_OFFICIAL_PLACE | 66 |
| 신규 — visitgyeongju 기념품 신규 | 7 |
| **합계** | **914** |

### 4.9 수동 검토 큐 (Phase 12)

| 항목 유형 | 건수 |
|---|---|
| 관광지 MANUAL_REVIEW / INSUFFICIENT_EVIDENCE | 4 |
| 식당 MANUAL_REVIEW | 13 |
| 기념품 review_required | 8 |
| 추천여행지 장소 PLACE_LINKS_NOT_FOUND | 6 |
| 문화관광해설 MANUAL_REVIEW | ~9 |
| **합계** | **30** |

### 4.10 필드 충돌 감사 (Phase 14)

- HIGH_CONFIDENCE 연결 중 phone/hours/admission 불일치: 5건
- 해결 방침: 운영 정보는 웹 우선 (더 최신, 공식 현장 정보)

---

## 5. 재현성 검증 (Run1 = Run2)

| 검증 | 결과 |
|---|---|
| 비교 파일 수 | 22 |
| MATCH | 22 |
| MISMATCH | 0 |
| 판정 | ✅ BYTE_IDENTICAL |

**수정 이력**: 초기 실행 시 `gyeongju-normalization-summary-v1.json`에 `run_id` 포함으로 1건 불일치.  
→ `run_id`를 파일에서 제거, 콘솔 로그에만 출력하도록 수정 후 22/22 PASS.

---

## 6. 산출물 (23개 신규 파일)

### 정규화 데이터 (10개)

| 파일 | 내용 |
|---|---|
| `normalized/gyeongju/source-facts-full-v1.jsonl` | 정규화 source facts 1,158건 |
| `normalized/gyeongju/gyeongju-full-v1-candidates.jsonl` | full-v1 candidates 914건 |
| `normalized/gyeongju/gyeongju-recommendation-collections-v1.jsonl` | 추천여행지 컬렉션 7건 |
| `normalized/gyeongju/gyeongju-recommendation-place-relations-v1.jsonl` | 추천 장소 관계 14건 |
| `normalized/gyeongju/gyeongju-course-entities-v1.jsonl` | 코스 엔티티 5건 |
| `normalized/gyeongju/gyeongju-course-waypoint-relations-v1.jsonl` | 웨이포인트 관계 29건 |
| `normalized/gyeongju/gyeongju-heritage-entities-v1.jsonl` | 세계유산 엔티티 5건 |
| `normalized/gyeongju/gyeongju-heritage-relations-v1.jsonl` | 세계유산 관계 53건 |
| `normalized/gyeongju/gyeongju-cultural-guide-relations-v1.jsonl` | 해설 관계 17건 |
| `normalized/gyeongju/gyeongju-event-entities-v1.jsonl` | 행사 엔티티 7건 |

### 감사 데이터 (11개)

| 파일 | 내용 |
|---|---|
| `normalized/gyeongju/gyeongju-attraction-identity-audit-v1.jsonl` | 관광지 identity 판정 159건 |
| `normalized/gyeongju/gyeongju-restaurant-identity-audit-v1.jsonl` | 식당 identity 판정 84건 |
| `normalized/gyeongju/gyeongju-souvenir-classification-audit-v1.jsonl` | 기념품 분류 8건 |
| `normalized/gyeongju/gyeongju-multilingual-entity-link-audit-v1.jsonl` | 다국어 연결 감사 92건 |
| `normalized/gyeongju/gyeongju-field-conflict-audit-v1.jsonl` | 필드 충돌 5건 |
| `normalized/gyeongju/gyeongju-baseline-831-identity-link-audit.jsonl` | 831 candidates × 웹 연결 |
| `normalized/gyeongju/gyeongju-event-listing-relations-v1.jsonl` | 행사 목록 관계 10건 |
| `normalized/gyeongju/gyeongju-entity-attribute-evidence-v1.jsonl` | 속성 근거 84건 |
| `normalized/gyeongju/gyeongju-manual-review-queue-v1.jsonl` | 수동 검토 큐 30건 |
| `normalized/gyeongju/gyeongju-source-filter-taxonomy-v1.json` | 필터 분류체계 |
| `normalized/gyeongju/gyeongju-attribute-mapping-audit-v1.json` | 속성 매핑 감사 |

### 요약/재현성 (2개)

| 파일 | 내용 |
|---|---|
| `normalized/gyeongju/gyeongju-normalization-summary-v1.json` | 정규화 전체 요약 |
| `normalized/gyeongju/gyeongju-run1-run2-sha-audit.json` | Run1/Run2 22/22 BYTE_IDENTICAL |

### 스크립트·문서 (2개)

| 파일 | 내용 |
|---|---|
| `scripts/gyeongju_normalize_full_v1.py` | 정규화 파이프라인 v1.0.0 |
| `docs/tourapi/gyeongju-normalization-identity-v1.md` | 본 완료보고서 |

---

## 7. 미수정 확인

| 항목 | 결과 |
|---|---|
| 기존 canonical 831건 직접 수정 | 미수정 ✅ |
| 기존 source facts 907건 직접 수정 | 미수정 ✅ |
| KTO API 행사 24건 직접 수정 | 미수정 ✅ |
| DB/migration/배포 | 없음 ✅ |
| `src/`·`functions/`·`supabase/` 수정 | 없음 ✅ |
| 비밀값 출력/커밋 | 없음 ✅ |
| `git add .` / `git add -A` 사용 | 없음 ✅ |

---

## 8. 제한 사항 및 다음 단계

| 항목 | 내용 |
|---|---|
| monthly-rec places 필드 | V3 collector 제한 — 실제 관광지명 미추출. V4에서 area_uid 추출 보강 필요 |
| 식당 NEW_OFFICIAL_PLACE 66건 | 기존 DB에 없는 visitgyeongju 공식 식당. 수동 검토 또는 일괄 신규 등록 결정 필요 |
| 수동 검토 큐 30건 | `gyeongju-manual-review-queue-v1.jsonl` 참조 |
| visitgyeongju 필터 속성 | 상세페이지 HTML 미노출 — 목록페이지 직접 크롤링 또는 API 조회 검토 |
| 좌표 미확보 | 웹 관광지·식당·기념품: 좌표 없음 (GJ01/KTO API 좌표로 identity 연결 후 전파 가능) |

작업을 완료했습니다
