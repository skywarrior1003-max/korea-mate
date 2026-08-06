# TASK-GYEONGJU-VG-KTO-DUPLICATE-LINK-FIX-V1 완료보고서

**완료일**: 2026-08-06  
**기반 브랜치**: `research/gyeongju-normalization-independent-qa-v2` HEAD `99e47e8`  
**작업 브랜치**: `data/gyeongju-vg-kto-duplicate-link-fix-v1`  
**정규화 스크립트**: `scripts/gyeongju_normalize_full_v1.py` v1.2.0 → v1.3.0  
**하네스**: PASS  
**최종 판정**: **PASS** — Run1=Run2 29/29 BYTE_IDENTICAL

---

## 1. 검증 결과 (실행 전)

### 전제 조건 확인

| 항목 | 결과 |
|---|---|
| 기반 HEAD `99e47e8` (DEF-M01 수리 + QA v2 완료) | ✅ 확인 |
| DEF-H01: 4건 LIKELY_DUPLICATE (VG-KTO 중복) | ✅ QA v2 S4에서 확인됨 |
| WEB-ATT 307/390: NOT_DUPLICATE (공유 대표전화) | ✅ 이 태스크 대상 아님 |
| frozen raw 수정 금지 | ✅ 입력 파일 변경 없음 |
| 특정 ID 하드코딩 금지 | ✅ 순수 증거 기반 동적 매칭 |
| 공용전화만으로 병합 금지 | ✅ 전화+주소+이름 3중 증거 |

### GPT 프롬프트 검증 결과

**차단 블로커**: 없음.

**개선 아이디어 발견 (2건)**:
1. **공유전화 조기 거부 로직 수정**: GPT 프롬프트의 `is_shared_or_generic_phone()` 조기 거부 방식은
   고도벌 한정식(전화 054-775-3260이 GJ08-733·GJ09-733 두 후보에 존재)을 오탐으로 거부할 위험.
   개선: 공유 전화라도 주소+이름 필터로 유일 후보를 특정할 수 있으면 허용.
   → `strong_matches` 수집 후 `len(strong_matches) == 1` 일 때만 HIGH_CONFIDENCE 반환으로 수정.

2. **Preflight 검증 경로 보정**: DEF-H01 VG 식당들은 pilot 항목이 None(not NO_MATCH).
   `NO_LINKABLE_EVIDENCE` 섹션에서 `evaluate_vg_kto_restaurant_identity()` 호출이 필요.
   → PILOT_NO_MATCH 분기 AND 최종 NO_LINKABLE_EVIDENCE 분기 모두에 삽입.

**결정**: EXECUTE (개선된 로직 포함)

---

## 2. 구현 내용

### 2.1 새 함수 추가 (`scripts/gyeongju_normalize_full_v1.py`)

| 함수 | 역할 |
|---|---|
| `_norm_name_nospace(s)` | NFC + 공백 제거 + lowercase (이름 포함 비교) |
| `is_shared_or_generic_phone(phone, idx)` | 공유 전화 탐지 유틸리티 (문서용, 직접 blocking 불사용) |
| `compare_normalized_address(vg_addr, bl_addr)` | 주소 EXACT/CONTAINMENT 비교 |
| `evaluate_vg_kto_restaurant_identity(rest, idx, web_sfid)` | 3중 증거(전화+주소+이름) 매칭 — 정확히 1건 통과 시 HIGH_CONFIDENCE |

### 2.2 `link_restaurant_identity()` 수정

- **PILOT_VG_CAND_NO_MATCH 분기**: NEW_OFFICIAL_PLACE 반환 직전에 `evaluate_vg_kto` 호출
- **NO_LINKABLE_EVIDENCE 분기 (최종)**: NEW_OFFICIAL_PLACE 반환 직전에 `evaluate_vg_kto` 호출

### 2.3 매칭 기준 (3가지 모두 충족 필요)

1. **전화번호 일치** (`norm_phone`): 9자리 이상
2. **주소 포함** (`compare_normalized_address`): EXACT 또는 CONTAINMENT
   - 경주시, 경상북도, 경북 접두사 제거 후 공백 제거 비교
3. **이름 포함** (`_norm_name_nospace`): 동일 또는 한쪽이 다른쪽에 포함
   - 공백 제거 후 비교 (고도벌 한정식↔고도벌한정식, 스틸룸(Stillroom)↔스틸룸 등)

**공유전화 처리**: 전화가 2+ 후보에 매칭되어도 주소+이름 필터로 유일 후보(1건)가 특정되면 허용.

---

## 3. 사전 검증 (Preflight)

| 검사 항목 | 결과 |
|---|---|
| DEF-H01 4건 최종 PILOT_NO_MATCH 여부 확인 | ❌ (pilot=None — pilot 항목 없음, 올바른 이해 필요) |
| DEF-H01 4건 NO_LINKABLE_EVIDENCE 경로 확인 | ✅ Evidence 2·3·4 미매칭 → 최종 폴백 |
| 고도벌한정식 공유전화 처리 | ✅ strong_matches=[GJ08-733] 1건 → HIGH_CONFIDENCE |
| 정확히 1건만 통과 조건 | ✅ GJ09-733은 주소 불일치로 제외 |
| WEB-ATT 공유전화 오탐 없음 | ✅ 별도 attraction 경로, 영향 없음 |

---

## 4. 정규화 실행 결과

### 4.1 DEF-H01 4건 링크 확인

| VG source_fact_id (줄임) | VG 이름 | 링크 후보 | 증거 코드 |
|---|---|---|---|
| VG-REST-535f...4741 | 고도벌 한정식 | gyeongju-GJ08-733 | VG_KTO_PHONE_ADDRESS_NAME_MATCH |
| VG-REST-535f...404d | 산해식당 | gyeongju-GJ08-87 | VG_KTO_PHONE_ADDRESS_NAME_MATCH |
| VG-REST-535f...4c4f | 박용자 경주 명동쫄면 | gyeongju-GJ08-760 | VG_KTO_PHONE_ADDRESS_NAME_MATCH |
| VG-REST-535f...4d4a | 스틸룸(Stillroom) | gyeongju-GJ08-405 | VG_KTO_PHONE_ADDRESS_NAME_MATCH |

모든 4건: 전화+주소(CONTAINMENT)+이름(포함) 3중 증거 → **HIGH_CONFIDENCE**

### 4.2 정규화 결과 분포 비교

| 항목 | v1.2.0 (이전) | v1.3.0 (이후) | 변화 |
|---|---|---|---|
| 식당 HIGH_CONFIDENCE | 5 | **9** | +4 |
| 식당 MANUAL_REVIEW | 13 | **13** | 변화 없음 |
| 식당 NEW_OFFICIAL_PLACE | 66 | **62** | -4 |
| 전체 candidates | 914 | **910** | -4 |

### 4.3 재현성 검증

| 항목 | 값 |
|---|---|
| 비교 방식 | Run1 vs Run2 (동일 입력/파라미터) |
| 비교 파일 수 | 29 |
| BYTE_IDENTICAL | 29 |
| MISMATCH | 0 |
| **판정** | ✅ **BYTE_IDENTICAL** |

---

## 5. DEF 상태 업데이트

| DEF | 등급 | 내용 | 상태 |
|---|---|---|---|
| DEF-C01 | CRITICAL | candidate_id 중복 10그룹 | ✅ RESOLVED (이전 태스크) |
| DEF-C02 | CRITICAL | source_fact_id 중복 10그룹 | ✅ RESOLVED (이전 태스크) |
| DEF-M01 | MEDIUM | manifest stale SHA 4건 | ✅ RESOLVED (이전 태스크) |
| DEF-H01 | HIGH | 5 LIKELY_DUPLICATE 후보 | ✅ **RESOLVED** — VG 식당 4건 HIGH_CONFIDENCE 링크 완료, WEB-ATT 2건 NOT_DUPLICATE 확인 |
| DEF-L01 | LOW | Heritage coverage gap 25건 | OPEN (수집 범위 한계) |

---

## 6. 미수정 확인

| 항목 | 결과 |
|---|---|
| frozen raw 파일 변경 | 없음 ✅ |
| baseline 831 원본 수정 | 없음 ✅ |
| identity status 임의 변경 | 없음 ✅ (증거 기반 HIGH_CONFIDENCE만) |
| 특정 hexID·candidate ID 하드코딩 | 없음 ✅ |
| HTTP·API·WebFetch 호출 | 0건 ✅ |
| DB/migration/배포 | 없음 ✅ |
| `src/`·`functions/`·`supabase/` 수정 | 없음 ✅ |
| 비밀값 출력/커밋 | 없음 ✅ |

---

## 7. 산출물

### 스크립트 (1개)

| 파일 | 내용 |
|---|---|
| `scripts/gyeongju_normalize_full_v1.py` | v1.2.0 → v1.3.0, DEF-H01 4건 링크 로직 |

### 정규화 출력 (28개, `data/tourapi/normalized/gyeongju/`)

| 파일 | SHA256 (16-hex) |
|---|---|
| `gyeongju-full-v1-candidates.jsonl` | `1ed2c18b2d7b7bf8` |
| `gyeongju-restaurant-identity-audit-v1.jsonl` | `f69d5a40d915b5b5` |
| `gyeongju-baseline-831-identity-link-audit.jsonl` | `3a01828930d84d21` |
| `gyeongju-normalization-summary-v1.json` | `59fa5b37d57552bb` |
| (나머지 24개: Run1=Run2 BYTE_IDENTICAL 감사 파일 참조) | |

### 감사 파일 (4개, `data/tourapi/validation/gyeongju/`)

| 파일 | SHA256 (16-hex) | 내용 |
|---|---|---|
| `gyeongju-vg-kto-dup-link-preflight-v1.json` | `44a23e0bcf0def99` | 사전 검증 보고서 |
| `gyeongju-vg-kto-identity-evidence-v1.jsonl` | `90b22444b2a9e880` | 4건 링크 상세 증거 |
| `gyeongju-vg-kto-candidate-mapping-v1.jsonl` | `f0bf66769fc74762` | Before/After 후보 매핑 |
| `gyeongju-vg-kto-dup-link-run1-run2-sha-audit.json` | `ddb2322b92bd154b` | Run1=Run2 SHA 감사 |

---

## 8. 후속 조치

DEF-H01 **RESOLVED** — 별도 태스크 불필요.

다음 단계:
- Release/HOLD 분류 태스크 (`TASK-GYEONGJU-RELEASE-HOLD-CLASSIFICATION`)
  - DEF-L01 (heritage 25건 coverage gap) 처리 방안 결정 포함

---

*본 완료보고서는 검증 내용을 포함한다.  
정규화 산출물 세부 결과: `data/tourapi/normalized/gyeongju/gyeongju-normalization-summary-v1.json` 참조.  
Run1=Run2 SHA 감사: `data/tourapi/validation/gyeongju/gyeongju-vg-kto-dup-link-run1-run2-sha-audit.json` 참조.*
