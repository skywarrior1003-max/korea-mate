# Staging Canonical Fixtures (CITY-ROUTING-RECOVERY §5.2)

작성 2026-09-27 · 대상: **Staging city_spots 전용** · Production write 0

## 왜

Preview(=Staging DB)에서 부산·서울·제주·전주 Explore/추천 장소가 0건이라
Owner 의 OAuth+This Trip E2E 가 막혔다(문제 B). 원인은 코드가 아니라
Staging `city_spots` 가 경주 9행뿐이었기 때문이다.

## 무엇을

Production **공개 카탈로그(city_spots, is_published)** 에서 read-only 로
도시별 대표 3행을 선별해 Staging 에 삽입했다 — 12행:

| city | ids |
|---|---|
| busan | 1, 2, 7 |
| seoul | 3127, 3128, 3129 |
| jeju | 1659, 1660, 1661 |
| jeonju | 727, 728, 729 |

(gyeongju 는 기존 9행 유지 — 무접촉)

- 선별 기준(결정적): published ∧ image_url ∧ name_l10n 보유, id 오름차순 3개
- 삽입: `INSERT … ON CONFLICT (id) DO NOTHING` — 재실행 멱등, 기존 행 무접촉
- 스크립트: 세션 스크래치패드 `seed-staging-canonical.mjs`
  (생성 SQL 사본: `staging-canonical-seed.sql`)

## 포함하지 않은 것

사용자 데이터 일절 없음 — user_spots·itineraries·moments/photos·saves·
likes/dislikes·usage·mapping·suggestions·submissions·reports·hash·이메일·
auth.users·Storage private 전부 0. **가짜 인기 신호 0** — 추천 순위의
"저장·여행 활용" 수치는 이후 실제 E2E 흐름이 만든 것이며 검증 후 정리했다
(place_saves/place_usage 2시간 창 정밀 삭제·monthly refresh 재수렴).

## 유지·삭제

Owner OAuth+This Trip 최종 E2E 가 이 장소들을 사용하므로 **E2E 완료 전
삭제 금지**. 이후에도 Staging 기본 카탈로그로 유지해도 무해하다(공개
카탈로그 사본 12행). 제거가 필요하면:

```sql
delete from public.city_spots where id in (1,2,7,3127,3128,3129,1659,1660,1661,727,728,729);
```
