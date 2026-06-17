# restaurants Supabase 연동 검증 결과

> 작성일: 2026-06-17  
> TASK: TASK-003 — restaurants Supabase 연동 검증 도구 추가  
> 검증 스크립트: `scripts/check-restaurants-places.mjs`

---

## 1. 현재 restaurants 데이터 흐름

```
[사용자 브라우저]
      │
      ▼
/restaurants 페이지 (src/app/restaurants/page.tsx)
      │
      ├─[1st] getRestaurantPlaces() → src/lib/places.ts
      │            │
      │            ▼
      │       Supabase places 테이블
      │       .eq("category", "restaurant")
      │       .eq("is_active", true)
      │       .eq("admin_status", "approved")
      │
      └─[fallback] Supabase 실패 또는 0건 반환 시
                   → public/data/restaurants.json 로드
```

---

## 2. Supabase-first / JSON fallback 규칙

| 우선순위 | 데이터 소스 | 조건 |
|----------|------------|------|
| 1 (Primary) | Supabase `places` 테이블 | `getRestaurantPlaces()` 성공 + 1건 이상 반환 |
| 2 (Fallback) | `public/data/restaurants.json` | Supabase 에러 또는 0건 반환 시 |

**원칙:**
- Supabase `places` 테이블이 **단일 진실 원본(Single Source of Truth)**
- `restaurants.json`은 fallback 전용 — 수동으로 업데이트하지 않음
- 두 소스를 merge하거나 중복 반영하지 않음 (No merge / No duplicate)

---

## 3. 알려진 이미지 데이터 한계

| 항목 | 현황 |
|------|------|
| 실제 레스토랑 이미지 | 아직 미수집 |
| 현재 표시 방식 | Placeholder 디자인 (dbae010 커밋 기준) |
| 이미지 필드 | `place_media` 테이블 설계 예정 (TASK-006) |
| 라이선스 확인 | TASK-006 미디어 라이선스 정책 수립 후 수집 예정 |

---

## 4. 현재 194 restaurants 컨텍스트

| 항목 | 내용 |
|------|------|
| 총 건수 | 194건 (부산 레스토랑) |
| 데이터 소스 | michelin-2026 / busan-mat-2026 / taegshlang-2025 |
| 저장 위치 | Supabase `places` 테이블 (`category = 'restaurant'`) |
| Fallback | `public/data/restaurants.json` (동일 194건) |
| 공개 기준 | `admin_status = 'approved'` + `is_active = true` |

---

## 5. No merge / No duplicate 원칙

- Supabase `places`와 `restaurants.json`은 동일 데이터 구조를 공유하지만 **두 소스를 동시에 로드하여 합치는 일이 없어야 합니다.**
- 페이지는 Supabase 응답이 성공이면 JSON을 무시합니다.
- JSON fallback이 작동할 때는 Supabase를 무시합니다.

---

## 6. 보안: 서비스 롤 키 격리 상태

| 파일 | 서비스 롤 키 참조 여부 |
|------|----------------------|
| `src/lib/places.ts` | ✔ 없음 (anon key 클라이언트만 사용) |
| `src/app/restaurants/page.tsx` | ✔ 없음 |
| `src/app/api/admin/contact-inquiries/route.ts` | 있음 (admin 전용 server route — 정상) |
| `src/lib/contact.ts` | 있음 (server-only — 정상) |

**결론:** restaurants 데이터 로딩 경로에는 서비스 롤 키가 사용되지 않습니다. 공개 anon key만 사용됩니다.

---

## 7. 검증 스크립트 실행 결과 (2026-06-17)

```
✔ Passed  : 17
⚠ Warnings: 0
✖ Failed  : 0

✔ [CHECK PASSED] restaurants Supabase structure is clean.
```

---

## 8. 향후 검증 필요 사항

| 항목 | 시점 |
|------|------|
| Supabase 실제 연결 상태 확인 | 로컬 개발 서버 실행 후 수동 확인 |
| 이미지 실데이터 수집 | TASK-006 완료 후 |
| `place_media` 연동 | TASK-006 migration 적용 후 |
| `admin_status` 관리 UI | 향후 admin 페이지 개선 시 |
| Supabase RLS 정책 검토 | production 배포 전 필수 확인 |

---

*이 문서는 read-only 로컬 검증 결과입니다. Supabase production DB에는 접속하지 않았습니다.*
