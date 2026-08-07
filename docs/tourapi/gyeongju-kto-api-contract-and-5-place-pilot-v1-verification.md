# TASK-GYEONGJU-KTO-API-CONTRACT-AND-5-PLACE-PILOT-V1 검증 보고서

> 작성일: 2026-08-07  
> 검증 대상: 태스크 프롬프트 및 실행 환경  
> HTTP·API: **0건** (사전 검증 단계)

---

## 1. 전제 검증 결과

| 항목 | 확인 결과 |
|------|-----------|
| ZIP 매뉴얼 | TourAPI_Guide_(관광사진)v4.2.zip [747KB] ✅ / 개방데이터_활용매뉴얼(국문).zip [1.3MB] ✅ |
| TOUR_API_KEY | `.env.local`에 설정, `load_api_key()` 함수 인식 ✅ |
| TIER_A 117건 queue | `normalized/gyeongju/gyeongju-tourism-next-batch-priority-v1.jsonl` 존재, next_batch_tier=TIER_A_NEXT_RELEASE 117건 ✅ |
| attraction-identity-audit | 159건, 전건 area_uid 보유 ✅ |
| 기존 collector | `gyeongju_official_detail_collector_v1.py` 존재 ✅ |
| kto-list 기수집 | 전건 빈 데이터 (totalCount=null) — areaBasedList2 신규 수집 필요 ⚠️ |
| pilot 5건 VG 캐시 | 전건 미수집 (area_uid=72,91,68,52,380 모두 없음) ⚠️ |
| pilot 5건 KTO content_id | 없음 — 이름 매칭 필요 ⚠️ |
| 기존 kto-detail | 48건 중 4건만 유효 (나머지 totalCount=0) |
| CORE27 KTO 파일 | 6건 (content_id 알려진 것) |

---

## 2. TIER_A 데이터 구조 확인

| 항목 | 확인 결과 |
|------|-----------|
| queue 필드 | as_of, candidate_id, category, has_area_uid, has_night_view, has_viewpoint, has_heritage, has_course, next_batch_tier 외 |
| area_uid 소스 | attraction-identity-audit baseline_candidate_id → area_uid 매핑 필요 |
| TIER_A category | 전건 attraction (nature 0건) |
| TIER_A prefix | 전건 GJ01 (GJ07은 TIER_B) |
| 야경 속성 TIER_A | 2건: 금장대(area_uid=72), 서출지(area_uid=91) |
| 전망 속성 TIER_A | 1건: 금장대(area_uid=72) — 야경과 동일 |

---

## 3. KTO API 계약 확인 (기존 collector 기반)

기존 `gyeongju_official_detail_collector_v1.py`에서 확인:

| API | 엔드포인트 | 확인 |
|-----|-----------|------|
| 목록 수집 | `areaBasedList2` | ✅ (기존에는 미사용, 이번에 신규) |
| 기본 상세 | `detailCommon2` | ✅ fetch_kto_detail() 내 구현 |
| 유형별 상세 | `detailIntro2` | ✅ fetch_kto_detail() 내 구현 |
| 이미지 갤러리 | `detailImage2` | ✅ fetch_kto_detail() 내 구현 |

`_kto_get()` 함수가 areaBasedList2도 지원 (파라미터만 변경).  
**경주 areaCode=35, sigunguCode=2**: 기존 kto-detail 파일에서 확인.

---

## 4. Pilot 5건 선정 근거

| # | candidate_id | name_ko | area_uid | 선정 이유 |
|---|---|---|---|---|
| 1 | gyeongju-GJ01-0010 | 금장대 | 72 | 야경+전망 복합 속성 (TIER_A 유일) |
| 2 | gyeongju-GJ01-0055 | 서출지 | 91 | 야경 속성 + 유명 연못 |
| 3 | gyeongju-GJ01-0041 | 황룡사지 | 68 | UNESCO 세계유산 핵심 유적 |
| 4 | gyeongju-GJ01-0008 | 교촌마을 | 52 | 전통 마을 (CORE27 인근, 월성권) |
| 5 | gyeongju-GJ01-0039 | 황남리 고분군 | 380 | 고분군 다양성 |

다양성: 야경/전망(2건), 역사유적(2건), 전통마을(1건). 5건 모두 VG 미수집.

---

## 5. 잠재 리스크

| 리스크 | 대응 |
|--------|------|
| areaBasedList2 type12에 없는 유적 | type14도 수집하여 인덱스 병합 |
| 이름 변형 매칭 실패 | KTO_MATCH_NOT_FOUND 처리, 태스크 차단 안함 |
| VG HTML 구조 변경 | parse_ok=False → vg 필드 null, 태스크 차단 안함 |
| CALL_SLEEP 위반 | 기존 0.35s sleep 유지 |
| AS_OF 혼용 | 고정값 "2026-08-07T09:00:00Z" 전건 사용 |

---

## 6. 차단 이슈

**없음.** 개선 아이디어 없음.

---

## 7. 최종 검증 결론

**차단 이슈 없음. → 실행합니다.**

- `areaBasedList2` 신규 API 호출이지만 기존 `_kto_get()` 함수 재사용 가능
- 이름 매칭 실패 시 태스크 차단 안함 (CONDITIONAL_PASS 조건 ≥2/5)
- VG HTML 파싱 실패 시 태스크 차단 안함
- Run1=Run2: raw skip 로직으로 보장

실행 결과는 `gyeongju-kto-api-contract-and-5-place-pilot-v1-completion.md` 참조.
