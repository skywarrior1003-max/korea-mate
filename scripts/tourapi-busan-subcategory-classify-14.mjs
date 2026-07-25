/**
 * TASK-DATA-BUSAN-SUBCATEGORY-CLASSIFY-14
 * 활성 1,642건 중 미분류 subcategory 전체 규칙 기반 분류 +
 * 기존 비허용 subcategory 132건 허용 목록으로 정규화
 *
 * 분류 우선순위: content_type → VB유형 → 원천서비스 → 제목 키워드
 * 두 개 이상 증거 일치 시 classified_rule / 단일 증거 강신호 → classified_rule
 * 모호·충돌·이동형 → manual_review
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CSV_IN  = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv');
const JSON_IN = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json');
const CSV_TMP = path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.csv.tmp');
const JSON_TMP= path.join(ROOT, 'data/tourapi/candidates/busan/busan-integrated-candidates.json.tmp');
const MR_CSV  = path.join(ROOT, 'data/tourapi/candidates/busan/busan-subcategory-manual-review.csv');
const MFILE   = path.join(ROOT, 'data/tourapi/reports/busan/busan-integrated-candidates-metrics.json');

// ── CSV 유틸 ────────────────────────────────────────────────
function parseCSVLine(line) {
  const cells = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur); return cells;
}
function parseCSV(text) {
  const lines = text.split('\n');
  const hdr = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCSVLine(lines[i]);
    const row = {};
    hdr.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
    rows.push(row);
  }
  return { hdr, rows };
}
function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function rowToLine(row, hdr) { return hdr.map(h => escapeCSV(row[h])).join(','); }

// ── 허용 subcategory ─────────────────────────────────────────
const ALLOWED = {
  attraction:     new Set(['landmark','museum','gallery','cultural_site','historic_site','temple',
                           'observatory','theme_park','spa','market','shopping','retail_store',
                           'cultural_space','village','park','sports_facility','family_attraction','other_attraction']),
  nature:         new Set(['beach','mountain','trail','island','river','forest',
                           'coastal_walk','outdoor_activity','ecological_site','scenic_view','other_nature']),
  restaurant:     new Set(['korean_food','seafood','cafe','dessert_shop','bakery',
                           'market_food','cooking_class','bar','international_food','other_restaurant']),
  event:          new Set(['festival','performance','exhibition','seasonal_event','cultural_event','other_event']),
  accommodation:  new Set(['hotel','resort','guesthouse','hostel','pension','hanok','camping','other_accommodation']),
};

// ── 기존 비허용 subcategory 정규화 맵 (category별 검증 포함) ──
// format: oldValue → {target, cat: 적용 가능 category 배열}
const LEGACY_NORM = {
  'shopping_mall':        { target: 'shopping',         cats: ['attraction'] },
  'lifestyle_shop':       { target: 'retail_store',     cats: ['attraction'] },
  'shopping_street':      { target: 'shopping',         cats: ['attraction'] },
  'specialty_shop':       { target: 'retail_store',     cats: ['attraction'] },
  'character_shop':       { target: 'retail_store',     cats: ['attraction'] },
  'souvenir_shop':        { target: 'retail_store',     cats: ['attraction'] },
  'department_store':     { target: 'shopping',         cats: ['attraction'] },
  'duty_free':            { target: 'shopping',         cats: ['attraction'] },
  'food_market':          { target: 'market',           cats: ['attraction'] },
  'seafood_market':       { target: 'market',           cats: ['attraction'] },
  'theater':              { target: 'cultural_space',   cats: ['attraction'] },
  'lifestyle_space':      { target: 'cultural_space',   cats: ['attraction'] },
  'fishing_village':      { target: 'village',          cats: ['attraction'] },
  'esports_arena':        { target: 'sports_facility',  cats: ['attraction'] },
  'pet_park':             { target: 'park',             cats: ['attraction'] },
  'sports_bar':           { target: 'bar',              cats: ['restaurant'] },
  'climbing_gym':         { target: 'sports_facility',  cats: ['attraction'] },
  'pet_center':           { target: 'other_attraction', cats: ['attraction'] },
  'pet_cafe':             { target: 'cafe',             cats: ['restaurant','attraction'] },
  'pet_store':            { target: 'retail_store',     cats: ['attraction'] },
  'dog_park':             { target: 'park',             cats: ['attraction'] },
  'lighthouse':           { target: 'landmark',         cats: ['attraction'] },
  'experience_center':    { target: 'cultural_space',   cats: ['attraction'] },
  'boutique_hotel':       { target: 'hotel',            cats: ['accommodation'] },
  'luxury_resort':        { target: 'resort',           cats: ['accommodation'] },
  'luxury_hotel':         { target: 'hotel',            cats: ['accommodation'] },
  'theme_cafe':           { target: 'cafe',             cats: ['restaurant'] },
  'bakery_experience':    { target: 'bakery',           cats: ['restaurant'] },
  'wellness_center':      { target: 'spa',              cats: ['attraction'] },
  'perfume_workshop':     { target: 'other_attraction', cats: ['attraction'] },
  'craft_workshop':       { target: 'other_attraction', cats: ['attraction'] },
  'walking_trail':        { target: 'trail',            cats: ['nature'] },
  'craft_center':         { target: 'cultural_space',   cats: ['attraction'] },
  'seafood_experience':   { target: 'other_restaurant', cats: ['restaurant'] },
  'digital_art_museum':   { target: 'museum',           cats: ['attraction'] },
  'food_experience':      { target: 'other_restaurant', cats: ['restaurant'] },
  'beach_cinema':         { target: 'other_attraction', cats: ['attraction'] },
  'ice_rink':             { target: 'sports_facility',  cats: ['attraction'] },
  'water_sports':         { target: 'outdoor_activity', cats: ['nature'] },
  'water_sports_center':  { target: 'outdoor_activity', cats: ['nature','attraction'] },
  'upcycling_workshop':   { target: 'other_attraction', cats: ['attraction'] },
  'dance_experience':     { target: 'other_attraction', cats: ['attraction'] },
  'indoor_entertainment': { target: 'family_attraction',cats: ['attraction'] },
  'forest_trail':         { target: 'trail',            cats: ['nature'] },
  'drone_show':           { target: 'other_event',      cats: ['event'] },
  'spa_sauna':            { target: 'spa',              cats: ['attraction'] },
  'art_workshop':         { target: 'other_attraction', cats: ['attraction'] },
  'tea_class':            { target: 'cooking_class',    cats: ['restaurant'] },
  'cultural_center':      { target: 'cultural_space',   cats: ['attraction'] },
  'spa_waterpark':        { target: 'spa',              cats: ['attraction'] },
  'adventure_ride':       { target: 'theme_park',       cats: ['attraction'] },
  'river_cruise':         { target: 'outdoor_activity', cats: ['nature','attraction'] },
  'art_museum':           { target: 'gallery',          cats: ['attraction'] },
  'diving':               { target: 'outdoor_activity', cats: ['nature'] },
  'ecological_park':      { target: 'ecological_site',  cats: ['nature'] },
  'children_museum':      { target: 'museum',           cats: ['attraction'] },
  'folk_village':         { target: 'village',          cats: ['attraction'] },
  'art_center':           { target: 'cultural_space',   cats: ['attraction'] },
  'cultural_village':     { target: 'village',          cats: ['attraction'] },
  'aquarium':             { target: 'family_attraction',cats: ['attraction'] },
  'children_theme_park':  { target: 'family_attraction',cats: ['attraction'] },
  'martial_arts':         { target: 'sports_facility',  cats: ['attraction'] },
  'ecological_tour':      { target: 'outdoor_activity', cats: ['nature'] },
  'surfing_school':       { target: 'outdoor_activity', cats: ['nature'] },
  'street_performance':   { target: 'performance',      cats: ['event'] },
  'yacht_tour':           { target: 'outdoor_activity', cats: ['nature'] },
  'temple_stay':          { target: 'temple',           cats: ['attraction'] },
  'farm_experience':      { target: 'other_attraction', cats: ['attraction'] },
};

// ── 키워드 규칙 ───────────────────────────────────────────────
const KW = {
  // ── restaurant ──
  seafood: ['회','횟집','활어','생선','낙지','문어','해물','해산물','꽃게','갈치',
            '고등어','아귀','복어','굴','장어','멍게','성게','대구','참치','조개',
            '가리비','전복','꼴뚜기','삼치','방어','도다리','광어','우럭','명태',
            '오징어','홍합','새우','어묵','게장','산오징어','갑오징어','물회',
            '생복','뱀장어','뻘낙지','쭈꾸미','복국','복어국','아귀탕','해물탕',
            '알탕','어탕','생선조림','갈치조림','고등어조림','농어','숭어','삼치구이'],
  korean_food: ['국밥','갈비','삼겹','불고기','보쌈','족발','순대','냉면','막국수',
                '삼계탕','닭갈비','선지','감자탕','추어탕','된장','청국장','비빔밥',
                '설렁탕','육개장','해장국','곱창','막창','떡볶이','칼국수','수제비',
                '만두','잡채','순두부','두부','전통음식','한식','김치','낙지볶음',
                '흑돼지','통닭','찜닭','제육','돈육','쌈밥','보리밥','한정식',
                '촌밥','솥밥','밀면','재첩','동래파전','파전','문어숙회',
                '꼬리곰탕','곰탕','뚝배기','장터국','한우','토종닭','흑염소',
                '곤드레','완당','산채','들깨','된장찌개','청국장찌개','삼계','닭곰탕'],
  cafe: ['카페','cafe','coffee','커피','로스터리','로스팅'],
  dessert_shop: ['디저트','아이스크림','빙수','팥빙수','소프트크림','케이크',
                 '마카롱','크로플','타르트','와플','젤라또','아이스','빙과'],
  bakery: ['빵집','베이커리','bakery','제과','브레드','bread','빵'],
  bar: ['바','술집','주점','맥주','호프','칵테일','와인바','막걸리','포차','이자카야','펍'],
  international_food: ['돈가스','우동','라멘','스시','초밥','일식','피자','파스타',
                       '이탈리안','중식','짬뽕','짜장','양식','태국','베트남','쌀국수',
                       '인도','멕시코','타코','양꼬치','마라탕','마라'],
  cooking_class: ['쿠킹','요리교실','요리체험','요리클래스'],
  market_food: ['어시장','수산시장','포장마차','노점','수산물 시장'],

  // ── attraction ──
  museum: ['박물관','기념관','전시관','역사관','유물관','생활사박물관','민속박물관',
           '어린이박물관','어류박물관','유리박물관','영화박물관','체험박물관','신발관',
           '과학관','문학관','민속관','자연사관','전쟁기념관','항공우주박물관','조각공원박물관',
           '정보통신박물관','체험관'],
  gallery: ['미술관','갤러리','gallery','전시실','아트뮤지엄','아트홀'],
  temple: ['사찰','암자','대웅전','법당','선원','포교원','사원','교당'],
  historic_site: ['유적','사적','성지','성벽','독립운동','항일','임시정부','3.1운동',
                  '의병','고분','고인돌','봉수대','왜성','진지','산성','왕릉',
                  '충렬','현충','의총','순교','전적지','기념비','읍성','향교',
                  '생가','사지','절터','관아','객사','동헌','서원건물'],
  observatory: ['전망대','하늘전망대','루프탑전망','타워전망'],
  theme_park: ['테마파크','어드벤처파크','놀이공원','놀이동산','에코랜드'],
  spa: ['온천','스파','찜질','목욕탕','사우나'],
  market: ['재래시장','전통시장','상설시장','오일장','새벽시장','시장','마켓'],
  shopping: ['쇼핑몰','면세점','아울렛','백화점','지하도상가','상가','복합쇼핑'],
  retail_store: ['공방','도예','칠기','전통공예','기념품','공예품','갤러리숍'],
  cultural_space: ['문화원','문화공간','문화센터','예술회관','복합문화','아트센터',
                   '문화예술','창작공간','문화재단','미디어센터','청자미디어','콘텐츠센터',
                   '국악원','시민회관','문화관','미디어아트','창작마루',
                   '영화의 전당','전당','예술의전당','콘서트홀','아트홀'],
  cultural_site: ['민속촌','문화재','문화마당','문화유산'],
  village: ['마을','벽화마을','특화거리','골목길','이바구길','감천마을','산복도로',
            '문화거리','예술거리','인쇄골목','상해거리','의 거리','차이나타운'],
  park: ['공원','근린공원','시민공원','국립공원','생태공원','어린이공원','해변공원',
         '친수공원','야외공원','강변공원','도시공원','경마공원','렛츠런'],
  sports_facility: ['빙상장','사격장','인라인','컨트리클럽','수련관','수영장','볼링',
                    '레이저태그','클라이밍','승마','국궁','골프','스크린','실내스포츠'],
  family_attraction: ['키자니아','어린이','아쿠아리움','수족관','동물원','키즈카페','놀이터'],
  landmark: ['대교','타워','항','영도다리','부산항','자갈치','BIFF','광장',
             '부두','철길마을','케이블카','해상','누리마루','스카이워크',
             '해수욕장','해변','백사장','오륙도','태종대','감천문화','청사포',
             '포구','항구','다리','탑','봉수대전망','전망봉'],

  // ── nature ──
  beach: ['해수욕장','해변','사빈','모래사장','백사장'],
  mountain: ['산','봉','고개','능선','정상'],
  trail: ['갈맷길','해파랑길','남파랑길','둘레길','산책로','탐방로','올레길','자전거길',
          '무장애길','무장애숲길','보행로','트레킹','하이킹','로드(길)'],
  coastal_walk: ['해안산책로','볼레길','해안누리길','해안로','해안보행로'],
  island: ['섬','도서','가덕도','영도','오륙도','거가도'],
  river: ['강','낙동강','수영강','수원지','저수지','호수'],
  forest: ['숲','산림','수목원','편백','산책숲'],
  outdoor_activity: ['SUP','서핑','요트','낚시','수상레포츠','해양레포츠','스쿠버',
                     '다이빙','카약','뱃놀이','조정','래프팅'],
  ecological_site: ['생태','자연','습지','갯벌','수원지','보호구역','식물원'],
  scenic_view: ['전망','뷰','야경','경관','조망','panorama'],

  // ── event ──
  festival: ['축제','페스티벌','페스타','영화제','불꽃축제','부산국제','부산영화','마켓'],
  performance: ['공연','콘서트','뮤지컬','연극','오페라','음악회','연주','버스킹','쇼'],
  exhibition: ['전시','박람회','엑스포','아트페어','비엔날레','사진전','작품전'],
  seasonal_event: ['봄꽃','봄축제','여름축제','가을','겨울','크리스마스','야경','빛'],
  cultural_event: ['문화행사','포럼','강연','심포지엄','학술','문화마당'],

  // ── accommodation ──
  hotel: ['호텔','hotel'],
  resort: ['리조트','resort'],
  guesthouse: ['게스트하우스','guesthouse'],
  hostel: ['호스텔','hostel','청년','유스'],
  pension: ['펜션','pension','빌라','방갈로','하우스','민박','민박집'],
  hanok: ['한옥','한옥마을'],
  camping: ['야영장','캠핑장','글램핑','카라반','오토캠핑','캠프','카라반파크'],
};

// ── 분류 함수 ─────────────────────────────────────────────────
function matchKeywords(title, kwList) {
  const t = title || '';
  return kwList.some(kw => t.includes(kw));
}

function classifyRestaurant(row) {
  const t = row.title_ko || '';
  const ct = row.content_type || '';
  // 강신호 순서 (단일 키워드도 해당 분야 명확 → classified_rule)
  if (matchKeywords(t, KW.seafood))          return { sub: 'seafood',           status: 'classified_rule', evidence: 'title_keyword:seafood' };
  if (matchKeywords(t, KW.cafe))             return { sub: 'cafe',              status: 'classified_rule', evidence: 'title_keyword:cafe' };
  if (matchKeywords(t, KW.dessert_shop))     return { sub: 'dessert_shop',      status: 'classified_rule', evidence: 'title_keyword:dessert' };
  if (matchKeywords(t, KW.bakery))           return { sub: 'bakery',            status: 'classified_rule', evidence: 'title_keyword:bakery' };
  if (matchKeywords(t, KW.bar))              return { sub: 'bar',               status: 'classified_rule', evidence: 'title_keyword:bar' };
  if (matchKeywords(t, KW.cooking_class))    return { sub: 'cooking_class',     status: 'classified_rule', evidence: 'title_keyword:cooking' };
  if (matchKeywords(t, KW.international_food)) return { sub: 'international_food', status: 'classified_rule', evidence: 'title_keyword:intl' };
  if (matchKeywords(t, KW.korean_food))      return { sub: 'korean_food',       status: 'classified_rule', evidence: 'title_keyword:korean' };
  if (matchKeywords(t, KW.market_food))      return { sub: 'market_food',       status: 'classified_rule', evidence: 'title_keyword:market_food' };
  // 제목에 음식 유형이 없으면 other_restaurant
  return { sub: 'other_restaurant', status: 'classified_rule', evidence: 'category=restaurant,no_food_keyword' };
}

function classifyAttraction(row) {
  const t = row.title_ko || '';
  const ct = row.content_type || '';

  // content_type으로 1차 분기
  if (ct === '레포츠') return { sub: 'sports_facility', status: 'classified_high', evidence: 'content_type:레포츠+category:attraction' };
  if (ct === '쇼핑') {
    if (matchKeywords(t, KW.market))          return { sub: 'market',    status: 'classified_high', evidence: 'content_type:쇼핑+keyword:market' };
    if (matchKeywords(t, KW.shopping))        return { sub: 'shopping',  status: 'classified_high', evidence: 'content_type:쇼핑+keyword:shopping' };
    if (matchKeywords(t, KW.retail_store))    return { sub: 'retail_store', status: 'classified_rule', evidence: 'content_type:쇼핑+keyword:craft' };
    return { sub: 'shopping', status: 'classified_rule', evidence: 'content_type:쇼핑,no_detail' };
  }
  if (ct === '문화시설') {
    if (matchKeywords(t, KW.museum))          return { sub: 'museum',        status: 'classified_high', evidence: 'content_type:문화시설+keyword:museum' };
    if (matchKeywords(t, KW.gallery))         return { sub: 'gallery',       status: 'classified_high', evidence: 'content_type:문화시설+keyword:gallery' };
    if (matchKeywords(t, KW.cultural_space))  return { sub: 'cultural_space',status: 'classified_high', evidence: 'content_type:문화시설+keyword:cultural_space' };
    if (matchKeywords(t, KW.family_attraction)) return { sub: 'family_attraction', status: 'classified_rule', evidence: 'content_type:문화시설+keyword:kids' };
    if (matchKeywords(t, KW.sports_facility)) return { sub: 'sports_facility', status: 'classified_rule', evidence: 'content_type:문화시설+keyword:sports' };
    return { sub: 'cultural_site', status: 'classified_rule', evidence: 'content_type:문화시설,no_detail' };
  }

  // 역사·추모시설 우선 분류: 충렬사·향교 등이 temple suffix보다 먼저 잡혀야 함
  if (matchKeywords(t, KW.historic_site))     return { sub: 'historic_site',    status: 'classified_rule', evidence: 'keyword:historic' };
  // 기독교 교회·성당 → cultural_site (불교 사찰 suffix 이전에 분기)
  if (['교회', '성당'].some(kw => t.includes(kw)))
    return { sub: 'cultural_site', status: 'classified_rule', evidence: 'keyword:church_cathedral' };

  // 불교 사찰명: 제목이 'N자 + 사'로 끝나는 고유명사 패턴
  // NON_TEMPLE_SUFFIX 삭제: character-class 오작동으로 홍법사·금수사·운수사가 오분류됨
  const tClean = t.replace(/\s*\(.*\)$/, '').trim();
  const TEMPLE_SUFFIX = /^[가-힣]{2,}사$/;
  if (TEMPLE_SUFFIX.test(tClean))
    return { sub: 'temple', status: 'classified_rule', evidence: 'title_suffix:사(寺)_pattern' };

  // 제목 키워드 체계적 매핑
  if (matchKeywords(t, KW.museum))            return { sub: 'museum',           status: 'classified_rule', evidence: 'keyword:museum' };
  if (matchKeywords(t, KW.gallery))           return { sub: 'gallery',          status: 'classified_rule', evidence: 'keyword:gallery' };
  if (matchKeywords(t, KW.temple))            return { sub: 'temple',           status: 'classified_rule', evidence: 'keyword:temple' };
  if (matchKeywords(t, KW.observatory))       return { sub: 'observatory',      status: 'classified_rule', evidence: 'keyword:observatory' };
  if (matchKeywords(t, KW.theme_park))        return { sub: 'theme_park',       status: 'classified_rule', evidence: 'keyword:themepark' };
  if (matchKeywords(t, KW.spa))               return { sub: 'spa',              status: 'classified_rule', evidence: 'keyword:spa' };
  if (matchKeywords(t, KW.market))            return { sub: 'market',           status: 'classified_rule', evidence: 'keyword:market' };
  if (matchKeywords(t, KW.shopping))          return { sub: 'shopping',         status: 'classified_rule', evidence: 'keyword:shopping' };
  if (matchKeywords(t, KW.sports_facility))   return { sub: 'sports_facility',  status: 'classified_rule', evidence: 'keyword:sports' };
  if (matchKeywords(t, KW.family_attraction)) return { sub: 'family_attraction',status: 'classified_rule', evidence: 'keyword:kids' };
  if (matchKeywords(t, KW.cultural_space))    return { sub: 'cultural_space',   status: 'classified_rule', evidence: 'keyword:cultural_space' };
  if (matchKeywords(t, KW.village))           return { sub: 'village',          status: 'classified_rule', evidence: 'keyword:village' };
  if (matchKeywords(t, KW.park))              return { sub: 'park',             status: 'classified_rule', evidence: 'keyword:park' };
  if (matchKeywords(t, KW.landmark))          return { sub: 'landmark',         status: 'classified_rule', evidence: 'keyword:landmark' };
  if (matchKeywords(t, KW.retail_store))      return { sub: 'retail_store',     status: 'classified_rule', evidence: 'keyword:craft' };
  return { sub: 'other_attraction', status: 'classified_rule', evidence: 'category=attraction,no_keyword' };
}

function classifyNature(row) {
  const t = row.title_ko || '';
  // 캠핑 → category 충돌 manual_review
  if (matchKeywords(t, KW.camping))
    return { sub: null, status: 'manual_review', evidence: 'camping_in_nature:recommend_accommodation/camping' };
  // 이동형 프로그램 manual_review
  const mobile = ['요트투어','요트 투어','서핑스쿨','서핑학교','서프마린'];
  if (mobile.some(kw => t.includes(kw)))
    return { sub: null, status: 'manual_review', evidence: 'mobile_program:no_fixed_spot' };

  if (matchKeywords(t, KW.beach))         return { sub: 'beach',           status: 'classified_high', evidence: 'keyword:beach' };
  if (matchKeywords(t, KW.mountain))      return { sub: 'mountain',        status: 'classified_high', evidence: 'keyword:mountain' };
  if (matchKeywords(t, KW.coastal_walk))  return { sub: 'coastal_walk',    status: 'classified_high', evidence: 'keyword:coastal_walk' };
  if (matchKeywords(t, KW.trail))         return { sub: 'trail',           status: 'classified_high', evidence: 'keyword:trail' };
  if (matchKeywords(t, KW.island))        return { sub: 'island',          status: 'classified_high', evidence: 'keyword:island' };
  if (matchKeywords(t, KW.river))         return { sub: 'river',           status: 'classified_rule', evidence: 'keyword:river' };
  if (matchKeywords(t, KW.forest))        return { sub: 'forest',          status: 'classified_high', evidence: 'keyword:forest' };
  if (matchKeywords(t, KW.outdoor_activity)) return { sub: 'outdoor_activity', status: 'classified_rule', evidence: 'keyword:outdoor' };
  if (matchKeywords(t, KW.ecological_site))  return { sub: 'ecological_site',  status: 'classified_rule', evidence: 'keyword:ecological' };
  if (matchKeywords(t, KW.scenic_view))   return { sub: 'scenic_view',     status: 'classified_rule', evidence: 'keyword:view' };
  // 길 포함 제목 → trail (갈맷길, 해파랑길, 볼레길 등 코스명)
  if (t.includes('길') && (t.includes('코스') || t.includes('길]') || t.includes('갈맷') || t.includes('해파랑') || t.includes('남파랑')))
    return { sub: 'trail', status: 'classified_rule', evidence: 'keyword:coarse_trail' };
  return { sub: 'other_nature', status: 'classified_rule', evidence: 'category=nature,no_keyword' };
}

function classifyEvent(row) {
  const t = row.title_ko || '';
  if (matchKeywords(t, KW.exhibition))       return { sub: 'exhibition',    status: 'classified_rule', evidence: 'keyword:exhibition' };
  if (matchKeywords(t, KW.performance))      return { sub: 'performance',   status: 'classified_rule', evidence: 'keyword:performance' };
  if (matchKeywords(t, KW.seasonal_event))   return { sub: 'seasonal_event',status: 'classified_rule', evidence: 'keyword:seasonal' };
  if (matchKeywords(t, KW.festival))         return { sub: 'festival',      status: 'classified_rule', evidence: 'keyword:festival' };
  if (matchKeywords(t, KW.cultural_event))   return { sub: 'cultural_event',status: 'classified_rule', evidence: 'keyword:cultural' };
  return { sub: 'other_event', status: 'classified_rule', evidence: 'category=event,no_keyword' };
}

function classifyAccommodation(row) {
  const t = row.title_ko || '';
  if (matchKeywords(t, KW.camping))          return { sub: 'camping',       status: 'classified_high', evidence: 'keyword:camping' };
  if (matchKeywords(t, KW.hanok))            return { sub: 'hanok',         status: 'classified_high', evidence: 'keyword:hanok' };
  if (matchKeywords(t, KW.hostel))           return { sub: 'hostel',        status: 'classified_rule', evidence: 'keyword:hostel' };
  if (matchKeywords(t, KW.guesthouse))       return { sub: 'guesthouse',    status: 'classified_rule', evidence: 'keyword:guesthouse' };
  if (matchKeywords(t, KW.resort))           return { sub: 'resort',        status: 'classified_rule', evidence: 'keyword:resort' };
  if (matchKeywords(t, KW.hotel))            return { sub: 'hotel',         status: 'classified_high', evidence: 'keyword:hotel' };
  if (matchKeywords(t, KW.pension))          return { sub: 'pension',       status: 'classified_rule', evidence: 'keyword:pension' };
  return { sub: 'other_accommodation', status: 'classified_rule', evidence: 'category=accommodation,no_keyword' };
}

function classify(row) {
  switch (row.category) {
    case 'restaurant':    return classifyRestaurant(row);
    case 'attraction':    return classifyAttraction(row);
    case 'nature':        return classifyNature(row);
    case 'event':         return classifyEvent(row);
    case 'accommodation': return classifyAccommodation(row);
    default:
      return { sub: null, status: 'manual_review', evidence: `unknown_category:${row.category}` };
  }
}

// ── 메인 ────────────────────────────────────────────────────
const ACTIVE = new Set(['api_only_existing','existing_enriched','web_only_new']);
const raw = fs.readFileSync(CSV_IN, 'utf-8');
const { hdr, rows } = parseCSV(raw);

// 헤더 확장 (없는 열 추가)
const EXTRA_COLS = ['subcategory_status','subcategory_evidence'];
for (const col of EXTRA_COLS) { if (!hdr.includes(col)) hdr.push(col); }

const stats = {
  total_active: 0,
  target_missing: 0,
  legacy_normalized: 0,
  classified_high: 0,
  classified_rule: 0,
  manual_review: 0,
  not_applicable: 0,
  skipped_has_value: 0,
};
const manualReviewRows = [];
const subDist = {};
const catSubDist = {};

for (const row of rows) {
  if (!ACTIVE.has(row.candidate_status)) continue;
  stats.total_active++;

  const existingSub = row.subcategory || '';
  const cat = row.category || '';

  // 이미 허용된 값이 있으면 스킵 (단, other_* generic 폴백은 개선 시도)
  const RECLASSIFY_GENERICS = new Set(['other_attraction','other_restaurant','other_event','other_nature','other_accommodation']);
  if (existingSub && existingSub !== 'unknown' && ALLOWED[cat]?.has(existingSub) && !RECLASSIFY_GENERICS.has(existingSub)) {
    stats.skipped_has_value++;
    row.subcategory_status = row.subcategory_status || 'classified_prior';
    row.subcategory_evidence = row.subcategory_evidence || 'pre_existing';
    continue;
  }

  // 기존 비허용 subcategory 정규화
  if (existingSub && existingSub !== 'unknown' && !ALLOWED[cat]?.has(existingSub)) {
    const norm = LEGACY_NORM[existingSub];
    const fallback = `other_${cat}`;
    let normTarget = null, normEvidence = '';

    if (norm) {
      if (ALLOWED[cat]?.has(norm.target)) {
        // 정규화 대상이 현재 category에서 유효
        normTarget = norm.target;
        normEvidence = `legacy_norm:${existingSub}→${norm.target}`;
      } else {
        // 정규화 대상이 다른 category용 → other_{cat} 폴백
        normTarget = ALLOWED[cat]?.has(fallback) ? fallback : null;
        normEvidence = `legacy_norm_cat_mismatch:${existingSub}→${norm.target}(${(norm.cats||[]).join(',')}),using_${fallback}`;
      }
    } else {
      // LEGACY_NORM 미등록 → other_{cat} 폴백
      normTarget = ALLOWED[cat]?.has(fallback) ? fallback : null;
      normEvidence = `legacy_norm_unknown:${existingSub},using_${fallback}`;
    }

    if (normTarget) {
      row.subcategory = normTarget;
      row.subcategory_status = 'classified_rule';
      row.subcategory_evidence = normEvidence;
      stats.legacy_normalized++;
      stats.classified_rule++;
    } else {
      row.subcategory_status = 'manual_review';
      row.subcategory_evidence = `legacy_norm_no_fallback:${existingSub}_in_${cat}`;
      manualReviewRows.push({ ...row, mr_reason: `legacy_norm_no_fallback: ${existingSub} no valid mapping for ${cat}` });
      stats.manual_review++;
    }
    continue;
  }

  // 신규 분류 (subcategory가 NULL/빈/unknown)
  stats.target_missing++;
  const result = classify(row);

  if (result.status === 'manual_review') {
    row.subcategory_status = 'manual_review';
    row.subcategory_evidence = result.evidence;
    manualReviewRows.push({ ...row, mr_reason: result.evidence });
    stats.manual_review++;
  } else {
    row.subcategory = result.sub;
    row.subcategory_status = result.status;
    row.subcategory_evidence = result.evidence;
    if (result.status === 'classified_high') stats.classified_high++;
    else stats.classified_rule++;
  }
}

// 분포 집계 (전체 활성 행)
for (const row of rows) {
  if (!ACTIVE.has(row.candidate_status)) continue;
  const cat = row.category || '';
  const sub = row.subcategory || '';
  subDist[sub] = (subDist[sub] || 0) + 1;
  if (!catSubDist[cat]) catSubDist[cat] = {};
  catSubDist[cat][sub] = (catSubDist[cat][sub] || 0) + 1;
}

// ── HARD STOP 검사 ────────────────────────────────────────────
const hardStopErrors = [];
let totalRows = 0, activeCount = 0;
const seenIds = {};

for (const row of rows) {
  totalRows++;
  if (!row.candidate_id) { hardStopErrors.push('BLANK_CANDIDATE_ID'); continue; }
  if (seenIds[row.candidate_id]) hardStopErrors.push(`DUPLICATE_ID:${row.candidate_id}`);
  seenIds[row.candidate_id] = true;

  if (!ACTIVE.has(row.candidate_status)) continue;
  activeCount++;

  const cat = row.category || '';
  const sub = row.subcategory || '';

  // 상위 category 비어있거나 unknown
  if (!cat || cat === 'unknown') hardStopErrors.push(`BLANK_CAT:${row.candidate_id}`);
  // 활성 행 subcategory 비어있거나 unknown (manual_review는 허용)
  if (row.subcategory_status !== 'manual_review' && (!sub || sub === 'unknown'))
    hardStopErrors.push(`BLANK_SUB_NON_MR:${row.candidate_id}`);
  // 허용 subcategory 외 값
  if (sub && sub !== 'unknown' && ALLOWED[cat] && !ALLOWED[cat].has(sub))
    hardStopErrors.push(`INVALID_SUB:${row.candidate_id}:${cat}/${sub}`);
}

if (totalRows !== 1767) hardStopErrors.push(`ROW_COUNT:${totalRows}≠1767`);

// ── 파일 출력 (HARD STOP 없을 때만) ─────────────────────────
if (hardStopErrors.length > 0) {
  console.error('❌ HARD STOP:', hardStopErrors.slice(0,10).join('\n'));
  process.exit(1);
}

// CSV 임시 파일 쓰기
const csvLines = [hdr.join(','), ...rows.map(r => rowToLine(r, hdr))];
fs.writeFileSync(CSV_TMP, csvLines.join('\n'), 'utf-8');

// JSON 임시 파일 쓰기
const jsonData = rows.map(r => {
  const obj = {};
  hdr.forEach(h => { if (r[h] !== undefined) obj[h] = r[h]; });
  return obj;
});
fs.writeFileSync(JSON_TMP, JSON.stringify(jsonData, null, 2), 'utf-8');

// manual-review CSV
const mrHdr = [...hdr, 'mr_reason'];
const mrLines = [mrHdr.join(','), ...manualReviewRows.map(r => mrHdr.map(h => escapeCSV(r[h]||'')).join(','))];
fs.writeFileSync(MR_CSV, mrLines.join('\n'), 'utf-8');

// ── 원자적 교체 ───────────────────────────────────────────────
fs.renameSync(CSV_TMP, CSV_IN);
fs.renameSync(JSON_TMP, JSON_IN);

// ── metrics 업데이트 ─────────────────────────────────────────
const metrics = JSON.parse(fs.readFileSync(MFILE, 'utf-8'));
metrics.subcategory_classify_14 = {
  task: 'TASK-DATA-BUSAN-SUBCATEGORY-CLASSIFY-14',
  generated_at: new Date().toISOString().slice(0, 10),
  stats,
  category_subcategory_distribution: catSubDist,
  subcategory_distribution: subDist,
  hard_stop_errors: hardStopErrors,
  total_rows: totalRows,
  active_count: activeCount,
};
fs.writeFileSync(MFILE, JSON.stringify(metrics, null, 2), 'utf-8');

// ── 콘솔 결과 ───────────────────────────────────────────────
console.log('=== TASK-DATA-BUSAN-SUBCATEGORY-CLASSIFY-14 ===');
console.log('전체 행:', totalRows, '/ 활성:', activeCount);
console.log('\n분류 통계:');
console.log(JSON.stringify(stats, null, 2));
console.log('\nHARD STOP 오류:', hardStopErrors.length ? hardStopErrors.join(', ') : '없음 ✓');
console.log('\ncategory별 subcategory 분포:');
for (const [cat, dist] of Object.entries(catSubDist)) {
  const top = Object.entries(dist).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}:${v}`).join(', ');
  console.log(`  ${cat}: ${top}`);
}
console.log('\nmanual_review 대상:', manualReviewRows.length);
const mrReasons = {};
manualReviewRows.forEach(r => { const k=(r.subcategory_evidence||'').split(':')[0]; mrReasons[k]=(mrReasons[k]||0)+1; });
console.log('manual_review 사유:', JSON.stringify(mrReasons));
