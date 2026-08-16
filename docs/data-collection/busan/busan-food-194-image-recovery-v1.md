# TASK-BUSAN-FOOD-194-IMAGE-RECOVERY-V1 완료보고서

**작성일**: 2026-08-16  
**브랜치**: data/busan-food-discovery-v1  
**기준 커밋**: 0aa025d (COORD-RECOVERY-V1 완료)  
**태스크**: 74개 image_unresolved 엔티티의 공식 이미지 복구

---

## 1. 프리플라이트 결과

| 항목 | 값 |
|------|----|
| CANONICAL 총계 | 194 |
| nav_ready | 194/194 ✓ |
| ai_auto | 126/194 |
| image_resolved | 120/194 |
| **image_unresolved** | **74/194** |
| image_resolved 소스 | visitbusan.net 113건, tong.visitkorea.or.kr 7건 |

**unresolved 분류**:

| 분류 | 건수 | 특징 |
|------|------|------|
| discovery_candidate 없음 (guide-only) | 68 | FoodService 미매칭, UC_SEQ 없음 |
| discovery_candidate 있음 (UC_SEQ 보유) | 6 | WEB_VISIBLE_BUT_API_IMAGE_GAP |
| **합계** | **74** | |

---

## 2. §2 VisitBusan CMS 프로브 (6건 UC_SEQ 케이스)

### 대상 6건

| canonical_id | name_ko | uc_seq | disc_id |
|--------------|---------|--------|---------|
| busan-G-00004 | 톤쇼우 | 1639 | busan-F-00350 |
| busan-G-00043 | 쥬가정효 | 1638 | busan-F-00349 |
| busan-G-00055 | 차오란 | 1597 | busan-F-00309 |
| busan-G-00095 | 원조할매낙지 | 1621 | busan-F-00333 |
| busan-G-00144 | 언양불고기부산집 | 1544 | busan-F-00256 |
| busan-G-00168 | 할매재첩국 | 1625 | busan-F-00336 |

### 조사 결과

**FoodService API** (`apis.data.go.kr/6260000/getFoodKr`):  
모든 6건 `MAIN_IMG_NORMAL = ""` → 이미 확인됨 (OFFICIAL-API-RECOVERY-V1)

**curated-images-21f/p/q.jsonl**:  
6건 모두 `image_status: source_exhausted`, `curated_images: []`

**VisitBusan 웹 직접 접근**:  
`busan-image-recovery-v2-evidence.json` 기존 증거 확인:

| disc_id | url_used | status | page_title |
|---------|----------|--------|------------|
| busan-F-00350 | `...menuCd=DOM_000000201002001000&uc_seq=1639` | 200 | 음식 \| 부산에가면 |
| busan-F-00349 | `...uc_seq=1638` | 200 | 음식 \| 부산에가면 |
| busan-F-00309 | `...uc_seq=1597` | 200 | 음식 \| 부산에가면 |
| busan-F-00333 | `...uc_seq=1621` | 200 | 음식 \| 부산에가면 |
| busan-F-00256 | `...uc_seq=1544` | 200 | 음식 \| 부산에가면 |
| busan-F-00336 | `...uc_seq=1625` | 200 | 음식 \| 부산에가면 |

**verdict_distribution: `OFFICIAL_SITE_NOT_FOUND: 37`** (6건 포함)

> ⚠️ **URL 패턴 주의**: `menuCd=DOM_000000201002001000`는 음식 목록 페이지 URL로, 
> 개별 식당 상세 페이지가 아님. HTTP 200이지만 실제로는 제네릭 목록 페이지를 반환.  
> 별도 시도한 `menuCd=DOM_000001503001000` 패턴은 WAF → "알 수 없는 오류" 반환.  
> 올바른 상세 페이지 URL 패턴 미확인 → §6 USER_BROWSER_SAMPLE_REQUIRED 트리거.

**§2 결론**: 자동 복구 불가. 기존 v2 evidence 채택.

---

## 3. §3 가이드 전용 68건 분석

| 항목 | 결과 |
|------|------|
| canonical_id 형태 | busan-G-* (전체 74건) |
| discovery_candidate_id | None (68건) |
| KTO content_id | 0건 |
| KTO detailIntro2 매핑 | 0건 |
| VisitBusan SSR HTML | 0건 |
| FoodService UC_SEQ | 없음 |

**소스별 image_gap_reason**: 68건 전원 `CURRENT_FOODSERVICE_ENTITY_NOT_FOUND`

이 엔티티들은 Michelin Guide Korea, 부산 맛 가이드, 태그슈랑 등에서 수집된
가이드-전용(guide-only) 엔티티로, 공식 관광 API 생태계에 미등록 상태.  
→ **공식 디지털 이미지 경로 없음** — 자동화 복구 불가.

---

## 4. §4 기타 공식 소스

| 소스 | 결과 |
|------|------|
| KTO detailIntro2 (type39, 262건) | unresolved 엔티티와 매핑 0건. 파일명 = content_id 기반, 가이드-only 엔티티는 KTO 미등록. |
| VisitBusan FoodService API 전체 배치 | `MAIN_IMG_NORMAL` = empty for 6건; 68건은 API 미검색. |
| 부산7비치 API | 식당 카테고리 해당 없음 (해수욕장/관광지용) |
| 부산관광아카이브 | 접근 가능한 API 엔드포인트 미명시. 가이드-only 엔티티에 대한 연결 고리 없음. |
| tong.visitkorea.or.kr | 이미 resolved 7건에 적용됨 (content_id 기반). 74건은 content_id 없음. |

**§4 결론**: 적용 가능한 추가 소스 없음.

---

## 5. §5 캐노니컬 업데이트

복구된 이미지 **0건** → 캐노니컬 수정 없음.

| 지표 | 이전 | 이후 |
|------|------|------|
| image_resolved | 120 | 120 (변동 없음) |
| image_unresolved | 74 | 74 (변동 없음) |

---

## 6. §6 USER_BROWSER_SAMPLE_REQUIRED

> VisitBusan 웹의 실제 음식 상세 페이지 URL 패턴이 확인되지 않았음.  
> v2 evidence 사용 URL이 목록 페이지를 반환했으므로, 올바른 상세 페이지 존재 여부 확인 필요.

**요청 대상 (1건 샘플)**:  
`톤쇼우` (canonical: busan-G-00004, uc_seq: 1639)

**사용자 확인 방법**:
1. 브라우저에서 VisitBusan 음식 페이지 방문: https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201001000000&lang_cd=ko
2. 검색창에 "톤쇼우" 입력 → 상세 페이지 진입
3. DevTools → Network → Img 탭에서 식당 대표 이미지 Request URL 확인
4. (또는) 직접 URL: uc_seq=1639 사용한 상세 페이지 URL이 무엇인지 확인

**필요 최소 정보**: 대표 이미지 `Request URL` 1건

**판단 기준**:
- 이미지 URL이 `visitbusan.net/uploadImgs/...` 형태 → OFFICIAL_IMAGE_CANDIDATE 존재 → 6건 수작업 등록 검토
- 이미지 없음/페이지 없음 → FINAL_NO_IMAGE_CONFIRMED → image_status=NO_OFFICIAL_IMAGE 최종화

---

## 7. 검증 중 발견된 개선 사항

### I-001 (MEDIUM) — v2 evidence URL 패턴 문제
**현상**: `busan-image-recovery-v2-evidence.json`에서 사용한 URL  
`menuCd=DOM_000000201002001000&uc_seq=XXX`가 개별 상세 페이지 대신  
음식 목록 페이지(title: "음식 \| 부산에가면")를 반환함.  
**영향**: 6건에 대한 OFFICIAL_SITE_NOT_FOUND 결론이 URL 패턴 오류로 인한 것일 수 있음.  
**권고**: §6 user browser sample로 실제 상세 페이지 URL 확인 후 재평가.

### I-002 (LOW) — 가이드-only 엔티티 터미널 상태 미명시
**현상**: 68건의 guide-only 엔티티에 대해 태스크 스펙이 명시적 terminal 처리를 정의하지 않음.  
**권고**: FINAL-QA-V1 단계에서 `image_status = 'NO_OFFICIAL_IMAGE_AVAILABLE'` 최종화 처리 필요.

---

## 8. 커밋

| 타입 | 내용 | SHA |
|------|------|-----|
| 데이터 변경 | 없음 (image_resolved 변동 없음) | — |
| 보고서 | 이 파일 추가 | — |

```
git add docs/data-collection/busan/busan-food-194-image-recovery-v1.md
git commit -m "docs: TASK-BUSAN-FOOD-194-IMAGE-RECOVERY-V1 completion report

IMAGE_RESOLVED=120/194 (unchanged). All automated paths exhausted:
- 6 UC_SEQ cases: WEB_VISIBLE_BUT_API_IMAGE_GAP confirmed via v2 evidence
  (OFFICIAL_SITE_NOT_FOUND x6; curated source_exhausted x6)
- 68 guide-only: CURRENT_FOODSERVICE_ENTITY_NOT_FOUND; no KTO/API path
- I-001: v2 evidence URL pattern may be wrong (list page, not detail page)
- I-002: guide-only terminal state needs explicit final-QA marking

ACTION_REQUIRED: USER_BROWSER_SAMPLE for 톤쇼우(uc_seq=1639)
NEXT_TASK: FINAL-QA-V1 (after user browser confirmation)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 9. 결론

| 항목 | 값 |
|------|-----|
| 태스크 상태 | IMAGE_RECOVERY_EXHAUSTED |
| 복구된 이미지 | 0건 |
| image_resolved 최종 | 120/194 (61.9%) |
| 자동화 경로 | 모두 소진 |
| 잔여 액션 | **USER_BROWSER_SAMPLE 1건 (톤쇼우 UC=1639)** |
| 이후 태스크 | FINAL-QA-V1 (user browser 결과 수신 후) |

> 74건 image_unresolved는 FoodService API 미등록(68건) 및 WEB_VISIBLE_BUT_API_IMAGE_GAP(6건)으로,
> 현재 접근 가능한 공식 API 생태계 내 이미지가 존재하지 않음.  
> 사용자 브라우저 샘플 결과가 "이미지 없음"으로 확인되면 74건 전체를 
> `image_status = 'NO_OFFICIAL_IMAGE_AVAILABLE'`로 최종화 가능.
