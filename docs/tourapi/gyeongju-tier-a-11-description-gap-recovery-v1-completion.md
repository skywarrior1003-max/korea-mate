# TASK-GYEONGJU-TIER-A-11-DESCRIPTION-GAP-RECOVERY-V1 완료보고서

**작업 ID**: TASK-GYEONGJU-TIER-A-11-DESCRIPTION-GAP-RECOVERY-V1  
**완료 일시**: 2026-08-07T07:55:23Z (UTC)  
**브랜치**: data/gyeongju-tier-a-11-description-gap-recovery-v1  
**베이스**: data/gyeongju-vg-description-parser-final-v1 @ e2ba7db  

---

## 1. 검증 결과 (실행 전)

### 1.1 프롬프트 사전 검증

| 검증 항목 | 결과 |
|-----------|------|
| 대상 명확성: READY_WITH_REVIEW_NOTE 11건 | ✅ 올바름 — 전수 확인 |
| 소스 탐색 전략: VG → KTO → source-facts → meta 순 | ✅ 올바름 |
| HOLD_DESCRIPTION 유지 원칙 (우회 승격 금지) | ✅ 올바름 — 기준에 부합 |
| 신규 HTTP/API 요청 금지 | ✅ 올바름 — 0건 계획 |
| 기존 READY 106건 변경 금지 | ✅ 올바름 |
| 차단 이슈 | **없음** |
| 개선 아이디어 | **없음** |

결론: **검증 이상 없음 → 실행**

### 1.2 사전 검증 요약 (4개 소스 전수 점검)

| 소스 유형 | 11건 상태 | 설명 |
|-----------|-----------|------|
| VG HTML 요약정보 | PATTERN_A_OPS (11건) | 운영정보만 (관람시간/관람료 등) |
| meta/og:description | boilerplate (11건) | "한국관광의 메카 Beautiful Gyeongju..." — 개별 설명 아님 |
| KTO API | NO_KTO_RECORD (11건) | 모두 미매칭 — KTO overview 탐색 불가 |
| source-facts description_reference | None (11건) | 설명 출처 없음 |

**사전 예측**: 11건 전부 DESCRIPTION_NOT_FOUND → HOLD_DESCRIPTION

---

## 2. 황남리 고분군 charset 재확인

| 항목 | 결과 |
|------|------|
| candidate_id | gyeongju-GJ01-0039 |
| Area UID | 380 |
| Cache 소스 | pilot (CACHE_HIT_PILOT) |
| 저장된 charset_ok 필드 | **없음** (pilot 캐시 구조 상 필드 미포함) |
| 실제 한글 문자 수 | **3,356자** |
| replacement char (U+FFFD) | **0개** |
| charset 판정 | **CHARSET_OK_INFERRED_FROM_KOR_COUNT** |
| 요약정보 내용 | 관람시간 없음 / 관람료 무료 / 주차정보 (OPS-only) |
| 설명 복구 | ❌ DESCRIPTION_NOT_FOUND — charset 문제가 아닌 content 부재 |

**핵심**: pilot 캐시의 `charset_ok` 필드 누락이 이전 세션에서 CHARSET_DAMAGE 오분류를 유발했다. 실제로는 한글 3,356자가 정상 존재하며, charset은 이상 없음. 요약정보 자체가 운영정보만 담고 있어 설명을 추출할 수 없는 것이 근본 원인.

---

## 3. Description 소스 감사 결과 (11건)

### 3.1 VG HTML 재탐색

**추가 탐색 패턴 (PATTERN_A_OPS 이후)**:
- meta description → 11건 전부 사이트 boilerplate
- og:description → 11건 전부 사이트 boilerplate  
- JSON-LD description → 11건 전부 부재
- cont_text / intro div → 11건 전부 운영정보 또는 내용 없음

**결과**: VG HTML에서 개별 장소 설명 0건 추출

### 3.2 개별 장소 판정

| candidate_id | 장소명 | charset 판정 | VG 패턴 | KTO | source-facts | 최종 판정 |
|---|---|---|---|---|---|---|
| GJ01-0003 | 경주 보문사지 연화문 당간지주 | OK_STORED | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |
| GJ01-0012 | 노서동 고분군 | OK_STORED | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |
| GJ01-0039 | 황남리 고분군 | OK_INFERRED (3356자) | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |
| GJ01-0043 | 황복사지 삼층석탑(구황리 삼층석탑) | OK_STORED | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |
| GJ01-0090 | 경주 스파월드 | OK_STORED | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |
| GJ01-0108 | 숲머리뚝방길 | OK_STORED | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |
| GJ01-0111 | 전 홍유후 설총묘 | OK_STORED | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |
| GJ01-0115 | 천군동 동서삼층석탑 | OK_STORED | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |
| GJ01-0122 | 국립경주문화재연구소 천존고 | OK_STORED | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |
| GJ01-0143 | 서악동 삼층석탑 | OK_STORED | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |
| GJ01-0151 | 정혜사지 13층 석탑 | OK_STORED | OPS | NO_MATCH | None | DESCRIPTION_NOT_FOUND |

---

## 4. 최종 RELEASE 재분류 (117건)

| 분류 | 직전 (Task 2 산출) | 이번 (최종) | 변화 |
|------|-------------------|-------------|------|
| **READY_FOR_RELEASE** | 106건 | **106건** | **0 (유지)** |
| READY_WITH_REVIEW_NOTE | 11건 | 0건 | -11건 |
| **HOLD_DESCRIPTION** | 0건 | **11건** | +11건 |
| 합계 | 117건 | 117건 | |

**핵심 확인**:
- 기존 READY_FOR_RELEASE 106건 → **후퇴 0건** ✅
- READY_WITH_REVIEW_NOTE → HOLD_DESCRIPTION 전환 (우회 승격 없음) ✅
- 신규 READY 승격: **0건** (공식 설명 없음 — source 한계)

---

## 5. Charset 감사 요약 (11건)

| charset 판정 | 건수 |
|---|---|
| CHARSET_OK_STORED | 10건 |
| CHARSET_OK_INFERRED_FROM_KOR_COUNT | 1건 (황남리 고분군) |
| CHARSET_DAMAGE 또는 SOURCE_TEXT_CORRUPTED | **0건** |

**결론**: 11건 모두 charset 이상 없음. 설명 부재는 사이트 source 한계 (VG 사이트 자체가 해당 장소 설명을 제공하지 않음).

---

## 6. 실행 통계

| 항목 | 결과 |
|------|------|
| 신규 HTTP/API 요청 | **0건** |
| LLM 설명 생성·요약·번역 | **0건** |
| 다른 장소 설명 복사 | **0건** |
| boilerplate 오추출 | **0건** |
| 기존 raw/candidate/source facts 수정 | **0건** |
| 결정론적 출력 (Run1=Run2) | ✅ |

---

## 7. Run1 SHA (재현성 기록)

| 파일 | SHA256 (앞 16자) |
|------|-----------------|
| input | 파일 기록 — `gyeongju-tier-a-11-description-reproducibility-v1.json` 참조 |
| charset_audit | 파일 기록 참조 |
| source_audit | 파일 기록 참조 |
| recovery | 파일 기록 참조 |
| final_release | 파일 기록 참조 |
| summary | 파일 기록 참조 |

완전한 SHA256은 `data/tourapi/validation/gyeongju/gyeongju-tier-a-11-description-reproducibility-v1.json`에 기록됨.

---

## 8. 출력 파일

### Validation (data/tourapi/validation/gyeongju/)

| 파일 | 건수 | 내용 |
|------|------|------|
| gyeongju-tier-a-11-description-input-v1.jsonl | 11 | 입력 감사 (소스 상태 사전 기록) |
| gyeongju-tier-a-11-charset-audit-v1.jsonl | 11 | charset 전수 감사 (황남리 고분군 포함) |
| gyeongju-tier-a-11-description-source-audit-v1.jsonl | 11 | 소스별 설명 탐색 전과정 기록 |
| gyeongju-tier-a-11-description-summary-v1.json | — | 전체 요약 통계 |
| gyeongju-tier-a-11-description-reproducibility-v1.json | — | Run1 SHA (6파일) |

### Normalized (data/tourapi/normalized/gyeongju/)

| 파일 | 건수 | 내용 |
|------|------|------|
| gyeongju-tier-a-11-description-recovery-overlay-v1.jsonl | 11 | 복구 시도 결과 overlay |
| gyeongju-tier-a-final-release-after-description-recovery-v1.jsonl | 117 | 최종 release 분류 (106 READY + 11 HOLD) |

---

## 9. 금지 규칙 준수

| 규칙 | 준수 |
|------|------|
| master checkout·merge·push 금지 | ✅ |
| force push 금지 | ✅ |
| git add . / git add -A 금지 | ✅ 명시적 파일 지정 |
| 신규 HTTP/API 요청 금지 | ✅ 0건 |
| LLM 설명 생성·요약·번역 금지 | ✅ |
| 다른 장소 설명 복사 금지 | ✅ |
| 기존 raw/candidate/source facts 수정 금지 | ✅ |
| API 키 출력·저장·커밋 금지 | ✅ |
| READY_WITH_REVIEW_NOTE 우회 승격 금지 | ✅ HOLD_DESCRIPTION으로 최종 처리 |

---

## 10. 후속 조치 권고

| 항목 | 우선순위 | 내용 |
|------|----------|------|
| HOLD_DESCRIPTION 11건 설명 수동 조사 | 중간 | 경주시 공식 관광안내소·문화재청 등 별도 출처 탐색 필요 |
| 황남리 고분군 KTO 매칭 재시도 | 낮음 | 다른 검색어(황남리 고분, 大陵苑 등)로 KTO에서 매칭 가능성 재확인 |
| TIER_A READY_FOR_RELEASE 106건 배포 | 높음 | 즉시 배포 가능 |

---

작업을 완료했습니다
