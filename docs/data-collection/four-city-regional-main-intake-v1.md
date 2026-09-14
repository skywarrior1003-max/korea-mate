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
| gyeongju en description | desc_l10n.en | 없음 | **패키지 en 행에 중국어 혼입 확인** | 제외(HOLD-결함보고) | 오염 데이터 미수령 |
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

## 6. 기존 오연결 23건 건별 분류

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

**부산 12건 — 전부 HOLD (canonical identity 충돌, Owner 판단 필요)**
범어사(1073)·오륙도(961)·영도대교(950)·감천(1081)·다대포(1054)·송도(963)·부평깡통(954)·광안리(1061×3)·다대포 C-003(1054)·영도대교 C-002(950).
패키지 부산 canonical(busan-A-*)은 `external_id` 로 **현재 연결 행과 동일 행**을 가리키고 다국어·좌표도 그 행의 복제다.
즉 패키지는 "현행이 맞다"고 재주장하고, findings 는 구세대 curated 행(26 Beomeosa Temple·28 Skywalk·990 영도대교·2 감천마을·19 다대포)이 실체라 한다.
→ 두 카탈로그 계보(visitbusan article 행 vs 구세대 curated 행)의 identity 재판정 사안 — Final authoritative 규칙상 임의 재연결 금지, 변경 0.

**제주 1건** — C-002 #1 영실탐방안내소→1871(영실탐방로): OUTSIDE_PACKAGE(패키지 근거 없음), 대표행 관례로 위험 낮음 — 유지.

**신규 발견(23건 밖, 보고만)**: jeonju-C-002 #3 오목대·이목대→**764("Jeonjucheon Stream")** — 오연결 의심(778 '오목대와 이목대' 실존). 패키지 OFF-11234(오목대) 브리지 부재 → 근거 없이 수정하지 않음. 또한 764/1126 전주천 twin 의심.

## 7. Production 적용 계획 (Owner 별도 승인 후)

1. `data/main-intake/four-city-regional-v1/gyeongju-regional-l10n-precheck-v1.sql` 실행(READ-ONLY) — 브리지 16/16·en_has 0 확인, before 스냅숏 보존.
2. `gyeongju-regional-l10n-apply-v1.sql` 정확 1회(sha256 `b7dd38cd28b8df4a8769a4ce3a898d26ace7e52aeb39aedb06fc953bf0cc637a`).
   키 부재 시에만 추가·no-overwrite·트랜잭션 내 검증 게이트(en 14·ja 2·zh 2 아니면 전체 롤백)·재실행 시 0행.
3. `…readback-v1.sql` — en 14/14·ja/zh 2/2·타행 무영향.
4. **복구**: master jsonl 의 값과 일치할 때만 `name_l10n - 'en'` 류 키 제거(값 조건 포함) — before 스냅숏이 1차 복구 자료.
5. 이후 SSG rebuild 1회(코스 화면은 라이브 fetch 라 rebuild 없이도 반영되지만 /place 텍스트 표면 일관성용).
6. linkage 수정(JSON)은 master 반영·배포로만 전파 — DB 무관. 기존 사용자 저장 여행(snapshot)은 **수정하지 않음**:
   과거 채택분에는 잘못된 장소가 남는다(잔여 영향, §8 보고) — 신규 렌더·신규 채택만 바로잡힌다.

## 8. TARGETED_SECONDARY_REQUEST (보조컴퓨터)

| city | canonical_id | source_key | field | Main 값 | package 값 | ambiguity | 필요한 evidence |
|---|---|---|---|---|---|---|---|
| jeonju | OFF-16109 | jeonju:OFF-16109 (=749) | zh title/desc | 없음 | 상태만 RUNTIME_ONLY_GAP, 텍스트 빈값 | 데이터 소재 불명 | 공식 원천 zh 원문 + source_url |
| jeonju | OFF-16086 | jeonju:OFF-16086 (=744) | ja+zh title/desc | 없음 | 〃 | 〃 | 〃 |
| jeonju | OFF-13964 | jeonju:OFF-13964 (=736) | ja+zh title/desc | 없음 | 〃 | 〃 | 〃 |

## 9. 패키지 결함 보고 (재등록 아님 — 신규 관찰)

1. **EN 행 description 중국어 혼입**(GJ01-0009·GJ01-0127) — language_qa `wrong_language_text_count: 0` 주장과 모순. EN 제목만 수령.
2. **NAV 좌표 품질**: 전주 계통적 오좌표(조경단=완산동 좌표 등)·제주 지점 오차(만장굴 3.68km)·부산=현행 행 복제. `nav_status: CONFIRMED` 를 Main 좌표 대체 근거로 쓸 수 없음.
3. **분류 stale**: 부산 13 RUNTIME_MAPPING_REPAIR(실제 렌더 정상)·전주 4 이미지 DATA_INTAKE(기반영).
4. 패키지 handoff 의 "UI 코드 수정 금지"는 데이터 트랙 자기 제약 — 본 Main task 지시와 충돌하나 이번 구현은 UI 코드 무변경이라 실충돌 없음.
