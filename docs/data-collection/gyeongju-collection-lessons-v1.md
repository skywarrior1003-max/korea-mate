# data-collection/gyeongju-collection-lessons-v1.md

**작성일**: 2026-08-08
**대상 파이프라인**: 경주 관광 데이터 (Task 1~13 완료)
**교훈 요약**: 발견된 버그, 구조적 문제, 재현 원칙

---

## 핵심 교훈 1: KTO 캐시 포맷 불일치 (V1 버그)

### 문제
`gyeongju_overnight_release_batch_v1.py` Phase B에서 KTO detail 파싱 시
표준 API 포맷(`response.body.items.item`)만 처리, tier-a 단순화 포맷(`item` 최상위키)을 미처리.

결과: 18건 (백률사, 선덕여왕릉, 황룡사지 등 유명 유적) 설명문 있음에도 HOLD_DESCRIPTION 오분류.

### 수정 (V4)
```python
def parse_ko_detail(d):
    # tier-a 포맷 우선 처리
    if "item" in d and isinstance(d["item"], dict) and d["item"].get("contentid"):
        item = d["item"]
        return item, item.get("overview", "") or ""
    # 표준 API 포맷
    body = d.get("response", {}).get("body", {})
    ...
```

### 재발 방지
- KTO detail 로드 시 반드시 `parse_ko_detail()` 중앙 함수 사용
- 새 캐시 디렉토리 추가 시 포맷 문서화

---

## 핵심 교훈 2: 18건 KTO12 후보 → TIER_A 중복

### 문제
HOLD 장기 대기 중인 18건이 실제로는 TIER_A에 GJ01 버전으로 이미 릴리즈됨.
(KTO12 contentId로 등록된 후보와 GJ01 VG identity로 등록된 후보가 동일 장소)

### 원인
V1 Phase B 중복 체크 미수행 — 이름 정규화 인덱스 비교 없음.

### 수정 (V4)
Phase 1 Source State Audit에서 TIER_A/CORE27 이름 인덱스 대조.
결과: `DUPLICATE_COVERED` 분류 → 최종 suppress.

---

## 핵심 교훈 3: VG URL 구조 (mnu_uid vs area_uid)

### VG 공식 사이트 URL 체계
- 경주 시 관광 정보: `https://www.gyeongju.go.kr/tour/page.do`
- 개별 장소 상세: `?mnu_uid={mnu_uid}&area_uid={area_uid}&cmd=2`
- 이벤트 목록: `?mnu_uid=2393` (개별 이벤트 페이지 != 목록 페이지)

### 주의
- `pageNo=2` 파라미터는 목록에서 수집된 URL — 상세 페이지 아님
- 정규 URL: `cmd=2` 단독 사용
- 이벤트 개별 URL: `con_uid` 파라미터 필요하나 확인 안 됨 → HTTP 금지

---

## 핵심 교훈 4: 188×623 Crosswalk 필요성

### 문제 (V3에서 발견)
이전 설계(V3)는 190건을 모두 COLLECTION_PENDING으로 가정 → 실제 2건만 callable URL.
나머지 188건은 VG_SOURCE_URL_NOT_RESOLVED였음.

### V4 수정
Source State Audit을 전처리 단계로 분리:
1. VG_COLLECTION_PENDING (2건 → HTTP)
2. DUPLICATE_COVERED (18건 → suppress)
3. KTO_DESCRIPTION_PARSEABLE (18건 → 재파싱으로 설명문 확보)
4. KTO_CACHE_MISS (108건 → KTO HTTP)
5. NO_KTO_LINK (64건 → 이름 기반 crosswalk)

---

## 핵심 교훈 5: 이벤트 URL 구조

### WEB-EV 이벤트 (7건)
- 모든 이벤트가 동일 URL 공유: `mnu_uid=2393` (목록 페이지)
- 개별 이벤트 URL (`con_uid=XXXX`) 미확인 → HTTP 불가
- 날짜 확인 불가 → DATE_INCOMPLETE_CONFIRMED 유지

### KTO15 이벤트 (24건)
- KTO15 detailCommon2에 이벤트 기간 필드 (eventStartDate/eventEndDate) 있음
- V4에서는 캐시 미보유 → 별도 수집 필요 (후속 작업)

---

## 파이프라인 단계 요약

| Task | 브랜치 | 핵심 산출물 |
|------|--------|-------------|
| Task 1-5 | core27, tier-a | 경주 CORE27·TIER_A 117건 |
| Task 7-8 | restaurant | 식당 102건 |
| Task 9 | att-identity | VG ATT audit 159건 |
| Task 10 | en-identity-offline-closeout-v1 | EN 235건 closeout |
| Task 11 | overnight-release-batch-v1 | 235건 release candidate |
| Task 12 | V3 검증 (미실행) | 구조적 개선 발견 |
| Task 13 | final-source-resolution-v4 | 본 문서 |
