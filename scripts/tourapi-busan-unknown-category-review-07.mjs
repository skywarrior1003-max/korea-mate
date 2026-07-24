#!/usr/bin/env node
/**
 * TASK-DATA-BUSAN-UNKNOWN-CATEGORY-REVIEW-07
 * unknown_allowed 173건 (shopping:53, experience:120) 분류
 * 전체 173건 title+address 수동 검토 후 하드코딩 분류 테이블 적용
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.dirname(__dir);
const TODAY = new Date().toISOString().slice(0, 10);

const IN_INTEGRATED = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const IN_CANONICAL  = path.join(ROOT, 'data/tourapi/candidates/busan/busan-canonical-candidates.csv');
const OUT_CSV       = path.join(ROOT, 'data/tourapi/candidates/busan/busan-unknown-category-review.csv');
const OUT_METRICS   = path.join(ROOT, 'data/tourapi/reports/busan/busan-unknown-category-review-metrics.json');
const OUT_REPORT    = path.join(ROOT, 'docs/tourapi/busan-unknown-category-review-07-report.md');

const ALLOWED_CATEGORIES = new Set(['attraction','nature','restaurant','event','accommodation','']);

// ─── 분류 테이블 ──────────────────────────────────────────────────────────────
// status: ready_for_candidate | manual_review | reference_only | exclude_non_place | duplicate_suspected
// (ready일 때만 category/subcategory 필수)
const CLASSIFY = {
  // ═══════════════════════ SHOPPING 53건 ═══════════════════════
  'busan-VB-2670': { s:'ready_for_candidate', c:'attraction', sc:'shopping_mall',     r:'르네시떼, 독립 방문 가능한 복합쇼핑몰' },
  'busan-VB-2662': { s:'ready_for_candidate', c:'attraction', sc:'lifestyle_shop',    r:'센티카, 향수·라이프스타일 브랜드샵, 주소 보유' },
  'busan-VB-2589': { s:'ready_for_candidate', c:'attraction', sc:'shopping_street',   r:'문현동 골동품거리, 거리형 쇼핑 명소' },
  'busan-VB-2581': { s:'manual_review',       c:'',           sc:'',                  r:'제목 "바다처럼" — 업종·장소 식별 불가, 주소만 존재' },
  'busan-VB-2580': { s:'ready_for_candidate', c:'attraction', sc:'specialty_shop',    r:'삼영그릇, 1987년 운영 주방용품 전문점' },
  'busan-VB-2579': { s:'manual_review',       c:'',           sc:'',                  r:'제목 미완성("달콤한 부산의 매력,"), 주소는 있으나 업종 불명' },
  'busan-VB-2555': { s:'ready_for_candidate', c:'attraction', sc:'character_shop',    r:'미피 캐릭터 전문샵, 영도구 주소 보유' },
  'busan-VB-2541': { s:'ready_for_candidate', c:'attraction', sc:'retail_store',      r:'부산슈퍼 청사포점, 라이프스타일 소품샵' },
  'busan-VB-2539': { s:'ready_for_candidate', c:'attraction', sc:'specialty_shop',    r:'포셋 전포, 엽서·아날로그 소품 전문 공간' },
  'busan-VB-2537': { s:'ready_for_candidate', c:'attraction', sc:'lifestyle_shop',    r:'오월상점, 감성 소품샵, 전포 주소 보유' },
  'busan-VB-2417': { s:'ready_for_candidate', c:'attraction', sc:'retail_store',      r:'오브젝트 서면점, 소품샵 체인' },
  'busan-VB-2398': { s:'ready_for_candidate', c:'attraction', sc:'retail_store',      r:'딜라이트 프로젝트 해운대점, 주소 보유' },
  'busan-VB-2252': { s:'ready_for_candidate', c:'attraction', sc:'lifestyle_shop',    r:'페이퍼가든, 소품샵' },
  'busan-VB-2241': { s:'ready_for_candidate', c:'attraction', sc:'souvenir_shop',     r:'BIG shop, 부산 도시브랜드 기념품샵' },
  'busan-VB-2165': { s:'ready_for_candidate', c:'attraction', sc:'specialty_shop',    r:'아비베르컴퍼니, 키덜트 전문샵' },
  'busan-VB-2141': { s:'exclude_non_place',   c:'',           sc:'',                  r:'(2024)부산관광기념품10선 — 선정 리스트 콘텐츠, 특정 장소 아님' },
  'busan-VB-1964': { s:'ready_for_candidate', c:'attraction', sc:'retail_store',      r:'분홍이네, 광안리 소품샵' },
  'busan-VB-1736': { s:'exclude_non_place',   c:'',           sc:'',                  r:'(2022)부산관광기념품10선 — 선정 리스트 콘텐츠' },
  'busan-VB-1681': { s:'exclude_non_place',   c:'',           sc:'',                  r:'"부산사이다" — 주소 없음, 브랜드 홍보 콘텐츠 추정' },
  'busan-VB-1669': { s:'reference_only',      c:'',           sc:'',                  r:'"여가~거가! 광안리" — 광안리 지역 가이드, 단일 장소 아님' },
  'busan-VB-1667': { s:'ready_for_candidate', c:'attraction', sc:'souvenir_shop',     r:'해운대 선물가게, 관광 기념품 판매점' },
  'busan-VB-1666': { s:'ready_for_candidate', c:'attraction', sc:'souvenir_shop',     r:'동백상회, 동구 기념품점' },
  'busan-VB-1323': { s:'ready_for_candidate', c:'attraction', sc:'market',            r:'밀락더마켓, 복합 쇼핑마켓' },
  'busan-VB-819':  { s:'ready_for_candidate', c:'attraction', sc:'shopping_mall',     r:'IKEA 동부산점, 독립 방문형 대형매장' },
  'busan-VB-533':  { s:'exclude_non_place',   c:'',           sc:'',                  r:'(2019)부산관광기념품10선 — 선정 리스트 콘텐츠' },
  'busan-VB-505':  { s:'exclude_non_place',   c:'',           sc:'',                  r:'"부산 백화점에 놀러가자!" — 복수 장소 가이드, 주소 없음' },
  'busan-VB-504':  { s:'exclude_non_place',   c:'',           sc:'',                  r:'"해외여행의 꽃, 면세점" — 일반 면세점 가이드, 특정 장소 아님' },
  'busan-VB-552':  { s:'ready_for_candidate', c:'attraction', sc:'shopping_mall',     r:'부산프리미엄아울렛, 기장군 아울렛' },
  'busan-VB-548':  { s:'ready_for_candidate', c:'attraction', sc:'department_store',  r:'신세계백화점 센텀시티점' },
  'busan-VB-546':  { s:'ready_for_candidate', c:'attraction', sc:'department_store',  r:'롯데백화점 센텀시티점' },
  'busan-VB-545':  { s:'ready_for_candidate', c:'attraction', sc:'department_store',  r:'롯데백화점 광복점, 음악분수·전망대 포함' },
  'busan-VB-541':  { s:'ready_for_candidate', c:'attraction', sc:'department_store',  r:'롯데백화점 부산본점' },
  'busan-VB-506':  { s:'ready_for_candidate', c:'attraction', sc:'shopping_mall',     r:'롯데프리미엄아울렛 동부산점' },
  'busan-VB-413':  { s:'ready_for_candidate', c:'attraction', sc:'shopping_street',   r:'광복로패션거리, 독립 방문형 쇼핑 거리' },
  'busan-VB-399':  { s:'duplicate_suspected', c:'attraction', sc:'market',            r:'국제시장 — KTO/canonical 중복 추정', ref:'검색키:국제시장' },
  'busan-VB-540':  { s:'ready_for_candidate', c:'attraction', sc:'duty_free',         r:'롯데면세점 김해공항점' },
  'busan-VB-539':  { s:'ready_for_candidate', c:'attraction', sc:'duty_free',         r:'부산면세점 용두산점' },
  'busan-VB-537':  { s:'ready_for_candidate', c:'attraction', sc:'duty_free',         r:'롯데면세점 부산점' },
  'busan-VB-460':  { s:'reference_only',      c:'',           sc:'',                  r:'"서면 그리고 삼정타워" — 서면 일대 지역 가이드' },
  'busan-VB-422':  { s:'duplicate_suspected', c:'attraction', sc:'market',            r:'동래시장 — canonical 중복 추정', ref:'검색키:동래시장' },
  'busan-VB-412':  { s:'duplicate_suspected', c:'attraction', sc:'market',            r:'자갈치시장 — canonical 중복 추정', ref:'검색키:자갈치' },
  'busan-VB-400':  { s:'duplicate_suspected', c:'restaurant', sc:'food_market',       r:'부평깡통시장 — 먹방 중심 시장, canonical 중복 추정', ref:'검색키:부평깡통' },
  'busan-VB-387':  { s:'reference_only',      c:'',           sc:'',                  r:'"부산대학교 앞" — 지역 상권 가이드' },
  'busan-VB-363':  { s:'duplicate_suspected', c:'attraction', sc:'market',            r:'구포시장(구포장) — canonical 중복 추정', ref:'검색키:구포' },
  'busan-VB-328':  { s:'duplicate_suspected', c:'attraction', sc:'market',            r:'서면시장 — canonical 중복 추정', ref:'검색키:서면시장' },
  'busan-VB-327':  { s:'duplicate_suspected', c:'attraction', sc:'market',            r:'부전마켓타운 — canonical 중복 추정', ref:'검색키:부전' },
  'busan-VB-300':  { s:'duplicate_suspected', c:'attraction', sc:'market',            r:'남항시장&봉래시장 — 복수 시장 묶음, canonical 중복 추정', ref:'검색키:남항시장' },
  'busan-VB-294':  { s:'duplicate_suspected', c:'restaurant', sc:'food_market',       r:'해운대시장 — 맛집 시장, canonical 중복 추정', ref:'검색키:해운대시장' },
  'busan-VB-293':  { s:'duplicate_suspected', c:'restaurant', sc:'seafood_market',    r:'민락회타운 — 회 전문 수산시장, canonical 중복 추정', ref:'검색키:민락' },
  'busan-VB-292':  { s:'duplicate_suspected', c:'attraction', sc:'market',            r:'기장시장 — canonical 중복 추정', ref:'검색키:기장시장' },
  'busan-VB-547':  { s:'ready_for_candidate', c:'attraction', sc:'department_store',  r:'롯데백화점 동래점' },
  'busan-VB-555':  { s:'ready_for_candidate', c:'attraction', sc:'department_store',  r:'NC백화점 부산대점' },
  'busan-VB-554':  { s:'ready_for_candidate', c:'attraction', sc:'department_store',  r:'NC백화점 해운대점' },

  // ═══════════════════════ EXPERIENCE 120건 ═══════════════════════
  'busan-VB-2789': { s:'exclude_non_place',   c:'',           sc:'',                  r:'기부 러닝 행사 "후기" 콘텐츠, 주소 없음, 특정 장소 아님' },
  'busan-VB-2784': { s:'reference_only',      c:'',           sc:'',                  r:'웰니스 커뮤니티 소개 기사, 주소 없음, 단일 장소 아님' },
  'busan-VB-2763': { s:'ready_for_candidate', c:'attraction', sc:'theater',           r:'KNN시어터, 소극장, 센텀서로 고정 주소' },
  'busan-VB-2755': { s:'ready_for_candidate', c:'attraction', sc:'museum',            r:'부산교육역사관, 사하구 박물관' },
  'busan-VB-2704': { s:'ready_for_candidate', c:'restaurant', sc:'cooking_class',     r:'배로모디 쿠킹클래스, 중구 고정 주소' },
  'busan-VB-2703': { s:'ready_for_candidate', c:'nature',     sc:'ecological_site',   r:'오륜대 초록신선이야기, 금정구 생태 체험 공간' },
  'busan-VB-2586': { s:'ready_for_candidate', c:'attraction', sc:'escape_room',       r:'브레이크 아웃 이스케이프, 해운대구 실내 체험' },
  'busan-VB-2557': { s:'ready_for_candidate', c:'attraction', sc:'lifestyle_space',   r:'사바이사바이 전포, 카페+소품 복합 공간, 진구 주소' },
  'busan-VB-2410': { s:'exclude_non_place',   c:'',           sc:'',                  r:'권은비×빠니보틀 브랜드 PR 콘텐츠, 주소 없음' },
  'busan-VB-2401': { s:'ready_for_candidate', c:'restaurant', sc:'cooking_class',     r:'오키친 쿠킹하우스, 해운대구 센텀 주소' },
  'busan-VB-2397': { s:'ready_for_candidate', c:'nature',     sc:'fishing_village',   r:'공수어촌체험휴양마을, 기장군 어촌 체험 마을' },
  'busan-VB-2309': { s:'ready_for_candidate', c:'attraction', sc:'esports_arena',     r:'부산 e스포츠 경기장, 진구 실내 경기장' },
  'busan-VB-2308': { s:'ready_for_candidate', c:'attraction', sc:'pet_park',          r:'그랑독, 강서구 천연잔디 반려견 공원+카페' },
  'busan-VB-2307': { s:'ready_for_candidate', c:'attraction', sc:'sports_bar',        r:'켈틱타이거, 진구 스포츠 바' },
  'busan-VB-2306': { s:'ready_for_candidate', c:'attraction', sc:'climbing_gym',      r:'웨이브락 클라이밍, 수영구 실내 클라이밍' },
  'busan-VB-2304': { s:'ready_for_candidate', c:'attraction', sc:'pet_center',        r:'BSKS 반려동물교육문화센터, 연제구' },
  'busan-VB-2302': { s:'ready_for_candidate', c:'attraction', sc:'pet_cafe',          r:'도그민, 수영구 오션뷰 애견 카페' },
  'busan-VB-2301': { s:'ready_for_candidate', c:'attraction', sc:'pet_store',         r:'광안리 펫스테이션, 반려동물 복합 공간' },
  'busan-VB-2300': { s:'ready_for_candidate', c:'attraction', sc:'pet_park',          r:'신라대학교 지산학 펫파크, 사상구' },
  'busan-VB-2298': { s:'ready_for_candidate', c:'nature',     sc:'dog_park',          r:'사하구 애견펫공원, 공공 반려견 공원' },
  'busan-VB-2297': { s:'ready_for_candidate', c:'nature',     sc:'dog_park',          r:'명지근린공원 강아지놀이터, 공공 공원 내' },
  'busan-VB-2294': { s:'ready_for_candidate', c:'nature',     sc:'lighthouse',        r:'가덕도 등대 체험, 강서구 자연 체험' },
  'busan-VB-2293': { s:'ready_for_candidate', c:'attraction', sc:'experience_center', r:'죽성그림, 기장군 복합 체험 공간' },
  'busan-VB-2277': { s:'duplicate_suspected', c:'accommodation', sc:'resort_hotel',   r:'이제 부산 료칸 호텔 — accommodation 중복 추정', ref:'검색키:이제 부산' },
  'busan-VB-2273': { s:'duplicate_suspected', c:'accommodation', sc:'resort_hotel',   r:'아난티 코브 호텔 — accommodation 중복 추정', ref:'검색키:아난티' },
  'busan-VB-2270': { s:'duplicate_suspected', c:'accommodation', sc:'luxury_hotel',   r:'윈덤 그랜드 부산 — accommodation 중복 추정', ref:'검색키:윈덤' },
  'busan-VB-2259': { s:'ready_for_candidate', c:'attraction', sc:'theme_cafe',        r:'세븐테마카페, 수영구 복합 테마 카페' },
  'busan-VB-2249': { s:'ready_for_candidate', c:'attraction', sc:'bakery_experience', r:'베이킹 하루, 수영구 베이킹 체험 카페' },
  'busan-VB-2245': { s:'manual_review',       c:'',           sc:'',                  r:'놀핏 노르딕 워킹 — 오퍼레이터 주소, 실제 산책 장소 별도 확인 필요' },
  'busan-VB-2244': { s:'ready_for_candidate', c:'attraction', sc:'wellness_center',   r:'SMB wellness, 기장군 일광읍 웰니스 센터' },
  'busan-VB-2243': { s:'duplicate_suspected', c:'accommodation', sc:'luxury_hotel',   r:'파크 하얏트 부산 — accommodation 중복 추정', ref:'검색키:파크하얏트' },
  'busan-VB-2209': { s:'ready_for_candidate', c:'attraction', sc:'perfume_workshop',  r:'로칼(rocarl), 영도구 향수 공방' },
  'busan-VB-2181': { s:'ready_for_candidate', c:'attraction', sc:'craft_workshop',    r:'청월호야, 사하구 유리 공예 공방' },
  'busan-VB-2159': { s:'ready_for_candidate', c:'attraction', sc:'perfume_workshop',  r:'향수 공방 어도르, 수영구 주소 보유' },
  'busan-VB-2144': { s:'reference_only',      c:'',           sc:'',                  r:'"부산 어싱 스팟 모음" — 복수 장소 리스트 기사' },
  'busan-VB-2142': { s:'ready_for_candidate', c:'nature',     sc:'camping',           r:'천성항 노지 캠핑장, 강서구 캠핑 장소' },
  'busan-VB-2135': { s:'ready_for_candidate', c:'nature',     sc:'walking_trail',     r:'하단 황톳길 산책, 사하구 하단동' },
  'busan-VB-2134': { s:'ready_for_candidate', c:'nature',     sc:'walking_trail',     r:'너울 공원 맨발 산책로, 강서구 명지동' },
  'busan-VB-2132': { s:'ready_for_candidate', c:'nature',     sc:'walking_trail',     r:'철로→황톳길, 북구 낙동대로 산책로' },
  'busan-VB-2109': { s:'ready_for_candidate', c:'attraction', sc:'craft_workshop',    r:'수은화가 도자기 공방, 기장군 주소 보유' },
  'busan-VB-2103': { s:'ready_for_candidate', c:'attraction', sc:'craft_center',      r:'닥밭골 한지체험관, 서구 전통 공예 체험' },
  'busan-VB-2097': { s:'ready_for_candidate', c:'restaurant', sc:'seafood_experience',r:'영도해녀촌, 해녀 문화+신선 해산물 식사' },
  'busan-VB-2091': { s:'ready_for_candidate', c:'attraction', sc:'digital_art_museum',r:'부산 아르떼뮤지엄, 영도구 몰입형 미디어아트관' },
  'busan-VB-2080': { s:'ready_for_candidate', c:'attraction', sc:'food_experience',   r:'구포국수 체험관, 북구 구포만세길 고정 장소' },
  'busan-VB-2066': { s:'ready_for_candidate', c:'attraction', sc:'wellness_center',   r:'4233 마음센터 광안점, 수영구 주소' },
  'busan-VB-2060': { s:'reference_only',      c:'',           sc:'',                  r:'"바다 VS 강" 편집 기사, 단일 장소 아님' },
  'busan-VB-1965': { s:'ready_for_candidate', c:'event',      sc:'beach_cinema',      r:'광안리 해변영화관, 기간 한정 야외 상영 이벤트' },
  'busan-VB-1963': { s:'ready_for_candidate', c:'attraction', sc:'ice_rink',          r:'부산실내빙상장, 북구 고정 시설' },
  'busan-VB-1955': { s:'ready_for_candidate', c:'nature',     sc:'water_sports',      r:'광안리 SUP 요가, 해변 고정 운영 프로그램' },
  'busan-VB-1908': { s:'ready_for_candidate', c:'attraction', sc:'water_sports_center',r:'다대포해양레포츠센터, 사하구 공공 시설' },
  'busan-VB-1906': { s:'ready_for_candidate', c:'attraction', sc:'water_sports_center',r:'화명수상레포츠타운, 북구 낙동강 수상 시설' },
  'busan-VB-1899': { s:'manual_review',       c:'',           sc:'',                  r:'"낙동강 감동포구 생태 어드벤처" — 주소 없음, 포구 이름 불명확' },
  'busan-VB-1874': { s:'manual_review',       c:'',           sc:'',                  r:'플로깅 투어 — 투어 오퍼레이터 주소, 고정 체험 장소 별도 확인 필요' },
  'busan-VB-1870': { s:'manual_review',       c:'',           sc:'',                  r:'업사이클 체험, 강서구 산단 주소 — 공방인지 공장인지 불명' },
  'busan-VB-1869': { s:'ready_for_candidate', c:'attraction', sc:'upcycling_workshop',r:'업사이클 청바지 원단 체험, 동구 주소 보유' },
  'busan-VB-1860': { s:'ready_for_candidate', c:'attraction', sc:'dance_experience',  r:'월클 K-POP 댄스 체험관, 진구 KT 건물 내' },
  'busan-VB-1859': { s:'manual_review',       c:'',           sc:'',                  r:'K-POP 댄스학원 소개 — 체험 공간인지 학원인지 불명' },
  'busan-VB-1858': { s:'duplicate_suspected', c:'accommodation', sc:'luxury_hotel',   r:'파라다이스 호텔 부산 — accommodation 중복 추정', ref:'검색키:파라다이스호텔' },
  'busan-VB-1855': { s:'duplicate_suspected', c:'accommodation', sc:'luxury_hotel',   r:'라이언 홀리데이 인 부산(파라다이스 同주소) — accommodation 중복 추정', ref:'검색키:파라다이스호텔' },
  'busan-VB-1854': { s:'ready_for_candidate', c:'attraction', sc:'indoor_entertainment',r:'런닝맨 부산점, 진구 실내 체험관' },
  'busan-VB-1853': { s:'ready_for_candidate', c:'restaurant', sc:'theme_cafe',        r:'클래식 캠퍼, 사상구 캠핑 컨셉 카페' },
  'busan-VB-1852': { s:'ready_for_candidate', c:'nature',     sc:'camping',           r:'부산항 힐링야영장, 동구 초량동 캠핑장' },
  'busan-VB-1799': { s:'ready_for_candidate', c:'nature',     sc:'forest_trail',      r:'구봉산 치유숲길 맨발 황톳길, 동구 수정동' },
  'busan-VB-1769': { s:'ready_for_candidate', c:'event',      sc:'drone_show',        r:'광안리 M 드론라이트쇼, 기간 한정 이벤트' },
  'busan-VB-1768': { s:'reference_only',      c:'',           sc:'',                  r:'"커피 문화 체험존" 소개 기사, 주소 없음, 복수 카페 소개' },
  'busan-VB-1755': { s:'reference_only',      c:'',           sc:'',                  r:'"부산 3대 골목 유토피아" 가이드, 주소 없음' },
  'busan-VB-1754': { s:'ready_for_candidate', c:'attraction', sc:'spa_sauna',         r:'허심청, 동래온천 전통 스파' },
  'busan-VB-1753': { s:'ready_for_candidate', c:'attraction', sc:'spa_sauna',         r:'센텀 스파랜드, 해운대구 대형 스파' },
  'busan-VB-1748': { s:'ready_for_candidate', c:'attraction', sc:'craft_workshop',    r:'그린온더브라운, 수영구 도자기 체험 공방' },
  'busan-VB-1747': { s:'ready_for_candidate', c:'attraction', sc:'art_workshop',      r:'성수미술관 부산서면점, 진구 드로잉 체험' },
  'busan-VB-1743': { s:'ready_for_candidate', c:'attraction', sc:'craft_workshop',    r:'헬로커피하이허니, 수영구 밀랍공예 체험' },
  'busan-VB-1742': { s:'ready_for_candidate', c:'attraction', sc:'perfume_workshop',  r:'향수 원데이 클래스, 진구 주소 보유' },
  'busan-VB-1739': { s:'ready_for_candidate', c:'attraction', sc:'craft_workshop',    r:'영도 터그보트 원데이클래스, 영도구 주소' },
  'busan-VB-1737': { s:'ready_for_candidate', c:'attraction', sc:'tea_class',         r:'봉산마을 꽃차 원데이클래스, 영도구 주소' },
  'busan-VB-1733': { s:'ready_for_candidate', c:'attraction', sc:'craft_workshop',    r:'커스텀 주얼리 클래스, 진구 주소' },
  'busan-VB-1729': { s:'ready_for_candidate', c:'attraction', sc:'cultural_center',   r:'부산전통문화체험관, 서구 고정 시설' },
  'busan-VB-1721': { s:'ready_for_candidate', c:'restaurant', sc:'cooking_class',     r:'코리아쿠킹클래스 밥상 인 부산, 해운대구' },
  'busan-VB-1710': { s:'ready_for_candidate', c:'attraction', sc:'theme_park',        r:'코코스퀘어, 기장군 동부산관광단지 내 체험시설' },
  'busan-VB-1695': { s:'manual_review',       c:'',           sc:'',                  r:'"우시산 인 부산" — 수영구 주소, 업종(찻집·갤러리?) 불명' },
  'busan-VB-1683': { s:'reference_only',      c:'',           sc:'',                  r:'"바다와 강 치유 체험" 가이드, 복수 장소 목록' },
  'busan-VB-1680': { s:'duplicate_suspected', c:'accommodation', sc:'spa_hotel',      r:'클럽디오아시스(엘시티 내 스파) — accommodation 연계 중복 추정', ref:'검색키:엘시티' },
  'busan-VB-1624': { s:'ready_for_candidate', c:'attraction', sc:'adventure_ride',    r:'스카이라인루지 부산, 기장군 체험 시설' },
  'busan-VB-1418': { s:'reference_only',      c:'',           sc:'',                  r:'"한식 쿠킹클래스 in 부산" — 주소 없음, 복수 업체 안내 추정' },
  'busan-VB-1364': { s:'ready_for_candidate', c:'attraction', sc:'river_cruise',      r:'해운대리버크루즈, 해운대구 수영강 선착장' },
  'busan-VB-1316': { s:'ready_for_candidate', c:'attraction', sc:'art_museum',        r:'뮤지엄 원, 해운대구 센텀서로' },
  'busan-VB-1315': { s:'ready_for_candidate', c:'nature',     sc:'diving',            r:'태종대 스쿠버다이빙, 영도구 감지길 전문 업체' },
  'busan-VB-1312': { s:'reference_only',      c:'',           sc:'',                  r:'"부산 어린이 워터파크 3" — 복수 시설 목록' },
  'busan-VB-1187': { s:'reference_only',      c:'',           sc:'',                  r:'"원데이클래스로 채우는 나만의 색" — 복수 공방 목록' },
  'busan-VB-1177': { s:'manual_review',       c:'',           sc:'',                  r:'아트다 아트(아난티코브 미디어아트관?) — 호텔 부속 시설 여부 확인 필요' },
  'busan-VB-1157': { s:'ready_for_candidate', c:'nature',     sc:'ecological_park',   r:'화명생태공원 가을 산책, 북구 고정 공원' },
  'busan-VB-1093': { s:'ready_for_candidate', c:'attraction', sc:'children_museum',   r:'부산칠드런스뮤지엄, 기장군 어린이 박물관' },
  'busan-VB-1066': { s:'ready_for_candidate', c:'attraction', sc:'theater',           r:'드림씨어터, 남구 전포대로 소극장' },
  'busan-VB-1063': { s:'ready_for_candidate', c:'attraction', sc:'craft_center',      r:'한지러브, 해운대구 마린시티 한지 공예' },
  'busan-VB-1057': { s:'ready_for_candidate', c:'attraction', sc:'folk_village',      r:'민속마당, 기장군 철마면 체험 마을' },
  'busan-VB-1034': { s:'ready_for_candidate', c:'attraction', sc:'art_center',        r:'문화예술촌 공방, 진구 시민공원로' },
  'busan-VB-996':  { s:'ready_for_candidate', c:'attraction', sc:'observatory',       r:'부산엑스더스카이 전망대, 해운대구 달맞이길' },
  'busan-VB-990':  { s:'duplicate_suspected', c:'nature',     sc:'ecological_tour',   r:'낙동강생태탐방선 자전거 — busan-VB-336과 동일 운영주 중복 추정', ref:'VB-336' },
  'busan-VB-986':  { s:'ready_for_candidate', c:'attraction', sc:'cultural_village',  r:'금정산성문화체험촌, 금정구 체험 마을' },
  'busan-VB-839':  { s:'ready_for_candidate', c:'nature',     sc:'water_sports',      r:'낙동강 카약, 사상구 삼락동 고정 운영' },
  'busan-VB-44':   { s:'ready_for_candidate', c:'attraction', sc:'aquarium',          r:'부산아쿠아리움, 해운대 해변로 대형 수족관' },
  'busan-VB-338':  { s:'reference_only',      c:'',           sc:'',                  r:'"부산 서핑" 지역 가이드 — VB-139(서프홀릭 특정 업체)와 중복' },
  'busan-VB-339':  { s:'ready_for_candidate', c:'nature',     sc:'water_sports',      r:'패들보드, 광안리 해양레포츠센터 고정 운영' },
  'busan-VB-43':   { s:'ready_for_candidate', c:'attraction', sc:'children_theme_park',r:'키자니아 부산, 해운대구 센텀 어린이 체험관' },
  'busan-VB-448':  { s:'ready_for_candidate', c:'attraction', sc:'martial_arts',      r:'태권도 체험, 남구 고정 도장' },
  'busan-VB-447':  { s:'reference_only',      c:'',           sc:'',                  r:'"어묵 만들기" 가이드 — 주소 없음, 특정 업체 미지정' },
  'busan-VB-446':  { s:'ready_for_candidate', c:'nature',     sc:'outdoor_activity',  r:'산악자전거 라이딩, 북구 화명동 고정 코스' },
  'busan-VB-518':  { s:'manual_review',       c:'',           sc:'',                  r:'부산 로컬푸드 쿠킹클래스(서구 구덕로 186번길 1) — VB-481(15번지)과 같은 거리, 동일 시설 여부 확인 필요' },
  'busan-VB-336':  { s:'ready_for_candidate', c:'nature',     sc:'ecological_tour',   r:'낙동강생태탐방선, 사하구 하단동 고정 선착장' },
  'busan-VB-139':  { s:'ready_for_candidate', c:'nature',     sc:'surfing_school',    r:'서프홀릭, 송정해변 고정 서핑스쿨' },
  'busan-VB-429':  { s:'ready_for_candidate', c:'event',      sc:'street_performance',r:'광안리 버스킹 무대, 기간 한정 이벤트' },
  'busan-VB-434':  { s:'reference_only',      c:'',           sc:'',                  r:'"부산 캠핑장" 복수 시설 목록' },
  'busan-VB-481':  { s:'manual_review',       c:'',           sc:'',                  r:'직접 만드는 한국의 맛(서구 구덕로 186번길 15) — VB-518과 같은 거리, 동일 시설 여부 확인 필요' },
  'busan-VB-473':  { s:'reference_only',      c:'',           sc:'',                  r:'"실내놀이 종결자" 복수 시설 가이드, 주소 없음' },
  'busan-VB-474':  { s:'reference_only',      c:'',           sc:'',                  r:'"온천 힐링" 일반 가이드, 주소 없음' },
  'busan-VB-140':  { s:'ready_for_candidate', c:'attraction', sc:'yacht_tour',        r:'요트탈래 요트투어, 해운대구 더베이101 고정 선착장' },
  'busan-VB-482':  { s:'ready_for_candidate', c:'attraction', sc:'temple_stay',       r:'템플스테이, 진구 백양산로 사찰' },
  'busan-VB-401':  { s:'reference_only',      c:'',           sc:'',                  r:'"부산 크루즈 유람선" 복수 업체 가이드, 주소 없음' },
  'busan-VB-530':  { s:'ready_for_candidate', c:'nature',     sc:'farm_experience',   r:'강서구 농장 체험, 고정 농장 주소 보유' },
  'busan-VB-436':  { s:'ready_for_candidate', c:'nature',     sc:'walking_trail',     r:'회동수원지 황토숲길, 금정구 산책로' },
  'busan-VB-542':  { s:'manual_review',       c:'',           sc:'',                  r:'"다누비열차" — 주소 없음, 낙동강 생태열차 여부 별도 확인 필요' },
};

// ─── CSV 유틸 ─────────────────────────────────────────────────────────────────
function csvCell(v) {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  return (s.includes(',') || s.includes('"')) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(arr) { return arr.map(csvCell).join(','); }
function parseCsv(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const hdr = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const fields = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i+1]==='"') { cur+='"'; i++; } else inQ=!inQ; }
      else if (c === ',' && !inQ) { fields.push(cur); cur = ''; }
      else cur += c;
    }
    fields.push(cur);
    const obj = {}; hdr.forEach((h,i) => { obj[h]=(fields[i]??'').trim(); }); return obj;
  });
}

// ─── canonical 키워드 검색 ────────────────────────────────────────────────────
function buildCanonicalIndex(canonItems) {
  return canonItems.map(c => ({ id: c.canonical_id, title: c.title_ko || '' }));
}
function findCanonicalMatch(keyword, index) {
  if (!keyword) return '';
  const kw = keyword.replace('검색키:', '').trim();
  const hit = index.find(c => c.title.includes(kw));
  return hit ? hit.id : '(canonical에서 미발견 — 수동 확인 필요)';
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('=== TASK-DATA-BUSAN-UNKNOWN-CATEGORY-REVIEW-07 시작 ===');

  const allItems = JSON.parse(fs.readFileSync(IN_INTEGRATED, 'utf8'));
  const targets = allItems.filter(r => r.category_compatibility_method === 'unknown_allowed');
  const canonItems = parseCsv(fs.readFileSync(IN_CANONICAL, 'utf8'));
  const canonIndex = buildCanonicalIndex(canonItems);

  console.log(`대상: ${targets.length}건 (shopping:${targets.filter(r=>r.content_type==='shopping').length}, experience:${targets.filter(r=>r.content_type==='experience').length})`);

  if (targets.length !== 173) {
    console.error(`[HARD STOP] 대상 건수 ${targets.length}≠173`); process.exit(1);
  }

  // 분류 적용
  const rows = [];
  for (const item of targets) {
    const cid = item.candidate_id;
    const cl = CLASSIFY[cid];
    if (!cl) {
      console.error(`[HARD STOP] 분류 테이블 누락: ${cid}`); process.exit(1);
    }

    // category 허용값 검증
    if (cl.s === 'ready_for_candidate' && !ALLOWED_CATEGORIES.has(cl.c)) {
      console.error(`[HARD STOP] 허용되지 않는 category "${cl.c}" @ ${cid}`); process.exit(1);
    }
    if (cl.s === 'ready_for_candidate' && !cl.sc) {
      console.error(`[HARD STOP] subcategory 공백 @ ${cid}`); process.exit(1);
    }

    // canonical 중복 참조 해소
    const canonRef = cl.ref?.startsWith('검색키:')
      ? findCanonicalMatch(cl.ref, canonIndex)
      : (cl.ref || '');

    rows.push({
      candidate_id:     cid,
      title_ko:         item.title_ko,
      content_type:     item.content_type,
      address:          item.address || '',
      review_status:    cl.s,
      category:         cl.c || '',
      subcategory:      cl.sc || '',
      reason:           cl.r,
      canonical_id_ref: cl.s === 'duplicate_suspected' ? canonRef : '',
      needs_new_category: (cl.c === '' && cl.s === 'ready_for_candidate') ? 'Y' : '',
    });
  }

  // ─── 검증 ───────────────────────────────────────────────────────────────────
  console.log('\n=== 검증 ===');
  const total = rows.length;
  if (total !== 173) { console.error(`[HARD STOP] 분류 총수 ${total}≠173`); process.exit(1); }
  console.log(`  전체 173건 추적 ✓`);

  const shoppingCount = rows.filter(r=>r.content_type==='shopping').length;
  const expCount = rows.filter(r=>r.content_type==='experience').length;
  if (shoppingCount !== 53)  { console.error(`[HARD STOP] shopping ${shoppingCount}≠53`); process.exit(1); }
  if (expCount !== 120)      { console.error(`[HARD STOP] experience ${expCount}≠120`); process.exit(1); }
  console.log(`  shopping:53 ✓  experience:120 ✓`);

  const byStatus = {};
  for (const r of rows) byStatus[r.review_status] = (byStatus[r.review_status]||0)+1;
  const statusSum = Object.values(byStatus).reduce((a,b)=>a+b,0);
  if (statusSum !== 173) { console.error(`[HARD STOP] 상태별 합계 ${statusSum}≠173`); process.exit(1); }
  console.log(`  상태별 합계 ✓ :`, JSON.stringify(byStatus));

  // ready 항목의 category 허용값 위반 0
  const badCategory = rows.filter(r => r.review_status==='ready_for_candidate' && !ALLOWED_CATEGORIES.has(r.category));
  if (badCategory.length > 0) { console.error(`[HARD STOP] category 허용값 위반 ${badCategory.length}건`); process.exit(1); }
  console.log('  category 허용값 위반 0 ✓');

  // ready 항목의 subcategory 공백 0
  const blankSc = rows.filter(r => r.review_status==='ready_for_candidate' && !r.subcategory);
  if (blankSc.length > 0) { console.error(`[HARD STOP] subcategory 공백 ${blankSc.length}건`); process.exit(1); }
  console.log('  subcategory 공백 0 ✓');

  const readyRows = rows.filter(r=>r.review_status==='ready_for_candidate');
  const byCategory = {};
  for (const r of readyRows) byCategory[r.category]=(byCategory[r.category]||0)+1;
  console.log(`  ready_for_candidate: ${readyRows.length}건`, JSON.stringify(byCategory));

  console.log('  모든 검증 조건 충족 → PASS');

  // ─── 저장 ───────────────────────────────────────────────────────────────────
  const HDR = ['candidate_id','title_ko','content_type','address','review_status','category','subcategory','reason','canonical_id_ref','needs_new_category'];
  const csvLines = [csvRow(HDR), ...rows.map(r => csvRow(HDR.map(h=>r[h]||'')))];
  fs.writeFileSync(OUT_CSV, csvLines.join('\n'), 'utf8');
  console.log(`\n  CSV: ${OUT_CSV} (${rows.length}행)`);

  // 지표
  const dupRows = rows.filter(r=>r.review_status==='duplicate_suspected');
  const metrics = {
    run_date: TODAY,
    task: 'TASK-DATA-BUSAN-UNKNOWN-CATEGORY-REVIEW-07',
    overall: 'PASS',
    total_reviewed: 173,
    by_content_type: { shopping: shoppingCount, experience: expCount },
    by_status: byStatus,
    ready_for_candidate: {
      total: readyRows.length,
      by_category: byCategory,
    },
    duplicate_suspected: {
      total: dupRows.length,
      accommodation_type: dupRows.filter(r=>r.category==='accommodation').length,
      market_type: dupRows.filter(r=>r.subcategory==='market'||r.subcategory==='food_market'||r.subcategory==='seafood_market').length,
      other: dupRows.filter(r=>r.category!=='accommodation'&&r.subcategory!=='market'&&r.subcategory!=='food_market'&&r.subcategory!=='seafood_market').length,
    },
    new_category_proposal: {
      shopping: { needed: true, reason: '백화점·면세점·소품샵 31건이 attraction으로 임시 매핑됨', count: rows.filter(r=>r.content_type==='shopping'&&r.review_status==='ready_for_candidate').length },
      outdoor_activity: { needed: true, reason: '서핑·클라이밍·카약 등 스포츠 체험이 nature로 임시 매핑됨', count: rows.filter(r=>r.subcategory==='water_sports'||r.subcategory==='surfing_school'||r.subcategory==='climbing_gym'||r.subcategory==='outdoor_activity').length },
    },
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(OUT_METRICS, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  metrics: ${OUT_METRICS}`);

  // 보고서
  const readyShopping = rows.filter(r=>r.content_type==='shopping'&&r.review_status==='ready_for_candidate').length;
  const readyExp = rows.filter(r=>r.content_type==='experience'&&r.review_status==='ready_for_candidate').length;

  const md = `# TASK-DATA-BUSAN-UNKNOWN-CATEGORY-REVIEW-07 완료 보고서

**날짜:** ${TODAY}
**상태:** **PASS ✓**

---

## 1. 검토 방법

전체 173건의 \`title_ko\` + \`address\` 필드를 직접 검토하여 분류 결정.
URL 방문(Playwright) 없이 텍스트 기반 검토 완료.
(URL 방문이 필요한 항목은 \`manual_review\`로 분류)

---

## 2. 상태별 건수

| review_status | shopping | experience | 합계 |
|---|---|---|---|
| ready_for_candidate | ${readyShopping} | ${readyExp} | ${readyRows.length} |
| duplicate_suspected | ${rows.filter(r=>r.content_type==='shopping'&&r.review_status==='duplicate_suspected').length} | ${rows.filter(r=>r.content_type==='experience'&&r.review_status==='duplicate_suspected').length} | ${byStatus['duplicate_suspected']||0} |
| reference_only | ${rows.filter(r=>r.content_type==='shopping'&&r.review_status==='reference_only').length} | ${rows.filter(r=>r.content_type==='experience'&&r.review_status==='reference_only').length} | ${byStatus['reference_only']||0} |
| manual_review | ${rows.filter(r=>r.content_type==='shopping'&&r.review_status==='manual_review').length} | ${rows.filter(r=>r.content_type==='experience'&&r.review_status==='manual_review').length} | ${byStatus['manual_review']||0} |
| exclude_non_place | ${rows.filter(r=>r.content_type==='shopping'&&r.review_status==='exclude_non_place').length} | ${rows.filter(r=>r.content_type==='experience'&&r.review_status==='exclude_non_place').length} | ${byStatus['exclude_non_place']||0} |
| **합계** | **53** | **120** | **173** |

---

## 3. ready_for_candidate category 분포

| category | 건수 |
|---|---|
${Object.entries(byCategory).map(([c,n])=>`| ${c} | ${n} |`).join('\n')}
| **합계** | **${readyRows.length}** |

### subcategory 분포 (주요)

| subcategory | 건수 |
|---|---|
${(() => {
    const sc = {}; readyRows.forEach(r => { sc[r.subcategory]=(sc[r.subcategory]||0)+1; });
    return Object.entries(sc).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`| ${s} | ${n} |`).join('\n');
  })()}

---

## 4. duplicate_suspected (${byStatus['duplicate_suspected']||0}건)

| 유형 | 건수 |
|---|---|
| accommodation (호텔·리조트) | ${metrics.duplicate_suspected.accommodation_type} |
| market (시장·상권) | ${metrics.duplicate_suspected.market_type} |
| 기타 (탐방선 중복 등) | ${metrics.duplicate_suspected.other} |

---

## 5. exclude_non_place (${byStatus['exclude_non_place']||0}건) — 주요 유형

- 기간 선정 리스트 콘텐츠 ("부산관광기념품10선" 3건)
- 복수 장소 가이드 ("부산 백화점에 놀러가자!" 등)
- 브랜드 홍보·행사 후기 (주소 없음)
- 제목 미완성 콘텐츠

---

## 6. manual_review (${byStatus['manual_review']||0}건) — 확인 필요 이유

| candidate_id | 사유 |
|---|---|
${rows.filter(r=>r.review_status==='manual_review').map(r=>`| ${r.candidate_id} | ${r.reason} |`).join('\n')}

---

## 7. 새 category 필요성

| 제안 category | 해당 건수 | 현재 임시 매핑 | 이유 |
|---|---|---|---|
| shopping | ${metrics.new_category_proposal.shopping.count} | attraction | 백화점·면세점·소품샵은 attraction과 의미 차이 명확 |
| outdoor_activity | ${metrics.new_category_proposal.outdoor_activity.count} | nature | 서핑·카약·클라이밍 등 스포츠는 자연 방문과 목적 상이 |

> 이번 태스크에서 신규 category 적용 금지 원칙 준수. 위 유형은 5개 기존 category 내 최적 매핑으로 처리.

---

## 8. 검증 조건

| 조건 | 결과 |
|---|---|
| shopping 53 + experience 120 = 173건 전부 추적 | ✓ |
| 상태별 합계 173건 | ✓ |
| ready_for_candidate category 허용값 위반 0 | ✓ |
| subcategory 공백 0 | ✓ |
| 원본 integrated candidates 무변경 | ✓ (읽기 전용) |
| 운영 DB 미반영 | ✓ |

---

## 9. 생성 파일

| 파일 | 내용 |
|---|---|
| busan-unknown-category-review.csv | 173건 분류 결과 |
| busan-unknown-category-review-metrics.json | 지표 요약 |
| busan-unknown-category-review-07-report.md | 본 보고서 |

---

TASK-DATA-BUSAN-UNKNOWN-CATEGORY-REVIEW-07 unknown_allowed 분류 검토 완료.
`;
  fs.writeFileSync(OUT_REPORT, md, 'utf8');
  console.log(`  report: ${OUT_REPORT}`);
  console.log('\nTASK-DATA-BUSAN-UNKNOWN-CATEGORY-REVIEW-07 unknown_allowed 분류 검토 완료.');
}

try { main(); } catch(e) { console.error('[FATAL]', e.message, e.stack); process.exit(1); }
