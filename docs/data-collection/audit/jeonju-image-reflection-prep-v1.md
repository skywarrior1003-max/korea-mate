# 전주 이미지 반영 준비 v1 (2026-09-05)

> TASK-GOKOREAMATE-JEONJU-IMAGE-PRODUCTION-REFLECTION-PREP-V1. Production 실행 없음 — 적용은
> 별도 Owner 승인 PROD-SQL 태스크(TASK-GOKOREAMATE-JEONJU-IMAGE-PRODUCTION-REFLECTION-APPLY-V1).

## 1. Owner 결정 (이 문서가 운영 기록)

Final 수집 단계에서 사용 판단까지 끝난 **KTO(한국관광공사) 공식 이미지 174건을 공개**한다.
권리 재검토·cpyrhtDivCd 재조사·재수집·재매칭 **0**. 출처 보존 + **takedown-on-request**
(문제 제기·삭제 요청 시 제거/교체). 이 결정은 재심사하지 않는다.

## 2. 현황 재확인 (2026-09-05 Production READ-ONLY 실측)

- 전주 relation **174 = 174 spot × 1장**(spot당 1장·전부 is_primary=true 기설정·sort 0·source_id 1:1)
- display_eligible 0 · city_spots.image_url 0 · 대상 spot 전부 published(174) · 잔여 62곳은 Final 원천에 이미지 없음
- rights_status 전부 `KTO_TYPE_UNKNOWN` · host 전부 tong.visitkorea.or.kr · as_of 2026-08-18

## 3. 검증

- **URL 전수 174/174 PASS**(https 로 200·image/*·해상도 443–5,141px·median 940 — broken 0).
  저장 URL 이 `http://` 라 https 사이트에서 mixed-content 차단됨 → 패키지에서 **scheme 만 https 정규화**
  (host/path 동일 — 동일 자원, 출처 불변).
- 서버측 READ-ONLY dry-run: total 174·rel_matched 174·already_eligible 0·img_url_updatable 174·
  non_jeonju 0·bad_url 0. precheck 실서버 실측 일치(174/174/0/174/0/174/0/174).

## 4. 패키지 (immutable)

`data/main-intake/five-city-reflection-recovery-v1/jeonju-images-eligibility-{precheck,apply,readback}-v1.sql`
apply sha256 `3667cb55f51954ef8b7d0781d23d308c87c1d96b1a37b639b295dd3d91ad2849`

apply 내용: ① relation 174 — display_eligible=true + image_url https 정규화 + rights_note 에 Owner 결정
기록(원 사실 'cpyrhtDivCd 미확인' 문구 보존) ② city_spots.image_url 174(NULL/'' 만). primary/sort/source/
as_of/publication **무변경** · 타 도시 영향 0 · idempotent.

기대 결과: eligible 0→174 · spot image_url 0→174 · primary 174 유지 · unresolved 0.
반영 후 UI 노출은 다음 Production rebuild 1회 필요(/place SSG — 경주 때와 동일).
