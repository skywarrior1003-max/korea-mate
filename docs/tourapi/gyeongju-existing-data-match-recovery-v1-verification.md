# TASK-GYEONGJU-EXISTING-DATA-MATCH-RECOVERY-V1 검증보고서

**작성일**: 2026-08-06  
**검증 판정**: **실행 보류 — 스코프 재설계 필요**  
**이유**: 핵심 가설이 실제 raw 데이터와 불일치 (2개 차단 이슈 + 3개 개선 방향)

---

## 요약

GPT 프롬프트가 전제한 "match·join·field-selection 결함으로 RELEASE=0"이라는 가설을 
실제 frozen raw를 직접 탐색하여 검증한 결과, **description 복구 경로가 존재하지 않음**이 확인됐다.
이 상태에서 24개 산출물 스크립트를 실행하면 예측 가능한 결과(description TRULY_MISSING, RELEASE 0건)를
3,000+ 줄 스크립트로 확인하는 데 그친다.

---

## 1. 검증 방법

실제 frozen raw 파일을 직접 탐색했다. 네트워크 요청 0건.

분석 대상:
| 경로 | 파일 수 | 크기 |
|------|---------|------|
| `data/tourapi/raw/gyeongju/gyeongju-city-api/` | 17개 | 2.6MB |
| `data/tourapi/raw/gyeongju/kto-list/` | 7개 | 470KB |
| `data/tourapi/raw/gyeongju/kto-detail/` | 48개 | 22KB |

---

## 2. 핵심 가설 vs 실제 데이터

프롬프트의 핵심 가설: "공식 API의 이미지·설명·주소·좌표를 보유하고도 RELEASE되지 못한 원인은 match·join·field-selection 결함일 가능성이 높다."

### 2-1. GJ-01 (경주시 관광지 기본 API — 159건)

| 실제 보유 필드 | 없는 필드 |
|--------------|---------|
| TURSM_DSTRCT (관광지명) | 이미지 필드 없음 |
| ADRES (주소) | 설명 필드 없음 |
| TELNO (전화번호) | 좌표 필드 없음 |

**GJ-01은 설명·이미지·좌표를 원천적으로 포함하지 않는 API다.**  
GJ-01 sourced candidate(139건) 좌표 누락은 join 실패가 아니라 raw 데이터 부재다.

### 2-2. GJ-03/04/05 (경주시 이미지 관련 레코드 — 1,292건)

프롬프트의 전제: "경주시 이미지 관련 API 레코드 약 1,292건 확보"를 match 가능한 장소 데이터로 전제.

**실제 구조**:

```
{
  "CON_UID": "781",
  "CON_TITLE": "첨성대(2019년 봄)",
  "CON_CONTENT": "2019년 봄, 첨성대",      ← 이미지 캡션
  "CON_IMGFILENAME": "...",                ← 파일명 (CDN URL 아님)
  "CON_LATITUDE": "None",                 ← 전건 None
  "CON_LONGITUDE": "None",               ← 전건 None
  "CON_ADDRESS": "None"                  ← 전건 None
}
```

| 항목 | GJ-03 (680건) | GJ-04 (560건) | GJ-05 (52건) |
|------|-------------|-------------|-------------|
| CON_CONTENT 최대 길이 | **30자 미만 전건** | **30자 미만 전건** | **30자 미만 전건** |
| CON_CONTENT = CON_TITLE | 134/680 | 0/560 | 40/52 |
| 좌표 (CON_LATITUDE) | **전건 None** | **전건 None** | **전건 None** |
| 주소 (CON_ADDRESS) | **전건 None** | **전건 None** | **전건 None** |

**결론**:  
GJ-03/04/05는 CMS 사진 앨범 항목이다. `CON_CONTENT`는 이미지 캡션(최대 30자)이며
실제 장소 설명이 아니다. 좌표·주소도 전건 부재다.  
`CON_IMGFILENAME`은 파일명이며 CDN base URL을 모르면 접근할 수 없고,
HTTP 요청 없이는 이미지 접근 가능 여부를 확인할 수 없다.

### 2-3. KTO list raw (559건, 7개 타입)

| 필드 | 보유 여부 |
|------|---------|
| `contentid` | 전건 O |
| `mapx` / `mapy` | 전건 O (좌표) |
| `firstimage` | 대부분 O (tong.visitkorea.or.kr) |
| `addr1` / `addr2` | 전건 O |
| `overview` / `description` | **없음** — list API에 설명 없음 |

**KTO list API는 설명(overview)을 제공하지 않는다.** 설명은 detail API에만 있다.

### 2-4. KTO detail raw (48개 파일 — 24건 contentId)

| 항목 | 내용 |
|------|------|
| 총 detail 파일 | 48개 (common2 24 + intro2 24) |
| 실제 데이터 보유 | **5건** (2614760, 3340207, 3536325, 3553947, + 1건) |
| 나머지 | 213B (빈 응답) |
| KTO type12 tourist spot 수 | 143건 |
| **detail 수집 커버리지** | **5 / 143 = 3.5%** |

**KTO detail(소개정보조회) API는 5건을 제외하고 수집되지 않았다.**  
143건의 관광지 중 설명이 있는 raw 파일은 5건뿐이다.

---

## 3. 필드별 복구 가능성 판정

| 필드 | 복구 가능 여부 | 근거 |
|------|-------------|------|
| **description_ko** | ❌ **불가** | GJ 캡션 ≤30자, KTO detail 5/143건만 수집 |
| **image_url** | ⚠️ 불확실 | GJ CDN URL 불명, KTO firstimage=RIGHTS_EVIDENCE_MISSING |
| **lat/lng** | ⚠️ 제한적 | GJ01 candidates ↔ KTO12/28 이름 매칭 시 부분 가능 |
| **address** | ✅ 가능 (이미 적용) | GJ01·KTO 모두 주소 있음, normalization에서 이미 처리 |

---

## 4. 차단 이슈

### BLOCKING-01: description_ko 복구 경로 부재 (HIGH)

**프롬프트의 전제**:  
> "공식 관광지 웹 레코드 159건 확보 / 경주시 이미지 관련 API 레코드 약 1,292건 확보 / KTO와 경주시 API에 주소·좌표·설명 존재"

**실제**:
- GJ-01: 설명 필드 없음 (ADRES, TELNO, TRRSRT, TURSM_DSTRCT 4개만)
- GJ-03/04/05: CON_CONTENT = 이미지 캡션 (≤30자, 실제 설명 아님)
- KTO list: overview 필드 없음
- KTO detail: 5건만 수집 (3.5% 커버리지)

**결과**: 이 태스크를 실행해도 description_ko 복구는 0건이 예상된다.  
description 없이는 RELEASE 조건 미충족 → **신규 RELEASE 0건이 사실상 확정적이다.**

24개 산출물 스크립트를 실행하면 예측 가능한 결론(TRULY_MISSING_FROM_LOCAL_DATA)을  
3,000+줄 스크립트로 확인하는 데 그친다.

---

### BLOCKING-02: GJ-03/04/05 "1,292건" 오해 (HIGH)

**프롬프트의 전제**:  
> "이미지 API의 parent ID와 관광지 기본 ID 미연결" / "raw에는 값이 있지만 source fact 생성 누락"

GJ-03/04/05를 match 가능한 장소 데이터로 전제하고 1,292건 매칭을 시도하도록 설계되어 있다.

**실제**:  
이 파일들은 CMS(콘텐츠 관리 시스템) 사진 앨범 항목이다.
- CON_CONTENT = 사진 제목/캡션 (예: "2019년 봄, 동궁과월지 호안의 풍경")
- CON_IMGFILENAME = 파일명 (CDN URL 불명, HTTP 없이 접근 불가)
- CON_LATITUDE / CON_LONGITUDE = 전건 "None"
- CON_ADDRESS = 전건 "None"

image source로서의 가치: CON_IMGFILENAME이 있지만 CDN base URL이 없으면 실제 이미지 URL을 생성할 수 없다.  
source contract(GJ08 = 이용허락범위: 제한 없음)가 GJ-03/04/05에도 적용되는지 명시적으로 확인되지 않는다.

---

## 5. 개선 방향

### 개선-01: 좌표 복구 전용 경량 태스크 (권고)

실질적으로 가능한 복구는 좌표 복구 일부뿐이다.

**가설**: GJ01-sourced candidates 중 KTO12/28에도 같은 장소가 있다면  
KTO의 mapx/mapy를 이름 매칭으로 보충 가능.

**규모**: GJ01 candidates 139건 × KTO12 143건 + KTO28 59건 = 202건 비교  
예상 매칭: 50~100건 (이름 완전 일치 기준)  
예상 산출물: 3~5개 파일  
실행 시간: <5분

**그러나**: 좌표 복구 단독으로 RELEASE 조건을 충족하지 못한다 (description 여전히 없음).  
실용적 가치는 "정확한 좌표 없이 RELEASE 불가" 상태를 "좌표만 있고 description 없어 RELEASE 불가"로 변경하는 것.

### 개선-02: 태스크 방향 전환 — KTO detail 수집 우선

현재 HOLD의 근본 원인은 description_ko 부재이고,  
KTO detail API (`소개정보조회`)가 실수집되지 않은 것이 직접 원인이다.

| 현황 | 수치 |
|------|------|
| KTO type12 tourist spot | 143건 |
| KTO detail 수집된 건 | 5건 (3.5%) |
| 미수집 KTO detail | ~138건 |

**권고**: TASK-GYEONGJU-EXISTING-DATA-MATCH-RECOVERY-V1 대신  
기존 384건 표적 수집 queue(TASK-GYEONGJU-TARGETED-COLLECTION-V1)를 실행한다.  
CORE_TIER_1 27건 → KTO_DETAIL_REFRESH(소개정보조회) → description_ko 획득 → RELEASE 검토.

### 개선-03: GJ CMS 이미지 CDN URL 규칙 확인 (선택)

GJ-03/04/05의 `CON_IMGFILENAME`에서 실제 이미지 URL을 구성할 수 있다면  
비교적 간단한 match recovery가 가능하다.

예: `CON_IMGFILENAME = "abc.jpg"` → `https://[CDN_BASE]/abc.jpg`

그러나:
- CDN base URL은 별도 확인 필요 (HTTP 1건 필요)
- source contract가 GJ-03/04/05에 적용되는지 확인 필요
- 이미지가 있어도 description 없이 RELEASE 불가

이 개선은 낮은 우선순위다.

---

## 6. 예상 결과 (실행 시)

이 태스크를 현재 설계대로 실행했을 경우 예상 결과:

| 항목 | 예상 |
|------|------|
| description_ko 복구 | **0건** |
| image 복구 (URL 생성 가능) | **불확실 (0~일부)** |
| coordinate 복구 | **일부 가능** (GJ01-KTO 이름 매칭 기반) |
| 신규 RELEASE 제안 | **0건** (description 없음) |
| 실제 targeted collection 변경 | **없음** (description은 여전히 수집 필요) |
| 산출물 | 24개 파일, 3,000+줄 스크립트 |
| Run1=Run2 위험 | **높음** (스크립트 복잡도 증가) |

---

## 7. 결론

| 항목 | 판정 |
|------|------|
| 프롬프트 논리 일관성 | ✅ 내부 논리 일관 |
| 핵심 가설 유효성 | ❌ description 복구 경로 없음 |
| 1,292건 이미지 match 가능성 | ❌ 캡션 레코드, CDN URL 불명 |
| 실행 대비 효과 | ⚠️ 낮음 (예측 가능한 결과) |
| 복잡도 | ⚠️ 높음 (24개 파일, ~3,000줄) |
| **실행 판정** | **🚫 보류 — 재설계 필요** |

**권고 순서**:

1. **(즉시)** 기존 384건 표적 수집 queue 실행 — CORE_TIER_1 27건 KTO_DETAIL_REFRESH 우선  
2. **(선택)** 좌표 복구 경량 감사 — GJ01 candidates ↔ KTO12/28 이름 매칭  
3. **(장기)** GJ CMS 이미지 CDN URL 규칙 확인 후 이미지 복구 재검토

---

*frozen raw 탐색 기준: HTTP/API/WebFetch 0건*  
*브랜치: data/gyeongju-core-attraction-nature-enrichment-v1 HEAD ed2e0bc*
