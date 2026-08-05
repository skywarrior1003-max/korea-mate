# TASK-GYEONGJU-VG-CANDIDATE-ID-FIX-V1 완료보고서

**완료일**: 2026-08-05  
**기반 브랜치**: `research/gyeongju-normalization-independent-qa-v1` HEAD `9fc3a80`  
**작업 브랜치**: `data/gyeongju-vg-candidate-id-fix-v1`  
**스크립트**: `scripts/gyeongju_normalize_full_v1.py` v1.1.0 → **v1.2.0**  
**결과**: **PASS** — Run1 = Run2 28/28 BYTE_IDENTICAL

---

## 1. 검증 결과 (실행 전)

### 전제 조건 확인

| 항목 | 결과 |
|---|---|
| 기반 HEAD `9fc3a80` | ✅ 확인 |
| 독립 QA 결과 FAIL (DEF-C01/C02 CRITICAL) | ✅ 확인 |
| VG raw hex_id 34자 | ✅ 확인 (restaurants 84건, souvenirs 8건 전부) |
| pilot_vg_cand.vg_id 34자 full hexId | ✅ 확인 (vg_hex_to_cand_link 정상 동작) |
| baseline 831 VG-NEW 미포함 (영향 없음) | ✅ 확인 |

### 설계 검토 결과

**차단 블로커**: 없음.  
**더 나은 개선방향**: 없음 (full hexId 직접 사용이 SHA-256 해시보다 투명성 우수).  
**결정**: EXECUTE

---

## 2. 사전 분석 (Preflight)

### 2.1 DEF-C01 / DEF-C02 재현 확인

| 항목 | 값 |
|---|---|
| VG-NEW candidate_id 중복 그룹 | 10 (restaurant 8, souvenir 2) |
| VG source_fact_id 중복 그룹 | 10 (restaurant 8, souvenir 2) |
| 재현 판정 | CONFIRMED |
| 감사 파일 | `gyeongju-vg-prefix-collision-preflight-audit-v1.json` |

### 2.2 collision 원인 확인

| 집계 | restaurant | souvenir |
|---|---|---|
| 원본 hex_id 34자 고유 | 84/84 ✅ | 8/8 ✅ |
| 첫 16자 고유 | 9/84 ❌ | 3/8 ❌ |
| 최대 충돌 그룹 크기 | 14건 (535f40400604084d) | 5건 (535f404006040946) |

**근본 원인**: visitgyeongju hex_id는 34자이며 앞 16자는 페이지 접두사(같은 페이지의 식당들이 공유). `hex_id[:16]` 잘라내기가 엔티티 구분 정보를 제거함.

### 2.3 수정 범위

수정이 필요한 코드 위치 9곳:

| 라인 | 위치 | 변경 내용 |
|---|---|---|
| 495 | `build_source_facts()` VG-REST sfid | `[:16]` 제거 |
| 534 | `build_source_facts()` VG-SOUV sfid | `[:16]` 제거 |
| 730 | `link_restaurant_identity()` web_sfid | `[:16]` 제거 |
| 743 | evidence_values PILOT_HIGH | `[:16]` 제거 |
| 748 | evidence_values PILOT_NO_MATCH | `[:16]` 제거 |
| 757 | evidence_values PILOT_MANUAL | `[:16]` 제거 |
| 810 | evidence_values NO_EVIDENCE | `[:16]` 제거 |
| 828 | `classify_souvenir()` web_sfid | `[:16]` 제거 |
| 913 | `_multilingual_entity()` entity_source_id | `[:16]` 제거 |
| 1566 | `build_source_filter_taxonomy()` entity_id | `[:16]` 제거 |
| 1663 | `build_full_v1_candidates()` sfid 매칭 | `[:16]` 제거 |
| 1667 | `build_full_v1_candidates()` new_id (REST) | `[:16]` 제거 |
| 1692 | `build_full_v1_candidates()` new_id (SOUV) | `[:16]` 제거 |

---

## 3. 스크립트 변경 내역 (v1.1.0 → v1.2.0)

### 3.1 버전 상수

| 항목 | v1.1.0 | v1.2.0 |
|---|---|---|
| `VERSION` | `"1.1.0"` | `"1.2.0"` |
| `TASK` | `TASK-GYEONGJU-MONTHLY-REC-RELATION-FIX-ALT-V1` | `TASK-GYEONGJU-VG-CANDIDATE-ID-FIX-V1` |
| `TASK_BASE` | `TASK-GYEONGJU-NORMALIZATION-AND-IDENTITY-V1` | `TASK-GYEONGJU-MONTHLY-REC-RELATION-FIX-ALT-V1` |

### 3.2 수정 패턴

```python
# Before (v1.1.0 — 버그)
sfid = f"gyeongju-VG-REST-{rest.get('hex_id', '')[:16]}"
web_sfid = f"gyeongju-VG-REST-{hex_id[:16]}"
new_id = f"gyeongju-VG-NEW-REST-{rest.get('hex_id','')[:16]}"

# After (v1.2.0 — 수정)
sfid = f"gyeongju-VG-REST-{rest.get('hex_id', '')}"       # 전체 34자
web_sfid = f"gyeongju-VG-REST-{hex_id}"                   # 전체 34자
new_id = f"gyeongju-VG-NEW-REST-{rest.get('hex_id','')}"  # 전체 34자
```

---

## 4. 실행 결과

### 4.1 수량 불변 확인

| 항목 | 수정 전 | 수정 후 | 판정 |
|---|---|---|---|
| 전체 candidates | 914 | 914 | ✅ 불변 |
| VG-NEW candidates | 73 | 73 | ✅ 불변 |
| source facts | 1,158 | 1,158 | ✅ 불변 |
| VG source facts | 92 | 92 | ✅ 불변 |
| multilingual entities | 92 | 92 | ✅ 불변 |
| baseline 831 IDs | 불변 | 불변 | ✅ 영향 없음 |

### 4.2 ID 고유성 해소

| 항목 | 수정 전 (v1.1.0) | 수정 후 (v1.2.0) | 판정 |
|---|---|---|---|
| 중복 VG candidate_id 그룹 | 10 | **0** | ✅ DEF-C01 RESOLVED |
| 중복 VG source_fact_id 그룹 | 10 | **0** | ✅ DEF-C02 RESOLVED |
| 중복 entity_source_id 그룹 | 10 | **0** | ✅ 추가 수정 |
| VG-NEW-REST unique IDs | 9/66 (unique/total) | **66/66** | ✅ 완전 고유 |
| VG-NEW-SOUV unique IDs | 3/7 | **7/7** | ✅ 완전 고유 |

### 4.3 샘플 ID 변경

```
# restaurant: 고도벌 한정식 (hex_id=535f40400604084d0a48034645514b4741)
  OLD candidate_id: gyeongju-VG-NEW-REST-535f40400604084d  (16자, 다른 13개 식당과 공유)
  NEW candidate_id: gyeongju-VG-NEW-REST-535f40400604084d0a48034645514b4741  (34자, 고유)

  OLD source_fact_id: gyeongju-VG-REST-535f40400604084d
  NEW source_fact_id: gyeongju-VG-REST-535f40400604084d0a48034645514b4741
```

### 4.4 변경된 출력 파일 (9건)

| 파일 | 변경 이유 |
|---|---|
| `source-facts-full-v1.jsonl` | 84 VG-REST + 8 VG-SOUV sfid 갱신 |
| `gyeongju-full-v1-candidates.jsonl` | 66 VG-NEW-REST + 7 VG-NEW-SOUV candidate_id 갱신 |
| `gyeongju-restaurant-identity-audit-v1.jsonl` | 84 VG-REST sfid/web_sfid 갱신 |
| `gyeongju-souvenir-classification-audit-v1.jsonl` | 8 VG-SOUV sfid 갱신 |
| `gyeongju-multilingual-entity-link-audit-v1.jsonl` | 92 entity_source_id 갱신 |
| `gyeongju-manual-review-queue-v1.jsonl` | 13 VG 식당 review 항목 sfid 갱신 |
| `gyeongju-baseline-831-identity-link-audit.jsonl` | task/버전 정보 갱신 |
| `gyeongju-entity-attribute-evidence-v1.jsonl` | 84 VG-REST entity_id 갱신 |
| `gyeongju-normalization-summary-v1.json` | task=VG-CANDIDATE-ID-FIX-V1, version=1.2.0 갱신 |

### 4.5 보존된 출력 파일 (19건)

attraction, event, course, heritage, cultural-guide, monthly-rec 계열 등 VG ID와 무관한 파일 모두 SHA 불변 확인.

### 4.6 신규 감사 파일 (2건)

| 파일 | 내용 |
|---|---|
| `gyeongju-vg-prefix-collision-preflight-audit-v1.json` | DEF-C01/C02 재현 감사 (validation/) |
| `gyeongju-vg-id-fix-mapping-audit-v1.jsonl` | v1.1.0→v1.2.0 ID 변경 매핑 258건 (validation/) |

---

## 5. 재현성 검증

| 검증 | 결과 |
|---|---|
| 비교 방식 | Run1 vs Run2 (독립 실행, 동일 입력/파라미터) |
| 비교 파일 수 | 28 |
| MATCH | 28 |
| MISMATCH | 0 |
| 판정 | ✅ **BYTE_IDENTICAL** |

---

## 6. DEF 상태 업데이트

| DEF | 심각도 | 내용 | 상태 |
|---|---|---|---|
| DEF-C01 | CRITICAL | candidate_id 중복 (10그룹) | ✅ **RESOLVED** (이 태스크) |
| DEF-C02 | CRITICAL | source_fact_id 중복 (10그룹) | ✅ **RESOLVED** (이 태스크) |
| DEF-H01 | HIGH | 5 LIKELY_DUPLICATE 후보 | OPEN (후속 태스크에서 처리) |
| DEF-M01 | MEDIUM | manifest 비-정규화 파일 SHA | OPEN (manifest 갱신으로 부분 해소) |
| DEF-L01 | LOW | Heritage RELATED_ATTRACTION 커버리지 | OPEN |

**릴리스 판정**: GYEONGJU_NORMALIZATION_QA_HOLD — DEF-H01(HIGH) 미해소  
(Release/HOLD 최종 분류는 이 태스크 범위 외)

---

## 7. 미수정 확인

| 항목 | 결과 |
|---|---|
| 기존 canonical 831건 직접 수정 | 미수정 ✅ |
| source facts 입력 907건 직접 수정 | 미수정 ✅ |
| web-raw-v3 frozen raw 수정 | 미수정 ✅ |
| baseline 831 ID 수정 | 미수정 ✅ |
| 신규 candidate 추가 | 없음 ✅ |
| candidate 삭제 | 없음 ✅ |
| DEF-H01 5건 임의 병합 | 없음 ✅ |
| identity status 임의 변경 | 없음 ✅ |
| HTTP 요청 | 0건 ✅ |
| DB/migration/배포 | 없음 ✅ |
| `src/`·`functions/`·`supabase/` 수정 | 없음 ✅ |
| 비밀값 출력/커밋 | 없음 ✅ |

---

## 8. 산출물 (30개 파일)

### 변경된 정규화 산출물 (9개)

| 파일 | SHA256 (16-hex prefix) |
|---|---|
| `source-facts-full-v1.jsonl` | `481fe795f992a4c3` |
| `gyeongju-full-v1-candidates.jsonl` | `797e386cc122de7d` |
| `gyeongju-restaurant-identity-audit-v1.jsonl` | `6f453f8e3824250d` |
| `gyeongju-souvenir-classification-audit-v1.jsonl` | `89f589574ac86a11` |
| `gyeongju-multilingual-entity-link-audit-v1.jsonl` | `b43c4e414808087c` |
| `gyeongju-manual-review-queue-v1.jsonl` | `762602eae3bb03ed` |
| `gyeongju-entity-attribute-evidence-v1.jsonl` | `08ae41049aee7d53` |
| `gyeongju-baseline-831-identity-link-audit.jsonl` | `0e268a5d8bfe2764` |
| `gyeongju-normalization-summary-v1.json` | `422527527f777f16` |

### 불변 정규화 산출물 (19개)

이전 태스크(v1.1.0) SHA와 byte-identical 유지 확인.

### 신규 감사 파일 (2개)

`gyeongju-vg-prefix-collision-preflight-audit-v1.json`,  
`gyeongju-vg-id-fix-mapping-audit-v1.jsonl`

---

## 9. 후속 조치

### DEF-H01 처리 (별도 태스크)

5건의 LIKELY_DUPLICATE 후보에 대한 후속 처리가 필요하다.  
이 태스크에서 임의 병합 금지. 별도 독립 QA 태스크에서 검토:

| candidate_id | 신호 | 비고 |
|---|---|---|
| `gyeongju-VG-NEW-REST-535f40400604084d0a48034645514b4741` | 이름+전화 GJ08/GJ09 중복 | ID 수정 후 이 ID로 갱신됨 |
| `gyeongju-VG-NEW-REST-535f40400605094c0a4604484651434341` | GJ08-6733과 이름+전화 일치 | 동일 |
| `gyeongju-VG-NEW-REST-535f404007020940...` | GJ09-372와 일치 | 동일 |
| `gyeongju-WEB-NEW-ATT-307` | KTO15 숙박과 전화 일치 | 공용전화 가능 |
| `gyeongju-WEB-NEW-ATT-390` | KTO15 숙박과 전화 일치 | 공용전화 가능 |

---

*본 완료보고서는 검증 내용을 포함하며, 사전 감사(preflight audit)는  
`data/tourapi/validation/gyeongju/gyeongju-vg-prefix-collision-preflight-audit-v1.json` 참조.*
