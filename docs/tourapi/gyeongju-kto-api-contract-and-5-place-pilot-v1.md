# TASK-GYEONGJU-KTO-API-CONTRACT-AND-5-PLACE-PILOT-V1

**브랜치:** data/gyeongju-kto-api-contract-and-5-place-pilot-v1  
**Base HEAD:** 95d275b (data/gyeongju-full-tourism-coverage-audit-v2)  
**작성일:** 2026-08-07  
**HTTP 허용:** YES — KTO TourAPI + VG HTML (pilot 5건)

---

## 0. 사전 검증 결과 (실행 전 확인)

| 항목 | 결과 |
|------|------|
| ZIP 매뉴얼 존재 | ✅ TourAPI_Guide_(관광사진)v4.2.zip [747KB], 개방데이터_활용매뉴얼(국문).zip [1.3MB] |
| TOUR_API_KEY | ✅ .env.local에 설정 (load_api_key() 사용) |
| TIER_A 117건 queue | ✅ normalized/gyeongju/gyeongju-tourism-next-batch-priority-v1.jsonl |
| attraction-identity-audit | ✅ 159건, 전건 area_uid 보유 |
| 기존 collector 재사용 | ✅ gyeongju_official_detail_collector_v1.py (fetch_kto_detail, parse_kto_detail 등) |
| kto-list 기수집 여부 | ⚠️ kto-list/ 전건 빈 데이터 — 신규 areaBasedList2 수집 필요 |
| pilot 5건 VG 캐시 여부 | ⚠️ 5건 모두 VG 미수집 — 신규 HTTP 필요 |
| pilot 5건 KTO content_id | ⚠️ 없음 — areaBasedList2 이름 매칭으로 획득 필요 |

### Pilot 5건 선정 (TIER_A 117건 중)

| # | candidate_id | name_ko | area_uid | 특성 |
|---|---|---|---|---|
| 1 | gyeongju-GJ01-0010 | 금장대 | 72 | 야경+전망 속성 (TIER_A 유일 복합) |
| 2 | gyeongju-GJ01-0055 | 서출지 | 91 | 야경 속성 |
| 3 | gyeongju-GJ01-0041 | 황룡사지 | 68 | UNESCO 세계유산 관련 유적 |
| 4 | gyeongju-GJ01-0008 | 교촌마을 | 52 | 전통 마을 (월성권 핵심) |
| 5 | gyeongju-GJ01-0039 | 황남리 고분군 | 380 | 고분군 (대릉원 인근) |

다양성 기준: 야경/전망 속성(2건) + 역사유적(2건) + 전통마을(1건). 전건 TIER_A_NEXT_RELEASE, 전건 VG 미수집.

---

## 1. KTO TourAPI 계약

**Base URL:** `https://apis.data.go.kr/B551011/KorService2`  
**인증:** `serviceKey` (URL-decoded 사용, load_api_key() 함수 재사용)  
**포맷:** `_type=json`  
**공통 파라미터:** `MobileOS=WEB`, `MobileApp=KoreaMate`

### 1-1. areaBasedList2 (목록 수집)

```
GET /areaBasedList2
  serviceKey={api_key}
  MobileOS=WEB
  MobileApp=KoreaMate
  _type=json
  areaCode=35        # 경상북도
  sigunguCode=2      # 경주시
  contentTypeId=12   # 관광지 (Type 1차)
  numOfRows=1000
  pageNo=1
```

- 경주시 areaCode=35, sigunguCode=2 (기존 kto-detail 파일에서 확인됨)
- contentTypeId=12 (관광지): TIER_A 대부분 해당
- contentTypeId=14 (문화시설): 12 매칭 실패 시 추가 수집
- 저장: `data/tourapi/raw/gyeongju/kto-list/kto-type12-areabasedlist2-gyeongju-v1.json`
- `data/tourapi/raw/gyeongju/kto-list/kto-type14-areabasedlist2-gyeongju-v1.json` (필요 시)

### 1-2. detailCommon2 (공통 상세)

```
GET /detailCommon2
  serviceKey={api_key}  _type=json  MobileOS=WEB  MobileApp=KoreaMate
  contentId={content_id}
  defaultYN=Y  firstImageYN=Y  areacodeYN=N  catcodeYN=N
  addrinfoYN=Y  mapinfoYN=Y  overviewYN=Y
```

수집 필드: `title`, `overview`, `addr1`, `addr2`, `mapx`, `mapy`, `tel`, `homepage`, `firstimage`, `firstimage2`

### 1-3. detailIntro2 (유형별 상세)

```
GET /detailIntro2
  serviceKey={api_key}  _type=json  MobileOS=WEB  MobileApp=KoreaMate
  contentId={content_id}
  contentTypeId={content_type_id}
```

수집 필드 (type12): `usetime`, `restdate`, `parking`, `infocenter`, `heritage1`, `heritage2`, `heritage3`

### 1-4. detailImage2 (이미지 갤러리)

```
GET /detailImage2
  serviceKey={api_key}  _type=json  MobileOS=WEB  MobileApp=KoreaMate
  contentId={content_id}
  imageYN=Y  subImageYN=Y  numOfRows=20
```

수집 필드: `originimgurl`, `smallimageurl`, `imgname`, `serialnum`

### 이미지 권리 판정

KTO TourAPI 이미지는 전건 `RIGHTS_EVIDENCE_MISSING` (DEF-ENRICH-M01 기존 등록).  
KTO type12/KTO type28 계약 미등록 — 상업적 사용 불가.

---

## 2. VG 수집 계약

**Base URL:** `https://www.gyeongju.go.kr`  
**URL 패턴:** `https://www.gyeongju.go.kr/tour/content.do?cid={area_uid}&mCode=MEN046`  
**권리:** 공공누리 제1유형 (Attribution) — `VERIFIED_ALLOWED_BY_PUBLIC_LICENSE_KOGL_TYPE1`  
**기존 collector 재사용:** `fetch_vg_detail(area_uid, url, raw_dir)` (gyeongju_official_detail_collector_v1 import)

저장 위치: `data/tourapi/raw/gyeongju/gyeongju-tier-a-pilot-v1/vg-area-{area_uid}.json`

---

## 3. 이름 매칭 전략

### 정규화 함수 (기존 재사용)
```python
def normalize_name(name: str) -> str:
    n = (name or "").strip()
    for p in ["경주 ", "경주시 "]:
        if n.startswith(p):
            n = n[len(p):]
    return n.replace(" ", "")
```

### 매칭 알고리즘
1. areaBasedList2 응답의 `title` → `normalize_name` 적용
2. candidate의 `name_ko` → `normalize_name` 적용
3. 정확 매칭(exact match) 우선
4. 없으면 `KTO_MATCH_NOT_FOUND` 판정 (에러 아님, 정상 산출물)

### 매칭 판정값
- `EXACT_MATCH`: 정규화 후 정확 매칭
- `KTO_MATCH_NOT_FOUND`: 매칭 실패 (이름 변형 가능성, 미등록 가능성)
- `AMBIGUOUS_MATCH`: 복수 후보 (수동 검토 대상)

---

## 4. 파이프라인 구조

```
Phase A: areaBasedList2 수집 (HTTP)
  → raw: kto-list/kto-type12-areabasedlist2-gyeongju-v1.json

Phase B: pilot 5건 이름 매칭 (offline)
  → link audit: validation/gyeongju-tier-a-pilot-kto-link-v1.jsonl

Phase C: pilot 5건 VG HTML 수집 (HTTP)
  → raw: gyeongju-tier-a-pilot-v1/vg-area-{area_uid}.json

Phase D: pilot 5건 KTO detail 수집 (HTTP, 매칭 성공 건만)
  → raw: gyeongju-tier-a-pilot-v1/kto-{content_id}.json

Phase E: 처리 → snapshot 생성 (offline)
  → normalized: gyeongju-tier-a-pilot-snapshot-v1.jsonl (5건)

Phase F: QA + 재현성 검증 (offline)
  → validation: gyeongju-tier-a-pilot-qa-v1.json
  → completion report
```

---

## 5. 산출물 목록

### raw (HTTP 수집)
| 파일 | 건수 | 위치 |
|------|------|------|
| kto-type12-areabasedlist2-gyeongju-v1.json | 1 | raw/gyeongju/kto-list/ |
| kto-type14-areabasedlist2-gyeongju-v1.json | 1 (필요 시) | raw/gyeongju/kto-list/ |
| vg-area-{area_uid}.json | 5건 | raw/gyeongju/gyeongju-tier-a-pilot-v1/ |
| kto-{content_id}.json | ≤5건 (매칭 성공 건) | raw/gyeongju/gyeongju-tier-a-pilot-v1/ |

### validation
| 파일 | 내용 |
|------|------|
| gyeongju-tier-a-pilot-kto-link-v1.jsonl | 5건 이름 매칭 감사 |
| gyeongju-tier-a-pilot-qa-v1.json | QA 요약 |
| gyeongju-tier-a-pilot-run1-run2-sha-v1.json | 재현성 감사 |
| gyeongju-tier-a-pilot-frozen-sha-v1.json | frozen SHA |

### normalized
| 파일 | 내용 |
|------|------|
| gyeongju-tier-a-pilot-snapshot-v1.jsonl | 5건 snapshot (VG+KTO 병합) |

### scripts
| 파일 | 내용 |
|------|------|
| scripts/gyeongju_tier_a_kto_pilot_v1.py | 실행 스크립트 |

### docs/tourapi
| 파일 | 내용 |
|------|------|
| gyeongju-kto-api-contract-and-5-place-pilot-v1.md | 이 파일 |
| gyeongju-kto-api-contract-and-5-place-pilot-v1-verification.md | 사전 검증 |
| gyeongju-kto-api-contract-and-5-place-pilot-v1-completion.md | 완료 보고서 |

---

## 6. Snapshot 스키마 (per candidate)

```jsonc
{
  "as_of": "2026-08-07T...",
  "candidate_id": "gyeongju-GJ01-0010",
  "name_ko": "금장대",
  "area_uid": 72,
  "kto_content_id": "...",         // null if KTO_MATCH_NOT_FOUND
  "kto_match_status": "EXACT_MATCH | KTO_MATCH_NOT_FOUND | AMBIGUOUS_MATCH",
  
  // VG 수집 결과
  "vg": {
    "area_uid": 72,
    "http_status": 200,
    "name_official": "...",
    "description_ko": "...",       // extract_sentences 결과 (≤700자)
    "description_rights": "VERIFIED_ALLOWED_BY_PUBLIC_LICENSE_KOGL_TYPE1",
    "address": "...",
    "phone": "...",
    "operation_hours": "...",
    "images": [...]                // rights: KOGL1
  },
  
  // KTO 수집 결과 (매칭 실패 시 null)
  "kto": {
    "content_id": "...",
    "content_type_id": "12",
    "overview": "...",             // ≤700자
    "overview_rights": "RIGHTS_EVIDENCE_MISSING",
    "address": "...",
    "lat": ..., "lng": ...,
    "tel": "...",
    "homepage": "...",
    "images": [],                  // rights: RIGHTS_EVIDENCE_MISSING
    "detail_intro2": {...}
  },
  
  // 병합 결과
  "merged": {
    "description_ko": "...",       // VG 우선, null이면 KTO (RIGHTS_EVIDENCE_MISSING 표기)
    "description_rights": "...",
    "address": "...",              // VG 우선
    "lat": ..., "lng": ...,       // KTO 우선 (VG 좌표 없음)
    "phone": "...",               // VG 우선
    "operation_hours": "...",      // VG 우선, KTO usetime 보완
    "images": [...]                // VG 우선 (KOGL1), KTO 이미지 제외
  },
  
  // 속성 (기존 overlay에서 가져옴)
  "has_night_view": true,
  "has_viewpoint": false,
  
  // 수집 메타
  "vg_collected_at": "...",
  "kto_collected_at": "...",
  "pipeline_version": "tier-a-pilot-v1"
}
```

---

## 7. 품질 기준

| 항목 | 기준 |
|------|------|
| VG HTTP 200 | 5/5 필수 |
| VG parse_ok | 5/5 필수 |
| KTO areaBasedList2 | HTTP 200, totalCount>0 |
| KTO 매칭율 | ≥3/5 (PASS), ≥2/5 (CONDITIONAL_PASS) |
| KTO detail HTTP 200 | 매칭 성공 건 전건 |
| description_ko 수집 | 5/5 (VG 기준) |
| 이미지 수집 | 5/5 (VG 기준) |
| Run1=Run2 | BYTE_IDENTICAL (offline processing 전건) |
| 인증키 노출 | 0건 |
| provenance 출처 명기 | 전건 |
| frozen SHA | ALL_OK |

---

## 8. 재현성 규칙

- **raw 저장 → processing 분리**: HTTP 응답은 raw로 저장 후 deterministic processing만 수행
- **skip 조건**: raw 파일 존재 시 HTTP 재호출 없음 (`force=False`)
- **Run1 = Run2**: raw 동일 → processing 출력 BYTE_IDENTICAL (sort_keys=True, ensure_ascii=False)
- **AS_OF**: `"2026-08-07T09:00:00Z"` 고정 (실행 타임스탬프 아님)

---

## 9. 금지 사항 (10개조 CoC)

- 기존 normalized/validation 파일 수정 금지
- raw/normalized 혼합 처리 금지 (raw 저장 후 처리)
- LLM·Gemini 사용 금지
- GJ03/GJ04/GJ05 CDN URL 추측 금지
- TIER_B/TIER_C candidates 이번 태스크에서 수집 금지
- content_id 없이 KTO detail 수집 금지
- RIGHTS_EVIDENCE_MISSING 이미지를 merged.images에 포함 금지
- 이름 매칭 없는 수동 content_id 하드코딩 금지 (areaBasedList2 기반만)
- HOLD 파일 수정 금지
- 인증키 출력·커밋 금지

---

## 10. 성공 기준

| 항목 | 기준 |
|------|------|
| areaBasedList2 수집 | ✅ HTTP 200, totalCount>0 |
| KTO 이름 매칭 | ✅ ≥3/5 EXACT_MATCH |
| VG 5건 수집 | ✅ 전건 HTTP 200 |
| KTO detail (매칭 건) | ✅ 전건 HTTP 200 |
| Snapshot 5건 생성 | ✅ |
| Run1=Run2 | ✅ BYTE_IDENTICAL |
| frozen SHA | ✅ ALL_OK |
| 인증키 노출 | ✅ 0건 |
| completion 보고서 | ✅ |

종합 판정: **PASS** (전 항목 충족 시) / **CONDITIONAL_PASS** (KTO 매칭 2/5 이상)

---

## 11. 다음 단계 예고

본 파일럿 완료 후:
1. **areaBasedList2 전수**: type12/14/28 전체 → TIER_A 117건 content_id 매핑
2. **TIER_A 배치 수집**: 배치 20건, 6회 실행, VG+KTO 병합
3. **GJ07 9건 (TIER_B) 수집**: area_uid 없음 → VG URL 수동 확인 필요
4. **heritage candidate_id 연결 보강** (파이프라인 갭 해소)
