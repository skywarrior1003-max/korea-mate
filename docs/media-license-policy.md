# GoKoreaMate — Media License 데이터 정책

> 브랜드: GoKoreaMate / gokoreamate.com  
> 작성일: 2026-06-17  
> Task: TASK-006 — Media License 데이터 정책 및 스키마 초안 추가  
> Migration: `supabase/migrations/006_media_license_schema.sql` (Draft — 운영 적용 전 승인 필요)

---

## 1. 왜 이 정책이 존재하는가

> **공식 홈페이지에 이미지가 있다는 것이 상업적 재사용 허가를 의미하지 않는다.**

GoKoreaMate는 한국 여행 플랫폼으로서 장소·행사 이미지를 서비스에 노출합니다.  
잘못된 이미지 사용은 **저작권 침해 소송**으로 이어질 수 있으며, 이는 서비스 운영 자체를 위협합니다.

이 정책은 그 리스크를 원천 차단하기 위한 **법적 방어막**입니다.

---

## 2. 핵심 원칙 3가지

### 원칙 1: 라이선스 없으면 등록 불가

```
media_licenses.license_id → place_media.license_id (NOT NULL)
```

`place_media` 테이블의 `license_id`는 NOT NULL입니다.  
라이선스가 확인되지 않은 이미지는 **DB에 등록 자체가 불가능**합니다.

### 원칙 2: 상업적 사용 불가 라이선스는 앱 노출 불가

```sql
-- gokoreamate.com 앱 이미지 조회 시 반드시 이 조건 포함
WHERE pm.admin_status = 'approved'
  AND ml.commercial_use_allowed = true
```

`commercial_use_allowed = false`인 라이선스에 묶인 이미지는  
DB에 존재하더라도 **절대 앱 화면에 노출하지 않습니다.**

### 원칙 3: 관리자 승인 게이트 필수 통과

```
이미지 등록 → admin_review_queue → 관리자 검토 3단계 → approved → 앱 노출
```

모든 이미지는 `admin_status = 'approved'` 전까지 앱에 나타나지 않습니다.

---

## 3. 이미지 출처별 사용 가능 여부

| 이미지 출처 | 허용 여부 | `license_id` | 이유 |
|------------|----------|-------------|------|
| **GoKoreaMate 직접 촬영** | ✔ 허용 | `direct-photo` | 저작권 gokoreamate.com 보유 |
| **제휴 업체 계약 제공** | ✔ 허용 | `partner-contract` | 계약 조건 내 사용 가능 |
| **공공누리 1유형** | ✔ 조건부 허용 | `gongkongnuri-type1` | 출처 표기 후 자유 이용 |
| **공공누리 2유형** | ✔ 조건부 허용 | *(별도 등록 필요)* | 출처 표기 + 비상업 변경 허용 |
| **공공누리 3유형** | ✔ 조건부 허용 | *(별도 등록 필요)* | 출처 표기 + 변경 금지 |
| **공공누리 4유형** | ✗ **사용 불가** | `gongkongnuri-type4` | 비상업적 이용만 허용 |
| **Creative Commons BY 4.0** | ✔ 조건부 허용 | `cc-by-4.0` | 출처 표기 후 상업 이용 가능 |
| **관광 API (재사용 허용 명시)** | ✔ 조건부 허용 | `api-kto-tourapi` | 이용약관 재사용 허용 확인 시 |
| **Visit Busan API** | ⚠ 확인 중 | `api-visit-busan` | 이용약관 상업적 재사용 허용 공식 확인 필요 |
| **공식 관광청 홈페이지** | ⚠ **보류** | `official-site-pending` | 게시 ≠ 상업적 재사용 허가 |
| **블로그 / 인스타그램** | ✗ **금지** | `forbidden` | 원저작자 동의 없음 |
| **구글 / 네이버 이미지** | ✗ **금지** | `forbidden` | 출처 불명, 저작권 미확인 |
| **미쉐린 / 리뷰 플랫폼** | ✗ **금지** | `forbidden` | 별도 계약 없이 사용 불가 |
| **여행 블로그 스크린샷** | ✗ **금지** | `forbidden` | 2차 저작물 |

---

## 4. 이미지 등록 워크플로우

```
[1단계] 이미지 후보 발견
         │
         ▼
[2단계] 라이선스 유형 확인
         │
         ├─ commercial_use_allowed = true → 등록 진행
         └─ commercial_use_allowed = false → 등록 중단
         │
         ▼
[3단계] media_licenses 테이블에 license_id 존재 확인
         → 없으면 먼저 라이선스 등록 (verified_at 기록 필수)
         │
         ▼
[4단계] place_media에 이미지 등록 (admin_status = 'pending' 자동 설정)
         │
         ▼
[5단계] admin_review_queue에 검토 요청 생성 (3단계 순차 검토)
         │
         ├─ license-verify  : 라이선스 내용 재확인
         ├─ place-match     : 올바른 장소에 연결됐는지 확인
         └─ content-check   : 이미지 내용 적절성 확인
         │
         ▼
[6단계] 모두 통과 → admin_status = 'approved'
         │
         ▼
[7단계] 앱 화면에 이미지 노출
```

---

## 5. 라이선스 마스터 분리 설계 이유

`media_licenses`를 `place_media`와 분리한 이유:

| 이유 | 설명 |
|------|------|
| **재사용** | "공공누리 1유형"은 수백 장의 이미지가 동일 license_id를 참조. 매번 재입력 불필요. |
| **일괄 업데이트** | 라이선스 조건이 변경되면 `media_licenses` 1행만 수정하면 연결된 모든 이미지에 반영. |
| **상업 사용 차단** | `commercial_use_allowed = false`로 바꾸는 순간 연결된 모든 이미지가 앱에서 즉시 숨김. |
| **감사 추적** | `verified_at`, `verified_by`로 누가 언제 라이선스를 확인했는지 기록. |

---

## 6. place_match_logs — 매칭 이력 보존 이유

이미지를 장소에 연결할 때 "왜 이 사진이 저 장소에 붙었지?"를 나중에 추적하기 위해 `place_match_logs`를 유지합니다.

| match_method | 신뢰도 | 설명 |
|---|---|---|
| `api-id` | ★★★★★ | API가 제공한 고유 ID로 직접 연결 — 가장 신뢰도 높음 |
| `manual` | ★★★★☆ | 운영자가 직접 확인하여 연결 |
| `coordinate` | ★★★☆☆ | GPS 좌표 근접성으로 자동 매칭 |
| `name-exact` | ★★☆☆☆ | 장소명 정확 일치 — 동명 장소 충돌 위험 |

**이름만으로 연결하는 것은 금지합니다.** 동명이인 문제처럼 다른 장소에 사진이 연결될 수 있습니다.

---

## 7. admin_review_queue — 법적 승인 게이트

이 단계를 건너뛰고 이미지를 노출하는 것은 **절대 금지**입니다.

| 검토 유형 | 순서 | 확인 내용 |
|-----------|------|----------|
| `license-verify` | 1 | 라이선스 내용이 실제로 상업적 사용을 허가하는가? |
| `place-match` | 2 | 이미지가 올바른 장소·행사에 연결됐는가? |
| `content-check` | 3 | 이미지 내용이 서비스에 적절한가? (민감 내용 없는지) |

---

## 8. 향후 연동 계획

| 기능 | 연동 | 예정 Task |
|------|------|----------|
| 장소 대표 이미지 표시 | `place_media` (is_primary + approved) | TASK-009/010 |
| 행사 이미지 | `place_media.event_id` (TASK-004 연동) | TASK-009 |
| 파트너 이미지 계약 관리 | `media_licenses` (partner-contract) | 별도 운영 |
| Trip Moments 사진 | `trip_moments.photo_url` — 별도 관리 (사용자 소유) | TASK-005 완료 |

> **참고:** `trip_moments`의 사진은 사용자가 직접 촬영한 것이므로 이 정책의 적용 대상이 아닙니다. 사용자 소유 콘텐츠로 별도 관리됩니다.

---

## 9. 절대 금지사항

```
- 라이선스 미확인 이미지를 place_media에 등록 금지
- commercial_use_allowed = false 이미지를 앱에 노출 금지
- admin_review_queue 검토 없이 admin_status = 'approved' 처리 금지
- 블로그·인스타그램·구글·네이버 이미지 수집 금지
- 미쉐린·리뷰 플랫폼 이미지 계약 없이 사용 금지
- 공식 홈페이지 이미지를 라이선스 확인 전 사용 금지
- 이미지 스크래핑 스크립트 작성 금지
- 이미지 대량 자동 다운로드 금지
- 이 Migration을 Supabase 운영 DB에 직접 실행 금지 (사장님 승인 후 진행)
```

---

*이 문서는 Draft 설계 기준입니다. 실제 Migration 적용 및 이미지 수집은 데스크탑(관제탑) 검토 및 사장님 최종 승인 후 진행합니다.*  
*GoKoreaMate / gokoreamate.com*
