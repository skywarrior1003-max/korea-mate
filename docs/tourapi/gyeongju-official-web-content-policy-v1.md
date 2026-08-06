# 경주문화관광 공식 웹사이트 콘텐츠 이용 정책 v1

**작성일**: 2026-08-06  
**적용 태스크**: TASK-GYEONGJU-CORE27-FULL-OFFICIAL-SNAPSHOT-V1  
**콘텐츠 원천**: https://www.gyeongju.go.kr/tour

---

## 1. 라이선스 판정

경주문화관광 공식 사이트 (`gyeongju.go.kr`)의 관광지 상세 페이지 콘텐츠는
**공공누리 제1유형(Attribution Only)** 으로 배포된다.

| 항목 | 내용 |
|------|------|
| 라이선스 유형 | 공공누리 제1유형 (KOGL Type 1) |
| 이용 조건 | 출처 표기 의무 (귀속 표시) |
| 상업적 이용 | **허용** |
| 변경·가공 | **허용** |
| 재배포 | **허용** |
| rights_verdict | `VERIFIED_ALLOWED_BY_PUBLIC_LICENSE_KOGL_TYPE1` |
| product_use_decision | `APPROVED_BY_OWNER_OFFICIAL_SOURCE` |
| usage_basis | `OFFICIAL_TOURISM_PROMOTIONAL_SOURCE_KOGL_TYPE1` |
| takedown_ready | `true` |

### 공공누리 배지 확인 방법

HTML 내 다음 패턴으로 유형 확인:
```
img_opentype01.png  → 제1유형
"제1유형" 텍스트    → 제1유형
```

27건 CORE_TIER_1 전건 공공누리 제1유형 확인됨 (파싱 시 `kogl_type=1`).

---

## 2. 출처 표기 의무

콘텐츠 사용 시 출처를 명시해야 한다:

```
출처: 경주문화관광 (https://www.gyeongju.go.kr/tour)
한국 공공누리 제1유형 (공공저작물 자유이용)
```

---

## 3. 수집 대상 콘텐츠 및 필드

### 상세 페이지 URL 패턴

```
https://www.gyeongju.go.kr/tour/page.do?listType=&mnu_uid={MNU_UID}&sortKwd=name&code_uid={CODE_UID}&area_uid={AREA_UID}&cmd=2
```

파라미터:
- `area_uid`: 관광지 고유 식별자 (스크립트 핵심 키)
- `mnu_uid`: 메뉴 UID (권역별 고정값)
- `code_uid`: 코드 UID (권역별 고정값)

### 추출 가능 필드 및 CSS 선택자

| 필드 | HTML 선택자/패턴 |
|------|----------------|
| 장소명 | `id="contentTitle"` |
| 이미지 목록 | `div.imgWrap > ul.imgWrap_ul > a.photoView[href]` |
| 설명 | `div.detail` |
| 주소 | `<span>주소</span>TEXT` |
| 전화번호 | `<span>전화</span>TEXT` |
| 관람시간 | `<span>관람시간</span>&nbsp;: TEXT` |
| 관람료 | `<span>관람료</span>&nbsp;: TEXT` |
| 주차정보 | `<span>주차정보</span>&nbsp;: TEXT` |
| 홈페이지 | `<span>홈페이지</span>...<a href>` |
| 공공누리 유형 | `img_opentype{N}.png` 또는 `제{N}유형` 텍스트 |

### 이미지 URL 구성

페이지 내 이미지는 상대 URL로 제공됨:
```
/upload/content/thumb/{YYYYMM}/{HASH}.jpg
```

전체 URL 구성:
```
https://www.gyeongju.go.kr/upload/content/thumb/{YYYYMM}/{HASH}.jpg
```

---

## 4. 수집 제약

| 항목 | 규칙 |
|------|------|
| 요청 간격 | 최소 0.35초 (CALL_SLEEP=0.35) |
| 재시도 | 최대 2회 (MAX_RETRY=2) |
| User-Agent | `KoreaMateBot/1.0 (official-snapshot-collector)` |
| 수집 phase | HTTP 요청 허용 (수집 태스크) |
| 처리 phase | HTTP 요청 0건 (Run1=Run2 보장) |

---

## 5. 콘텐츠 우선순위 (설명)

| 우선순위 | 출처 | 방법 코드 | 적용 조건 |
|---------|------|----------|----------|
| 1 | KTO API overview | `KTO_OVERVIEW_NORMALIZED` | KTO API에서 overview ≥ 30자 |
| 2 | 경주문화관광 div.detail | `OFFICIAL_WEB_DESCRIPTION_EXCERPT_OWNER_APPROVED` | VG 페이지 설명 존재 시 |
| 3 | 구조화 사실 (주소·운영시간) | `OFFICIAL_STRUCTURED_FACTS_ONLY` | 설명 없고 주소 있을 때 |

CORE_TIER_1 27건 실적 (2026-08-05 수집 기준):
- 전건 VG 설명 우선순위 2번 적용 (`OFFICIAL_WEB_DESCRIPTION_EXCERPT_OWNER_APPROVED`)
- KTO detail API 응답은 HTTP 200이나 overview 데이터 없음

---

## 6. 콘텐츠 우선순위 (이미지)

| 우선순위 | 출처 | rights_verdict | 이용 가능 여부 |
|---------|------|---------------|-------------|
| 1 | 경주문화관광 VG 공식 페이지 | `VERIFIED_ALLOWED_BY_PUBLIC_LICENSE_KOGL_TYPE1` | ✅ 즉시 가능 |
| 2 | KTO firstimage | `RIGHTS_EVIDENCE_MISSING` | ⚠️ DEF-ENRICH-M01 해소 필요 |

CORE_TIER_1 27건 실적: 전건 VG 공식 이미지 적용 (총 187장).

---

## 7. Takedown 절차

공공누리 제1유형이라도 저작권자(경주시)가 takedown을 요청할 경우:
1. `takedown_ready=true` 필드로 즉시 제거 가능
2. 해당 `area_uid` 연관 이미지 및 설명 삭제
3. 대체 콘텐츠 없으면 `HOLD_CONTENT_MISSING`으로 변경

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-08-06 | v1 최초 작성 — CORE_TIER_1 27건 수집 완료 후 |
