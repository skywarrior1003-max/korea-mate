# PHASE 10 — Partner/Affiliate E2E Readiness (v1 → **v2 보완 2026-09-12**)

작성: 2026-09-12 · 기준 Production 소스: `95f0a51`(v2 보완 시점 HEAD와도 일치,
미커밋 코드 변경 0) · 상위 SSOT: `gokoreamate-current-product-acceptance-ssot-v1.md`

**v2 변경 요약** (PHASE-10-PARTNER-READINESS-CONSOLIDATION-V2):
Owner 최신 확인 — Airalo **거절·제외**(재조사 금지) · Booking.com **이메일 인증
대기·보류** · Viator **제외**. 적용 준비 대상 = **Agoda / Trip.com / Klook /
KKday 4사**. Agoda(부산)·Trip.com(경주·전주) 실링크 확보로 v1의 "숙박 전체
숨김" 판단을 **수정**. 공개 착지 확인 수행(§1.5) — 단 예시 링크만으로 5도시·
4언어 전부 검증됐다고 표시하지 않는다.

이 문서는 **준비 문서**다. 런타임 코드 수정·게이트 ON·배포는 하지 않았고,
Owner 승인 전 시작하지 않는다. CLOSED 제품(Weather·AI Writing 등)은 재설계하지
않는다. 모든 항목에서 **[확정]**(증거 있는 사실)과 **[제안]**을 구분한다.

---

## 1. Owner 확보 실링크 — 구조 분석 [확정]

URL 파서로 분해한 결과이며, 아래 사실 이상으로 확대 해석하지 않는다
(aff_adid 범용 재사용·전 도시/상품 추적 성공은 **미확인**).

### Klook
- AID **123610** · 생성 당시 aff_adid **1427383**
- 형식: `affiliate.klook.com/redirect?aid=…&aff_adid=…&k_site=<이중 인코딩된 목적지>`
- 확인된 목적지: `www.klook.com/ko/search/result/?query=부산` — **KO locale 검색 결과**
  (특정 상품 아님). k_site 는 URL-encode 된 전체 목적지를 값으로 갖는다 →
  구현 시 목적지별로 `encodeURIComponent(목적지 전체 URL)` 로 조립 가능
  [제안 — 단 aff_adid 를 목적지마다 재생성해야 하는지는 §7-① Owner 확인 필요].

### KKday
- CID **26267** · 승인된 개인 계정·통장 등록 완료(Owner 확인) [확정]
- 형식: `www.kkday.com/en?cid=26267&ud1=gokoreamate&ud2=test`
- 확인된 착지: **EN 홈페이지**(한국/도시/상품 아님). `ud1/ud2` = 자유 태그 슬롯,
  `ud2=test` 는 시험용 → 운영에서는 문맥 태그(예: `ud2=busan-transport`)로 교체
  [제안 — 태그 체계는 §7-② 승인 항목].
- 규칙: 홈페이지 링크를 "이 장소 예약" 대체로 쓰지 않는다 — 도시/카테고리
  "더 보기" 용도까지만. 상품·도시 딥링크에 cid 가 붙는지는 **미확인**.

### 1.4 (v2) Agoda / Trip.com — Owner 원본 링크 구조 [확정]

- **Agoda(부산)**: `www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1972243&hl=en-us&city=17172`
  → 공식 partnersearch 규격: `cid`(제휴 ID)+`hl`(언어)+`city`(도시 ID). 부산=17172 [확정].
  타 도시 ID·호텔 ID 는 **추측하지 않는다**(Owner 대시보드/공식 자료로 확보).
- **Trip.com(경주·전주)**: `kr.trip.com/hotels/<도시>-hotels-list-<ID>/?Allianceid=9901788&SID=327852582&trip_sub1=…&trip_sub3=…`
  → `Allianceid`+`SID`+`trip_sub1/3`(문맥 태그) 규격 [확정]. 경주=3675 ·
  전주=61380 [확정]. 부산/서울/제주 ID 미확보 — 추측 금지.

### 1.5 (v2) 공개 착지 확인 결과 — 원본 vs 규칙 기반 구성 구분

파서/HTTP+실브라우저로 확인. **접속·파싱 성공 ≠ 추적·귀속 성공**(§5 5단계로만
확정). "규칙"=공식 파라미터 문법에서 언어/목적지만 치환해 구성한 URL.

| 링크 | 구분 | 상태 | 최종 착지 | 착지 언어 | 파라미터 잔존(주소 기준) |
|---|---|---|---|---|---|
| Agoda 부산 hl=en-us | 원본 | 200 | agoda.com/search | en | cid ✓ |
| Agoda 부산 hl=ja-jp / ko-kr / zh-cn | 규칙 | 200 | /ja-jp·/ko-kr·/zh-cn/search | ja/ko/zh-Hans | cid ✓ |
| Trip.com 경주·전주 (kr.) | 원본 | 200 | kr.trip.com 해당 목록 | ko-KR | Allianceid·SID·trip_sub1 ✓ |
| Trip.com 경주 www. / jp. | 규칙 | 200 | www(en)·jp(ja-JP) 동일 목록 | en/ja | Allianceid·SID·trip_sub1 ✓ |
| Trip.com ZH 도메인 | — | **미확인**(도메인 추측 금지 — 공식 자료 확인 필요) | — | — | — |
| Klook redirect(원본 ko·규칙 en-US) | 원본/규칙 | **403(봇 방어)** | klook.com/{ko·en-US}/search/result | (차단 페이지) | aid·aff_adid ✓ |
| KKday en 홈(원본)·en/ja/ko/zh-tw country/south-korea(규칙) | 원본/규칙 | **403(봇 방어 "Just a moment")** | 해당 경로 유지 | (차단 페이지) | cid·ud1 ✓ |

- Klook·KKday 403 은 데이터센터 IP 봇 차단으로 판단 — **링크 불량 단정 금지**,
  실기기(휴대폰 브라우저) 확인 항목으로 이월(§5). 파라미터가 최종 URL 에
  잔존함은 확인됨(주소에서 사라져도 추적 실패 단정 금지 원칙 유지).
- KKday `ud2` 는 영숫자만 사용(예: `busanactivity`) — `test` 는 운영 금지.

## 2. 전체 파트너 전달표 (v2 — Viator·Airalo 제외)

| 파트너 | 계정 근거 | 목적 | 실제 링크 | 언어 | 착지 범위 | 확인된 추적 규격 | 미확인 |
|---|---|---|---|---|---|---|---|
| **Klook** | Owner 대시보드 AID 123610 [확정] | 액티비티·교통·eSIM·티켓 | §1 부산 KO 검색 1건 [확정] | 원본 ko · en-US 규칙 구성 가능(착지는 봇차단 미확인) | 검색 결과(도시) | `aid`+`aff_adid`+`k_site` [확정] | aff_adid 범용성 · 실기기 착지 · ②③④⑤ |
| **KKday** | Owner 대시보드 CID 26267, 개인계정·통장 등록 [확정] · 전용 링크 화면에 CID 부착 안내 [Owner 확인] | 액티비티·교통 | §1 EN 홈 1건 [확정] + country/south-korea 규칙 구성 | en/ja/ko/zh-tw 경로 규칙 구성(착지 봇차단 미확인) | 홈·국가 페이지 | `cid`+`ud1/ud2`(영숫자) [확정] | 실기기 착지 · 상품 딥링크 cid · ②③④⑤ |
| **Agoda** | Owner 화면 cid **1972243** [확정] | 숙박 | §1.4 부산 partnersearch [확정] | **4언어 착지 200 검증**(en 원본·ja/ko/zh 규칙, §1.5) | 도시 호텔 검색 | `cid`+`hl`+`city` [확정] | 부산 외 4도시 city ID · ③④⑤ |
| **Trip.com** | Owner 화면 Allianceid **9901788**·SID **327852582** [확정] | 숙박 | §1.4 경주·전주 [확정] | ko 원본·en/ja 규칙 200(§1.5) · **zh 도메인 미확인** | 도시 호텔 목록 | `Allianceid`+`SID`+`trip_sub1/3` [확정] | 부산/서울/제주 목록 ID · zh 규격 · ③④⑤ |
| Booking.com | (v2) **수동 이메일 인증 대기 — 활성화 보류** [Owner 확인] | 숙박 | — | — | — | — | 인증 완료 대기(확인된 파트너 진행을 막지 않음) |
| Airalo | (v2) **거절 — 대상 제외** [Owner 확인] · 재조사/자료 요청 금지 | — | — | — | — | — | — |
| Viator | 기존 거절 — 제외 | — | — | — | — | — | — |

②③④⑤ = §5 의 검증 단계(파라미터 처리·자체 클릭·파트너 실적·구매 귀속).

**구세대 자산 — 운영 사용 금지 식별 [확정]**: registry 의 Klook `aid=41763`
(김해공항 이동), 단축링크 `sl/KiT3U74`(eSIM)·`sl/21FkAvj`(공항이동)는 Owner
신규 AID(123610) 이전 세대다. PHASE 10 활성화 전에 **전부 신규 AID 기반으로
교체 또는 비활성**해야 하며, 그대로 게이트만 켜면 안 된다.

## 3. 추천·대안 매핑안 [제안]

축: 언어(EN/JA/ZH/KO — 사용자가 고른 UI 언어만 사용, IP/국가 추론 없음) ×
목적(숙박/eSIM/교통/액티비티·패스·티켓). 원칙: 추천 1 + **검증된** 대안 ≤1,
검증된 것이 없으면 그 칸은 숨김. 커미션은 일정 생성·장소 선정·순위에 영향 0
(기존 affiliate-policy 계약 유지).

(v2) 언어별 브랜드 선호를 추측할 근거가 없어 **4개 언어 동일 순서**를 제안한다
(모든 칸 = **추천안** 상태 — Owner 승인 완료 아님. "후보"는 확인 완료 전 단계).
표기: 준비 상태 = 착지①까지의 §5 단계 번호.

| 언어 | 목적 | 추천 | 대안 | 선정 근거 | 링크 준비 상태 | 남은 확인 |
|---|---|---|---|---|---|---|
| EN/JA/ZH/KO 공통 | 숙박 | **Agoda** | **Trip.com** | Agoda: cid+hl+city 규격으로 4언어 착지 ① 검증(부산). Trip.com: 3언어 ① 검증(경주·전주) — 언어 커버가 현재 더 넓은 Agoda 를 추천 | Agoda 부산=① 완료 / Trip.com 경주·전주=①(zh 제외) | Agoda 4도시 city ID · Trip.com 3도시 ID+zh 규격 · 양사 ③④⑤ |
| EN/JA/ZH/KO 공통 | eSIM·통신 | **Klook** | (없음 — 숨김) | 후보군(Klook·KKday) 중 eSIM 상품 딥링크가 확인된 쪽이 아직 없음 — Klook 은 기존 eSIM 상품 취급 이력(구세대 링크)이 있어 신규 AID 재생성 대상 1순위 | 미비(신규 AID eSIM 목적지 필요 — 후보 단계) | Klook eSIM 목적지 생성(①부터) |
| EN/JA/ZH/KO 공통 | 교통 | **Klook** | KKday(후보) | Klook: 검색 딥링크 규격 확보+구세대에 공항이동 상품 실적 구조 존재(신규 AID 재생성 전제). KKday: country 페이지 규칙 구성만 — 실기기 착지 확인 전 **대안 숨김** | Klook=규격 확정·착지 실기기 대기 / KKday=후보 | Klook 실기기 ① · aff_adid 범용성 · KKday ① 후 대안 승격 |
| EN/JA/ZH/KO 공통 | 액티비티·패스·티켓 | **Klook** | KKday(후보) | 위와 동일 — 둘 다 한국 상품 판매는 사실이나, **판매 여부 ≠ 커미션 귀속**이므로 귀속은 ④⑤ 로만 확정 | 위와 동일 | 위와 동일 |

- 도시 차원 주석: 매핑은 언어×목적 축이고, **표면 노출은 그 도시의 검증 링크가
  있을 때만**(예: 숙박 — 부산=Agoda 가능, 경주·전주=Trip.com 가능, 서울·제주=
  두 파트너 모두 도시 ID 확보 전 숨김). 검증된 선택지가 하나면 하나만 노출.
- 커미션 비율은 일정 생성·장소 선정·순위에 영향 0 (기존 policy 계약).

## 4. 화면·활성화 범위 [제안]

기존 구조 대조: 노출 후보 표면은 이미 코드에 있고 전부
`TRIP_FLOW_COMMERCE_ENABLED=false` 게이트 뒤에 있다(§2 SSOT). Home 광고 배너·
파트너 로고 나열·새 예약 엔진은 만들지 않는다.

| 표면 | 제안 | 5도시 공통/개별 |
|---|---|---|
| **City Hub Travel Essentials** | 교통·eSIM 성격의 essentials 상세 하단에 보조 1줄(공식 정보가 주인공, 파트너는 "예약 선택지" 표기) | 링크 규격은 공통, 카드-상품 대응은 도시별 검증 |
| **My Trip** | Day 화면 하단 조용한 1줄 "부산 상품 더 보기 →"(도시 검색 딥링크 — 목적을 정직하게 표기) | 공통(도시명 치환) |
| **Place Detail** | **초기 비활성.** "해당 장소와 직접 일치하는 상품만" 규칙인데 현재 장소↔상품 매칭 데이터가 0 이다. 일반 홈/검색 링크를 장소 예약 버튼처럼 달지 않는다. 예외 후보: 김해공항 이동(전용 상품 실존) — 신규 AID 재생성+장소 일치 확인 후 개별 승인 | 개별(상품 단위) |

**부산 우선 활성화 [제안+이유]**: 확정사항이 아니므로 이유를 제시한다 —
①Owner 실링크가 부산 검색으로 생성돼 첫 E2E 의 추적 검증 대상과 일치
②QA 자산·카탈로그 커버리지 최다 ③코스 linkage 오연결(Data Track 인계 23건)의
영향을 받는 표면(코스 상세)을 이번 범위에서 제외하면 부산 Hub/My Trip 은
오연결과 무관. 승인 시 부산 → 검증 후 4도시 확장.

## 5. E2E 검증 계획 [제안]

- 모바일 390 + 데스크톱, **4개 언어 각각**: 노출 문구·파트너 착지 locale·
  파라미터 보존(aid/aff_adid/k_site·cid/ud1/ud2 가 최종 요청까지 유지되는지
  네트워크 레벨로 확인 — **리다이렉트 후 주소창에서 ID 가 안 보인다는 이유만으로
  추적 실패를 단정하지 않는다**, 쿠키/서버측 귀속 가능).
- 실패 처리: 파트너 링크 불능 시 카드 자체 비노출(깨진 버튼 0), 게이트 OFF 시
  화면 흔적 0.
- 고지 2중 확인: `rel="sponsored"`(기계 고지)와 **사용자 눈에 보이는 제휴 표기**
  (기존 AffiliateLink kind 계약)를 각각 검증.
- (v2) **검증 5단계 분리 관리** — 서로 완료를 대신하지 않는다:
  ① 착지 확인(파트너 페이지 정상 도달·언어) ② 제휴 파라미터 처리(최종 요청까지
  보존/쿠키 귀속) ③ 자체 `affiliate_click` 기록 ④ 파트너 대시보드 실적 반영
  (24h+ 지연 가능) ⑤ 실제 구매 귀속. 현재 상태: Agoda ①(4언어)·Trip.com ①
  (3언어) 완료, Klook·KKday ① 은 봇 차단으로 **실기기 확인 대기**(배포 후
  휴대폰 실클릭으로 수행 — 링크 불량 단정 금지), ②~⑤ 전 파트너 미시작.
- 완료 기준: 부산 승인 표면에서 4locale 실클릭 → 파트너 착지+파라미터 보존
  100% · 고지 2종 확인 · affiliate_click 기록 확인 · 파트너 대시보드 반영은
  "확인됨/대기" 상태로 보고(구매 귀속은 실구매 전 미검증으로 명시).

## 6. 구현 순서와 롤백 [제안 — 승인 후 실행]

1. registry 정리: 구세대(41763·sl/*) 비활성 → 4사 링크 빌더(구조화 조립,
   하드코딩 금지): Klook `aid+aff_adid+k_site` · KKday `cid+ud1/ud2(영숫자)` ·
   Agoda `cid+hl+city` · Trip.com `Allianceid+SID+trip_sub1/3`(도시 ID 는
   확보분만 — 부산/경주/전주)
2. policy 갱신: §3 매핑(검증된 칸만) — KKday 대안은 실기기 ① 확인 후 승격,
   숙박은 도시별 검증 링크 있는 곳만 노출
3. 승인 표면(부산 Hub Essentials·My Trip 1줄)만 배선, Place Detail 은 보류
4. 테스트: 링크 조립 파서·게이트·고지·매핑 가드
5. 게이트 ON(승인 표면 한정) → 배포 → §5 E2E → 완료보고
- **롤백**: `TRIP_FLOW_COMMERCE_ENABLED=false` 원복 1줄 + 재배포(표면 흔적 0
  가 이미 계약). 데이터/DB 변경이 없으므로 롤백 리스크 없음.

## 7. Owner 승인 필요 결정 (v2 갱신 — 한 번에)

(v1 의 ②"KKday 생성 가능 여부 질의"·③"미자료 파트너 처리"는 해소:
CID 부착 방식은 전용 화면에 안내됨[Owner 확인], Airalo 제외·Booking 보류 확정.)

1. **Klook aff_adid 범용성**: 1427383 재사용 vs 목적지별 재생성 — 대시보드에서
   타 목적지 1건 생성해 aff_adid 변동 여부만 확인해 주시면 확정.
   (다른 예시와 값이 같더라도 재사용 허용으로 확정하지 않는다.)
2. **도시 ID 추가 확보**(Owner 대시보드/공식 자료 — 추측 금지):
   Agoda 서울·제주·경주·전주 city ID · Trip.com 부산·서울·제주 목록 ID ·
   Trip.com ZH 도메인 규격. (없이도 부산 Agoda + 경주·전주 Trip.com 으로
   숙박 첫 E2E 는 가능 — 대기 파트너/도시 때문에 확인분을 막지 않는다.)
3. **KKday ud2 태그 체계**: 영숫자 규칙 `busanactivity` 식(`<city><purpose>`)
   승인.
4. **활성 범위 승인**: 표면 2종(§4) + 도시 로드맵 — 부산 첫 검증(§4 이유) 후
   경주·전주(Trip.com 숙박)로 확장, 서울·제주는 ID 확보 후. (최종 범위를
   부산으로 축소하는 결정이 아님.)
5. **구세대 링크 폐기**: 41763·단축링크(sl/*) 전면 교체/비활성 승인.
6. Booking.com 은 이메일 인증 완료 시점에 별도 편입 결정(이번 범위 아님).

## 8. OWNER ATTENTION

- **코스 오연결 영향**: 공식 추천코스 linkage 오연결 23건(Data Track 인계,
  `tmp/course-linkage-reverify-v1/findings.md`)이 수정되기 전에는 **코스 상세
  표면에 제휴를 배치하지 않기를 권고**(잘못된 장소에 예약 링크가 붙는 조합
  방지). 영향 코스의 임시 비노출/배지 등 제한은 Data Track 수정 일정에 따라
  Owner 가 결정 — 이번 작업에서 임의 수정하지 않았다.
- 이 문서 자체도 커밋하지 않았다(작업 계약) — 채택 시 커밋 지시 필요.

---

## 9. (v3 — 2026-09-13, COMPLETION-V2) 확장 결과·확인표·커버리지

### 9.1 활성 매트릭스 v2 (stay)
| 도시 | 추천 | 대안 | locale | 근거 |
|---|---|---|---|---|
| 부산 | Agoda(17172) | Trip.com(253) | en/ja/ko (+zh 는 Agoda 만) | Owner 원본+공식 실측, 착지 검증 |
| 서울 | Trip.com(274) | — | en/ja/ko | 공식 페이지 실측 목록 ID, 착지 200·Alliance 잔존 |
| 제주 | Trip.com(737) | — | en/ja/ko | 동일 |
| 경주 | Trip.com(3675) | — | en/ja/ko | Owner 원본 |
| 전주 | Trip.com(61380) | — | en/ja/ko | Owner 원본 |

zh(간체): hk.trip.com 은 번체(zh-HK 실측)라 간체 UI 와 불일치 → Trip zh 미지원.
따라서 zh 숙박은 Agoda 확보 도시(부산)만. 서울/제주/경주/전주 zh = OFF(사유 위).
Agoda 신규 도시 ID 는 자동화가 전면 봇차단이라 확보 불가 — Owner 확인표 §9.2.

### 9.2 Owner 확인표 (한 번에 — 실기기 브라우저에서 각 링크 클릭 확인)
| # | 파트너 | 적용 도시·언어 | 목적 | 버튼 문구(예) | 클릭할 실제 링크 | 정상일 때 보여야 할 것 | 확인 요청 |
|---|---|---|---|---|---|---|---|
| 1 | Klook | 전국(우선 en/ko) | eSIM·유심·WiFi | "Korea eSIM & SIM — Klook" | https://affiliate.klook.com/redirect?aid=123610&aff_adid=1427383&k_site=https%3A%2F%2Fwww.klook.com%2Fko%2Fwifi-sim-card%2F%3Fcountry_id%3D13 | Klook 한국 유심/eSIM 카테고리 페이지 | 정상 착지 여부 + 상단에 로그인 계정 기준 제휴 인식(가능하면 대시보드 클릭 1 반영) |
| 2 | Klook | 전국(en) | 기차(도시 간) | "Korea Rail Pass — Klook" | https://affiliate.klook.com/redirect?aid=123610&aff_adid=1427383&k_site=https%3A%2F%2Fwww.klook.com%2Fkorea-rail%2F | Klook 한국 기차 페이지 | 동일 |
| 3 | Klook | 전국(en) | 고속버스 | "Intercity Bus — Klook" | https://affiliate.klook.com/redirect?aid=123610&aff_adid=1427383&k_site=https%3A%2F%2Fwww.klook.com%2Fen-US%2Fkorea-bus%2F | Klook 한국 버스 페이지 | 동일 |
| 4 | Klook | 도시별(우선 부산 ko) | 액티비티·패스·티켓 | "부산 액티비티 더 보기 — Klook" | (Owner 원본 부산 검색 링크 §1 그대로) | 부산 검색 결과 | **aff_adid 1427383 이 목적지 달라도 유효한지**가 핵심 — 대시보드에서 다른 목적지 1건 생성해 값 변동 여부 확인 |
| 5 | KKday | 전국(en) | 액티비티(한국) | "Korea activities — KKday" | https://www.kkday.com/en/country/south-korea?cid=26267&ud1=gokoreamate&ud2=koreaactivity | KKday 한국 국가 페이지 | 정상 착지 여부(봇차단이 실기기에도 뜨는지) |
| 6 | Agoda | 서울/제주/경주/전주 | 숙박 | (기존 문구) | Owner 대시보드에서 partnersearch 링크 4건 생성(도시만 변경) | 해당 도시 호텔 검색 | **도시 ID 4개 확보**(자동화 전면 차단으로 저희가 얻을 수 없음) |

적용 범위: #1~3 확인 시 해당 목적을 전국 공통 링크로 5도시 표면에서 재사용
(도시별 전수 수집 없음). #4 확인 시 Klook 도시 검색을 activity 로 활성.
#5 확인 시 KKday 를 activity 대안으로 승격. #6 수신 시 Agoda 를 해당 도시
추천으로 승격(Trip.com 은 대안으로 이동). 미확인 항목은 계속 OFF.

### 9.3 기존 QA 근거 대조 (도시×언어, 표면 무관 — URL 은 표면 간 동일)
| 조합 | 직접 외부 착지 | 공통 테스트 커버 |
|---|---|---|
| busan en/ja/zh | Preview+LIVE 직접 | — |
| busan ko | raw fetch(§1.5) + **v2 LIVE 직접(이번)** | 빌더 테스트 |
| gyeongju ko / jeonju en | Preview+LIVE 직접 | — |
| gyeongju en·ja / jeonju ko | (동일 도메인·규격) | 빌더+매트릭스 테스트 |
| jeonju ja | **v2 LIVE 직접(이번)** | — |
| seoul en·ko / jeju ja | **v2 Preview 직접 + LIVE(이번)** | — |
| seoul ja / jeju en·ko | 동일 도메인 규격 | 빌더+매트릭스 테스트 |
| busan 대안 Trip(en) | **v2 Preview 직접** | 매트릭스 테스트 |
표면 2종(hub/my-trip)은 같은 offersFor 출력을 렌더 — my-trip 은 row/href 검증
(외부 중복 클릭 생략, §5 계약).

### 9.4 정정 2건
- **trip_sub1 실값**: 직전 보고의 "gkm_hotel_경주/전주" 는 설명용 한글 표기였다.
  실제 전송값은 영문 slug — `gkm_hotel_gyeongju` · `gkm_hotel_jeonju` (신규
  도시도 `gkm_hotel_busan` / `gkm_hotel_seoul` / `gkm_hotel_jeju`).
  코드·테스트로 고정, 착지 URL 에서 실측.
- **코스 오연결 영향 표현**: "코스 상세 제휴 OFF 로 출시 영향 해결" 은 부정확.
  OFF 는 코스 화면 내 제휴 노출만 격리한다. **코스→My Trip 채택 시 오연결
  장소(23건 계열)가 사용자의 일정에 들어가는 영향은 별개로 미해결**이다
  (Data Track 데이터 수정 대기 — regional JSON 무변경 확인 2026-09-13).
  영향 코스의 임시 채택 제한/노출 배지 여부는 Owner 판단사항으로 남긴다.
