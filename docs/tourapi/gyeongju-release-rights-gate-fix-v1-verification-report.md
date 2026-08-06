# TASK-GYEONGJU-RELEASE-RIGHTS-GATE-FIX-V1 — 검증 보고서

**작성일**: 2026-08-06  
**현재 브랜치**: `research/gyeongju-release-102-provenance-rights-audit-v1` HEAD `cc96dd7`  
**결정**: **실행 보류 — 검증보고서만 작성**  
**이유**: 프롬프트 절단 (CRITICAL) + 분류 스크립트 재실행 위험 (HIGH)

---

## 1. 검증 목적

GPT 프롬프트(TASK-GYEONGJU-RELEASE-RIGHTS-GATE-FIX-V1)를 분석해 실행 가능성을 판단한다.  
실행을 보류하는 항목: 프롬프트 결함 또는 더 나은 개선방향이 있는 경우.

---

## 2. 프롬프트 분석

### 2.1 목표 (명시된 내용)

| # | 목표 | 판정 |
|---|---|---|
| 1 | DEF-AUD-H01 해결: OFFICIAL_IMG_DOMAINS 기반 권리 판정 제거 | 의도 명확 |
| 2 | DEF-AUD-M02 해결: 별도 rights resolution 산출물에서 계약 근거 판정 | 의도 명확 |
| 3 | RELEASE 102건 이미지·설명 권리 판정 재생성 | 의도 명확 |
| 4 | 102건이 계속 RELEASE_CONFIRMED_METADATA_LIMITED인지 확인 | 의도 명확 |
| 5 | 다음 도시에서도 사용할 공통 provenance·rights gate 구현 | 이미 cc96dd7에서 완료 ← 중복 |
| 6 | raw·normalized 데이터 수정 금지 | 명확 |
| 7 | 운영 DB 반영 금지 | 명확 |

### 2.2 Git 섹션 구조

```
## Git 및 선행 Push
git switch ...
git status
git push -u origin ...
git fetch origin
git rev-parse HEAD
git rev-parse origin/research/gyeongju-release-102-provenance-rights-audit-v1
```

→ 코드 블록 닫힘 없음(` ``` ` 미종료). 이후 섹션 전무.

---

## 3. 발견된 문제 (발견 순서: 심각도 내림차순)

---

### IMP-01 ▶ CRITICAL BLOCKER: 프롬프트 절단

**근거**:  
사용자 메시지의 프롬프트가 Git 섹션 코드 블록 도중에 끝난다. `` ``` `` 종료 태그 없음. 이후 섹션 전무.

**누락된 섹션 추정**:
- `## 허용 경로` (읽기·쓰기 대상 파일 목록)
- `## 산출물` (출력 파일 명세)
- `## 브랜치 전략` (신규 브랜치명, base 커밋)
- `## 커밋 메시지` 형식
- `## Run1=Run2` 검증 요건
- `## 스크립트 수정 방법` (기존 수정 vs 신규 작성)

**영향**: 허용 경로 불명 → 어느 파일을 수정해도 CoC(범위 외 수정 금지) 위반 가능성.  

**필요 조치**: 프롬프트 완성본 제공 필요.

---

### IMP-02 ▶ HIGH RISK: 분류 스크립트 재실행 시 커밋된 산출물 덮어쓰기

**분석**:

`gyeongju_release_hold_classification_v1.py`에서 `derive_image_rights()`는 단순 권리 판정이 아니라 **RELEASE/HOLD 결정 체인 전체**에 연결되어 있다:

```python
# L326-364 (스크립트 내 실제 로직)
img_rights, img_domain = derive_image_rights(img_url)   # ← 도메인 기반
img_usable = (img_rights == "OFFICIAL_API_IMAGE_USABLE")

if not img_usable:
    hold_reasons.append("HOLD_ENRICHMENT_REQUIRED")    # HOLD 결정 영향

# RELEASE인 경우
if img_usable and desc_ko:
    readiness_tier = "RELEASE_READY"                   # tier 영향
else:
    readiness_tier = "RELEASE_READY_METADATA_LIMITED"

if img_usable:
    content_usage_scope = ["FULL_OFFICIAL_CONTENT_ALLOWED"]  # scope 영향
else:
    content_usage_scope = ["OFFICIAL_FACTS_ONLY"]
```

**스크립트 수정 + 재실행 시 영향**:

| 항목 | 현재 커밋 상태 | 재실행 후 위험 |
|---|---|---|
| `gyeongju-candidate-release-hold-v1.jsonl` | ca64e5c에 커밋됨 | 덮어쓰기 → 이전 커밋과 내용 불일치 |
| `readiness_tier` 값 | RELEASE_READY (img_usable=True 기준) | 새 기준으로 변경 가능 |
| `content_usage_scope` 값 | FULL_OFFICIAL_CONTENT_ALLOWED | 변경 가능 |
| RELEASE 102건 수 | 102건 확정 | 재실행 결과가 다를 경우 수 변동 가능 |
| `img_rights_basis` 필드 | `url_domain:www.gyeongju.go.kr` | 변경됨 |

**실제 위험 수준**: ALL 102 RELEASE 후보의 image_url 도메인이 `www.gyeongju.go.kr`이므로, 계약 기반 로직에서도 VERIFIED_ALLOWED_BY_SOURCE_CONTRACT로 통과할 가능성 높음. 하지만 엣지 케이스(image_url 없음, KTO 도메인, 미등록 namespace 등) 처리에서 분기가 달라질 수 있어 **102건 유지 보장 불가**.

---

### IMP-03 ▶ HIGH IMPROVEMENT: 신규 별도 스크립트 접근법 권장

**프롬프트 목표 2에서 스스로 제시**:  
>"normalized의 RIGHTS_UNKNOWN을 직접 수정하지 않고 **별도 rights resolution 산출물에서** 계약 근거 판정"

이 원칙을 분류 스크립트 자체에도 적용하면:

**권장 구현 방법**:

```
기존 유지:
  scripts/gyeongju_release_hold_classification_v1.py (v1.0.0 — 수정 없음)
  data/tourapi/validation/gyeongju/gyeongju-candidate-release-hold-v1.jsonl (그대로)

신규 생성:
  scripts/gyeongju_release_rights_resolution_v1.py (v1.0.0)
    - 입력: gyeongju-candidate-release-hold-v1.jsonl (RELEASE 102건 필터)
    - 로직: determine_image_rights(), determine_description_rights() (감사 스크립트와 동일)
    - 출력: gyeongju-release-rights-resolution-v1.jsonl
             gyeongju-release-rights-resolution-summary-v1.json
             gyeongju-release-def-aud-h01-resolution-v1.json (DEF-AUD-H01 해소 증명)
```

**이 접근법의 장점**:

| 항목 | 기존 스크립트 수정 | 별도 스크립트 신규 |
|---|---|---|
| ca64e5c 기준 산출물 보존 | ❌ 덮어쓰기 위험 | ✅ 보존 |
| 계약 기반 권리 판정 적용 | ✅ | ✅ |
| DEF-AUD-H01 해소 증명 | 불명확 (기존 결과 삭제됨) | ✅ 독립 증명 문서 |
| 102건 RELEASE 유지 확인 | 위험 (재실행 결과 변동 가능) | ✅ 확실 (독립 적용) |
| 다음 도시 재사용 | 스크립트 내 함수로 제한 | ✅ 독립 모듈 |
| CoC 범위 준수 | 기존 파일 변경 → 위험 | ✅ 새 파일만 추가 |

---

### IMP-04 ▶ MEDIUM NOTE: 목표 5 중복

"다음 도시에서도 사용할 공통 provenance·rights gate 구현"은 이미 `cc96dd7`에서 완료:  
- `docs/tourapi/multicity-release-provenance-rights-gate-v1.md` (작성 완료)  
- `scripts/gyeongju_release_102_provenance_rights_audit_v1.py` (reusable rights functions 포함)

신규 태스크는 이 기존 자료를 **참조**하되, 중복 작성하지 않아야 한다.

---

### IMP-05 ▶ LOW NOTE: Push 선행조건 불충족

프롬프트 Git 섹션의 첫 번째 단계:
```bash
git push -u origin research/gyeongju-release-102-provenance-rights-audit-v1
```

이 push는 auto-mode classifier에 의해 차단됨 (이전 태스크에서 확인). 선행조건 자체가 수동으로만 충족 가능하다. 완성된 프롬프트에서는 push 실패 시 태스크 중단 vs. 계속 진행 방침을 명시해야 한다.

---

## 4. 검증 결론

| 항목 | 상태 |
|---|---|
| 프롬프트 완정성 | **❌ 절단 — 허용경로·산출물·브랜치·Run1=Run2 요건 누락** |
| 실행 가능성 | **❌ 불가 (CRITICAL blocker)** |
| 주요 개선 방향 | 별도 `gyeongju_release_rights_resolution_v1.py` 신규 작성 접근법 |
| 기존 스크립트 수정 권장 | ❌ 권장하지 않음 (커밋된 산출물 덮어쓰기 위험) |

---

## 5. 완성 프롬프트에 반드시 포함할 섹션

```markdown
## 허용 경로
읽기:
- data/tourapi/validation/gyeongju/gyeongju-candidate-release-hold-v1.jsonl
- data/tourapi/normalized/gyeongju/source-facts-full-v1.jsonl
- data/tourapi/contracts/gyeongju/gyeongju-culture-tourism-source-contract-v1.json
- data/tourapi/contracts/gyeongju/visitgyeongju-source-contract-v1.json
- docs/tourapi/multicity-release-provenance-rights-gate-v1.md (참조)

쓰기:
- scripts/gyeongju_release_rights_resolution_v1.py (신규)
- data/tourapi/validation/gyeongju/gyeongju-release-rights-resolution-v1.jsonl (신규)
- data/tourapi/validation/gyeongju/gyeongju-release-rights-resolution-summary-v1.json (신규)
- data/tourapi/validation/gyeongju/gyeongju-release-def-aud-h01-resolution-v1.json (신규)
- data/tourapi/validation/gyeongju/gyeongju-release-rights-resolution-sha-audit-v1.json (신규)
- data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json (업데이트)

## 브랜치
신규: research/gyeongju-release-rights-gate-fix-v1
베이스: cc96dd7 (현재 HEAD)

## Run1=Run2 검증
- as_of: gyeongju-normalization-summary-v1.json에서 읽음
- datetime.now() 금지
- sort_keys=True, 후보 정렬 고정

## 커밋 메시지
qa(gyeongju): resolve DEF-AUD-H01 with contract-based rights resolution

## 산출물 (최소)
1. gyeongju-release-rights-resolution-v1.jsonl (102건 per-candidate)
2. gyeongju-release-rights-resolution-summary-v1.json
3. gyeongju-release-def-aud-h01-resolution-v1.json (DEF-AUD-H01 해소 증명)
4. gyeongju-release-rights-resolution-sha-audit-v1.json (Run1=Run2)
```

---

## 6. 권장 접근법 요약

```
APPROACH: 별도 rights resolution 스크립트 신규 작성

[기존 유지]
  ca64e5c: gyeongju_release_hold_classification_v1.py v1.0.0 → 수정 없음
  ca64e5c: gyeongju-candidate-release-hold-v1.jsonl → 수정 없음

[신규 추가 (cc96dd7 기반)]
  scripts/gyeongju_release_rights_resolution_v1.py
    - RELEASE 102건 필터링
    - determine_image_rights(): source fact + contract (domain 단독 금지)
    - determine_description_rights(): 동일
    - 102건 전부 VERIFIED_ALLOWED_BY_SOURCE_CONTRACT → RELEASE_CONFIRMED_METADATA_LIMITED 확인
    - DEF-AUD-H01 해소 증명 문서 생성
    - Run1=Run2 BYTE_IDENTICAL 검증

[참조 문서]
  docs/tourapi/multicity-release-provenance-rights-gate-v1.md (cc96dd7, 기존 완료)
```

---

*완성된 프롬프트로 재제출 시 IMP-03 접근법(별도 스크립트)을 기준으로 재검증 후 실행합니다.*
