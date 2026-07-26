# TASK-DATA-BUSAN-VB-IMAGE-REPLACEMENT-MATCH-20A-8 완료보고서

**작성일**: 2026-07-26  
**상태**: 완료 (실제 교체·commit·push 보류)

---

## 1. 검증 내용

### 1-1. 프롬프트 구조 검증

| 항목 | 검증 결과 |
|------|-----------|
| 입력 데이터 (VB 958건) | busan-image-rights-audit.csv, image_source_domain=www.visitbusan.net ✓ |
| 대체 풀 (KTO 543건) | item_verified + usable + tong.visitkorea.or.kr ✓ |
| 산출물 경로 | data/tourapi/reports/busan/busan-vb-image-replacement-match.csv ✓ |
| 컬럼 10개 | 프롬프트 지정 그대로 ✓ |
| 원본 수정 금지 | 스냅샷 검증 포함 ✓ |

### 1-2. 데이터 구조 사전 확인

**VB 958건 prefix 분포** (busan-image-rights-audit.csv 기준):
- busan-A-*: 213건 (VisitBusan 관광명소 AttractionService)
- busan-E-*: 38건 (VisitBusan 이벤트)
- busan-F-*: 397건 (VisitBusan 축제·행사)
- busan-VBM-* / busan-VB-*: 310건 (VisitBusan 콘텐츠·쇼핑·체험 등)

**KTO 543 usable 풀**: 전부 busan-K-* (TourAPI KorService2), kogl_1(75건) + kogl_3(468건)

**linked_source_keys 형식**:
- busan-K-*: `"KorService2:NNN:ko"` (단일 문자열)
- busan-A-* api_only: `"AttractionService:NNN:ko"`
- busan-A-* existing_enriched: `"VisitBusanContent:attraction:NNN:ko|AttractionService:NNN:ko"` (파이프 구분)
- busan-VBM-*: `"VisitBusanContent:type:NNN:ko"`

**Method 1 사전 분석**:
- `merge_target_id` 보유 VB 후보 9건 (busan-VBM-*) 전부 busan-A-* 또는 busan-F-* 를 가리킴
- busan-A-*, busan-F-*는 KTO usable 풀(busan-K-*)에 포함되지 않음
- linked_source_keys에 `KorService2` 를 포함하는 VB 후보 = 없음
- → Method 1 실질 매칭 건수 0건 예측 (정상 — 데이터 구조상 필연)

---

## 2. 실행 결과

### 2-1. 매칭 결과 요약

| 결과 | 건수 |
|------|------|
| auto_replace_candidate | **7** |
| manual_review | **2** |
| no_kto_match | **949** |
| **합계** | **958** |

### 2-2. KTO 라이선스 분포 (매칭 성공 9건)

| 라이선스 | 건수 | 특이사항 |
|----------|------|---------|
| kogl_1 (공공누리 1유형) | 1 | 출처표시 조건 충족 시 상업·수정 허용 |
| kogl_3 (공공누리 3유형) | 8 | 출처표시 조건 충족 시 상업 허용, **수정 금지** |

※ 모든 Type3 매칭 건의 decision_reason에 `[공공누리 3유형: 수정 금지]` 명시됨.

### 2-3. 매칭 방식별 건수

| 방식 | 건수 | 설명 |
|------|------|------|
| Method 1 (linked_source / merge_target) | 0 | VB→KTO 직접 연결 없음 (데이터 구조상 정상) |
| Method 2 (장소명 정규화 + 주소 일치) | 4 | 정확 일치 (exact) |
| Method 3 (좌표 100m + 장소명 유사) | 5 | high(3건) + medium(2건) |
| no_match | 949 | KTO 대체 후보 없음 |

### 2-4. 매칭 성공 9건 상세

| # | candidate_id | 장소명 | KTO contentid | 라이선스 | 방식 | 신뢰도 | 상태 |
|---|--------------|--------|---------------|---------|------|--------|------|
| 1 | busan-A-00002 | 깡깡이 예술마을 | 2554070 | kogl_3 | method2 | exact | auto_replace |
| 2 | busan-A-00049 | 렛츠런파크 부산경남 | 2456224 | kogl_3 | method2 | exact | auto_replace |
| 3 | busan-A-00072 | 금정산 | 126028 | kogl_1 | method2 | exact | auto_replace |
| 4 | busan-F-00402 | 롯데호텔 부산 블루헤이… | 142998 | kogl_3 | method3 | medium | **manual_review** |
| 5 | busan-VB-1964 | 갖고 싶은 소품이 모두 | 2782747 | kogl_3 | method3 | high | auto_replace |
| 6 | busan-VB-548 | 신세계백화점 센텀시티점 | 767084 | kogl_3 | method2 | exact | auto_replace |
| 7 | busan-VB-1853 | 감성 캠핑소품샵이 있는 | 2785267 | kogl_3 | method3 | high | auto_replace |
| 8 | busan-VB-1364 | 강, 바다 야경을 동시 | 2705325 | kogl_3 | method3 | high | auto_replace |
| 9 | busan-VB-336 | 낙동강을 따라 떠나는 | 2783344 | kogl_3 | method3 | medium | **manual_review** |

### 2-5. no_kto_match 949건 원인 분석

| VB 후보 유형 | 건수 | no_kto_match 이유 |
|-------------|------|------------------|
| busan-F-* 축제·행사 | ~395 | KTO 관광명소 풀(busan-K-*)에 동일 장소 없음 |
| busan-E-* 이벤트 | ~36 | 이벤트 데이터 KTO 관광명소 풀에 없음 |
| busan-A-* 관광명소 | ~210 | 부분 겹침 있으나 대다수 KTO 미등재 |
| busan-VBM-*/busan-VB-* | ~308 | 쇼핑·체험·콘텐츠 → KTO 관광명소 풀 외 |

---

## 3. 검증 결과

| 항목 | 결과 |
|------|------|
| VB 958건 누락 0 | ✓ (출력 958행 확인) |
| candidate_id 중복 0 | ✓ |
| auto_replace 전건 tong.visitkorea.or.kr | ✓ |
| auto_replace license_type kogl_1 또는 kogl_3 | ✓ |
| 원본 audit CSV 무변경 | ✓ (파일 크기 일치) |
| 원본 candidates JSON 무변경 | ✓ (파일 크기 일치) |
| 원본 candidates CSV 무변경 | ✓ (파일 크기 일치) |
| 실제 이미지 교체 없음 | ✓ (신규 파일만 생성) |

---

## 4. 변경 파일

| 파일 | 유형 | 내용 |
|------|------|------|
| `data/tourapi/reports/busan/busan-vb-image-replacement-match.csv` | **신규** | 959줄 (헤더 + 958행) |
| `scripts/tourapi-busan-vb-image-replacement-match-20a8.mjs` | **신규** | 실행 스크립트 |

---

## 5. 다음 단계 권고

- **auto_replace 7건**: 실제 image_url 교체 작업 전 담당자 최종 확인 후 적용 가능
- **manual_review 2건** (busan-F-00402, busan-VB-336): 50~100m 범위 medium 신뢰도 — 지도 확인 후 교체 여부 결정
- **no_kto_match 949건**: VB 이미지 rights 확정 시까지 현행 유지 또는 추후 재매칭

---

TASK-DATA-BUSAN-VB-IMAGE-REPLACEMENT-MATCH-20A-8 VisitBusan 이미지의 KTO 대체 후보 매칭 완료 — 실제 교체·commit·push 보류.
