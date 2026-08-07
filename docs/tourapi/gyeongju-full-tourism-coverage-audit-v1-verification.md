# TASK-GYEONGJU-FULL-TOURISM-COVERAGE-AUDIT-AND-ATTRIBUTE-RECOVERY-V1 검증 보고서

> 작성일: 2026-08-07  
> 검증 대상: TASK-GYEONGJU-FULL-TOURISM-COVERAGE-AUDIT-AND-ATTRIBUTE-RECOVERY-V1 GPT 프롬프트  
> 기준 브랜치: `data/gyeongju-core27-location-recovery-v2` (HEAD `eef72d9`)  
> 결론: **실행 보류 — 4개 개선 아이디어 식별**

---

## 1. 검증 범위

GPT 프롬프트를 실행하기 전 다음을 직접 확인했다.

- 입력 파일 전건 존재 여부
- GJ01~GJ09 실제 raw 파일 구조 및 레코드 수
- `source-facts-full-v1.jsonl` 실제 필드 구조
- `entity-attribute-evidence-v1.jsonl` 실제 내용
- GJ-06(야경)·GJ-07(전망) → candidate 연결 경로
- attribute overlay provenance 요구사항과 실제 데이터 정합성

---

## 2. 입력 파일 존재 확인

| 파일 | 경로 | 건수 | 상태 |
|------|------|------|------|
| candidate 910건 | `normalized/gyeongju-full-v1-candidates.jsonl` | 910건 | ✅ |
| source facts 1,158건 | `normalized/source-facts-full-v1.jsonl` | 1,158건 | ✅ |
| 384건 queue | `validation/gyeongju-core-place-targeted-collection-queue-v1.jsonl` | 384건 | ✅ |
| GJ-01 full | `raw/gyeongju-city-api/GJ-01-tourist-destination-full.json` | 159건 | ✅ |
| GJ-06 야경 | `raw/gyeongju-city-api/GJ-06-night-view-full.json` | 10건 | ✅ |
| GJ-07 전망 | `raw/gyeongju-city-api/GJ-07-observation-point-full.json` | 10건 | ✅ |
| WEB-ATT 159건 | `normalized/gyeongju-attraction-identity-audit-v1.jsonl` | 159건 | ✅ |
| entity-attribute-evidence | `normalized/gyeongju-entity-attribute-evidence-v1.jsonl` | 84건 | ✅ (구조 주의 ⚠️) |
| attribute-mapping-audit | `normalized/gyeongju-attribute-mapping-audit-v1.json` | — | ✅ |

**기본 입력 파일: 모두 존재한다.**

---

## 3. GJ01~GJ09 실제 구조 확인

| 데이터셋 | 파일명 | 건수 | 실제 역할 | 주의사항 |
|----------|--------|------|-----------|----------|
| GJ-01 | `GJ-01-tourist-destination-full.json` | 159건 | 관광지 목록 (권역·장소명·주소·전화번호) | 장소명 필드 = **TRRSRT** ⚠️ |
| GJ-02 | `GJ-02-권역별_관광지-pilot.json` | **0건** | 권역별 관광지 (KTO API 형식) | **데이터 없음** ⚠️ |
| GJ-03 | `GJ-03-image-시내권-full.json` | 680건 | 시내권 CMS 이미지 앨범 | CON_KEYWORDS에 태그 있음 |
| GJ-04 | `GJ-04-image-보문권-full.json` | 560건 | 보문권 CMS 이미지 앨범 | 동일 구조 |
| GJ-05 | `GJ-05-image-남산권-full.json` | 52건 | 남산권 CMS 이미지 앨범 | 동일 구조 |
| GJ-06 | `GJ-06-night-view-full.json` | 10건 | 야경 명소 목록 | NM=장소명, LC=위치 |
| GJ-07 | `GJ-07-observation-point-full.json` | 10건 | 전망포인트 목록 | PRSPECT_DOMN=장소명 |
| GJ-08 | `GJ-08-menu-restaurant-full.json` | 111건 | 메뉴별 음식점 (CON 형식) | 식당 데이터, 태스크 범위 외 |
| GJ-09 | `GJ-09-eat-hotplace-full.json` | 61건 | 먹거리 핫플레이스 (AREA_UID 포함) | 식당 데이터, 태스크 범위 외 |

---

## 4. 개선 아이디어

### 개선-1: GJ-01 장소명 필드 TRRSRT 명시 필요

**현황:**  
GJ-01-tourist-destination-full.json의 실제 레코드 구조:
```
TURSM_DSTRCT: 경주시내권  (권역)
TRRSRT:       경주 계림   ← 관광지명 (한국어 약어, 직관적이지 않음)
ADRES:        경상북도 경주시 교동 1
TELNO:        054-779-8743
```

프롬프트 섹션 1에서 "실제 필드와 레코드 의미를 다시 확인한다"라고 했으나, 스크립트가 장소명 필드로 `TRRSRT`를 올바르게 사용하는 것을 명시하지 않았다.

또한 GJ-01과 동일 데이터셋인 WEB-ATT 159건(`gyeongju-attraction-identity-audit-v1.jsonl`)의 연결 키가 `area_uid`이고, GJ-01의 TRRSRT와 WEB-ATT의 `name_ko` 사이의 매핑 로직도 불명확하다.

**개선 방향:**  
프롬프트에 GJ-01 필드명 명세 추가:
- `TRRSRT` → 관광지명 (장소명)
- `TURSM_DSTRCT` → 권역 코드
- GJ-01 → WEB-ATT 연결 기준: `name_ko` 정규화 매칭

---

### 개선-2: GJ-02 데이터 0건 — graceful 처리 명시 필요

**현황:**  
`GJ-02-권역별_관광지-pilot.json`은 KTO TourAPI 형식 (response.body.items.item)으로 수집 시도됐으나 **items 0건**이다. full 파일이 별도로 존재하지 않는다.

프롬프트는 "GJ01~GJ09 전수 역할 확인"을 요구하는데, GJ-02의 부재가 오류인지 정상인지 정의되어 있지 않다.

스크립트가 이를 오류로 처리하면 실행이 중단될 수 있다.

**개선 방향:**  
프롬프트에 명시:
- GJ-02: 수집 시도됐으나 KTO API items 0건 반환 — `DATA_NOT_AVAILABLE` 상태로 기록하고 계속 진행
- GJ-02 대상 관광지는 GJ-01 또는 source-facts를 통해 커버됨을 확인

---

### 개선-3: `entity-attribute-evidence-v1.jsonl` 실제 구조 오해 가능성

**현황:**  
`gyeongju-entity-attribute-evidence-v1.jsonl` 84건의 실제 구조:
```json
{
  "attributes": {},
  "content_type": "restaurant",
  "entity_id": "gyeongju-VG-REST-...",
  "filter_evidence_type": "DETAIL_PAGE_TAGS_NOT_FOUND",
  "note": "visitgyeongju detail page does not expose filter labels in HTML"
}
```

**실제 attribute_key: 84건 모두 ''(빈 문자열)**이다.  
이 파일은 "VG 상세 페이지 필터 태그 탐색 실패 레코드"이며, 기존 attribute overlay가 아니다.

프롬프트 섹션 3(원천 분류·태그 인벤토리)과 섹션 7(파이프라인 전달 손실 감사)에서 이 파일을 "기존 attribute 보유 근거"로 오해할 경우, pipeline loss audit에서 "기존 attribute 0건"을 잘못 집계하거나 건너뛸 수 있다.

**개선 방향:**  
프롬프트에 명시:
- `entity-attribute-evidence-v1.jsonl`: VG 필터 탐색 결과 — 84건 모두 `DETAIL_PAGE_TAGS_NOT_FOUND`, 실제 attribute 0건
- pipeline loss audit에서 이를 `ATTRIBUTE_NOT_MODELED`(attribute 모델이 없어 전달 안 됨)로 분류
- 기존 attribute overlay는 별도로 존재하지 않음 — 이번 태스크가 최초 생성

---

### 개선-4: GJ-06/GJ-07 → candidate 연결 경로 불명확

**현황:**  
GJ-06(야경) `NM` 필드 장소명과 GJ-07(전망) `PRSPECT_DOMN` 필드 장소명은  
candidate의 `name_ko` 필드와 **직접 매칭이 모두 실패**한다.

```
GJ-06 NM=동궁과 월지 → candidate name_ko 직접 매칭: NO_MATCH
GJ-07 PRSPECT_DOMN=경주엑스포대공원 경주타워 → NO_MATCH
```

그러나 source-facts의 `source_name` 필드를 확인하면:
```
source_name = "경주시 야경 API"
name = 동궁과 월지
entity_type = attraction
```

즉 GJ-06 데이터는 이미 source-facts로 수집되어 있으며, SF → candidate 연결 키(`normalized_name` 또는 `vg_hex_id`)를 통해 간접 연결이 가능하다.  
그러나 GJ-07의 일부 장소(경주 루지월드 전망대, 블루원 CC 전망데크 등)는 source-facts에 있는지 별도 확인이 필요하다.

프롬프트는 연결 경로(GJ raw → SF → candidate)를 명시하지 않아, 스크립트가 직접 name 매칭을 시도하면 야경 10건 / 전망 10건 모두 연결 실패로 잘못 처리될 수 있다.

**개선 방향:**  
프롬프트에 명시:
- GJ-06/GJ-07 → candidate 연결 경로: `SF.source_name` 필터링 → `SF.normalized_name` ↔ `candidate.name_ko 정규화` 매칭
- 직접 name_ko 매칭 금지 (필드명 불일치)
- 연결 실패 시 `RELATION_NOT_LINKED` 기록

---

## 5. 차단 이슈 검토

프롬프트의 핵심 요구사항에 대한 기술적 실행 가능성:

| 항목 | 상태 | 비고 |
|------|------|------|
| GJ01~GJ09 파일 존재 | ✅ | GJ-02는 0건 (개선-2) |
| candidate 910건 | ✅ | attraction 334 + nature 59 + 기타 |
| source-facts 1,158건 | ✅ | source_name·source_type 있음 |
| 384건 queue | ✅ | 저장됨 |
| WEB-ATT 159건 | ✅ | attraction-identity-audit |
| GJ-06 야경 연결 | ⚠️ | 직접 매칭 불가, SF 경유 필요 (개선-4) |
| attribute provenance | ⚠️ | source_namespace 없음 (SF에 source_name으로 대체) |
| Run1=Run2 실현 가능성 | ✅ | HTTP 0건, 결정적 처리 가능 |
| 19개 산출물 생성 | ✅ | 단일 스크립트로 구현 가능 |

**차단 이슈: 없음.**  
하지만 4개 개선 아이디어가 실행 결과의 정확성에 영향을 준다.

---

## 6. 추가 확인 사항 (정상)

| 항목 | 확인 결과 |
|------|-----------|
| candidate.category 분포 | attraction 334, nature 59, restaurant 367, accommodation 126, event 24 |
| SF entity_type 분포 | attraction 505, restaurant 435, accommodation 127, nature 59, event 24 |
| SF.source_name 야경 레코드 | "경주시 야경 API" — GJ-06 연결 경로 존재 확인 |
| GJ-03/04/05 역할 | CMS 이미지 앨범 (CON_* 구조), IMAGE_ALBUM 분류 적절 |
| attribute-mapping-audit | auto_applied_count=0, PROVISIONAL_mappings=0 — 기존 mapping 없음 확인 |
| attribute overlay 기존 건수 | **0건** (entity-attribute-evidence 84건 모두 VG 필터 탐색 실패, 개선-3) |
| SF source_namespace | 없음, source_name/origin_source로 대체 가능 |

---

## 7. 최종 검증 결론

| 항목 | 결과 |
|------|------|
| 차단 이슈 | 없음 |
| 개선-1 (GJ-01 TRRSRT 필드명) | 개선 필요 |
| 개선-2 (GJ-02 데이터 0건 처리) | 개선 필요 |
| 개선-3 (entity-attribute-evidence 구조) | 개선 필요 |
| 개선-4 (GJ-06/07 연결 경로) | 개선 필요 |

**결론: 차단 이슈는 없으나 4개 개선 아이디어가 식별되었다. 실행하지 않는다.**

V2 프롬프트에서 위 4개 항목을 반영한 뒤 재검증을 진행한다.

---

## 8. V2 프롬프트 권장 수정 요약

1. **Section 1 GJ-01 명세 추가**: 장소명 = `TRRSRT`, 권역 = `TURSM_DSTRCT`, GJ-01→WEB-ATT 연결 기준 명시
2. **Section 1 GJ-02 처리 명시**: items 0건 → `DATA_NOT_AVAILABLE`, 오류 없이 계속 진행
3. **Section 3/7 entity-attribute-evidence 주석 추가**: 84건 = VG 필터 탐색 실패, attribute 0건, `ATTRIBUTE_NOT_MODELED` 분류
4. **Section 4/5 GJ-06/07 연결 경로 명시**: SF.source_name 필터 → SF.normalized_name ↔ candidate 정규화 매칭, 직접 name 매칭 금지
