# gokoreamate Current Work Order SSOT v1 (2026-09-07)

Owner 확정 작업 순서. 직전 우선순위 SSOT(`gokoreamate-product-data-closeout-priority-ssot-v1.md`,
2026-09-05 — P0 트랙은 전부 CLOSED)를 승계하는 현재 순서다.
Claude 가 발견한 tech debt·아이디어는 Owner 승인 없이 이 순서에 삽입하지 않는다
(발견은 보고서 OWNER ATTENTION 으로만 올린다).

## 순서

1. **AI 기반 마감**
   - Gemini 서울 Placement Worker 안정 통로 (`gokoreamate-ai-writing`, `gcp:asia-northeast3`)
   - My Trip AI writing: 3방향 × KO/EN/JA/ZH × 저장 → Story — Production 최종 LIVE PASS 확정
   - V2 AI Personalization Production 활성화 (`AI_PERSONALIZATION_MODE=production-live`)
2. **Shared Story**
3. **Blog** — EN/KO/JA/ZH 콘텐츠·언어전환
4. **External URL Import 실제 엔진**
5. **Seoul Planner**
6. **Jeonju Planner**

## 진행 기록

- 2026-09-07: ① AI 기반 마감 완료(서울 Worker·writing·personalization LIVE),
  ② Shared Story LIVE, ③ Blog v1 LIVE(공식 기반 3편·4-locale).
- 2026-09-07: **Blog 공식 원천 공급층 v1**(TASK-GOKOREAMATE-BLOG-OFFICIAL-SOURCE-SUPPLY-V1,
  Owner 승인 Blog 후속) — KTO TourAPI(KorService2/EngService2) + VisitKorea Travel News
  candidate 구조. `docs/data-collection/blog-supply/blog-supply-structure-v1.md` 참조.
  수집=후보일 뿐, 게시는 별도 큐레이션. refresh cadence 는 Owner 결정 대기.
- 2026-09-07: ④ External URL Import 엔진 LIVE(Preview-first·provider-neutral·SSRF 방어,
  master 6509ec5), ⑤ Seoul Planner LIVE→최종 CLOSED(서울역 기본·far-airport 규칙·
  This Trip/Fixed 최종 QA, master c85ea17→3cd811c).
- 2026-09-07: **⑥ Jeonju Planner LIVE→CLOSED**(TASK-GOKOREAMATE-JEONJU-PLANNER-PRODUCTION-V1,
  master a8f6fa0) — planningReady 게이트만 개방(기본 도착 전주역=기존 승인 프리셋·
  published 211·데이터 재수집 0), Production 브라우저 QA 전항 PASS(기본/늦은 도착/출발
  buffer/This Trip/Fixed 2건/AI 취향 차등/대표성/5도시 회귀/4-locale).
  **본선 ①~⑥ 전부 CLOSED — 다음 작업은 Owner 새 지시로만 시작한다.**

## 별도 정리 (본선 순서 밖)

- legacy V1 `functions/api/generate-itinerary.ts` 는 본선 우선순위가 아니다.
  전용 게이트(`LEGACY_ITINERARY_AI_MODE`, 미설정 = 410)로 격리되어 있다.
  **V2 AI Personalization PASS 후 참조 0/필요성 확인을 거쳐 삭제 여부를 Owner 가 판단한다.**

## V2 Planner 제품 계약

```
Rule Scheduler → Gemini 취향 profile/weight → Rule constraints
```

- Gemini 는 전체 일정을 자유 생성하지 않는다. 프로필(가중치)만 만든다.
- 시간/거리/도착·출발/실행가능성 등 최종 제약은 Rule 이 지킨다.
- 호출은 여행당 정확 1회·재시도 0·실패 시 profile null → 순수 Rule 결과(사용자 무해).
- provider 호출은 서울 Worker `/provider` 경유(HKG ingress 지역 차단 회피).

## My Trip AI writing 계약

- 현재 UI locale 자동 사용(언어를 묻지 않는다): KO/EN/JA/ZH.
- 방향은 정확히 3개: 절제된 담담하고 부담스럽지 않은 / 유머와 재치, 센스 / 감성적인.
- 대상은 title/memo. **My Trip 이 원본**이고 저장된 내용이 Story 에 동일 반영된다(별도 Story AI 없음).

## Weather 제품 계약 — Owner Decision 2026-09-08

기록 태스크: TASK-GOKOREAMATE-WEATHER-PRODUCT-CONTRACT-RECORD-V1 (DOCUMENTATION ONLY —
이 섹션은 계약 기록이며, 구현·API 연결·UI 변경은 후속 태스크로만 진행한다).

### A. City Hub Weather — 매우 작은 quiet utility

City Hub 에 그 여행 도시의 **현재 날씨**를 아주 작고 조용한 utility 로 표시한다.
표현 수준은 `☀️ 26°C` 정도가 전부다.

- 허용: weather icon + current temperature.
- 금지: 최고/최저 나열 · 강수확률 카드 · 7-day dashboard · 복잡한 기상 UI ·
  City Hub 를 기상 서비스처럼 만드는 것. **GoKoreaMate 는 weather service 가 아니다.**
- 이 계약은 기존 `home-ux-decision-ssot-v1.md` 의 "complex weather module /
  날씨 dashboard 를 기본으로 넣지 않는다" 원칙과 **정합**한다(그 원칙은 유지된다).

### B. 기준은 도시다 — GPS 가 아니다

City Hub weather 의 기준은 사용자의 현재 GPS 위치가 아니라 **지금 보고 있는
여행 도시**다. Busan Hub → Busan / Seoul Hub → Seoul / Jeju Hub → Jeju /
Gyeongju Hub → Gyeongju / Jeonju Hub → Jeonju.
이유: 해외에서 한국 여행을 계획하는 사용자의 실제 GPS 는 여행 대상 도시와
무관할 수 있다.

### C. Weather 클릭 — city-specific destination 필수

City Hub 의 weather icon/온도 영역은 클릭 가능해야 하고, 클릭 시 **그 도시의**
weather detail/source 로 간다. Busan 에서 클릭했는데 GPS 기반 현재 위치 날씨나
generic Korea weather 로 가면 안 된다.
정확한 provider/링크는 후속 Visual/Product Audit 에서 현재 코드·기존 승인
디자인을 확인한 뒤 결정한다 — **이 문서에서 새 provider 를 발명하지 않는다.**

### D. My Trip Weather — KEEP (매우 중요)

현재 My Trip 에 존재하는 weather 기능은 **그대로 유지**한다. City Hub weather 는
My Trip weather 를 대체·이전하는 기능이 아니다.

- 역할 구분: City Hub weather = 여행지를 **탐색/선택**할 때 보는 도시 날씨 /
  My Trip weather = 사용자가 만든 **실제 일정/Day 맥락**에서 보는 날씨.
- 따라서 My Trip weather 삭제 금지 · 숨김 금지 · City Hub 추가를 이유로 한 축소 금지.
- 현재 My Trip weather 의 실제 표현/연결 상태는 후속 Visual Audit 에서 확인한다.

### E. CURRENT OBSERVATION — AUDIT REQUIRED

Owner 가 현재 Production 에서 관찰한 상태(원인 미확정 — 판정 금지):

- 지역페이지에 weather 영역/칸은 존재하는 것으로 보이나, 실제 온도 등이
  연결되지 않고 `날씨보기` 수준으로만 표시되는 것으로 보인다.
- 가능한 원인(열거일 뿐 확정 아님): API/data unwired · UI wiring regression ·
  disabled configuration · incomplete prior implementation 등.
- 후속 audit 에서 approved design + git history + current code + Production 을
  비교해 정확히 판정한다.

참고(2026-09-08 기록 시점의 repo 실측 — 판정이 아니라 audit 입력):
`날씨 보기` 문구는 My Trip 쪽 `WeatherLinkChip`(STAGE A — 실제 예보 미연동이라
기온을 지어내지 않고 기상청 공식 홈 링크만 제공, STAGE B 에 temperature prop
예정이라고 컴포넌트 자체에 기록됨)에서 나오며, 링크는 도시별이 아닌 단일
`weather.go.kr` 홈이다. City Hub(`CityHubClient`) 에는 현재 weather UI 가 없다.

### 과거 결정과의 관계 (삭제하지 않고 승계를 명시)

- `CityHubClient` 의 기존 주석/방침 "지도·필터·랭킹·**날씨는 넣지 않는다**" 는
  City Hub weather 에 한해 **2026-09-08 Owner Decision 이 최신 결정으로 승계**한다
  (단, 넣는 것은 A 의 icon+온도 quiet utility 뿐이며 복잡한 기상 UI 금지는 그대로다).
  과거 문구 자체는 이 기록 태스크에서 수정하지 않는다(코드 변경 금지) —
  후속 구현 태스크에서 함께 갱신한다.
- scheduler v2 SSOT 의 "weather adaptation(P3)" 는 엔진 로드맵 항목으로 이 표시
  계약과 별개이며 충돌 없다.

### 후속 Visual/Product Audit 검증 항목 (필수)

1. 과거 승인 weather 디자인 확인
2. City Hub weather 현재 UI
3. 실제 weather data/API 존재 여부
4. 왜 `날씨보기` 만 보이는지 (E 의 원인 판정)
5. city-specific link 존재 여부
6. Busan/Seoul/Jeju/Gyeongju/Jeonju 각 도시 매핑
7. My Trip weather 현재 실제 화면
8. My Trip weather 가 정상 연결/표현되는지
9. City Hub 와 My Trip weather 역할이 충돌하지 않는지

---

## 현재 상태의 authoritative summary (2026-09-08 이후)

이 문서의 본선 ①~⑥ 은 CLOSED 된 **역사적 Work Order** 로 유지된다. 앞으로
**현재 제품 상태/Acceptance 기준을 판단하는 authoritative summary 는**
`docs/product/gokoreamate-current-product-acceptance-ssot-v1.md` 다
(TASK-GOKOREAMATE-CURRENT-PRODUCT-ACCEPTANCE-SSOT-V1, 2026-09-08).
