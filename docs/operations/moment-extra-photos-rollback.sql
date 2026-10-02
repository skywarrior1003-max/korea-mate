-- 추가 사진 단독 수정(fix/moment-extra-photos-hotfix)을 "공개 보호가 없는 옛 서버(ecc5bf01 등)"로 되돌려야 할 때만.
-- 공개 보호를 유지하는 되돌림(옛 클라이언트 + 새 서버)으로 충분하면 이 SQL 은 쓰지 않는다.
-- 순서: ① 읽기 → ② 비공개 전환(결과를 반드시 보관) → 옛 서버로 되돌림 → (앞으로 고친 뒤) ③ 보관한 값으로 복원.
-- Staging 실측: docs/operations/moment-extra-photos-hotfix.md §4.

-- ① 대상 확인(읽기 전용): 공개 기록인데 공개 동의 뒤에 올라온 추가 사진이 있는 기록
select m.moment_id, m.itinerary_id, count(*)::int as late_photos
  from public.trip_moments m
  join public.trip_moment_photos c on c.moment_id = m.moment_id
 where m.is_public = true and c.created_at > m.public_consent_at
 group by m.moment_id, m.itinerary_id;

-- ② 그 기록만 비공개로(첫 사진·메모도 공개 Story 에서 빠진다). 반환값(원래 동의 시각·판본)을 파일로 보관한다.
update public.trip_moments m
   set is_public = false, public_consent_at = null, public_consent_version = null
  from (select m2.moment_id, m2.public_consent_at as old_at, m2.public_consent_version as old_ver
          from public.trip_moments m2
         where m2.is_public = true
           and exists (select 1 from public.trip_moment_photos c
                        where c.moment_id = m2.moment_id and c.created_at > m2.public_consent_at)) s
 where m.moment_id = s.moment_id
returning m.moment_id, s.old_at as public_consent_at, s.old_ver as public_consent_version;

-- ③ 공개 보호가 있는 배포로 다시 올린 뒤: ② 에서 보관한 값으로 복원(동의 시각이 같으므로 늦은 사진은 계속 비공개).
--    /*ROWS*/ 를 ('<moment_id>', '<public_consent_at>'::timestamptz, '<public_consent_version>'), ... 로 바꾼다.
update public.trip_moments m
   set is_public = true, public_consent_at = v.at, public_consent_version = v.ver
  from (values /*ROWS*/) as v(id, at, ver)
 where m.moment_id = v.id::text and m.is_public = false
returning m.moment_id;
