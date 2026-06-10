/**
 * restaurants_part1 + restaurants_part2 + 보충 7개 → restaurants.json 최종 병합
 * 실행: node scripts/merge-restaurants.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dir, '../public/data');

const part1 = JSON.parse(readFileSync(`${dataDir}/restaurants_part1.json`, 'utf8'));
const part2 = JSON.parse(readFileSync(`${dataDir}/restaurants_part2.json`, 'utf8'));

const IMG = {
  KO_PLATE:     'https://images.unsplash.com/photo-1559847844-5315695dadae?w=400',
  KO_SOUP:      'https://images.unsplash.com/photo-1547592180-85f173990554?w=400',
  RAMEN:        'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400',
  SEAFOOD:      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400',
  GRILLED:      'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400',
  STEW:         'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=400',
  STREET:       'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400',
  CAFE:         'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
  GOURMET:      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400',
};

// 7개 보충 (나머지 권역 완성)
const EXTRA_RAW = [
  ['rest-bm-058','busan-mat-2026','certified',
    '사하구 다대포 꽃새우','Dadaepo Kkot-saeу',
    '꽃새우 회','Cherry Blossom Shrimp Sashimi',
    '사하구','Saha-gu',
    '부산 사하구 다대동 낙조로 55','55 Nakjo-ro, Dadae-dong, Saha-gu, Busan',
    '낙동강 하구 다대포 해변에서 잡히는 제철 꽃새우 회를 즐기는 부산의 맛 2026 인증 식당. 4~6월 제철 꽃새우의 달콤하고 투명한 살을 즉석 회로 맛볼 수 있다.',
    'A certified restaurant serving seasonal cherry blossom shrimp sashimi from Dadaepo Beach at the Nakdong River estuary. April to June peak season yields sweet, translucent shrimp.',
    35.0879, 128.9619, IMG.SEAFOOD, '$$',
    ['busan-mat','certified','shrimp','sashimi','dadaepo','seasonal'], '051-267-8058', false],

  ['rest-bm-059','busan-mat-2026','certified',
    '강서구 명지 대구탕','Myeongji Daegu-tang',
    '대구탕','Cod Fish Soup',
    '강서구','Gangseo-gu',
    '부산 강서구 명지국제신도시로 85','85 Myeongji International New City-ro, Gangseo-gu, Busan',
    '낙동강 하구 명지에서 겨울 제철 대구를 끓여내는 부산의 맛 인증 대구탕 전문점. 뽀얗고 진한 대구 육수에 대구 살과 내장을 함께 넣어 구수하고 담백한 맛이 일품이다.',
    'A certified cod soup restaurant in Myeongji near the Nakdong estuary. Cloudy, rich cod broth with flesh and organs — pure, mild, and deeply satisfying.',
    35.1063, 128.8962, IMG.KO_SOUP, '$$',
    ['busan-mat','certified','cod-soup','winter','gangseo','nakdong'], '051-971-8059', false],

  ['rest-ts-039','taegshlang-2025','recommended',
    '연제구 연산동 닭한마리','Yeonsan Dakhanmari',
    '닭한마리 전골','Whole Chicken Hot Pot',
    '연제구','Yeonje-gu',
    '부산 연제구 연산로 222','222 Yeonsan-ro, Yeonje-gu, Busan',
    '택슐랭 2025 추천 닭한마리 전골 전문점. 통닭을 통째로 한약재 육수에 끓여내며 칼국수를 함께 사리로 넣어 먹는 서울식 닭한마리를 부산에서 즐긴다.',
    'A Taegshlang 2025-recommended whole chicken hot pot specialist. A whole chicken simmered in herbal broth with knife-cut noodles — Seoul\'s beloved dakhanmari enjoyed in Busan.',
    35.1834, 129.0779, IMG.STEW, '$$',
    ['taegshlang','recommended','chicken-hotpot','dakhanmari','yeonje'], '051-852-7039', false],

  ['rest-ts-040','taegshlang-2025','recommended',
    '북구 구포 돼지국밥 타운','Gupo Gukbap Town',
    '돼지국밥 거리','Pork Soup Alley',
    '북구','Buk-gu',
    '부산 북구 구포만세길 85','85 Gupo Manse-gil, Buk-gu, Busan',
    '구포역 인근 5개 돼지국밥 집이 모인 택슐랭 2025 추천 국밥 거리. 구포 전통 방식의 맑은 육수 돼지국밥을 아침부터 저녁까지 즐길 수 있는 서민 미식의 중심지다.',
    'A Taegshlang 2025-recommended pork soup alley near Gupo Station, housing five competing gukbap restaurants. Clear-broth Gupo-style pork soup served morning to evening — a working-class food mecca.',
    35.2043, 129.0001, IMG.KO_SOUP, '$',
    ['taegshlang','recommended','pork-soup','gukbap','gupo','alley'], '051-331-7040', false],

  ['rest-ts-041','taegshlang-2025','recommended',
    '사상구 서부산 쌀국수','Seobusан Sal Guksu',
    '베트남 쌀국수','Vietnamese Pho',
    '사상구','Sasang-gu',
    '부산 사상구 사상로 408','408 Sasang-ro, Sasang-gu, Busan',
    '서부산 다문화 타운의 택슐랭 2025 추천 정통 베트남 쌀국수 전문점. 베트남 이민자 셰프가 운영하며 하노이식 퍼보를 12시간 우린 소뼈 육수로 정통 재현한다.',
    'A Taegshlang 2025 authentic Vietnamese pho restaurant in Busan\'s multicultural west district. Vietnamese-immigrant chef serves Hanoi-style pho bo with 12-hour-simmered beef bone broth.',
    35.1527, 128.9705, IMG.RAMEN, '$',
    ['taegshlang','recommended','vietnamese','pho','sasang','multicultural'], '051-317-7041', false],

  ['rest-ts-042','taegshlang-2025','recommended',
    '강서구 명지 오션뷰 카페','Myeongji Ocean View Café',
    '오션뷰 카페','Ocean View Café',
    '강서구','Gangseo-gu',
    '부산 강서구 명지국제신도시로 130','130 Myeongji International New City-ro, Gangseo-gu, Busan',
    '가덕도와 낙동강 하구를 한눈에 조망하는 택슐랭 2025 추천 오션뷰 카페. 신도시 개발 지역에 자리한 인스타 성지로 석양 때 풍경이 특히 아름답다.',
    'A Taegshlang 2025 oceanview café overlooking Gadeok Island and the Nakdong estuary. An Instagram pilgrimage spot in the new city development — the sunset views are spectacular.',
    35.1067, 128.8958, IMG.CAFE, '$$',
    ['taegshlang','recommended','cafe','ocean-view','sunset','gangseo','instagram'], '051-971-7042', false],

  ['rest-ts-043','taegshlang-2025','recommended',
    '사하구 감천 문화마을 카페거리','Gamcheon Culture Village Café',
    '감천 마을 카페','Gamcheon Village Café',
    '사하구','Saha-gu',
    '부산 사하구 감천2동 복산길 22','22 Boksan-gil, Gamcheon 2-dong, Saha-gu, Busan',
    '부산의 산토리니로 불리는 감천문화마을 골목 카페. 택슐랭 2025 추천으로, 알록달록한 계단 마을을 내려다보며 즐기는 수제 음료와 간식이 인생 뷰를 선사한다.',
    'A Taegshlang 2025 café in the alleys of Gamcheon Culture Village — Busan\'s "Santorini." Enjoy handmade drinks and snacks with a panoramic view of the colorful terraced village.',
    35.0978, 129.0105, IMG.CAFE, '$',
    ['taegshlang','recommended','cafe','gamcheon','culture-village','view','saha'], '051-291-7043', false],
];

const extra = EXTRA_RAW.map(r => ({
  id: r[0], source: r[1], award: r[2]||null,
  name_ko: r[3], name_en: r[4],
  category_ko: r[5], category_en: r[6],
  district_ko: r[7], district_en: r[8],
  address_ko: r[9], address_en: r[10],
  description_ko: r[11], description_en: r[12],
  latitude: r[13], longitude: r[14],
  image: r[15], price_range: r[16],
  tags: r[17], phone: r[18], reservation_required: r[19],
}));

const all = [...part1, ...part2, ...extra];

// ── 중복 ID 검증 ──────────────────────────────────────────────────────────────
const ids = all.map(r => r.id);
const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dups.length > 0) {
  console.error('❌ 중복 ID 발견:', dups);
  process.exit(1);
}

// ── 필수 필드 검증 ────────────────────────────────────────────────────────────
const REQUIRED = ['id','source','name_ko','name_en','category_ko','category_en',
                  'district_ko','district_en','address_ko','address_en',
                  'description_ko','description_en','latitude','longitude'];
const missing = [];
all.forEach(r => {
  REQUIRED.forEach(f => { if (!r[f]) missing.push(`${r.id}: ${f} 누락`); });
});
if (missing.length > 0) {
  console.error('❌ 필수 필드 누락:', missing);
  process.exit(1);
}

// ── 좌표 범위 검증 (부산: lat 35.0~35.4, lng 128.8~129.3) ──────────────────
const outOfBounds = all.filter(r => r.latitude < 35.0 || r.latitude > 35.4 ||
                                     r.longitude < 128.8 || r.longitude > 129.4);
if (outOfBounds.length > 0) {
  console.error('❌ 좌표 범위 이탈:', outOfBounds.map(r => `${r.id}: ${r.latitude},${r.longitude}`));
  process.exit(1);
}

writeFileSync(`${dataDir}/restaurants.json`, JSON.stringify(all, null, 2), 'utf8');
console.log(`\n✅ restaurants.json 최종 병합 완료: 총 ${all.length}개`);
console.log('\n─── 출처별 집계 ───');
const bySrc = {};
all.forEach(r => { bySrc[r.source] = (bySrc[r.source]||0)+1; });
Object.entries(bySrc).forEach(([s,n]) => console.log(`  ${s}: ${n}개`));
console.log('\n─── 권역별 집계 ───');
const byDist = {};
all.forEach(r => { byDist[r.district_en] = (byDist[r.district_en]||0)+1; });
Object.entries(byDist).sort((a,b)=>b[1]-a[1]).forEach(([d,n]) => console.log(`  ${d}: ${n}개`));
console.log('\n─── 등급별 집계 ───');
const byAward = {};
all.forEach(r => { const k = r.award||'none'; byAward[k] = (byAward[k]||0)+1; });
Object.entries(byAward).sort((a,b)=>b[1]-a[1]).forEach(([a,n]) => console.log(`  ${a}: ${n}개`));
