# TASK-DATA-BUSAN-RESTAURANT-IMAGE-RIGHTS-20A-9 완료보고서

**작성일**: 2026-07-26  
**상태**: 완료 (운영 반영·commit·push 보류)

---

## 1. 검증 내용

### 1-1. 프롬프트 구조 검증

| 항목 | 검증 결과 |
|------|-----------|
| 대상 (VB 958 중 restaurant) | 415건 ✓ |
| 허용값 명시 (`owner_promotional_image_likely`) | yes/no/unknown ✓ |
| 허용값 명시 (`source_type`) | 5종 ✓ |
| 허용값 명시 (`operational_risk`) | 4종 ✓ |
| 허용값 명시 (`recommended_action`) | 5종 ✓ |
| KTO 대체 이미지 탐색 제외 | 명시 ✓ |
| 원본 수정 금지 | 스냅샷 검증 포함 ✓ |
| 미명시 컬럼 (`third_party_indicator`, `watermark_or_credit`) | yes/no/unknown 패턴으로 처리 (차단 불요) |

**판단: 실행 가능. 개선 아이디어 없음.**

### 1-2. 데이터 사전 확인

**링크드 소스 키 패턴 분포 (415건)**:

| source_type | 건수 | candidate_status |
|------------|------|-----------------|
| `foodservice_and_visitbusan_content` | 325 | existing_enriched |
| `visitbusan_foodservice` | 72 | api_only_existing |
| `visitbusan_content` | 18 | web_only_new |

- image_url 없는 건: 0건 ✓
- source_detail_url 없는 건: 72건 (FoodService 단독, 상세 페이지 없음 — 정상)
- 이미지 직접 검수 불가: 모든 이미지 `www.visitbusan.net/uploadImgs/` 호스팅, 워터마크·제3자 표기 여부는 URL로 판단 불가 → `third_party_indicator = unknown`, `watermark_or_credit = unknown` (정직한 처리)

---

## 2. 실행 결과

### 2-1. 공식 홍보 사진 추정

| owner_promotional_image_likely | 건수 |
|-------------------------------|------|
| yes | **397** |
| no | **0** |
| unknown | **18** |

### 2-2. 운영 위험도

| operational_risk | 건수 |
|-----------------|------|
| low | **397** |
| medium | **18** |
| high | **0** |
| unknown | **0** |

### 2-3. 권고 조치

| recommended_action | 건수 |
|-------------------|------|
| use_as_official_promotional_image | **397** |
| manual_review | **18** |
| replace_image / do_not_use | **0** |

### 2-4. 판정 근거 요약

| source_type | 판정 | 근거 |
|------------|------|------|
| `foodservice_and_visitbusan_content` (325건) | low / yes | FoodService API + VisitBusan 공식 콘텐츠 이중 확인. 공식 음식 관광 DB 출처. |
| `visitbusan_foodservice` (72건) | low / yes | VisitBusan FoodService API 단독. 공식 관광 음식점 데이터베이스. 상세 페이지 없음. |
| `visitbusan_content` (18건) | medium / unknown | 웹 콘텐츠 단독 (web_only_new). FoodService API 미연결. 공식 여부 불확실. |

> **법적 라이선스 미확정**: 전 415건 `license_verification = unverified` 유지. 공식 홍보 이미지 추정과 법적 사용 허가는 구분.

---

## 3. 검증 결과

| 항목 | 결과 |
|------|------|
| restaurant 415건 누락 0 | ✓ |
| candidate_id 중복 0 | ✓ |
| third_party=yes + low 처리 0건 | ✓ |
| low 판정 전건 공식 출처 확인 | ✓ |
| operational_risk 허용값 검증 | ✓ |
| recommended_action 허용값 검증 | ✓ |
| owner_promotional_image_likely 허용값 검증 | ✓ |
| 원본 audit CSV 무변경 | ✓ |
| 원본 candidates JSON 무변경 | ✓ |
| 원본 candidates CSV 무변경 | ✓ |

---

## 4. 변경 파일

| 파일 | 유형 | 내용 |
|------|------|------|
| `data/tourapi/reports/busan/busan-restaurant-image-rights.csv` | **신규** | 416줄 (헤더 + 415행) |
| `scripts/tourapi-busan-restaurant-image-rights-20a9.mjs` | **신규** | 실행 스크립트 |

---

## 5. 운영 참고

- **397건 (low)**: FoodService API 공식 출처 확인. 최소 안전장치 통과. 실제 사용 전 출처 표기 방식 결정 필요.
- **18건 (medium/manual_review)**: VisitBusan 웹 콘텐츠 단독 소스 (web_only_new). FoodService API 미연결로 추가 확인 권고. 음식점명: 18건은 VisitBusan 음식 콘텐츠 페이지에서 직접 수집.
- **전 415건**: 이미지 직접 검수 미실시. 법적 라이선스 확정은 VisitBusan 이용약관 및 FoodService API 이용허락범위 공식 확인 후 진행.

---

TASK-DATA-BUSAN-RESTAURANT-IMAGE-RIGHTS-20A-9 음식점 공식 홍보 이미지 최소 안전검사 완료 — 운영 반영·commit·push 보류.
