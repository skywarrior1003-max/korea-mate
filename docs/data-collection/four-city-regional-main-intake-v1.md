# TASK-MAIN-FOUR-CITY-REGIONAL-DATA-INTAKE-AND-RUNTIME-MAPPING-V1 — 대조·수령 기록

- 날짜: 2026-09-14 · feature branch: `feature/four-city-regional-data-intake-runtime-v1` (base = origin/master `5f3b083`)
- 공급본: `data/four-city-regional-final-package-v1` @ **0c3a45e** (ls-remote 실측 일치 — SHA HOLD 없음)
- 이 문서의 모든 DB 조회는 READ-ONLY(anon + 브리지 확인용 service SELECT)다. **Production DB write 0.**

## 1. 공급본 baseline 실측 (파일 재계산)

| 항목 | 기대(§5) | 실측 | 판정 |
|---|---|---|---|
| Courses | 18 (4/4/5/5) | 18 (busan4/gyeongju4/jeju5/jeonju5) | 일치 |
| Occurrences | 107 = 71+36 | 107 = 71+36 (도시별 21+22/24+7/9+6/17+1) | 일치 |
| Unique service | 53 (13/15/9/16) | 53, dup canonical 0 | 일치 |
| KO desc / NAV | 53 / 53 | 53 / 53 | 일치 |
| Official image | 53 | **52 CONFIRMED + 1**(만장굴 `IMAGE_SOURCE_CONFIRMED_HOTLINK_BLOCKED`) | 일치(§10 제주 조항의 특례 상태 — dead 아님) |
| EN/JA/ZH COMPLETE | 50/34/34 | 50 / 34(33 DAP+1 native, TITLE_ONLY 1 별도) / 34(32+2) | 일치 |
| Actions | 20/16/17 | 20/16/17 (stops·actions 파일 상호 일치) | 일치 |
| Context | 36→35 = 21+14, 장림포구 DEDUPED, 을숙도 OUTSIDE | 문서·건수 일치 | 일치 |
| 참조 무결성 | — | images/nav/actions ↔ stops 누락 0 | 일치 |

전주천(OFF-9774) 다국어 = NOT_APPLICABLE(패키지 명시) — service stop 유지, context 전환 없음(§10 준수).

## 2. 범위 정합 — 기존 72 vs 패키지 71

Main `regional-trips-v1.json` 4도시 stop 총합 = **107** = 패키지 total occurrences.
그중 spotId 연결 71(부산21·경주24·제주9·전주17) = 패키지 service occurrences **71**,
미연결 36 = 패키지 context occurrences **36**. 기존 재검증의 "72"는 **서울 연결 1건 포함**(71+1).
→ 두 집계는 같은 우주이며 서울 1건만 이번 패키지 범위 밖.

## 3. 핵심 실측 (Main 현행)

- **identity 브리지**: `city_spot_sources.source_key` 가 경주 패키지 canonical 16종을 **전부 정확 매핑**
  (GJ01-0033 월정교=454 · GJ01-0014 대릉원=436 · GJ01-0056 오릉=475 · GJ01-0054 삼릉=473 · GJ01-0127 석굴암=530 등).
  부산 13종은 `city_spots.external_id(busan:busan-A-*)` 로 **현재 연결 행과 동일 행**에 매핑(아래 HOLD).
  전주 7종은 external_id 매핑 존재하나 일부(OFF-9766→1096 등) 의심, 제주는 만장굴 1종만.
- **부산 JA/ZH**: 연결 13행 전부 name_l10n·desc_l10n 에 en/ja/ko/zh 실재 + **LIVE 렌더 실측**
  (`/city/busan/trips/busan-C-001` ja: 梵魚寺聖宝博物館…/海雲台… 표시) → 런타임 gap 부재.
- **경주 EN**: 연결 행 전부 name_l10n ko 만 — EN locale 에서 코스 stop 이 전부 한국어(LIVE 실측) → 진짜 gap.
- **전주 이미지 4건**(917/1098/1125/1126): 패키지가 지정한 tour.jeonju.go.kr **동일 URL 이 이미 반영**되어 있음.
- **만장굴 2646**: visitjeju CDN 이미지·desc_l10n.ko 이미 보유.
- **NAV**: 패키지 좌표는 부산=현재 행 좌표의 복제, 전주=계통적 오좌표(조경단이 완산동 좌표 등 0.4~3.6km 오차),
  제주=지점 부정확(만장굴 3.68km) → **Main 좌표가 전반적으로 더 정확 — intake 0**.

## 4. 필드별 비교표 (요약)

| PACKAGE FIELD | MAIN TARGET | CURRENT(출처) | PACKAGE(출처) | ACTION | SAFETY |
|---|---|---|---|---|---|
| gyeongju en_title ×14 | city_spots.name_l10n.en (425,432,436,439,444,454,457,462,468,473,475,481,530,665) | 없음(ko만) | visitkorea/VG 계보 verbatim | **DATA_INTAKE(SQL 준비, 미적용)** | 키 부재 시에만 추가·no-overwrite |
| gyeongju ja/zh (432·530) | name_l10n.ja/zh + desc_l10n.ja/zh | 없음 | 박물관 공식(jpn/chn)·UNESCO 공식 | **DATA_INTAKE(SQL 준비, 미적용)** | 동일 |
| gyeongju en description | desc_l10n.en | 없음 | **패키지 en 행에 중국어 혼입 확인** | 패키지분 미수령. **432·530 만 공식 원문 직접 확인으로 확보**(museum /eng/·UNESCO en — §10.3), 나머지 12행 TITLE_ONLY | 오염 데이터 미수령·공식 verbatim 만 |
| gyeongju desc_ko / image / NAV | description·image_url·lat/lng | Final·공식이미지 889 반영 완료 | gyeongju.go.kr 재수집본 | CURRENT_MAIN_NEWER_OR_MORE_SPECIFIC | 역덮어쓰기 금지 준수 |
| busan JA/ZH 13 | (런타임) | l10n 실재+렌더 정상(LIVE) | RUNTIME_MAPPING_REPAIR 주장 | **ALREADY_FIXED**(stale 분류) | 변경 0 |
| jeonju image 4 | image_url | 동일 URL 기반영 | 복구 이미지 | **ALREADY_FIXED** | 변경 0 |
| jeonju ja/zh 3 (749/744/736) | name/desc_l10n | 없음 | **패키지에 텍스트 없음(빈 placeholder)** | HOLD → TARGETED_SECONDARY_REQUEST | 발명 0 |
| jeju 만장굴 | image/desc | 기반영(visitjeju CDN) | hotlink-blocked 후보 | CURRENT_MAIN | 변경 0 |
| courses/context/nav 파일 | regional-trips 구조 | 동일 구조 기존재 | 재산출본 | NO_ACTION | — |
| (패키지 밖) 경주 linkage | regional-trips-v1.json spotId | 스왑/밀림 7 + 오연결 1 | canonical×브리지 = 정답 확정 | **REPAIRED(이번 커밋)** | 정확 ID 근거·이름 매칭 0 |

## 5. 공급본 20/16/17 vs Main 실제 처리

| 공급본 분류 | 건수 | Main 실제 | 이유 |
|---|---|---|---|
| DATA_INTAKE | 20 | SQL 준비 16필드/14행(경주) · ALREADY_FIXED 4(전주 이미지) · CURRENT_MAIN 1(만장굴) — 경주의 desc/image/NAV 축은 CURRENT_MAIN | Main 이 이미 최신(전주 final closeout·경주 이미지 apply)·경주 EN/JA/ZH 만 실제 공백 |
| RUNTIME_MAPPING_REPAIR | 16 | ALREADY_FIXED 13(부산, LIVE 실측) · HOLD 3(전주 — 패키지 텍스트 부재) | 코스 화면은 이미 `displayPlaceName(spot.nameL10n)` 사용, 부산 l10n DB 실재 |
| NO_ACTION | 17 | NO_ACTION 17 | 일치 |
| (분류 밖) | — | **경주 linkage 수리 8**(7 재연결+1 unlink) | 패키지 canonical + `city_spot_sources` 정확 브리지가 정답을 확정 |

## 6. 기존 오연결 23건 건별 분류 (V1 시점 기록 — 최종 판정은 §10.1·§11 이 우선한다)

**경주 10건**
| 항목 | 현재→ | 처리 | 근거 |
|---|---|---|---|
| C-001 #2 월정교→436 | →**454** | PACKAGE_RESOLVES(수정) | GJ01-0033→454 브리지 |
| C-001 #4 대릉원→454 | →**436** | PACKAGE_RESOLVES(수정) | GJ01-0014→436 |
| C-002 #2 대릉원→454 | →**436** | PACKAGE_RESOLVES(수정) | 〃 |
| C-002 #5 월정교→436 | →**454** | PACKAGE_RESOLVES(수정) | 〃 |
| C-003 #1 월정교→436 | →**454** | PACKAGE_RESOLVES(수정) | 〃 |
| C-003 #2 오릉→473 | →**475** | PACKAGE_RESOLVES(수정) | GJ01-0056→475 |
| C-003 #6 삼릉→530 | →**473** | PACKAGE_RESOLVES(수정) | GJ01-0054→473 |
| C-001 #6 월성발굴현장→475 | →**null** | OUTSIDE_PACKAGE(오표시 제거) | 패키지에 월성 canonical 없음·475=오릉 확정 → 이름만 표시. 정연결은 미해결 |
| C-003 #5 배동삼존불→665 | 유지 | **HOLD** | 패키지는 이 점유를 '배동 삼릉(665)'로 분류(=현행), findings 는 별개 실체(석불) — 삼존불 행 부재. 참고: 473(삼릉)·665(배동 삼릉)은 동일 실체 twin 의심(병합 금지, 보고만) |
| C-R01 #5 보문관광단지→511 | 유지 | PACKAGE_RESOLVES(의심 해소) | GJ01-0099→511 브리지 일치(대표행 관례 확정) |

**부산 12건 — (V1 시점 HOLD → V2 에서 identity 실측으로 11건 재연결·1건 유지 확정, §10.1)**
범어사(1073)·오륙도(961)·영도대교(950)·감천(1081)·다대포(1054)·송도(963)·부평깡통(954)·광안리(1061×3)·다대포 C-003(1054)·영도대교 C-002(950).
패키지 부산 canonical(busan-A-*)은 `external_id` 로 **현재 연결 행과 동일 행**을 가리키고 다국어·좌표도 그 행의 복제다.
즉 패키지는 "현행이 맞다"고 재주장하고, findings 는 구세대 curated 행(26 Beomeosa Temple·28 Skywalk·990 영도대교·2 감천마을·19 다대포)이 실체라 한다.
→ 두 카탈로그 계보(visitbusan article 행 vs 구세대 curated 행)의 identity 재판정 사안 — Final authoritative 규칙상 임의 재연결 금지, 변경 0.

**제주 1건** — C-002 #1 영실탐방안내소→1871(영실탐방로): OUTSIDE_PACKAGE(패키지 근거 없음), 대표행 관례로 위험 낮음 — 유지.

**신규 발견(23건 밖, 보고만)**: jeonju-C-002 #3 오목대·이목대→**764("Jeonjucheon Stream")** — 오연결 의심(778 '오목대와 이목대' 실존). 패키지 OFF-11234(오목대) 브리지 부재 → 근거 없이 수정하지 않음. 또한 764/1126 전주천 twin 의심.

## 7. Production 적용 계획 (Owner 별도 승인 후)

1. `data/main-intake/four-city-regional-v1/gyeongju-regional-l10n-precheck-v1.sql` 실행(READ-ONLY) — 브리지 16/16·en_has 0 확인, before 스냅숏 보존.
2. `gyeongju-regional-l10n-apply-v1.sql` 정확 1회(sha256 `dd4a5f6ce01e98c4febb7cb9996dc308586b849607bb5af849b4f5f73bc440be` — v2 재생성: 432/530 EN 본문 추가로 sha 변경, 구 `b7dd38cd…` 는 SUPERSEDED — DO NOT APPLY).
   키 부재 시에만 추가·no-overwrite·트랜잭션 내 검증 게이트(en 14·ja 2·zh 2·en_desc 2 아니면 전체 롤백)·재실행 시 0행.
3. `…readback-v1.sql` — en 14/14·ja/zh 2/2·desc en 2/2·타행 무영향.
4. **복구**: master jsonl 의 값과 일치할 때만 `name_l10n - 'en'` 류 키 제거(값 조건 포함) — before 스냅숏이 1차 복구 자료.
5. 이후 SSG rebuild 1회(코스 화면은 라이브 fetch 라 rebuild 없이도 반영되지만 /place 텍스트 표면 일관성용).
6. linkage 수정(JSON)은 master 반영·배포로만 전파 — DB 무관. 기존 사용자 저장 여행(snapshot)은 **수정하지 않음**:
   과거 채택분에는 잘못된 장소가 남는다(잔여 영향, §8 보고) — 신규 렌더·신규 채택만 바로잡힌다.

## 8. TARGETED_SECONDARY_REQUEST (보조컴퓨터) — **V3 에서 전주 3건 자체 해소되어 아래 표는 폐기(SUPERSEDED)**. 잔여 전달물은 정정 delta 2파일(§10.3)이며 회신 선행 조건 아님.

| city | canonical_id | source_key | field | Main 값 | package 값 | ambiguity | 필요한 evidence |
|---|---|---|---|---|---|---|---|
| jeonju | OFF-16109 | jeonju:OFF-16109 (=749) | zh title/desc | 없음 | 상태만 RUNTIME_ONLY_GAP, 텍스트 빈값 | 데이터 소재 불명 | 공식 원천 zh 원문 + source_url |
| jeonju | OFF-16086 | jeonju:OFF-16086 (=744) | ja+zh title/desc | 없음 | 〃 | 〃 | 〃 |
| jeonju | OFF-13964 | jeonju:OFF-13964 (=736) | ja+zh title/desc | 없음 | 〃 | 〃 | 〃 |

## 9. 패키지 결함 보고 (재등록 아님 — 신규 관찰)

1. **EN 행 description 중국어 혼입**(GJ01-0009·GJ01-0127) — language_qa `wrong_language_text_count: 0` 주장과 모순. EN 제목만 수령.
2. **NAV 좌표 품질**: 전주 계통적 오좌표(조경단=완산동 좌표 등)·제주 지점 오차(만장굴 — §10.1 C-JJ2 로 '기준점 차이'로 정밀화)·부산=현행 행 복제. `nav_status: CONFIRMED` 를 Main 좌표 대체 근거로 쓸 수 없음.
3. **분류 stale**: 부산 13 RUNTIME_MAPPING_REPAIR(실제 렌더 정상)·전주 4 이미지 DATA_INTAKE(기반영).
4. 패키지 handoff 의 "UI 코드 수정 금지"는 데이터 트랙 자기 제약 — 본 Main task 지시와 충돌하나 이번 구현은 UI 코드 무변경이라 실충돌 없음.

## 10. V2 — 충돌 통합표와 확정 처리 (SECONDARY-DATA-CONFLICT-RESOLUTION-V2, 2026-09-14)

원칙: source_key 브리지 일치만으로 동일성을 확정하지 않고, 공식 주소·좌표·시설 범위·행 정체성을
함께 실측했다. 코스 stop 은 **관광지 본체 행**에 연결한다(내부 시설·인접 별개 시설 행 금지).
`linkage: "IDENTITY_REPAIR_V2"` 가 이번 수리 표식이다. city_spots 행 자체는 수정·병합·삭제 0.

### 10.1 통합 충돌표 (conflict_id 순)

| id | 도시 | 코스·stop | canonical/키 | Main행(전) | 판정 | 처리 | 근거 요지 |
|---|---|---|---|---|---|---|---|
| C-B01 | busan | C-001#1 범어사 | busan-A-00202→1073 | 1073 성보박물관 | 내부 시설 오연결 | **→26**(사찰 본체, 범어사로 250, full l10n) | 주소·좌표·행 정체성 |
| C-B02 | busan | C-001#7·C-002#11 오륙도스카이워크 | busan-A-00022→961 | 961 오륙도 섬 | 인접 별개 | **→28**(Oryukdo Skywalk, 동일 주소 137 오륙도로, 스카이워크 좌표) | 〃. 28 은 이미지 없음(delta 요청) |
| C-B03 | busan | C-001#9·C-002#1 영도대교 | busan-A-00191→950 | 950 해돋이전망대(2.2km) | 별개 장소 | **→990**(Yeongdodaegyo Bridge, busan-A-00066, 교량 좌표) | 패키지 canonical(A-00191) 자체가 오배정 — A-00066 이 교량 |
| C-B04 | busan | C-001#11 감천문화마을 | busan-A-00212→1081 | 1081 어린왕자 포토존 | 내부 시설 | **→2**(마을 본체) | 〃 |
| C-B05 | busan | C-001#13·C-003#11 다대포해수욕장(·고우니생태길) | busan-A-00177→1054 | 1054 바다누리길 | 인접 시설 | **→19**(Dadaepo Beach Park) | 복합명은 앞부분(해수욕장 본체) 기준. 고우니생태길 행 부재 |
| C-B06 | busan | C-002#6 부평깡통시장 | busan-A-00204→954 | 954 남포·광복 지하상가 | 명백 별개 시장 | **→1319**(부평깡통시장, 부평1길 48, published) | 정확 명칭 행 실존. 1319 는 ko-only·이미지 없음(delta 요청) |
| C-B07 | busan | C-002#13·C-003#8·C-R01#4 광안리해수욕장 계열 | busan-A-00185→1061 | 1061 Podium Dive M 공연장 | 별개 시설 | **→16**(광안해변로 219, 해변·야경 본체 행) | 4(정확명 행)는 unpublished 라 사용 불가 — 발견 게이트 준수 |
| C-B08 | busan | C-001#12 송도해수욕장·케이블카 | busan-A-00027→963 | 963 송도해수욕장 기사 | 본체 정합 | **유지(의심 해소)** | 기사 주제=송도해수욕장(송도해변로 100) |
| C-G01 | gyeongju | C-003#5 배동석조여래삼존입상 | (패키지: KTO12→665) | 665 배동 삼릉 | 별개 문화재 | **→672**(경주 배동 석조여래삼존입상, published) | V1 HOLD 해소 — 정확 명칭 행을 이번 탐색으로 확인. 판정 변경 사유 기록 |
| C-G02 | gyeongju | C-001#6 월성 발굴현장 | (패키지 canonical 없음) | V1 에서 null | 본체 행 실존 | **→427**(경주 월성, published) | V1 unlink 는 후보 탐색 전 임시 조치 — 월성 사적 본체 행으로 재연결(발굴현장은 월성 내 지점) |
| C-G03 | gyeongju | 473 vs 665 | GJ01-0054 vs KTO12-128634 | 두 행 모두 실존 | 동일 실체 twin 의심 | 보고만(병합 금지) | 삼릉=배동 삼릉. 코스는 브리지대로 473 사용 |
| C-J01 | jeonju | C-002#3 오목대·이목대 | (오목대 OFF-11234 브리지 없음) | 764 "Jeonjucheon Stream" | 오연결 + 764 행 자체 오염 의심 | **→778**(오목대와 이목대, KTO-126621) | 764 는 이름(전주천)과 주소·좌표(오목대, 기린대로 55)가 불일치 — 1126 전주천과 twin 의심, 행 정정은 데이터 트랙 요청 |
| C-JJ1 | jeju | C-002#1 영실탐방안내소 | (브리지 없음) | 1871 영실탐방로 | 본체(탐방로)-시설(안내소) | **유지** | 안내소는 탐방로 시작 시설 — 탐방로 행이 최선의 published 대표 |
| C-JJ2 | jeju | 만장굴 좌표 | jeju-CONT_…500182 = 2646 | Main (33.5548,126.7969)/월정리 산41-5 | **동일 장소·기준점 차이** | Main 유지(좌표 변경 없음) | 패키지(33.5283,126.7719)=공식 입구 주소 '만장굴길 182', Main=지적 소재지 방향. 어느 쪽도 '오답' 아님 — NAV 기준점(입구) 채택 여부는 제품 판단(권고: 입구) + 2차 요청으로 공식 입구 좌표 확정 |
| C-JN1 | jeonju | 패키지 NAV 좌표 전반 | OFF-* | Main 좌표 | 패키지 계통 오좌표 | Main 유지 | 조경단이 완산동 좌표 등 — 2차 요청으로 NAV artifact 정정 delta 요구 |
| C-L01 | gyeongju | EN 14행 | GJ01-* | l10n en 없음 | **EN = TITLE_ONLY** | SQL 패치(제목만) — description 미수령 | 패키지 en 행 desc 는 중국어 혼입(GJ01-0009·0127 실측) — "영문 완성" 아님을 명시 |
| C-L02 | jeonju | 749 zh · 744/736 ja+zh | OFF-16109/16086/13964 | l10n 없음 | 패키지 텍스트 부재 → **V3 해소** | visitjeonju 공식 /jpn·/cnh 편집 원문 직접 확보 — jeonju l10n 패치 준비(§10.3) | 상류 수집본 실측: ja/zh = NOT_COLLECTED(RUNTIME_ONLY_GAP 은 오분류). 중국어판 실경로는 /cnh(사이트 자체 /chn 링크 오류) |

### 10.2 실제 채택 흐름 QA (V2)

- 환경: `wrangler pages dev out`(korea-mate cwd, functions+.dev.vars — Compiled Worker 확인) = **실 API·실 저장 경로**.
  저장은 운영 Supabase 의 사용자 데이터 테이블(itineraries)에 QA 전용 신규 device UUID 로만 이뤄지며 종료 시 전량 DELETE.
- UI 클릭 채택(코스 상세→날짜→생성) 3코스: **gyeongju-C-001(수리+월성 427)** · **busan-C-001(수리 다수+미연결 5)** · **jeonju-C-001(무변경 대조)**.
  실측: POST 201 → GET 저장본 — place 수 7/15/5 정확, **순서 보존**, 연결 stop = 수정된 ID(26/28/990/2/19/963·454/436/427 등) 정확,
  미연결 stop(동래읍성 등) = 코스 이름 그대로·place_id 없음(조용한 누락 0). 제휴 회귀 0. QA 트립 3건+디버그 2건+중단분 1건 **전량 삭제·부재 확인**.
- 재열람 렌더: dev 환경에서는 Naver 지도 도메인 인증(127.0.0.1 미등록 → oapi.map.naver.com 401)으로 페이지가 에러 바운더리에 걸림 — **환경 제약이며 회귀 아님**.
  보완으로 **LIVE 에서 동일 계약 payload(수리 ID 포함)를 실 API 로 생성해 재열람 렌더 PASS**(제목·Day1·장소 정상, 에러 0) 후 삭제.
  렌더 코드는 이번 변경에 미포함이므로 이 조합으로 채택 흐름 검증을 완료로 판정한다. dev 의 `/place/*__next._tree.txt` 404 는 프로덕션에도 있는 무해한 prefetch(빌드 프루닝) — 기존 baseline.

### 10.3 SQL 패치 상태 (V3 갱신)

**경주 l10n 패치 v3** — apply sha256 `196fe6fcae1374ec4b25a3c384854dfe426b2fab0c117ce27a437b56c0c108f1` (**미적용**):
name_l10n en 14 + **desc_l10n en 14**(상류 수집 원본 `gyeongju-15-en-multilingual-v1.jsonl` — KTO EngService2/visitkorea, CONFIRMED 14행·verbatim, 엔티티 디코딩만; exact-copy 를 패키지 폴더에 보존) + 432/530 ja/zh.
**근본 원인 확정**: 상류에 정상 EN 본문이 14/15행 존재 — 최종 패키지 조립 단계에서 EN description 누락·오결합(0009/0127 은 zh 혼입)된 조립 결함. TITLE_ONLY 마감 아님 — EN 제목·본문 모두 반영.
구 sha `b7dd38cd…`(v1)·`dd4a5f6c…`(v2, 박물관/UNESCO EN 본문 2행) 는 SUPERSEDED — DO NOT APPLY(박물관/UNESCO EN 원문은 유효한 대안으로 이 문서에 기록 유지). GJ01-0099(511) EN 은 원천 부재(SNA) — 대상 밖.

**전주 l10n 패치 v1** — apply sha256 `783df233acfbf2166c60dae778e8acce2a0371b5b3a30755a427087d9908dea9` (**미적용**):
749 zh(全州韩屋村)+desc · 744 ja(晴煙樓・南川橋)/zh(晴烟楼·南川桥)+desc · 736 ja/zh(完山花山)+desc — visitjeonju 공식 /jpn·/cnh 편집 원문(2026-09-14 직접 fetch, master jsonl 에 URL·라이선스 문구 기록). 키 부재 시에만 추가·idempotent·검증 게이트·복구 조건 포함.
**OWNER ATTENTION**: 해당 페이지 하단 공공저작물 문구에 비상업 이용 제한 표기 — 기존 visitjeonju 텍스트(ko/en, 이미 서비스 중)와 동일 원천·동일 정책(OWNER_APPROVED_…ATTRIBUTION_AND_TAKEDOWN) 범위인지 Owner 확인 항목.

**정정 delta artifact(공급본 원본 무변경·delta 만)**: `busan-canonical-correction-delta-v1.jsonl`(A-00191→A-00066 오배정 포함 7건 정정+1건 정합 확인) · `four-city-regional-nav-correction-delta-v1.jsonl`(전주 4건+계통 관찰·만장굴 기준점). 좌표 패치는 만들지 않음(Main 좌표 유지).

## 11. 최종 stop ↔ numeric ID 대응표 (V3 확정본, 4도시 연결 71 occurrence)

### busan

| 코스 | # | stop | spotId | linkage |
|---|---|---|---|---|
| busan-C-001 | 1 | 범어사 | 26 | IDENTITY_REPAIR_V2 |
| busan-C-001 | 4 | 해동용궁사 | 25 | EXACT_CANONICAL_LINK |
| busan-C-001 | 6 | 해운대해수욕장 | 1 | EXACT_CANONICAL_LINK |
| busan-C-001 | 7 | 오륙도스카이워크 | 28 | IDENTITY_REPAIR_V2 |
| busan-C-001 | 8 | 태종대 | 27 | EXACT_CANONICAL_LINK |
| busan-C-001 | 9 | 영도대교 | 990 | IDENTITY_REPAIR_V2 |
| busan-C-001 | 10 | 용두산공원 | 24 | EXACT_CANONICAL_LINK |
| busan-C-001 | 11 | 감천문화마을 | 2 | IDENTITY_REPAIR_V2 |
| busan-C-001 | 12 | 송도해수욕장·케이블카 | 963 | EXACT_CANONICAL_LINK |
| busan-C-001 | 13 | 다대포해수욕장 | 19 | IDENTITY_REPAIR_V2 |
| busan-C-002 | 1 | 영도대교 | 990 | IDENTITY_REPAIR_V2 |
| busan-C-002 | 2 | 흰여울문화마을 | 47 | EXACT_CANONICAL_LINK |
| busan-C-002 | 4 | 태종대 | 27 | EXACT_CANONICAL_LINK |
| busan-C-002 | 6 | 부평깡통시장 | 1319 | IDENTITY_REPAIR_V2 |
| busan-C-002 | 7 | 용두산공원 | 24 | EXACT_CANONICAL_LINK |
| busan-C-002 | 8 | 해운대해수욕장 | 1 | EXACT_CANONICAL_LINK |
| busan-C-002 | 11 | 오륙도스카이워크 | 28 | IDENTITY_REPAIR_V2 |
| busan-C-002 | 13 | 광안리해수욕장·광안대교 | 16 | IDENTITY_REPAIR_V2 |
| busan-C-003 | 8 | 광안리해수욕장·민락수변공원 | 16 | IDENTITY_REPAIR_V2 |
| busan-C-003 | 11 | 다대포해수욕장·고우니생태길 | 19 | IDENTITY_REPAIR_V2 |
| busan-C-R01 | 4 | 광안리해수욕장 (광안리 디셈버) | 16 | IDENTITY_REPAIR_V2 |

### gyeongju

| 코스 | # | stop | spotId | linkage |
|---|---|---|---|---|
| gyeongju-C-001 | 1 | 국립경주박물관 | 432 | EXACT_CANONICAL_LINK |
| gyeongju-C-001 | 2 | 월정교 | 454 | EXACT_CANONICAL_LINK |
| gyeongju-C-001 | 3 | 첨성대 | 457 | EXACT_CANONICAL_LINK |
| gyeongju-C-001 | 4 | 대릉원 | 436 | EXACT_CANONICAL_LINK |
| gyeongju-C-001 | 5 | 동궁과 월지 | 439 | EXACT_CANONICAL_LINK |
| gyeongju-C-001 | 6 | 월성 발굴현장 | 427 | IDENTITY_REPAIR_V2 |
| gyeongju-C-001 | 7 | 황리단길 | 462 | EXACT_CANONICAL_LINK |
| gyeongju-C-002 | 1 | 황리단길 루프탑 카페 | 462 | EXACT_CANONICAL_LINK |
| gyeongju-C-002 | 2 | 대릉원 | 436 | EXACT_CANONICAL_LINK |
| gyeongju-C-002 | 3 | 첨성대 | 457 | EXACT_CANONICAL_LINK |
| gyeongju-C-002 | 4 | 계림 | 425 | EXACT_CANONICAL_LINK |
| gyeongju-C-002 | 5 | 월정교 | 454 | EXACT_CANONICAL_LINK |
| gyeongju-C-002 | 6 | 동궁과 월지 | 439 | EXACT_CANONICAL_LINK |
| gyeongju-C-003 | 1 | 월정교 | 454 | EXACT_CANONICAL_LINK |
| gyeongju-C-003 | 2 | 오릉 | 475 | EXACT_CANONICAL_LINK |
| gyeongju-C-003 | 3 | 나정 | 468 | EXACT_CANONICAL_LINK |
| gyeongju-C-003 | 4 | 포석정지 | 481 | EXACT_CANONICAL_LINK |
| gyeongju-C-003 | 5 | 배동석조여래삼존입상 | 672 | IDENTITY_REPAIR_V2 |
| gyeongju-C-003 | 6 | 삼릉 | 473 | EXACT_CANONICAL_LINK |
| gyeongju-C-R01 | 3 | 첨성대 | 457 | EXACT_CANONICAL_LINK |
| gyeongju-C-R01 | 4 | 분황사 | 444 | EXACT_CANONICAL_LINK |
| gyeongju-C-R01 | 5 | 보문관광단지 | 511 | EXACT_CANONICAL_LINK |
| gyeongju-C-R01 | 9 | 국립경주박물관 | 432 | EXACT_CANONICAL_LINK |
| gyeongju-C-R01 | 10 | 동궁과 월지 | 439 | EXACT_CANONICAL_LINK |

### jeju

| 코스 | # | stop | spotId | linkage |
|---|---|---|---|---|
| jeju-C-001 | 1 | 외돌개 (출발점) | 1692 | EXACT_CANONICAL_LINK |
| jeju-C-002 | 1 | 영실탐방안내소 (출발점) | 1871 | EXACT_CANONICAL_LINK |
| jeju-C-003 | 1 | 성산일출봉 (UNESCO 세계자연유산) | 2733 | EXACT_CANONICAL_LINK |
| jeju-C-003 | 2 | 섭지코지 (옵션) | 2729 | EXACT_CANONICAL_LINK |
| jeju-C-003 | 3 | 만장굴 (UNESCO 거문오름 용암동굴계) | 2646 | EXACT_CANONICAL_LINK |
| jeju-C-003 | 4 | 비자림 (천연기념물 제374호) | 2690 | EXACT_CANONICAL_LINK |
| jeju-C-R01 | 1 | 사려니숲길 | 2699 | EXACT_CANONICAL_LINK |
| jeju-C-R01 | 2 | 용눈이오름 | 2792 | EXACT_CANONICAL_LINK |
| jeju-C-R02 | 1 | 우도봉 (등반) | 2085 | EXACT_CANONICAL_LINK |

### jeonju

| 코스 | # | stop | spotId | linkage |
|---|---|---|---|---|
| jeonju-C-001 | 1 | 경기전 | 729 | EXACT_CANONICAL_LINK |
| jeonju-C-001 | 2 | 전동성당 | 1089 | EXACT_CANONICAL_LINK |
| jeonju-C-001 | 3 | 풍남문 | 765 | EXACT_CANONICAL_LINK |
| jeonju-C-001 | 4 | 전주한옥마을 | 749 | EXACT_CANONICAL_LINK |
| jeonju-C-001 | 5 | 청연루·남천교 | 744 | EXACT_CANONICAL_LINK |
| jeonju-C-002 | 1 | 전주천 | 1126 | EXACT_CANONICAL_LINK |
| jeonju-C-002 | 2 | 한벽당 | 763 | EXACT_CANONICAL_LINK |
| jeonju-C-002 | 3 | 오목대·이목대 | 778 | IDENTITY_REPAIR_V2 |
| jeonju-C-002 | 4 | 조경단 | 917 | EXACT_CANONICAL_LINK |
| jeonju-C-003 | 1 | 남부시장·청년몰 | 742 | EXACT_CANONICAL_LINK |
| jeonju-C-003 | 3 | 전주전통술박물관 | 1109 | EXACT_CANONICAL_LINK |
| jeonju-C-003 | 4 | 전주한지박물관 | 1125 | EXACT_CANONICAL_LINK |
| jeonju-C-003 | 5 | 남부시장 한옥마을 야시장 | 743 | EXACT_CANONICAL_LINK |
| jeonju-C-R01 | 1 | 덕진공원 | 1098 | EXACT_CANONICAL_LINK |
| jeonju-C-R01 | 2 | 전주향교 | 1088 | EXACT_CANONICAL_LINK |
| jeonju-C-R02 | 1 | 완산꽃동산(완산칠봉꽃동산) | 736 | EXACT_CANONICAL_LINK |
| jeonju-C-R02 | 2 | 한벽당 | 763 | EXACT_CANONICAL_LINK |

미연결 36 occurrence 는 이름만 표시(발명 0) — 채택 시에도 name-only 로 승계(조용한 누락 0, §10.2 실측).

## 12. QA 기록 (환경·테이블·건수·정리)

| 구분 | 환경 | 대상 | 내용 | 정리 |
|---|---|---|---|---|
| 실채택 E2E(V2) | wrangler pages dev(실 API) → 운영 Supabase `itineraries`(사용자 데이터 테이블) | QA 전용 신규 device UUID | UI 클릭 채택 3코스(V1 빌드 오서빙 1회 재수행 포함 총 2회 런) — 생성 6건 + 디버그 2건 | **8건 전부 DELETE**(API 7 + 중단분 고아 1건은 id·내용 검증 후 service 단건 삭제) — GET/재조회 부재 확인, 잔존 0 |
| 재열람 렌더(V2) | LIVE(gokoreamate.com, 기존 코드) | `itineraries` QA 1건 | 동일 계약 payload 생성→렌더 PASS→삭제 | DELETE 200·GET 404 |
| canonical 테이블 | — | city_spots 등 | **write 0**(READ-ONLY 조회만) | — |
| V3 | 로컬 | 코드·런타임 무변경(SQL/문서/delta artifact 만) | 가드 테스트·tsc 재확인 | — |

**QA 판정 구분(§8)**: ① feature 실 API 채택·저장·순서 = **직접 실측 PASS** ② 격리(dev) 재열람 = Naver 지도 도메인 인증 제약으로 화면 미검증(환경 한계) ③ LIVE 재열람 렌더 = **기존 배포 코드**에서 동일 계약 payload 로 PASS ④ 수정본 전체의 Production E2E 는 **배포 후 LIVE 재QA 항목**(미수행) — ①~③을 합쳐 Production E2E PASS 로 표기하지 않는다.
