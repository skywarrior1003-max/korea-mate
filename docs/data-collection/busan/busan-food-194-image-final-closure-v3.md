# TASK-BUSAN-FOOD-194-IMAGE-FINAL-CLOSURE-V3 완료 보고서

**브랜치**: `data/busan-food-discovery-v1`  
**커밋**: `8c63c09`  
**CANONICAL SHA**: `3def785cfd441cfdc44a98a11929627224b3757b73f1d3789b0732c7e34984e6`  
**작업일**: 2026-08-17

---

## 목표 및 결과

| 항목 | 시작 | 최종 | 달성 |
|------|------|------|------|
| IMAGE 확보 | 140/194 | **191/194** | +51건 |
| IMAGE % | 72.2% | **98.5%** | +26.3%p |
| 진정한 예외 | 54건 미확보 | **3건** | 51건 해소 |

---

## 수행 경로 요약

### Phase B2 — CatchTable 비앱 URL Playwright (+4건)

이전 regex `catchtable\.co\.kr/ct/shop/`가 `catchtable.co.kr/{slug}` 형식을 누락.  
`CT_EXTRA_RE = re.compile(r'(?:catchtable\.co\.kr)/(?!ct/)([^/?&"\']+)')`로 수정 후  
4건 추가 렌더링 성공 → CatchTable 총 21건.

### Phase C — Naver Place Playwright (+27건)

**방법**: `search.naver.com/search.naver?query={phone}` Playwright → regex로 Place ID 추출 → `m.place.naver.com/restaurant/{pid}/photo` DOM 이미지 수집

**버그 3종 수정:**

1. **og:image 필터**: `'naver' in og.lower()` → `pstatic.net` URL 거부. 수정: `any(h in url.lower() for h in ['pstatic.net','naver.com','naver.net'])`
2. **Playwright timeout**: `page.get_attribute('meta[...]','content')` 30초 대기. 수정: `page.evaluate("() => document.querySelector(...)?.content || ''")`
3. **name 검증 false positive**: 단일문자 `any(c in page_name for c in list(name)[:3])` → '이'가 '다이닝'·'네이버'에 모두 매칭. 수정: 2-gram bigram ≥50% overlap

**Place ID cross-contamination**: 꽃마을지리산어탕 전화번호 검색이 옥이보리밥(PID 1696700298)을 반환. `exclude_pids` 파라미터 + 2-gram 검증으로 차단.

### Phase D — 부산시 공식사이트 (+1건)

`정짓간 신평본점`: `menu.busan.go.kr/uploadFiles/mbr/20250612123450251.JPG`  
원본 URL `.J` extension → HTTP 404. `.JPG`로 수정 → HTTP 200 image/jpeg ✓

---

## 정책 위반 제거

| 엔티티 | 잘못 설정된 이미지 | 조치 |
|--------|-------------------|------|
| 미소오뎅 (G-00158) | `pup-review-phinf.pstatic.net` (소비자 리뷰) | 제거 → NO_BUSINESS_IMAGE_FOUND |
| 멍텅구리 (G-00109) | `g-place.pstatic.net/assets/shared/images/icon_default_profile.png` (기본 아이콘) | 제거 → NO_BUSINESS_IMAGE_FOUND |

---

## 진정한 예외 3건 (evidence-based)

### 1. 쥬가정효 (busan-G-00043)
- 주소: 부산 해운대구 해운대로 620, 3층
- 전화: 051-741-3515
- 시도: Naver Place 검색 5쿼리 (상호명 2종·주소·업종·전화번호) → 모두 PID=None
- 근거: Naver Local DB 미등록. Instagram/공식 사이트 없음.
- 판정: **GENUINE_EXCEPTION — NO_ONLINE_PRESENCE**

### 2. 멍텅구리 (busan-G-00109)
- 주소: 부산 영도구 절영로93번길 11
- 전화: 051-415-2421
- Naver Place PID: `37018974` ("멍텅구리 : 네이버" ✓)
- 시도: `/photo` 갤러리 sleep=5 + sleep=8 재시도 → 사업자 이미지 0건
- 주의: `icon_default_profile.png` DOM에서 탐지됐으나 식당 사진 아님 → 제거
- 판정: **GENUINE_EXCEPTION — NO_BUSINESS_IMAGE_ON_PLATFORM**

### 3. 미소오뎅 (busan-G-00158)
- 주소: 부산 남구 유엔평화로10번길 9
- 전화: 051-644-3838
- Naver Place PID: `13399848` ("미소오뎅 : 네이버" ✓)
- 시도: `/photo` 갤러리 DOM → 10건, 전부 `pup-review-phinf.pstatic.net` (소비자 리뷰)
- 판정: **GENUINE_EXCEPTION — REVIEW_PHOTOS_ONLY (policy: FORBIDDEN)**

---

## 이미지 소스 분류 (최종 191건)

| CDN / 소스 | 건수 | image_rights |
|-----------|------|--------------|
| ldb-phinf (Naver 업체 업로드) | ~80 | business_provided |
| naverbooking-phinf (Naver 예약) | ~31 | business_provided |
| ugc-images.catchtable.co.kr | 21 | business_provided |
| TourAPI / KTO 공식 | 기존 포함 | official |
| VisitBusan / VBC | 기존 포함 | usable |
| busan.go.kr 공식 | 1 | official |
| CDNInstagram (업체 계정) | 기존 포함 | business_provided |

---

## 스크립트 이력

| 파일 | 역할 |
|------|------|
| `image_recovery_v3b.py` | CatchTable 비앱 URL Playwright (Phase B2) |
| `image_recovery_v3c.py` | Naver Place ID discovery 초기 버전 |
| `image_recovery_v3d.py` | og 필터 버그 발견, Place ID 전수 수집 |
| `image_recovery_v3e.py` | og 필터 수정, 단일문자 검증 (false positive 있음) |
| `image_recovery_v3f.py` | 2-gram 검증, exclude_pids, 재확인 |
| `image_recovery_v3g_final.py` | 최종 3개 예외 확인 |
| `apply_and_finalize.py` | canonical 적용 140→190/194 |
| `final_4_exceptions.py` | 정짓간 .JPG ✓, 멍텅구리 아이콘 오입력 |
| `fix_mengtang.py` | 멍텅구리 아이콘 제거 → 191/194 확정 |

모든 스크립트 위치: `C:\Users\USER\AppData\Local\Temp\claude\c---------------KoreaMate\68275f29-cf89-44cb-ab92-a5cf662316b9\scratchpad\`

---

## 연관 문서

- 핸드오프: `docs/data-collection/busan/busan-food-final-handoff-v1.md`
- CANONICAL: `data/tourapi/normalized/busan/busan-food-194-canonical-v1.json`
