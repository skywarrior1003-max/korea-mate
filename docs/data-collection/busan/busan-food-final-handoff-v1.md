# 부산 Food 최종 Handoff — busan-food-final-handoff-v1

**작성일**: 2026-08-17  
**수렴 태스크**: TASK-BUSAN-FOOD-194-FINAL-IMAGE-RECOVERY-AND-QA-V1  
**브랜치**: `data/busan-food-discovery-v1`  
**CANONICAL SHA**: `75ac94f503d5ca61fd925f9cf5e64259b275bb5ee8734221bbea0d20370b0e03`

---

## 최종 지표

| 항목 | 값 | 비고 |
|------|-----|------|
| CANONICAL | 194 | 부산 Gourmet Guide 전체 |
| NAV_READY | **194/194** | 100% |
| IMAGE | **140/194** | 72.2% |
| AI_AUTO | **189/194** | 97.4% |
| ACTIVE | 190/194 | TEMP_UNVERIFIED 4건 제외 |
| CLOSED | 0 | |
| MOVED | 0 | |
| TEMPORARILY_UNVERIFIED | 4 | 귀화식당 사케의 향, 이안, 신도랩2.0, 미락슈퍼 |
| DIFFERENT_ENTITY | 1 | 슌사이쿠보 화명 (ACTIVE, ai_auto blocked) |

---

## 커밋 이력

| 커밋 | 태스크 | 내용 |
|------|--------|------|
| `0aa025d` | COORD-RECOVERY-V1 | VWorld geocode 88건, NAV 106→194/194 |
| `df5c772` | IMAGE-R1-OVERNIGHT-V2 | IMAGE 120→122, 할매재첩국 coord 정정 |
| `53f0654` | CLOSURE-SPRINT-V1 | IMAGE 122→125 (VBC 3건), 72+68건 종료분류 |
| `5348ebe` | NAVER-UNBLOCK-V1 | IMAGE 125→140 (+15 Instagram), AI_AUTO 126→189 (+63) |

---

## 이미지 정책 요약

### 적용 source 계층

1. **VisitBusan / 부산관광공사** (`image_rights='usable'`): 최우선. 관광공사 공식 허가 이미지.
2. **KTO / TourAPI** (`image_rights='official'`): 한국관광공사 공식. 부산 Food는 대부분 수록 없음.
3. **VBC local JSONL** (`image_rights='usable'`): VisitBusan Content JSONL. FoodService 미수록 항목에도 제공 가능. uc_seq 기반 address match 필수.
4. **Instagram 공식 계정 og:image** (`image_rights='business_provided'`): 식당이 Naver Local에 등록한 공식 계정. 사업자 제공, `takedown_ready=true`.
5. **식당 공식 홈페이지 og:image** (`image_rights='business_provided'`): 특정 조건 시만.

### 영구 금지

| 금지 항목 | 이유 |
|-----------|------|
| Michelin Guide 사진 | 서비스 정책 |
| Pixabay / generated 이미지 | 라이선스 |
| 일반 고객/리뷰어 사진 | 사업자 비제공 |
| 블로그 사용자 사진 | 사업자 비제공 |
| 다른 지점 사진 | 동일 entity 원칙 |
| 호텔 브랜드 generic 이미지 | 식당 특정 불가 |
| Google/Naver 이미지 직접 복사 | API 정책 위반 |
| Kakao Maps 이미지 | WAF 차단 정책 |

---

## Naver Local 사용 범위

| 항목 | 사용 방식 |
|------|-----------|
| API | NAVER_API_HUB_LOCAL_SEARCH (`naverapihub.apigw.ntruss.com/search/v1/local`) |
| 인증 | X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY |
| 용도 | 운영 상태 확인 (VERIFIED_ACTIVE), Instagram/공식 링크 discovery |
| 임계값 | score ≥ 0.70, dist < 500m |
| 금지 | raw API response 별도 DB 저장 금지, Naver 지역정보 별도 축적 금지 |
| 이미지 | og:image 추출만 허용 (business_provided, takedown_ready) |

---

## 잔여 blockers 상세

### IMAGE_UNRESOLVED 54건

#### BUSINESS_IMAGE_FOUND_BUT_MAPPING_BLOCKED 30건

**근본 원인**: 18건이 CatchTable SPA (JavaScript 렌더링 필수, og:image 없음). 나머지 Naver 블로그(3건), YouTube(1건), Michelin 정책(1건), Lotte generic(1건), rate-limited(2건), 기타(4건).

| 유형 | 건수 | 대표 예시 |
|------|------|-----------|
| CatchTable SPA | ~18 | 디귿, 석정갈비, 이와, 피오또, 기장해변짚불곰장어, 레스토랑 엠비언스, 융캉찌에, 야키토리 온정, 잔둔가, 야키쵸리, 아르프, 미락슈퍼, 융캉찌에 광안본점, 마츠자키, 비네토, 안목, 샤브니지, 쉐프곤 |
| Naver 블로그 | 3 | 서가원국수, 초량갈비, 레썽스 |
| Michelin 금지 | 1 | 피리피리 |
| Lotte Hotel generic | 1 | 차오란 |
| YouTube | 1 | 막둥이네 양곱창 |
| 기타 | 6 | 당미옥, 차애전 할매칼국수, 송헌집, 한월관, 정짓간 신평본점, menu.busan.go.kr session-gated |

**해소 조건**: CatchTable이 SSR(서버사이드 렌더링) og:image를 제공하거나, 대상 식당이 별도 Instagram/공식 사이트를 개설하는 경우.

#### NO_BUSINESS_IMAGE_FOUND 24건

| canonical_id | 상호 |
|---|---|
| busan-G-00016 | 귀화식당 사케의 향 |
| busan-G-00043 | 쥬가정효 |
| busan-G-00063 | 신도랩2.0 |
| busan-G-00066 | 옥이보리밥 |
| busan-G-00077 | 만세담 |
| busan-G-00083 | 갯마을횟집 |
| busan-G-00100 | 청기와식당 |
| busan-G-00102 | 오성집 |
| busan-G-00104 | 부광갈비 |
| busan-G-00105 | 초량돼지국밥 |
| busan-G-00107 | 마가만두 |
| busan-G-00109 | 멍텅구리 |
| busan-G-00118 | 나룻터국수 |
| busan-G-00143 | 비비재 |
| busan-G-00148 | 뉴러우멘관즈 |
| busan-G-00158 | 미소오뎅 |
| busan-G-00173 | 꽃마을지리산어탕 |
| busan-G-00174 | 골목 손칼국수 |
| busan-G-00176 | 흑산도 횟집 |
| busan-G-00178 | 맛나기사식당 |
| busan-G-00180 | 왕밀면냉면 본점 |
| busan-G-00183 | 원조일미기사식당 |
| busan-G-00185 | 돌고래순두부 |
| busan-G-00187 | 개미집 본점 |

**근본 원인**: Naver Local Search 미수록 또는 공개 Instagram/공식 사이트 없음. 주로 전통 한식당, 기사식당, 서민 식당 계열로 온라인 존재감 낮음.

### AI_AUTO_BLOCKED 5건

| canonical_id | 상호 | 차단 이유 |
|---|---|---|
| busan-G-00016 | 귀화식당 사케의 향 | TEMPORARILY_UNVERIFIED (Naver score=0.0, 모든 대체 쿼리 미매칭) |
| busan-G-00059 | 이안 | TEMPORARILY_UNVERIFIED (Naver score=0.58, 임계값 미달) |
| busan-G-00063 | 신도랩2.0 | TEMPORARILY_UNVERIFIED (Naver score=0.0) |
| busan-G-00122 | 미락슈퍼 | TEMPORARILY_UNVERIFIED (Naver score=0.65, 임계값 미달) |
| busan-G-00164 | 슌사이쿠보 화명 | DIFFERENT_ENTITY_RELATION_REMOVED (ACTIVE, 보수적 hold) |

---

## 다음 도시 적용 교훈

### Naver API Hub

- endpoint: `naverapihub.apigw.ntruss.com/search/v1/local`
- mapx/mapy: INTEGER ×10^7 (float(mapy)/1e7=lat, float(mapx)/1e7=lng)
- thumbnail 필드: **없음** (og:image 별도 추출 필요)
- Instagram og:image: `cdninstagram.com/v/t51.2885-19/` (profile small) / `t51.82787-19/` (profile large) — 사업자 계정 공식 이미지로 인정
- 부산 195건 중 VERIFIED_ACTIVE 90%+ 달성 가능 (score ≥ 0.70 기준)

### CatchTable (catchtable.co.kr)

- SPA 플랫폼, og:image HTML 정적 추출 **불가**
- Naver에서 공식 링크로 반환되는 경우 많음 (부산 ~18건)
- **해결법**: 향후 Playwright/Puppeteer 등 headless browser 실행 환경 또는 CatchTable 공식 파트너 API 필요
- 미수록 시 인정: CatchTable에 등재 = 영업 중인 식당 evidence이지만 이미지 소스로는 불가

### VBC (VisitBusan Content) JSONL

- 파일: `data/tourapi/enriched/busan/busan-food-discovery-candidates-v1.jsonl`
- 721개 candidates, 334개 uc_seq food with image
- 매칭: address exact match (±30m) 기준
- FoodService 미수록 식당에도 이미지 제공 가능 — 부산 3건 해소
- 다른 도시: 동등 VBC-equivalent 관광 콘텐츠 JSONL 존재 여부 확인

### 좌표 처리

- KTO coord baseline 88건 수정: VWorld geocoder v2 사용 (`api.vworld.kr/req/address`)
- 키: VWORLD_API_KEY (.env.local)
- 변환: lat=Integer÷10^7, lng=Integer÷10^7

### Instagram og:image 추출

- 공개 계정 og:image: `resp.read(100000)` 후 meta property 파싱
- 성공률: ~22% (69건 중 15건 성공)
- 실패 원인: 비공개 계정, og:image 미설정, 크기 제한
- 성공한 og:image URL: `scontent-gmp1-1.cdninstagram.com/...` — CDN URL, takedown_ready=true 필수

### 데이터 품질

- 부산 Gourmet Guide 194건: 100% 수집 완료
- image rights 계층: usable(VBC/VisitBusan) > official(KTO) > business_provided(Instagram/web)
- TEMPORARILY_UNVERIFIED 최소화: Naver API Hub 1회 전체 스캔으로 64/68 해소 (94%)

---

## 부산 Food 트랙 마감 선언

```
FURTHER_BROAD_RECOVERY_REQUIRED = NO
SAFE_TO_CLOSE_BUSAN_FOOD_TRACK  = YES
BUSAN_FOOD_DATA_STATUS          = COMPLETE_WITH_KNOWN_GAPS
BUSAN_FOOD_RELEASE_READY        = YES
```

부산 Food 데이터는 이 시점에서 최선의 자동화 수집을 완료했다.  
54건 IMAGE_UNRESOLVED 및 5건 AI_AUTO_BLOCKED의 잔여 항목은 구조적 기술 한계(CatchTable SPA, 온라인 존재감 없는 전통 식당)로 인한 것이며 동일한 자동화 재시도로는 해소 불가능하다.  
이후 보강은 **단건 수동 발굴** 또는 **headless browser 환경 구축** 후 CatchTable 이미지 추출로만 가능하다.
