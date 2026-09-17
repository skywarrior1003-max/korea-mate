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

### 12.1 QA 원장 갱신 (FINAL-CLOSEOUT-V1, 2026-09-14)

- RELEASE-V1 LIVE QA: 생성 4건(50d9558d·671ca195·8b61713f·7b7b399e) 중 3건은 소유자 API 로 즉시 삭제, **잔존 1건(50d9558d-6776-4afa-ade7-8ff2aef0f60b)은 Owner 지정 단건 정리로 삭제 완료** —
  READ-ONLY 사전 확인(경주·'경주 시내권 핵심 바이블'·10/02~04·is_public=false·copy_of null·view 0·생성시각=1차 QA 런 일치, trip_moments 0·copy 참조 0) → 정확 ID 단건 DELETE 204 → readback 부재.
  **QA 여행 잔존 = 0.** 일반 사용자 여행 접촉 0.

## 13. 최종 마감 (MAIN-REGIONAL-DATA-FINAL-CLOSEOUT-V1, 2026-09-14)

### 13.1 경주 GJ01-0099 EN — 원문 미제공 확정(미해결 유지)

- 대상 확정: GJ01-0099 = **city_spots 511 '보문 물레방아 광장'**(city_spot_sources 정확 브리지·LIVE ko fallback 확인 대상과 동일).
- 확인 경로: ① 패키지 en SOURCE_NOT_AVAILABLE ② 상류 수집 원본(gyeongju-15-en-multilingual-v1.jsonl, KTO EngService2/visitkorea 경로) en_status SOURCE_NOT_AVAILABLE·source_url 공란 ③ 원천(경주문화관광 gyeongju.go.kr/tour)의 English/日本語/中文 링크는 **구글 번역 위젯**(translation-links·기계번역)으로 공식 편집 EN 원문 아님 — 사용 금지 원칙 준수.
- 판정: **원문 미제공**(접근 장애·수집 누락 아님). EN 제목·본문 발명 0, KO fallback 을 복구로 표기하지 않음. 장소·기존 자료 보존. **미해결로 유지.**

### 13.2 전주 — 보류 범위와 기존 서비스 영향 (건별)

| Main ID | 장소 | 신규 보류 필드(패키지 sha 783df233… — 적용 금지 유지) | 기존 서비스 사용 자료의 실측 출처 | 이용근거 확인 필요(기존 사용) |
|---|---|---|---|---|
| 749 | 전주한옥마을 (jeonju:OFF-16109) | zh 제목·본문 (cnh dataSid=16152) | 이미지=KTO 공식(tong.visitkorea, rights KTO_OFFICIAL) · en 제목/본문=KTO 계열 편집문 · **ja 제목/본문=visitjeonju /jpn 게시물 원문과 문두 일치 실측(dataSid 16147)** | **ja 제목·본문 1건**(제2유형 게시물 계열) |
| 744 | 청연루·남천교 (OFF-16086) | ja(16146)·zh(16151) 제목·본문 | 이미지=KTO 공식 · en=KTO 계열 · ja/zh 기존 사용 없음 | 없음 |
| 736 | 완산꽃동산 (OFF-13964) | ja(13966)·zh(13967) 제목·본문 | 이미지=KTO 공식 · en=KTO 계열 · ja/zh 기존 사용 없음 | 없음 |

- 이 3곳의 기존 이미지·EN 텍스트는 **제2유형 게시물 계열이 아님**(KTO 공식) — 같은 도시라는 이유로 동일 조건 분류하지 않음.
- 별도 클래스(광역 전수 아님·기확인분만): tour.jeonju.go.kr 게시물(BBS_0000003) 이미지를 사용하는 기존 행들 — 실측 확인분 917(조경단)·1098(덕진공원)·1125(한지박물관)·1126(전주천) — 도 동일 게시물 계열로 **이용 근거 확인 필요** 클래스. 그 외 행의 출처는 **불명(미조사)** 로 남긴다(광역 조사 금지 준수).
- 표시 구분: 전주 신규 JA/ZH = **수집 완료·적용 HOLD** / 위 기존 사용 필드 = **이용 근거 확인 필요**(서비스 변경·삭제·숨김 0).

**Owner 문의 정리(한곳)** — 문의 대상: 전주시 문화관광 포털(tour.jeonju.go.kr, 대표 063-222-1000·사이트 하단 '저작권정책' 경로).
문의 범위: ① 게시물 5건 — jpn 16146(청연루)/13966(완산)/16147(한옥마을), cnh 16151(청연루)/16152(한옥마을)/13967(완산) 및 ko 원게시물 계열 — 의 **본문 텍스트**를 상업적 웹서비스(제휴 수익 포함 여행 안내, 출처 표기·요청 시 삭제 운영)에서 인용·표시 가능한지 ② 동일 조건이 기존 사용분(위 표의 ja 1건·게시물 이미지 4건)에 적용되는지 ③ 허용 시 표기 조건. (문의 발송은 Owner — 대리 발송 안 함.)

### 13.3 경주 적용 건수 정정 (직전 '33 필드'는 오기)

실제 적용본(sha 196fe6fc…) 실측: **UPDATE 35문 = 언어 키 35개 추가**
(name_l10n: en 14·ja 2·zh 2 = 18 / desc_l10n: en 14·ja 1·zh 2 = 17) · **대상 14행** · **DB 컬럼 2종**(행×컬럼 셀 28).
readback(en 14/14·desc en 14/14·ja 2·zh 2·범위 밖 0)과 정합 — DB 값 변경 없음, 보고 수치만 정정.

### 13.4 checksum·복구 자료 위치 (전체 SHA-256)

| 파일 | 상태 | sha256 |
|---|---|---|
| data/main-intake/four-city-regional-v1/gyeongju-regional-l10n-apply-v1.sql | **적용 완료(2026-09-14, 정확 1회 — 재실행 금지)** | 196fe6fcae1374ec4b25a3c384854dfe426b2fab0c117ce27a437b56c0c108f1 |
| data/main-intake/four-city-regional-v1/jeonju-regional-l10n-apply-v1.sql | 보류(HOLD — 자동 적용 금지) | 783df233acfbf2166c60dae778e8acce2a0371b5b3a30755a427087d9908dea9 |
| data/main-intake/four-city-regional-v1/gyeongju-regional-l10n-rollback-v1.sql | 준비(실행 금지 — Owner 지시 시 1회) | a0d2b29f18cbd8a3ee7d96a55546fa2538fa85ac6b4ebbcd37031ab2e99a9b3e |
| data/main-intake/four-city-regional-v1/gyeongju-l10n-before-snapshot-2026-09-14-v1.json | 적용 직전 원본 14행(영속 보관) | (JSON 자료 — 대상 키 전부 부재 검증 완료) |

경주 구버전 apply(b7dd38cd… / dd4a5f6c…)는 SUPERSEDED 유지. 축약 sha 표기는 항상 '…' 로 축약임을 명시한다.

**DB rollback 실행 조건**: Owner 지시 시에만 — rollback-v1.sql 은 각 키가 apply 가 넣은 값과 정확히 일치할 때만 제거(값조건 35문)하므로 이후 다른 갱신을 덮지 않는다. 실행 후 대상 키 부재 readback + SSG rebuild 1회.

**코드 rollback(실행 지침 아님 — 기록)**: 배포분(5f3b083→170630a)은 5커밋 — 96ebad4·b1358e4(런타임: regional-trips-v1.json linkage 수리 + 가드 테스트) / b5300b4·c9e8782·170630a(SQL·문서 artifact — 런타임 무관).
화면 linkage 만 되돌리려면 `git revert b1358e4` → `git revert 96ebad4` 순(최신부터), 가드 테스트가 함께 revert 되는지 확인. **충돌 발생 시 중단하고 보고**(수동 해소 금지). **이 지침은 170630a 가 최신일 때만 유효 — 이후 Production 변경이 쌓이면 그대로 적용 불가.** DB(l10n)와 독립이므로 코드만 되돌려도 DB 값은 남는다(표시 무해 — 코스/장소 화면은 있는 키만 사용).

### 13.5 지역 화면 — 후속 논의 항목(이번 작업 범위 밖, 기록만)

Owner 결정: 데이터 마감 후 별도 논의. 이번에 파트너 박스·Explore CTA·검색·날씨·언어 전환·섹션 순서 **무변경**(A/B/C/D 제안 어느 것도 미승인).
① 파트너 박스: 9/13 신규 삽입(1줄) → 9/14 최대 5줄(en/ja/zh)로 확대된 경위 — 위치는 '여행 편의정보'와 Explore CTA 사이.
② 확인 필요(후속): 기존 승인 디자인(stitch \*_final 계열)에서 Explore/검색 진입이 상단 배치였는지 대조.

### 13.6 기존 사용자 snapshot

기존 저장 여행의 오연결 snapshot 은 이번에도 무수정 — 미해결 항목으로 유지(§7-6 보존 사유 동일). 전수조사·일괄 복구·재저장 0.

## 14. 콘텐츠 완전성 감사 (RECOMMENDED-ITINERARY-CONTENT-AUDIT-V1, 2026-09-14 · Production 170630a)

READ-ONLY. 노출 전수 = **regional 22 + 경주 legacy 54 = 76 코스** · 연결 장소 unique **54**(코스 간 중복 spot 은 1회 집계, 노출 위치별 표시는 별도 확인). 홈 하단 Picks = busan/seoul/jeju 첫 코스 3장(클릭 → 도시 코스 목록).

### 14.1 판정 요약

- **A(지역 이미지)**: 일부 누락 — LIVE 깨짐 0, 누락 2 spot(28 오륙도스카이워크·1319 부평깡통시장 = 3 occurrence placeholder 표시). 미연결 36 occurrence 의 placeholder 는 설계(이름만). 서울 3코스 카드 커버는 연결 이미지 부재로 도시비주얼 fallback(설계 fallback — 깨짐 아님).
- **B(홈)**: 이미지 전부 정상(5도시 캐러셀 5/5 — 화면 밖 2장은 lazy 정상 동작으로 스와이프 시 로딩 실증 · Picks 3장 정상). **카드 설명은 표시 영역 없음(설계)** — 데이터 부재와 구분. 클릭 경로 정상.
- **설명(지역)**: ko 설명 없음 3 spot(672·778·1126 — LIVE 는 설명 블록 생략, 깨짐 아님) + **전주 연결 14 spot 은 ko 화면 설명이 영문**(description=KTO EN 편집문·desc_l10n.ko 부재 — /place/749 LIVE 실증).
- 언어(연결 54 기준): 실본문 en 47 · ja 33 · zh 32, 나머지는 원문 fallback(단 전주는 원문 name/description 자체가 영문이라 ja/zh fallback 도 영문 표시 — zh 전주 코스 LIVE 표본 실증).

### 14.2 regional 22 코스표 (카드 커버 / 코스 설명 / stop 이미지 / stop ko설명 / LIVE)

| 도시 | 코스 | 카드 커버 | 코스 설명 | stop 이미지(연결) | stop ko설명(연결) | LIVE |
|---|---|---|---|---|---|---|
| busan | busan-C-001 | 장소사진 | theme O | 9/10 | 10/10 | 깨짐 0 |
| busan | busan-C-002 | 장소사진 | theme O | 6/8 | 8/8 | 깨짐 0 |
| busan | busan-C-003 | 장소사진 | theme O | 2/2 | 2/2 | 깨짐 0 |
| busan | busan-C-R01 | 장소사진 | theme O | 1/1 | 1/1 | 깨짐 0 |
| seoul | seoul-C-001 | 장소사진 | theme O | 1/1 | 1/1 | 깨짐 0 |
| seoul | seoul-C-002 | 도시비주얼(fallback) | theme O | 0/0 | 0/0 | 깨짐 0 |
| seoul | seoul-C-003 | 도시비주얼(fallback) | theme O | 0/0 | 0/0 | 깨짐 0 |
| seoul | seoul-C-R01 | 도시비주얼(fallback) | theme O | 0/0 | 0/0 | 깨짐 0 |
| jeju | jeju-C-001 | 장소사진 | theme O | 1/1 | 1/1 | 깨짐 0 |
| jeju | jeju-C-002 | 장소사진 | theme O | 1/1 | 1/1 | 깨짐 0 |
| jeju | jeju-C-003 | 장소사진 | theme O | 4/4 | 4/4 | 깨짐 0 |
| jeju | jeju-C-R01 | 장소사진 | theme O | 2/2 | 2/2 | 깨짐 0 |
| jeju | jeju-C-R02 | 장소사진 | theme O | 1/1 | 1/1 | 깨짐 0 |
| gyeongju | gyeongju-C-001 | 장소사진 | theme O | 7/7 | 7/7 | 깨짐 0 |
| gyeongju | gyeongju-C-002 | 장소사진 | theme O | 6/6 | 6/6 | 깨짐 0 |
| gyeongju | gyeongju-C-003 | 장소사진 | theme O | 6/6 | 5/6 | 깨짐 0 |
| gyeongju | gyeongju-C-R01 | 장소사진 | theme O | 5/5 | 5/5 | 깨짐 0 |
| jeonju | jeonju-C-001 | 장소사진 | theme O | 5/5 | 5/5 | 깨짐 0 |
| jeonju | jeonju-C-002 | 장소사진 | theme O | 4/4 | 2/4 | 깨짐 0 |
| jeonju | jeonju-C-003 | 장소사진 | theme O | 4/4 | 4/4 | 깨짐 0 |
| jeonju | jeonju-C-R01 | 장소사진 | theme O | 2/2 | 2/2 | 깨짐 0 |
| jeonju | jeonju-C-R02 | 장소사진 | theme O | 2/2 | 2/2 | 깨짐 0 |

- 코스 상세의 stop 별 '설명' 표시 영역은 없음(이름·district 만 — 설계). 설명은 ③ 장소 상세에서 표시.
- legacy 54(경주): stops 0 = 설계(P0-4 편집형 fallback copy). LIVE 54/54 제목·본문 렌더 정상, theme 보유 16/54, 카드 이미지 영역 없음(설계).

### 14.3 문제 항목 (화면→일정→장소→필드→원인→필요 수정)

1. 부산 코스 상세·장소 상세 → busan-C-001 #7·C-002 #11 → **28 Oryukdo Skywalk** → image_url 없음 → V2 재연결로 구세대 행 사용(그 행에 이미지 미수집) → 공식 이미지 delta 확보(§10.1 C-B02 기록과 연동).
2. 부산 C-002 #6 → **1319 부평깡통시장** → image_url·en/ja/zh l10n 없음 → 동일(구세대 행) → 공식 이미지+다국어 delta.
3. 경주 C-003 #5 → **672 배동 석조여래삼존입상** → ko 설명 없음 → V2 재연결 행이 설명 미보유 → 경주 Final/공식 원문에서 ko 설명 확보(후속·정확 항목 기록).
4. 전주 C-002 #3 → **778 오목대와 이목대** → ko 설명 없음 + en/ja/zh 없음 → 재연결 행 미보유. ko 원문 후보 = visitjeonju 게시물(**KOGL 제2유형 — 이용조건 확인과 연계**).
5. 전주 C-002 #1 → **1126 전주천** → ko 설명 없음 → 패키지 NOT_APPLICABLE(알려진 상태 유지).
6. 전주 연결 14 spot(729·736·742·743·744·749·763·765·917·1088·1089·1098·1109·1125) → **ko 표면 설명=영문** → 수집 계보가 KTO EN 편집문을 description 에 저장, ko 본문 미수집 → ko 본문 원본 후보 = visitjeonju ko 게시물(제2유형 대상) — **Owner 이용조건 확인(§13.2)과 동일 트랙**.
7. 경주 **427 경주 월성** → EN 없음(코스 EN 화면에서 ko 표시) → V2 재연결 행이 l10n 패치 14행 대상 밖(패키지에 월성 canonical 부재) → KTO EngService2 '경주 월성' EN 확보 후속 후보. **511 EN 은 §13.1 원문 미제공 유지.**
8. 관찰: 제주 place 히어로(visitjeju CDN)는 첫 3~4초 내 미로딩 빈발, 12~20초 내 전부 로딩(10/10 재검 OK) — 깨짐 아님, 체감 지연 관찰만.

증빙: scratchpad shot-busan-c001.png(스카이워크 placeholder)·shot-place-1319.png·shot-place-749-ko.png(ko 영문 설명)·shot-gyeongju-c001.png(정상 대표).

### 14.4 검증 방법 구분

- 직접 LIVE(모바일 ko): 목록 5 페이지 전수(카드 76·이미지 실패 0), regional 22 상세 전수(<img> 실로딩·placeholder 판별), legacy 54 상세 전수(렌더), 연결 장소 54 상세 전수(히어로 실로딩·설명 표시), 홈(캐러셀 스와이프 포함), 언어 표본 7(ko 외 en/ja/zh 코스 상세 — busan en/ja/zh·gyeongju en/ja·jeju en·jeonju zh·seoul en).
- 데이터·공통 코드: 언어별 l10n 커버리지 전수(DB)·fallback 규칙(pickL10n)·데스크톱은 공통 렌더 경로(코스·장소 페이지 반응형 단일 구현) — 별도 데스크톱 전수 화면 확인은 미수행(미검증 범위로 구분).
- 이번 감사의 수정·배포·DB 변경 0. 숨김·삭제 0.

## 15. 콘텐츠 복구 (RECOMMENDED-ITINERARY-CONTENT-RECOVERY-V1, 2026-09-14)

### 15.1 복구 패치 content-recovery-v1 (준비 완료 · Production 미적용)

- 파일: `data/main-intake/four-city-regional-v1/content-recovery-{precheck,apply,readback,rollback}-v1.sql` + `content-recovery-master-v1.jsonl`
- **apply sha256 `f79ccbad9111a2283edf359291423decec81b700e2cd4f1cbd69579ce9846204`** — UPDATE 27문:
  이미지 5행(28 오륙도스카이워크·1319 부평깡통시장·40 블루라인파크·1360 몰운대길·1273 자유도매시장 — `image_url IS NULL` 일 때만) ·
  **ko 본문 16행**(672·729·736·742·744·763·765·778·917·1088·1089·1098·1109·1125·**1126 전주천**·1633 — 키 부재 시에만) ·
  EN 3행(427 경주 월성·778 오목대·1319 — name+desc, KTO EN title/overview verbatim).
- 원천: **KTO TourAPI**(Kor/EngService detailCommon — 공공데이터포털 활용키, 기존 KTO_OFFICIAL 계보와 동일 제공 경로; contentid·주소를 master jsonl 에 기록. 도메인 라벨이 아니라 '공사 제공 API 데이터 + 출처 표기 관례'가 이용 근거 — 별도 계약 아님을 기록).
- **identity 대조**: 전 대상 KTO 좌표↔Main 좌표 ≤0.6km(1126 전주천 3.8km 는 선형 하천 — KTO 항목이 하천 전반 소개라 desc 만 채택, 좌표 무변경).
- **1126 NOT_APPLICABLE 재판정**: 패키지 NA 는 visitjeonju 다국어 부재 맥락 — KTO 국문 '전주천'(contentid 3056623) 공식 설명 실존 → ko desc 복구 대상으로 승격(범위 상이 문제 없음: 하천 전반 소개).
- **미확보(대상 밖 — 완료 위장 없음)**: 749 전주한옥마을 ko 본문(KTO 검색 미검출 — 126508 probe 는 경복궁으로 판명·불채택. ko 원문 후보는 visitjeonju 제2유형 → HOLD 트랙) · 743 남부야시장 ko(KTO 부재) · 22 국제시장·48 절영 이미지(KTO firstimage 없음) · 778/1319 JA·ZH(KTO 언어 서비스 미검출; visitjeonju ja 는 제2유형 HOLD).
- rollback: 이미지=값조건 NULL 복귀(원값 NULL 실측), 텍스트=값조건 키 제거(rollback-v1.sql — 실행 금지 골격, 실제 실행 시 master 원문 조건으로 확정). Production 적용 전 재검사: precheck 카운트 전부 0 + before snapshot 저장.

### 15.2 미연결 분류·연결 복구 (46 occurrence / 45 unique — 서울 10 포함)

- **연결 복구 26 occurrence / 25 unique** (`linkage: IDENTITY_LINK_RECOVERY_V1`, 명칭+공식 주소·좌표 실측 — 가드 테스트 고정):
  부산 17(동래읍성 58·복천동고분박물관 993·송정해수욕장 17·장림포구 980×2·을숙도 65·절영해안산책로 48·국제시장 22·부산아쿠아리움 1645·누리마루 38·전포카페거리 54·호천마을 985·해리단길 1633·블루라인 40·몰운대길 1360·X the SKY 43·자유도매시장 1273) ·
  제주 4(법환포구 1690·월평포구 1684·영실기암 1810·윗세오름 1698) · 경주 5(중앙시장 야시장 455·플레이스씨 1617·경주월드 507·엑스포대공원 504·**불국사 528**).
- **Main 행은 있으나 unpublished(발견 게이트) — 연결 보류·별도 결정**: 이기대(7/29)·청사포다릿돌전망대(39)·부산역(81). 공개 여부는 Final 권한 — 임의 publish 0.
- **실장소·Main 행 부재(신규 행 후보 — insert 준비는 별도 결정)**: 서울 7(경복궁·국립민속박물관·북촌한옥마을·창덕궁·인사동·국립중앙박물관·이촌한강공원 — 서울 카탈로그에 본체 부재 실측) · 삼정타워 · 밀락더마켓 · 서빈백사(우도) · 전주비빔밥거리 · 경주 고속버스터미널·경주역.
- **맥락형 유지(장소 ID 부여 안 함)**: 서귀포 해안선(구간) · 안국역 인근 집합 · 창덕궁 방면 표현 · 근정전·향원정 일원(경복궁 내부 동선) · 국립중앙박물관 야외/내부 중 야외(경내 동선) — 원 라벨(RELATION_OR_AREA_ONLY 등) 존중.

### 15.3 legacy 54코스 판정

- **의도 구성 근거**: curated-trips.json 스키마 자체가 stops=개수(장소 목록 없음), P0-4(10d4ccd)에서 편집형 fallback 으로 승인 배포 — 구현 사실·승인 근거 모두 확인.
- **자료 누락 확인**: 원본 `gyeongju-official-course-place-links-final-v1.jsonl` 에 **18개 legacy 코스의 stop 132행 실존**(candidate GJ01-* 등) — 전달 계층에서 미사용. **복구안 준비물**: `gyeongju-legacy-course-stops-resolved-v1.jsonl`(city_spot_sources 브리지로 **107/132행 numeric id 해석**, 73/73 canonical). 나머지 36 코스는 원본에도 링크 없음(NON_PLACE/NEW_PLACE 등 분류 잔존).
- **별도 결정 항목**: 이 18코스에 stops 를 배선할지(match_status EXACT/HIGH 만 채택 등 정책 포함) — 화면에 stop 타임라인이 새로 생기는 변화라 Owner 결정 후 구현.

### 15.4 격리 QA (2026-09-14, 로컬 serve — DB 패치 미적용 상태 기준)

복구 연결 표시·링크(58/65/22/1645/1633/1690/1684/528/507/504 등) 전부 PASS · 깨진 이미지 0(제주 CDN 지연은 18s 내 로딩) · 미연결 유지 항목 확인 · 홈→목록 경로 유지 · 제휴 sponsored 5 유지 · UI diff = 데이터·테스트·문서만(런타임 코드 0). 이미지 5행·본문은 DB 미적용이라 격리 화면에선 기존 상태(placeholder 등) — **적용 후 LIVE 재QA 항목**. 채택·저장·재열람은 QA 여행 생성 금지 제약으로 adopt-core 계약+가드 스냅숏 검증으로 갈음(실채택 E2E 는 적용 승인 후 항목).

### 15.5 Production 적용 순서(승인 후)

① content-recovery precheck(카운트 0 확인·before snapshot 저장) → apply 1회(sha f79ccbad…) → readback(img 5/5·ko 16/16·en 3/3) → ② master FF(연결 복구 커밋) → 배포 → ③ LIVE 재QA(복구 이미지 실로딩·ko 본문 표시·EN 427/778/1319·채택 E2E) → QA 데이터 정리.

## 16. 복구 마감 (RECOMMENDED-ITINERARY-CONTENT-RECOVERY-CLOSEOUT-V2, 2026-09-14)

### 16.1 1633 정합 확정 + 보고 집계 정정 (패치 무변경)

- **1633 = 부산 해리단길**(KTO contentid 2783306, 주소 부산 해운대구 우동 — KTO·Main 주소·좌표·명칭 3중 정합 실측). 패치 sha f79ccbad… 의 1633 ko 본문은 **정확**(부산 해운대 도시철도역 배후 본문) — DB·SQL 무변경.
- 정정 대상은 **직전 완료보고의 도시 분류 집계 문구**: "전주 ko 12/14" 로 1633 을 전주 집계에 포함한 오기. 확정 구성 — **KO 16행 = 전주 14(729·736·742·744·763·765·778·917·1088·1089·1098·1109·1125·1126) + 경주 1(672) + 부산 1(1633)**.
- §14.1 정정: 감사 보고의 "미연결 36 occurrence" 는 서울 3코스 10 occurrence 를 (연결 0 코스라 표에서 0/0 처리하며) 미연결 합계에서 누락한 집계 — **확정 46 occurrence**(§16.3). 감사의 화면 판정 자체는 유효.

### 16.2 이미지 22/48 판정 (28·1319 외 — §14 의 "일부 누락" 잔여 확인)

- 복구 대상으로 확정된 5행(28·1319·40·1360·1273)은 KTO firstimage 확보(§15.1). 그 외 연결 spot 중 이미지 부재 2행 재확인: **22 국제시장·48 절영해안산책로 — KTO firstimage·detailImage2 모두 0건 실측 → KTO 경로로는 부재 확정**.
- 대체 후보 visitbusan.net 은 검색/목록 접근 장애(요청 차단·스크립트 렌더)로 게시물 특정 불가 — **"부재 단정" 아님, "확인 불가(접근 장애)"로 구분** 기록. 후속 = Owner 브라우저 경유 확인 또는 보조컴퓨터 트랙.

### 16.3 미연결 46 occurrence 확정 분류 (26+2+8+7+3)

집계: **연결 복구 26**(§15.2, IDENTITY_LINK_RECOVERY_V1 가드 고정) · **비공개 행 보류 2**(이기대 7/29·청사포다릿돌 39) · **실장소·행 부재 후보 8** · **맥락형 7** · **근거 부족 3**. §15.2 대비 정련: **부산역은 원 라벨(RELATION_OR_AREA_ONLY·교통 결절) 존중으로 맥락형**에 확정(비공개 행 81 존재 사실만 병기 — 보류 아님), 삼정타워도 맥락형(단 KTO 3014436 실장소 등재 — insert 준비물 보유, 연결 여부는 Owner 판단).

| 도시 | 코스 | # | stop | 라벨 | 확정 분류 |
|---|---|---|---|---|---|
| busan | C-002 | 12 | 이기대해안산책로 | TRUE_NEW_PLACE_CANDIDATE | 비공개 행(7/29) 보류 — 공개는 Final 권한 |
| busan | C-003 | 7 | 청사포다릿돌전망대 | TRUE_NEW_PLACE_CANDIDATE | 비공개 행(39) 보류 |
| busan | C-003 | 1 | 부산역 | RELATION_OR_AREA_ONLY | 맥락형(교통 결절) — 비공개 행 81 존재 병기 |
| busan | C-003 | 2 | 삼정타워 | RELATION_OR_AREA_ONLY | 맥락형(집합 지점) — KTO 3014436 insert 준비물 보유 |
| busan | C-R01 | 1 | 밀락더마켓 | RELATION_OR_AREA_ONLY | 행 부재 후보 — KTO 2862152, insert안 |
| seoul | C-001 | 1 | 경복궁 (광화문) | RELATION_OR_AREA_ONLY | 행 부재 후보 — KTO 126508, insert안 |
| seoul | C-001 | 2 | 근정전·향원정 일원 | RELATION_OR_AREA_ONLY | 맥락형(경복궁 경내 동선) |
| seoul | C-001 | 3 | 국립민속박물관 | RELATION_OR_AREA_ONLY | 행 부재 후보 — KTO 2608977(복합 표제 verbatim), insert안 |
| seoul | C-002 | 1 | 안국역 인근 집합 | RELATION_OR_AREA_ONLY | 맥락형(집합 지점) |
| seoul | C-002 | 2 | 북촌한옥마을 (가회동 일원) | RELATION_OR_AREA_ONLY | 행 부재 후보 — KTO 126537, insert안 |
| seoul | C-002 | 3 | 창덕궁 방면 (창덕궁길) | RELATION_OR_AREA_ONLY | 맥락형(이동 방면) — 창덕궁 본체 KTO 미검출(내부 시설만) 병기 |
| seoul | C-002 | 4 | 인사동 | RELATION_OR_AREA_ONLY | 행 부재 후보 — KTO 264353, insert안 |
| seoul | C-003 | 1 | 국립중앙박물관 야외 공원·연못 | RELATION_OR_AREA_ONLY | 맥락형(경내 동선 — 내부 stop 과 동일 시설) |
| seoul | C-003 | 2 | 국립중앙박물관 내부 | RELATION_OR_AREA_ONLY | 행 부재 후보 — KTO 129703, insert안 |
| seoul | C-003 | 3 | 이촌한강공원 | RELATION_OR_AREA_ONLY | 행 부재 후보 — KTO 970636, insert안 |
| jeju | C-001 | 2 | 서귀포 해안선 (구간) | RELATION_OR_AREA_ONLY | 맥락형(구간 표현) |
| jeju | C-R02 | 2 | 서빈백사해수욕장 | RELATION_OR_AREA_ONLY | 행 부재 후보 — KTO 598558, insert안 |
| gyeongju | C-R01 | 1 | 터미널 | RELATION_OR_AREA_ONLY | 근거 부족(경주고속버스터미널 추정 — KTO 미등재·행 부재) |
| gyeongju | C-R01 | 2 | 경주역 | RELATION_OR_AREA_ONLY | 근거 부족(신경주역 추정·구 경주역 폐역 — KTO 미등재·행 부재) |
| jeonju | C-003 | 2 | 전주비빔밥 거리 (풍남동) | RELATION_OR_AREA_ONLY | 근거 부족(행 부재·KTO 미등재 — 공식 본문·좌표 부재) |

(복구 26 occurrence 의 개별 대응은 §11 최종 대응표·§15.2 명세와 가드 테스트 스냅숏이 SSOT — 중복 나열 생략.)

### 16.4 신규 장소 insert안 (13곳 판정 → 9행 준비 · 실행 금지)

- 파일: `data/main-intake/four-city-regional-v1/candidate-place-inserts-v1.sql` — **sha256 `e4f278ad64fb4d0727605231b858eacb39301421dac75d6a5e9cf867498d61c6`** + `candidate-place-inserts-master-v1.jsonl`(contentid·주소·본문 길이·코스 stop 대응).
- **9행**(KTO 이름·본문·좌표·이미지 verbatim): 경복궁 126508(749-probe 에서 판명된 자료 전용) · 국립민속박물관 2608977(KTO 복합 표제 그대로) · 북촌한옥마을 126537 · 인사동 264353(초기 후보 오기 → 실측 교정) · 국립중앙박물관 129703 · 이촌한강공원 970636 · 서빈백사 598558 · 밀락더마켓 2862152 · 삼정타워 3014436(연결 여부 Owner 판단 전제 준비물).
- 안전 설계: **is_published=false 로만 삽입**(공개는 별도 게이트/Owner) · **id 하드코딩 0 — 실행 시점 `max(id)+row_number` 발급** · `external_id 'kto:<contentid>'` 존재 시 삽입 0(중복 가드) · BEGIN/COMMIT + RETURNING.
- **근거 부족으로 insert 제외 3**: 전주비빔밥거리·경주 고속버스터미널·경주역(§16.3) · 창덕궁 본체는 KTO 미검출로 후보 성립 불가(13번째 항목) — 발명 금지 원칙대로 보류.

### 16.5 격리 실적용 검증 (Production 접근 0 — READ-ONLY 시드만)

**환경**: embedded PostgreSQL 17.2(127.0.0.1:55432, 스키마 city_spots/itineraries/trip_moments*) + PostgREST 12.2.3(:3111) + REST 프록시(:54321, /rest/v1 매핑) + 실제 `functions/api/itinerary*.ts` 핸들러 실행 미니 앱서버(:8899) + **iso env 정적 빌드 out/**(NEXT_PUBLIC_SUPABASE_URL=127.0.0.1 — 646 페이지·place 420 생성). 시드 = Production READ-ONLY(경주 published 399행 + 패치 대상·부산 코스 spot 51행).

- **① DB 단독(iso-verify)**: precheck 0/0/0 → **apply 1회 = img 5·ko 16·en 3 정확 적용** → 컨트롤 행 무변경·기존 en(917) 보존·1633=해리단길 본문·427 EN 실측 → **재실행 idempotent**(전행 해시 동일) → **값조건 rollback 완전 복귀**(기존 키 보존 확인). 전항 PASS.
- **② 풀스택 E2E(Playwright, 13/13 PASS)**: 코스 상세 복구 링크 표시(gyeongju-C-R01 507·504·528 / busan-C-003 **1633·40** / busan-C-R01 43·1273) + 미연결 stop 이름만 유지(터미널·밀락더마켓) · **/place/672 ko 패치 본문 표시** · **/place/427 EN 제목·본문 표시** · /place/1319 패치 이미지 실로딩(KTO CDN) · 홈→목록→상세 경로 · 제휴 링크 보존(aid=123610) · **실채택 E2E: 채택 → POST /api/itinerary 저장(7 places, 코스 순서 유지·첫 장소 국립경주박물관) → GET 재확인 → 재열람 화면 장소명 렌더 → DELETE 200 → GET 404 — QA 여행 격리 DB 정리 완료(잔존 0)**.
- **환경 한계(검증 방식 구분)**: Naver 지도 SDK 는 127.0.0.1 미등록 도메인에서 SDK 내부 오류(maps.js setMap — 스택 실측)로 렌더를 깨뜨림 — 재열람 렌더 검증은 SDK 로드 차단(지도 미가용 가드 경로)으로 수행. 지도 포함 재열람은 LIVE 재QA 항목(§15.5 ③)으로 유지. UI 코드 변경 0(이번 태스크 산출물 = 데이터·SQL·문서·테스트·격리 도구만).
- 증빙: scratchpad iso-shot-*.png 8매(코스 2도시·place 3·채택·재열람).

## 17. 잔여 데이터 마감 (RECOMMENDED-ITINERARY-REMAINING-DATA-CLOSEOUT-V1, 2026-09-14 · Production 73c46b5)

전제: 복구분(f79ccbad)은 Production 73c46b5 로 릴리스 완료(§16 + PRODUCTION-RELEASE-V1). 이번은 잔여 데이터만 — Production write·배포 0.

### 17.1 22 국제시장·48 절영 이미지 — 원천 전수 확인 결과

확인한 기존 자료·경로(동일 조회 반복 없음 — 새 경로만):
- **브리지 contentid 직접 조회**(검색 아님): 22=KTO 132191/705873 · 48=KTO 252561/3002402 — detailCommon2 firstimage·detailImage2 **모두 0건**(주소 정합 실측 — identity 정확).
- **기존 수집 원장**: busan-integrated-candidates(1,767건) image "none" · **이미지 권리 감사(1,642행) no_image** · visitbusan 웹 수집(1,510행) — 국제시장 게시물(uc_seq=399)은 수집 시에도 `missing_required_fields=image_url`(정적 HTML 에 이미지 없음 — JS 렌더), 절영은 **항목 자체 부재**.
- **부산 공공 AttractionService 라이브 재조회**(213건, TOUR_API_KEY 승인 확인): 두 장소 항목 부재. **ShoppingService 는 키 미등록 403 — 접근 장애(활용신청 필요), 부재 단정 아님.**
- **VisitBusan 게시물 브라우저 렌더**(Playwright): **국제시장 399 게시물에서 공식 사진 18장 실존 확인**(uploadImgs, 대표 1200×545 — 실로딩 검증). 절영은 통합검색·목록에서 미검출. 영도구청 tour 사이트 3페이지 — 전용 소개 게시물 미검출(관광안내도 언급뿐).

판정:
- **22 국제시장**: 공식 사진 실존(visitbusan 게시물 399, URL 기록·로딩 실증·주소 20m 정합) — 단 **이용 근거 미확정**: 게시물에 공공누리 미표시, API 경로(ShoppingService)는 키 미등록. Production 의 visitbusan 이미지 450행은 **공공 API(AttractionService) 경유** 계보 — 웹 게시물 직채는 다른 경로라 채택 보류. **Owner 액션 1건으로 해소 가능: data.go.kr 부산 ShoppingService 활용신청(무료) 또는 visitbusan 이용조건 확인** → 확보 즉시 이미지 delta 1행.
- **48 절영해안산책로**: 확인한 공식 원천(KTO 2경로·부산 공공 API·visitbusan 수집/검색·영도구청 3페이지) 전부에서 전용 사진 미검출 — **"확인한 원천 내 미제공"**(원본 없음 단정 아님). 후속 = 영도구청 문화관광 심층/부산관광공사 문의(Owner).

### 17.2 743 남부야시장 KO·미확보 다국어

- **743**: 브리지에 visitjeonju 게시물 **16085** 실존 — 제목 실측 "**남부시장 한옥마을 야시장**" = **야시장 전용 게시물(범위 정합 — 남부시장 전체 아님)**. KO 원문 특정 완료. 단 visitjeonju = **공공누리 제2유형 → 이용허락 확인 트랙(§13.2) 합류**. 749(한옥마을)와 같은 트랙이지만 사유 구분: 749=이용조건 문제 확인됨 / 743=KTO 미확보 + 원문은 이번에 특정·이용조건 대기.
- **1319 부평깡통시장 JA/ZH**: KTO 미검출(기존 기록 유지). visitbusan 게시물 **uc_seq=400**("부산 먹방의 성지 부평깡통시장" — 전용 게시물, 수집 시 language_available=true) — 다국어판 존재 표식. **이용 근거 확인 트랙(17.1 과 동일)** 후 정확 URL 특정.
- **778 오목대 JA/ZH**: KTO 미검출(기존) — visitjeonju 경로는 제2유형 확인 후 조사 항목.
- 749 KO·기존 JA/ZH 보류·511 EN: 기존 상태 그대로(재조사 0, 번역 대체 0, 대리 문의 0).

### 17.3 신규 insert안 — 중복 실사로 v2 정정 (9행 → 7행 + 기존 ID 연결 2)

**중복 실사(Production READ-ONLY·비공개 포함)**: external_id 충돌 0 · 좌표 ±500m + 이름 전역 검사에서 **기존 행 2건 발견**:
- **밀락더마켓 = 기존 행 1332**(공개, "A market full of trends —Millac the Market"/ko "트렌디함 물씬, 밀락더마켓", 수영구 민락수변로17번길 56, KTO 2862152 와 **10m**) → insert 제외, **기존 ID 연결**로 이관.
- **서빈백사해수욕장 = 기존 행 2797 산호해수욕장**(공개, 우도면 연평리, KTO 598558 과 **64m** — 동일 해변 병기명, ko/en/ja/zh 보유) → 동일 이관.

**insert v2**: `candidate-place-inserts-v2.sql` — **sha256 `1930484aea0f5eab3b283de40b0ea3dab3b42f3a7cab85affd7744258ec68e82`**, **7행**(경복궁 126508·국립민속박물관 2608977·북촌한옥마을 126537·인사동 264353·국립중앙박물관 129703·이촌한강공원 970636·삼정타워 3014436) + master v2 jsonl. v1(e4f278ad…)은 **SUPERSEDED**(파일 머리 표기). 후보 8건↔행 대응: 행부재 8 중 6(서울)=insert 유지 · 밀락더마켓·서빈백사=기존 ID 연결로 전환 · +삼정타워(맥락형·준비물)=7행째(연결 여부 Owner 판단).

**기존 ID 연결 2건 적용(feature)**: regional-trips-v1.json — busan-C-R01#1 밀락더마켓→**1332**, jeju-C-R02#2 서빈백사→**2797** (`IDENTITY_LINK_RECOVERY_V2`), 가드 테스트 17/17 고정. **관찰(수정 없음)**: busan-C-R01#1 의 패키지 nameEn 은 "Millak Luche Festa (illumination)" — ko 명(밀락더마켓)·기확정 분류(실장소)·좌표 10m 로 시설 identity 채택, nameEn 불일치는 패키지 결함 관찰로 병기. **이 연결은 master 미반영 — 다음 릴리스 승인 시 노출.**

**격리 검증(임시 공개 전환 포함 — Production 무관)**: iso PG 에서 v2 실행 → **7행 발급(1646~1652, max+row_number — 하드코딩 0)·source↔ID 대응표 산출** → **재실행 0행(중복 가드)** → 비공개 상태 published 필터 미노출 → 공개 전환 후 img/ko/geo 전행 완비 → **iso 빌드 + UI 8/8 PASS**(신규 경복궁·삼정타워 상세 진입+이미지 실로딩 940px, 밀락 1332·서빈백사 2797 코스 링크+상세 진입, busan-C-003 부산역·삼정타워 미연결 유지).

**운영 반영 시 필요한 단계(구분 — insert 만으로 공백 해소 아님)**: ① Production insert(비공개) → ② Owner 공개 결정 → ③ 코스 연결 커밋(external_id 로 발급 id 조회) → ④ **SSG 재빌드·배포**(dynamicParams=false — 재빌드 전에는 /place/<신규id> 페이지 미생성).

### 17.4 비공개 행 7/29/39/81 — 사유 확정

legacy-retirement crosswalk(714행) 실측: **4행 전부 `FINAL_RETIRED / RETIRE_FROM_DISCOVERY`** — Final busan 우주에 동일 entity 부재(명시 artifact+주소·이름·좌표 대조) → 의도적 discovery 퇴출. **비공개 ≠ 오류.** 4행 모두 이미지가 unsplash placeholder(카탈로그 공식 이미지 정책 위반 소지)라는 품질 문제 병존.

장소별 Owner 결정 프레임(일괄 아님):
- **이기대(7·29 — 같은 장소의 legacy 이중 후보)**: 재공개+연결 시 busan-C-002#12 링크 노출. 단 Final authoritative 예외 승인 필요 + placeholder 이미지·본문 품질 문제로 **재공개 비권장** — 대안 = KTO 신규 후보 확인 후 insert 트랙(후속 수집).
- **청사포다릿돌전망대(39)**: 동일 구조(busan-C-003#7). 재공개보다 신규 후보 트랙 적합.
- **부산역(81)**: 코스 stop 은 **맥락형 확정(§16.3)** — 연결 대상 아님 → **결정 불필요**(재공개 실익 없음).
- 연결 준비 패치는 위 구조상 **만들지 않음**(재공개=Final 규칙 예외라 Owner 선결정 필요 — 결정 시 최소 패치는 즉시 구성 가능: is_published 전환+연결+이미지 교체 3요소).

### 17.5 이번 산출물·검증

- 파일: candidate-place-inserts-**v2**.sql(1930484a…)+master v2 · v1 SUPERSEDED 표기 · regional-trips-v1.json 연결 2 · 가드 테스트 17/17 · 본 문서 §17.
- 격리: insert DB 검증 + iso 빌드 UI 8/8(위) · teardown 후 정상 재빌드 완료. Production DB write 0·QA 여행 0·배포 0·master push 0.

## 18. 기존 공개 연결 릴리스 + 공개 판단 준비 (EXISTING-PLACE-LINK-RELEASE-AND-PUBLICATION-READINESS-V1, 2026-09-14)

### 18.1 A — 연결 2건 릴리스 (완료)

- master FF 73c46b5→**3bd1048**(force 0) · Cloudflare 배포 **d1ec0a26** · runtime diff = regional-trips-v1.json 연결 2 + 가드 테스트뿐(그 외 data/·docs/ 기록물 — SQL 코드 참조 0 재확인) · iso 잔재 0.
- **LIVE 6/6 PASS**(QA 여행 생성 0): busan-C-R01#1 밀락더마켓→/place/1332(표시명 = 카탈로그 ko "트렌디함 물씬, 밀락더마켓" — 계약), jeju-C-R02#2→/place/2797(표시명 "산호해수욕장"), 두 상세 이미지 실로딩(1332=visitbusan 공공 API 계보 이미지)·본문 표시, busan-C-003 부산역·삼정타워 맥락형(이름만) 보존, 지역 허브 경로·제휴 보존. DB write 0·화면 구성 변경 0.

### 18.2 B — 신규 7행 장소별 공개 판단표 (insert v2 = 1930484a…, 실행 금지 유지)

공통: 원천 KTO TourAPI(공공 — 기존 KTO_OFFICIAL 계보), 이름·주소·좌표·본문·이미지 verbatim, 기존 Main 행 부재 근거 = external_id 충돌 0 + 좌표 ±500m·이름 전역(비공개 포함) 실사(§17.3), 언어 = **KO 실본문만**(EN/JA/ZH 미수집 → fallback 표시), 이미지 = KTO firstimage 실존(격리 UI 에서 경복궁·삼정타워 실로딩 940px 실증).

| # | 장소(KTO 표제 verbatim) | 도시 | contentid | 코스 stop(원 라벨) | 본문 | 주소 | 준비 상태 |
|---|---|---|---|---|---|---|---|
| 1 | 경복궁 | seoul | 126508 | seoul-C-001#1 (RELATION) | ko 1,264자 | 종로구 사직로 161 | **공개 준비 완료** |
| 2 | 국립민속박물관과 국립민속박물관 어린이박물관 | seoul | 2608977 | seoul-C-001#3 (RELATION) | ko 595자 | 종로구 삼청로 37 | **완료**(복합 표제 — 표시명 축약은 별도 결정) |
| 3 | 북촌한옥마을 | seoul | 126537 | seoul-C-002#2 (RELATION) | ko 1,146자 | 종로구 계동길 37 | **완료**(기존 3239 는 '안내센터' — 별개 시설 확인) |
| 4 | 인사동 | seoul | 264353 | seoul-C-002#4 (RELATION) | ko 800자 | 종로구 인사동길 62 | **완료** |
| 5 | 국립중앙박물관 | seoul | 129703 | seoul-C-003#2 (RELATION) | ko 336자 | 용산구 서빙고로 137 | **완료** |
| 6 | 이촌한강공원 | seoul | 970636 | seoul-C-003#3 (RELATION) | ko 369자 | 용산구 이촌로72길 62 | **완료** |
| 7 | 삼정타워 | busan | 3014436 | busan-C-003#2 (RELATION — 맥락형) | ko 385자 | 부산진구 중앙대로 672 | insert 준비 완료 — **연결 여부는 Owner 판단**(코스 stop 은 집합 지점 표현) |

**운영 절차(각 단계 검증·복구 포함)**: ① Production insert = v2 sql 1회(가드: external_id 존재 시 0행; 복구 = external_id 'kto:%' 7행 DELETE — 참조 생기기 전 단계라 안전) → ② **발급 ID 확인** = `SELECT id, external_id FROM city_spots WHERE external_id IN ('kto:126508',…)` (격리 발급 1646~1652 는 **Production 하드코딩 금지** — external_id 대응만 사용) → ③ Owner 공개 결정 후 `is_published=true`(값조건: false→true; 복구 = 역전환) → ④ 코스 연결 커밋 = ②의 id 를 regional-trips-v1.json 에 IDENTITY_LINK_RECOVERY_V2 로(가드 테스트 갱신·복구 = revert) → ⑤ **SSG 재빌드·배포**(재빌드 전 /place/<신규id> 미생성 — dynamicParams=false) → ⑥ LIVE 확인(상세 진입·이미지·코스 링크). 격리에서 ①②③⑤⑥ 상당 전 과정 검증 완료(§17.3).

### 18.3 C — retired 장소: 과거 처리의 실제 근거와 복구 준비

crosswalk(2026-09-01, 714행) 실측 — **중복·identity 오류가 아니라 "Final 수집 범위 부재"가 4행 공통 근거**:
- **7 Igidae Coastal Walk**: 2026-08 릴리스 당시 **OWNER_OVERRIDE_KEEP_PUBLISHED**("Owner 확정 유지")였으나 09-01 retirement 에서 Final 우주 부재로 퇴출(기록: "historical override not reinterpreted as publish approval"). **참조: itineraries 51·user_spots 2.**
- **29 Igidae Coastal Trail**: 동일(당시 기록 "이기대 2행 중 하나" — **7과 같은 시설의 이중 행**로 처리됨). 참조 17.
- **39 청사포 다릿돌전망대**: LEGACY_ONLY_VALID — "canonical 없음(A-00055 청사포·미포는 어촌 면적 페이지)" = 전용 canonical 수집 공백. 참조 12.
- **81 부산역**: "도착 anchor, canonical 없음" — 코스 stop 은 맥락형 확정(§16.3) → **연결·재공개 불필요, 현 이름·순서 유지 확인**.

**복구 준비(신규 중복 생성 0 — 기존 ID 재사용)**: KTO 에 정확 동명 항목 실존 — 이기대해안산책로 **3008212**(본문 403자·detailImage 7장), 청사포 다릿돌전망대 **2607943**(본문 374자·detailImage 3장). §17.4 의 "KTO 신규 트랙" 판단은 **철회** — 기존 행 복구가 참조 보존상 우월.
- 패치: `retired-place-minimal-restore-v1.sql` **sha256 `dc7035770add0d8b9699be82b222cf9cddae10f96ec5fa9872ba3511ab3c1b74`** + master jsonl — 7·39 에 ko 이름/본문(KTO verbatim)+placeholder 이미지 교체(값조건: 현 unsplash URL 앵커)+is_published 전환(조건부). **29 는 비공개 유지**(이중 행 — 병합·삭제·ID 재부여 0). 좌표는 기존 유지(KTO 좌표 대조만 기록: 7↔3008212 약 370m·39↔2607943 약 480m — 산책로/구간 특성).
- 격리 검증 PASS: ko_name/본문/KTO 이미지 교체/공개 전환/published 필터 포함 2/2/재실행 idempotent — id 불변이라 기존 사용자 참조(51+2·12) 보존.
- **남은 결정(장소별)**: ⓐ 7 재공개+busan-C-002#12 연결 — Final authoritative 예외 승인 필요(과거 Owner 유지 지시가 있었던 행) ⓑ 39 재공개+busan-C-003#7 연결 — 동일 ⓒ 29 는 계속 비공개(추가 결정 불요, 7 복구 시 코스는 7 사용).

### 18.4 D — 외부 확인 항목 상태(정확 구분)

- **22 국제시장**: 공식 사진 18장 **실존 확인 완료**(visitbusan 게시물 399) — 원본 부재 아님, **이용 근거 확인 대기**. Owner 직접 행동: ① data.go.kr 에서 **부산광역시 쇼핑 정보 서비스(ShoppingService, 6260000)** 활용신청(현 키 403=미등록) — 승인 후에도 **해당 레코드 존재·이미지 필드·이용조건을 별도 확인**(신청=확보 아님) 또는 ② visitbusan.net 콘텐츠 이용조건 문의. 확보 즉시 이미지 delta 1행(경로 §17.1).
- **1319 부평깡통시장 JA/ZH**: 게시물 400 다국어 **존재 표식**(수집 시 language_available=true)까지 확인 — 실제 제목·본문 미확보(정확 URL 은 언어별 menuCd 상이로 미특정). 이용 근거 트랙과 함께 진행.
- **48 절영**: 확인 원천(KTO 2경로·부산 공공 API 213건·visitbusan 수집/검색·영도구청 3페이지) 미제공 — 남은 경로 = 영도구청 문화관광 심층·부산관광공사 문의(Owner). 동일 실패 조회 반복 금지 유지.
- 전주 제2유형(743·749 ko·ja/zh)·511 EN·기존 snapshot·legacy 배선: 미해결/결정 대기 유지 — 이번 완료 수치에 불포함.

## 19. 발견·커머스·콘텐츠 수리 (DISCOVERY-COMMERCE-AND-CONTENT-REPAIR-V1, 2026-09-17 · Production 3bd1048 무변경)

Owner 합의 범위의 feature 구현+패치 준비+격리 실적용+QA. **Production DB write 0·배포 0·master 무변경** — 적용은 별도 승인.

### 19.1 구현(feature 1a8f591)

- **검색 진입**: 5도시 Hub 공통 — 도시 소개 아래·추천여행 위 검색 pill("{city}에서 장소 찾기") → `/explore/{slug}?focus=search`(기존 Explore 검색 문법·`?q=` 계약 재사용, SearchBar autoFocus만 추가 — 새 검색 체계 0). §8-4의 "Hub 검색 미신설" 결정은 본 Owner 결정으로 변경(진입점 1개 한정). 검색·탐색이 제휴보다 먼저 발견되는 구성 성립.
- **제휴 목적 선택형**(city-hub-essentials): 기본=목적 칩만(검증 조합만 생성·파트너 기본 강조 0·sponsored 링크 0) → 선택 시 해당 목적 추천1+대안≤1+가시 고지 → 전환/접기. my-trip-prep 표면은 기존 스택 유지. 링크 굵기 semibold→medium·보조 문구 대비 rgba(.5)→(.62) 상향. 기존 게이트·빌더·고지·tracking 재사용, 날짜·개별 상품 미도입, Place Detail 비활성 유지.
- **0-stop 가드**: 채택 CTA 를 stops>0 에서만 렌더(+adoptCourseDays 빈 배열 null 이중 방어). name-only stop 과 0-stop 코스 구분 유지 — 유효 코스 채택 불가화 0, 코스 자료 삭제 0.
- **맥락형 표시**: 미연결 stop 은 placeholder 썸네일 카드 대신 이름만의 컴팩트 행(라벨·순서·데이터 보존 — 표현만 구분). 실장소의 이미지 placeholder(연결 spot)는 유지 — 확보/미확보 구분 보존.
- **1633 철회**: busan-C-003#5 → null, `IDENTITY_LINK_RETRACTED_V1`. **낙산 복구**: seoul-C-R01 stops 5개 — STO 공식 KON000645 "도보코스" 원문 순서(흥인지문→한양도성박물관→이화마을→낙산공원→혜화문, 만남 동대문역 7번 출구·2~3시간). 상류 normalized 패키지도 stops=[](is_reserve)였음 — 조립 누락 아닌 원문 미수집분을 공식 페이지에서 보강. EN 은 STO EN 페이지 verbatim(흥인지문)만, 나머지 발명 0. 가드 19/19.

### 19.2 DB 패치(실행 금지 — Owner 승인 후)

| 패치 | sha256 | 내용 |
|---|---|---|
| 1633-mislink-repair-v1.sql | `280eda28eb89bd5eb79eee7200c1a143fe7d580ccc4ace707cf2472e185b46a7` | 주입 desc_l10n.ko 만 값조건 제거(내장 검증 DO) — 매장 name·"바다처럼"·사진·주소·EN·source 무접촉. before 원상={en} |
| haeridan-street-insert-v1.sql | `753f3101bb50bdd45f0a36498519058e812a2ab873e72f18c130c507b6fc6b09` | 거리 본체 1행(KTO 2783306 verbatim: 주소 우동 510-7·좌표·본문 304자·대표+상세10 이미지) — 비공개 insert·id 실행시점·중복가드. 카탈로그 전수(이름·비공개·근접)에서 거리 본체 부재 실측 |
| seoul-six-inserts-v1.sql | `7ff187c6a0b3f4b27d28d14c8d22db0ac2922148d5cdd3ad98bbecf6ec18e814` | v2 의 적용 단위 분리 — 서울 6곳만(삼정타워 제외·맥락형 유지, v2 파일에 분리 표기) |
| retired-place-minimal-restore-v1.sql | `dc703577…`(기존 — 재검토 후 재사용, 수정 0) | 7 이기대·39 청사포 ko 이름/본문+placeholder 교체+조건부 공개 · 29 비공개 유지 |

- 코스 연결 도구: `scripts/main-intake/apply-new-place-links-v1.mjs` — external_id/고정 ID→발급 ID 조회 후 JSON 연결(비공개 행 연결 거부 가드 — **격리 발급 숫자 하드코딩 0**).
- Final 재퇴출 방지: `five-city-core-v3/audits/owner-restore-exceptions-v1.jsonl` — 7(과거 OWNER_OVERRIDE 계보·참조 51+2)·39(참조 12) 유지 근거, 29 비공개 확정. 전역 공개 정책 신설 없음.

### 19.3 격리 실적용+QA (전 패치 실제 적용 — 샘플 주입 0)

- DB: 재시드(Production 현재 상태 READ) → 1633 repair(ko 제거·바다처럼/EN 보존) → 해리단길 insert(발급·재실행 0) → seoul-six(6행 발급·재실행 0) → 7/39 복구(공개·이미지 교체) → 격리 공개 전환 7행 → 연결 도구로 9 stop 연결(격리 ID) → iso 빌드.
- **UI/기능 QA 26/27 PASS**(모바일 390 기준 + en/ko locale 축, 데스크톱·ja/zh 는 공통 코드 검증으로 구분): 1633 매장/거리 분리 표시 · 서울 6곳 링크+상세(경복궁 이미지 실로딩·ko 본문·EN fallback 구분) · 7/39 링크+KTO 이미지(unsplash 아님) · 낙산 5 stop name-only(placeholder 0)+CTA "5개 장소" · **0-stop 코스 CTA 미노출** · 검색 pill→Explore 포커스→도시 검색(경복궁 결과)→뒤로가기 복귀 · 제휴 기본 접힘(sponsored 0)/선택 1목적/전환/접기/ko 에 기차·버스 칩 없음/en 에 있음 · 정상 채택 11 stop 순서 저장(해리단길=카탈로그명)→재열람→정리(잔존 0).
- **직접 빈 days POST = 201 수용(실측)** — API days:[] 허용은 planner "빈 일정 시작" 계약과 공유되어 API 강제 거부는 이번 범위에서 보류(회귀 위험), **코스 채택 경로는 UI+core 이중 가드로 차단 완료**. QA 생성분 즉시 정리.
- **H3 판정**: 재열람(?id) 화면의 my-trip-prep 비노출은 `shareId=searchParams.get("id")` 게이트의 **기존 동작**(6846f80 이후 동일 — ?id 접근 전부 share 취급) — 이번 변경과 무관·회귀 아님. my-trip-prep 스택 렌더는 컴포넌트 분기 보존으로 확인. (관찰: 본인 ?id 재열람에서도 비노출되는 설계는 Owner 확인 후보로 병기.)
- 환경 한계(기지): Naver SDK 127.0.0.1 crash — QA 는 SDK 차단으로 수행, 지도 포함 확인은 LIVE/Preview 몫.

### 19.4 Production 적용 순서(승인 후) · rollback

① 1633-mislink-repair(280eda28) → ② haeridan insert+공개 → ③ seoul-six insert+공개 → ④ 7/39 restore(dc703577) → ⑤ `apply-new-place-links-v1.mjs`(운영 발급 ID — plan all) 커밋 → ⑥ master FF+재빌드·배포 → ⑦ LIVE 확인(§19.3 매트릭스 상당+지도 포함 재열람). rollback: 코드=169 이전 커밋 revert·배포 / DB=값조건(1633 재주입은 Owner 명시 지시 시에만·insert 는 external_id DELETE·7/39 는 스냅숏 값 복귀·공개 역전환). 배포 후 검증 실패 시 이번 변경 범위만 되돌린다.

### 19.5 잔여(변경 없음 — 완료 수치 불포함)

미연결 occurrence 집계: 직전 18 → **이번 커밋 상태 24**(+1 해리단길 철회, +5 낙산 신규 name-only) → **패치·연결 전부 적용 시 15** = 맥락형 7 + 근거부족 3 + 낙산 행부재 후보 5 (−1 해리단길 신규 행 연결, −1 이기대 7, −1 청사포 39, −6 서울). 이미지 실확보 대기: 22(이용 근거 확인)·48(원본 접근 필요) — placeholder 표현 제거와 실사진 확보를 구분 유지. 외부 HOLD 불변: 전주 제2유형(743·749 ko·ja/zh)·1319/778 ja·zh·511 EN.

## 20. 발견·커머스·콘텐츠 릴리스 (DISCOVERY-COMMERCE-AND-CONTENT-PRODUCTION-RELEASE-V1, 2026-09-17)

**master=Production 3bd1048 → `b1f5ef4`(FF) · Cloudflare `59c6ddbb` · gokoreamate.com 콘텐츠 실증.**

### 20.1 이번 릴리스 DB 적용(전체 sha 핀·readback 확정 — 재실행 금지)

| 패치(경로: data/main-intake/four-city-regional-v1/) | 전체 SHA-256 | 결과 |
|---|---|---|
| 1633-mislink-repair-v1.sql | 280eda28eb89bd5eb79eee7200c1a143fe7d580ccc4ace707cf2472e185b46a7 | 1633 desc_l10n.ko 1키 제거(값조건 일치 precheck)·매장 원상 readback |
| haeridan-street-insert-v1.sql | 753f3101bb50bdd45f0a36498519058e812a2ab873e72f18c130c507b6fc6b09 | **5018** 발급(비공개→공개), 재실행 0 |
| seoul-six-inserts-v1.sql | 7ff187c6a0b3f4b27d28d14c8d22db0ac2922148d5cdd3ad98bbecf6ec18e814 | **5019~5024** 발급(경복궁·민속박물관·북촌·인사동·중박·이촌 — external_id readback), 재실행 0 |
| retired-place-minimal-restore-v1.sql | dc7035770add0d8b9699be82b222cf9cddae10f96ec5fa9872ba3511ab3c1b74 | 7·39 ko/이미지 복구+공개, 29 비공개 유지 |

발급 대응표 = `discovery-repair-issued-ids-2026-09-17-v1.json` · before snapshot = `discovery-repair-before-snapshot-2026-09-17-v1.json`(1633·7·29·39·81 전필드+bridge). 하드코딩 0 — 연결은 external_id readback ID.

### 20.2 코드(b1f5ef4)

Explore 로딩 중 "0개 장소" 오표시 제거(4 locale "불러오는 중…") · my-trip-prep 게이트 shareId→**isOwner**(owner-only GET 성공 기준 — 본인 ?id 재열람 표시, 타인 공유 숨김) · regional JSON 연결 9(5018·5019~5024·7·39) · 가드 20/20.

### 20.3 LIVE 검증(모바일 390 직접 25/25 + 데스크톱·EN 보충 4/4)

검색(5도시 pill·REST 지연 주입으로 로딩 문구 실측·실개수 1,843·실0건 정상·포커스·뒤로가기) · 여행 준비(기본 sponsored 0·추천1+대안1·교체·접힘·ko 기차/버스 숨김·en 노출·Agoda cid/city 파라미터 보존) · 콘텐츠(1633=바다처럼 원상·C-003→5018·신규7+복구2 이미지 naturalWidth/본문 9/9·서울 6 링크·이기대7·청사포39·낙산 5 name-only·0-stop CTA 없음·29 Explore 미노출) · 채택 QA 1건(11 stop 순서·지도 SDK 로드·name-only "지도에 표시되지 않음" 구분·DELETE→404·잔존 0).

### 20.4 판정 구분·관찰

- **my-trip-prep LIVE E2E 미완**: isOwner 게이트는 코드·격리 근거로 확인. LIVE 실증은 QA 여행 1건 한도 내 ko 채택분에서 sponsored 0 — 원인은 게이트가 아니라 **채택 저장 city가 locale 라벨("부산")이라 slug 매핑 미통과(기존 잠재 이슈 — 6846f80부터, en 채택 city="Busan"만 통과)**. "제휴 E2E 전체 완료" 아님 — city 저장값 slug 정규화는 별도 결정 항목.
- /place/<비공개 id> 직접 URL 페이지 존재(예: 29)는 **기존 빌드 동작**(이전에도 5,005페이지=공개+비공개 전량) — 이번 변경 아님, Explore 목록 미노출은 유지. 별도 확인 항목으로 병기.
- ja/zh 화면 문구는 번들 키 커밋으로 확인(직접 화면 미검증 — 미검증 표기).

### 20.5 Rollback(단계별·실행 조건)

① 1633: 재주입은 Owner 명시 지시 시에만(오연결 정정 취지) — 값 = before snapshot desc_l10n. ② 신규 7행: **공개 해제 우선**(`is_published=false WHERE external_id IN (…) AND is_published`) — DELETE 는 참조 0 확인 후 Owner 지시 시에만. ③ 7/39: 이번 복구값 일치 조건으로 image=unsplash 원값(snapshot)·ko 키 제거·is_published=false 복원. ④ 연결/UI: b1f5ef4 revert 커밋 → 재빌드·배포. **순서 = 코드 revert·배포 먼저(참조 제거) → DB 공개 해제 → 값 복원.** Cloudflare 직전 정상 = d1ec0a26(3bd1048).

## 21. My Trip city canonical + 비공개 place 게이트 (MYTRIP-CITY-CANONICALIZATION-AND-UNPUBLISHED-PLACE-GATE-V1, 2026-09-17)

**master=Production b1f5ef4 → `1bb6dbd`(FF) · Cloudflare `d51f07e8` · Preview `preview-city-canon-place-gat`(09780b4d). DB write 0 · 기존 itinerary UPDATE 0.**

### 21.1 city 계약
- SSOT: `src/data/cities/index.ts`(CITY_SLUGS) + 기존 tripForm.city_* locale 라벨(4개 언어) — **resolver `src/data/cities/resolve.ts`가 라벨을 역파생**(중복 도시 목록 신설 0). trim+라틴 소문자 후 완전 일치만, unknown→null(기본 도시 대체 금지). 별칭 = slug+4locale 라벨 20개뿐(bare "Jeju/제주" 실사용 근거 미발견 → 미수용). 테스트 6/6(`resolve.test.ts`).
- 쓰기: 코스 채택 city=slug · itinerary autosave `resolveCitySlug(city) ?? city`(미확정 원본 유지). 서버 copy 핸들러는 원본 승계 유지(runtime resolver가 커버 — Functions 번들에 4locale 메시지 292KB 유입 회피, 재저장 시 canonical 수렴).
- 읽기/소비: my-trip-prep 게이트=resolved slug(실패 시 조용히 숨김) · 지도 중심·날씨 slug=resolver · 표시 `My {city} Trip`/og title=locale 라벨(slug 원문 미노출).

### 21.2 비공개 place 게이트
- `/place/[id]` generateStaticParams reference→**discovery**(Gate B의 reference 생성 계약을 Owner 결정으로 대체) — dynamicParams=false 라 비공개=404. 빌드 place 5,012→**4,644**.
- 공개 클라이언트 hydration(fetchCitySpotsByIds — itinerary·DayMap) scope 인자 추가 후 discovery — 비공개 행 데이터 미전송, 미매칭 stop=snapshot name-only. citySpotHref 는 public catalog 실존 id 만 링크(404 링크 생성 0).
- LIVE: 29/81/286/999999=404(초기 29·286 200 은 엣지 전파 지연 — 수분 후 404·cf-cache DYNAMIC·no-store 로 stale 캐시 없음 확인) · 7/39/5018/1633/672=200 · sitemap 비공개 미포함.

### 21.3 LIVE QA(QA 여행 1건 — c6bb02ed…, 삭제 완료·잔존 0)
KO 부산 채택→**POST city="busan"** 실측 · 본인 재열람 my-trip-prep 표시(도시 문구 "부산"=라벨, slug 노출 0) · **owner PUT 로 city="부산" fixture**→재열람 prep 유지+지도 로드(라벨 레코드 runtime 인식) · 타인 컨텍스트 열람 prep 숨김 · DELETE→404. **JA/ZH 직접 화면(§12 이행)**: ja 부산·zh 서울 Hub 모바일 390 — pill·도시명·여행 준비 접힘/칩/선택(추천1+대안≤1)·전국 표기·Explore 로딩 문구(読み込み中/正在加载·0 오표시 없음). 회귀: Home·낙산 name-only·0-stop CTA 없음·page errors 0.

### 21.4 잔여
비공개 게이트로 기존 여행의 비공개 stop 은 name-only(스냅숏 보존·수정 0) — 재공개는 장소별 Owner 결정 그대로. copy 핸들러 canonical 저장은 후속 후보(현재 승계+runtime 호환). 데스크톱 ja/zh·전 도시 조합은 공통 코드 검증 범위.

## 22. Trip city 계약 최종 마감 (TRIP-CITY-CONTRACT-FINAL-CLOSEOUT-V1, 2026-09-17)

**master=Production 1bb6dbd → `115254a`(FF) · Cloudflare `bc61830f`. 기존 itinerary UPDATE 0 · DB migration 0.**
(경위 기록: FF 과정에서 커밋 메시지 here-string 큰따옴표로 1차 커밋 실패 → 중간에 26ca923(문서만)이 master 로 먼저 FF/배포(b49fcddb)됐고, 즉시 115254a 재커밋·FF·재배포로 정합 — force 0.)

### 22.1 Production city 값 READ-ONLY 감사(86행 전수 — city 컬럼만 조회)
`"Busan"` 80 · `"busan"` 4 · `"seoul"` 1 · `"서울"` 1 — **unknown/null/empty 0 · 전값 resolver 성공**. legacy alias 추가 0(존재 근거 없음 — bare Jeju/제주 미검출 → 미수용 유지). 사용자 ID·제목·본문 미조회, UPDATE 0.

### 22.2 shared identity(코드 계약)
- **`src/data/cities/identity.ts`** — slug 5+4locale 표시명 20+exact resolver, import 의존 0(클라·Functions 공용). `cities/index.ts` 는 slug 재수출, `resolve.ts` 는 위임(=클라 resolver 에서 messages 292KB 의존 제거). 가드: tripForm.city_* ↔ identity 표시명 동기 테스트.
- **Functions copy.ts**: `city: resolveCitySlug(source.city) ?? source.city`. 번들 1,255,969 → **1,257,449B(+1,480B)** — 한도 내.
- **자동 제목**: `itin.autoTripTitle` 4locale — ko `{city} 여행`·en `My {city} Trip`(Owner 예시)·ja `{city} の旅`·zh `{city} 行程`(기존 trending.tripTitleCity 문체 재사용 — 발명 0). `My ${city} Trip` 혼합 리터럴 5곳 전부 formatter 로 대체, 사용자 입력 제목 항상 우선. 테스트 9/9(20조합 slug 누출·혼합 판정 포함).

### 22.3 검증
- **격리 Copy 계약 6/6**(실제 copy.ts 를 iso 스택에서 실행): 부산/Busan/釜山(ja·zh 동일 표기)/busan → 복사본 `busan` · **Tokyo(unknown) → 원본 그대로**(강제 변환 0) · copy_of·places 순서 보존 · 원본 city 무변경 · iso 정리 0.
- **LIVE(QA 여행 — 원본 생성 2회·전부 소유자 삭제·Copy 0·잔존 0)**: KO 채택 POST **city="busan"** 실측 2회 · 타인 열람 my-trip-prep 숨김 · 비공개 /place 404·공개 200 유지. LIVE Copy/fixture 검증은 fixture PUT/PATCH 가 QA 컨텍스트에서만 400("Invalid ID" — 동일 코드·동일 페이로드 단독 재현은 404 정상, 원인 미규명)으로 미완 → **Copy 계약은 격리 6/6 로 완결**하고 LIVE 재시도는 QA 한도 준수를 위해 중단(정직 구분).
- **자동 제목 화면**: 소스·번들·테스트 검증 완료, `My 부산 Trip` 리터럴 잔존 0. 화면 노출 경로(제목 없는 저장 여행 fallback)는 QA 한도 내 미재현 — **직접 화면 미검증(공통 코드 검증)**으로 구분. /itinerary 무저장 화면의 기본 docTitle 은 기존 정적 메타 그대로(변경 전과 동일 — 회귀 아님).

### 22.4 함정 기록
PostgREST 스키마 캐시: 세션 내 ALTER 후 NOTIFY reload 가 레이스로 미반영될 수 있음(insert PGRST204) — **재기동이 확실**. 커밋 메시지 here-string 안 큰따옴표 금지(pathspec 파괴 — 재발).
