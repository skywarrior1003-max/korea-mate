# 부산 이미지 권리 연결 가능성 감사

**작성일:** 2026-07-26
**작성:** TASK-DATA-BUSAN-IMAGE-RIGHTS-LINKAGE-20A-3
**목적:** 기존 raw·normalized·candidate 데이터만으로 이미지 권리 정보 연결 가능 여부 점검

---

## 요약

| 공급자 | auto_linkable | manual_review | not_linkable | no_image | 합계 |
|---|---|---|---|---|---|
| VisitBusan | 0 | 958 | 0 | 0 | 958 |
| KTO TourAPI | 543 | 0 | 0 | 0 | 543 |
| 이미지 없음 | 0 | 0 | 0 | 141 | 141 |
| **합계** | **543** | **958** | **0** | **141** | **1,642** |

---

## 1. KTO TourAPI (543건) — auto_linkable

### 1-1. 연결 키

| 단계 | 필드 | 위치 |
|---|---|---|
| ① candidate_id → contentid | `linked_source_keys`에서 `KorService2:NNN:lang` 패턴 추출 | busan-integrated-candidates.json |
| ② contentid → cpyrhtDivCd | KTO raw 배치 파일(`kto-ko-p*.json`)에서 contentid 키 조회 | data/tourapi/raw/busan/2026-07-24/batch/ |

### 1-2. 연결 결과

| cpyrhtDivCd 값 | 건수 | 공공누리 유형 |
|---|---|---|
| Type1 | 75 | 출처표시 — 상업·수정 허용 |
| Type3 | 468 | 출처표시+변경금지 — 상업 허용, 수정 금지 |
| 빈 값 | 0 | 해당 없음 |
| **합계** | **543** | |

**중요:** cpyrhtDivCd 값은 API 포털 기준 공공누리 유형이며, 개별 이미지의 최종 라이선스 확정은 별도 법률 검토 필요. (TASK-20A-2 정책 참조)

### 1-3. 다음 도시 재사용 절차

1. `linked_source_keys`에서 `KorService2:NNN` 패턴 추출 → contentid
2. KTO raw 배치 (`kto-ko-p*.json`) 로드 → contentid 키로 `cpyrhtDivCd` 조회
3. cpyrhtDivCd 값 → auto_linkable (Type1/Type3), 빈 값 → manual_review

---

## 2. VisitBusan (958건) — manual_review

VisitBusan 데이터에는 cpyrhtDivCd에 해당하는 권리 필드가 없습니다. 연결 가능한 식별자가 있더라도 실제 권리 여부(공공누리 마크 유무·유형)는 상세 페이지 수동 방문이 필요합니다.

### 2-1. 연결 방법 3가지

#### 방법 A — uc_seq_direct (672건)

후보 레코드에 `visitbusan_uc_seq`와 `source_detail_url`이 직접 저장된 경우.

| 필드 | 위치 |
|---|---|
| `visitbusan_uc_seq` | busan-integrated-candidates.json |
| `source_detail_url` | 동일 레코드 — VB 상세 페이지 URL |

**활용:** source_detail_url 방문 → 공공누리 마크 유무 수동 확인.

#### 방법 B — service_uc_seq_to_vbfull (198건)

`linked_source_keys`가 `AttractionService:NNN` 또는 `FoodService:NNN` 형태이고 `visitbusan-content-full.json`에 UC_SEQ가 존재하는 경우.

| 단계 | 필드 | 위치 |
|---|---|---|
| ① UC_SEQ 추출 | `linked_source_keys`에서 `ServiceName:NNN` 패턴 | busan-integrated-candidates.json |
| ② source_detail_url 조회 | `uc_seq` 키로 vbFull 검색 | visitbusan-content-full.json |

**활용:** 조회된 source_detail_url 방문 → 공공누리 마크 확인.

#### 방법 C — image_url_to_raw_uc_seq (88건)

`linked_source_keys`가 `FoodService:NNN` 또는 `FestivalService:NNN`이고 vbFull 미매칭인 경우. VB 전용 API(getFoodKr, getFestivalKr)에서만 제공되는 콘텐츠.

| 단계 | 필드 | 위치 |
|---|---|---|
| ① UC_SEQ 추출 | `linked_source_keys`에서 직접 또는 image_url 역추적 | busan-attraction/food/festival raw 배치 |
| ② source_detail_url | 현재 미확보 — URL 패턴 수동 구성 필요 | — |

**활용:** UC_SEQ를 사용해 VB 상세 페이지 URL 수동 구성 후 방문 → 공공누리 마크 확인.

### 2-2. 다음 도시 재사용 절차

1. `visitbusan_uc_seq` 필드 직접 확인 (있으면 방법 A)
2. `linked_source_keys`에서 AttractionService/FoodService:NNN 추출 → visitbusan-content-full에서 source_detail_url 조회 (있으면 방법 B)
3. FoodService/FestivalService raw 배치에서 이미지 URL 역맵 구성 → UC_SEQ 확인 (방법 C)
4. 모두 실패 → not_linkable

---

## 3. 연결 불가 (0건)

· 해당 없음 (0건).

---

## 4. 산출물 파일

| 파일 | 설명 |
|---|---|
| `data/tourapi/reports/busan/busan-image-rights-linkage-audit.csv` | 1,642행 감사 결과 |
| `docs/tourapi/busan-image-rights-linkage-20a3.md` | 이 보고서 |

**수정하지 않은 파일:**
- busan-integrated-candidates.json / .csv
- busan-image-rights-audit.csv (PHASE 1)
- 기타 정본 파일 전체

git add·commit·push: 미실행

---

## 5. HARD STOP 검사 결과

| 검사 항목 | 결과 |
|---|---|
| 총 후보 1,767건 | ✓ |
| 활성 1,642건 | ✓ |
| candidate_id 중복 | 0건 ✓ |
| VB 958건 누락 | 0건 ✓ |
| KTO 543건 누락 | 0건 ✓ |
| no_image 141건 누락 | 0건 ✓ |
| auto_linkable 행 근거 미비 | 0건 ✓ |
| 기존 정본 파일 수정 | 없음 ✓ |
