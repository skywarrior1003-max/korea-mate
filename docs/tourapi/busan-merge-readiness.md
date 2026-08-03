# Busan Data Branch Merge Readiness

**Task**: TASK-BUSAN-DATA-MERGE-READINESS-V1
**Date**: 2026-08-03
**Verdict**: **MERGE_READY**

---

## 판정 요약

| 항목 | 결과 |
|---|---|
| Branch | `data/busan-enrichment-v1` |
| HEAD | `a2ce1d87a282c6392d1369a740268fcc1b60af12` |
| origin/master | `91a39dbddc5b310afe719b845130c1d9f7767283` |
| merge-base | `369d4cc8b0143021870fa4e0cd2227dc384d58e0` |
| Ahead | 64 commits |
| Behind | 22 commits |
| 변경 파일 | 271 (data/ docs/ scripts/ 만) |
| 금지 경로 (우리 브랜치) | **0** |
| 비밀정보 | **0** |
| merge 충돌 예상 | **0** |
| 전체 판정 | **MERGE_READY** |

> `src/` `supabase/` 파일이 `git diff origin/master..HEAD`에 나타나지만 이는 **origin/master가 추가한 변경** (22커밋)이며 우리 브랜치가 만든 변경이 아님. merge-base 기준 우리 브랜치의 변경은 data/ docs/ scripts/ 만.

---

## 핵심 데이터 수량

| 항목 | 수량 | 검증 |
|---|---|---|
| candidates | 1,642 | ✅ PASS |
| source facts | 2,714 | ✅ PASS |
| release (장소+행사) | **1,533** | ✅ PASS |
| — RELEASE_READY_COMPLETE | 301 | |
| — RELEASE_READY_OPTIONAL_MISSING | 1,228 | |
| — RELEASE_READY_CURRENT_EVENT | 4 | |
| hold/exclude | 109 | ✅ PASS |
| 합계 1,533+109 | 1,642 | ✅ PASS |
| current event | 4 | ✅ PASS |
| promotion public | 2 | ✅ PASS |
| promotion archive | 8 | ✅ PASS |
| manual queue | 0 | ✅ PASS |

---

## 현재 공개 콘텐츠

### 현재 행사 (4건)

| ID | 행사명 | 날짜 | 날짜 출처 |
|---|---|---|---|
| busan-E-00001 | 부산바다축제 | 2026-08-07~08-13 | bfo.or.kr |
| busan-E-00004 | 금정산성축제 | 2026-10-16~10-18 | FestivalService_raw_2026 |
| busan-E-00006 | 부산불꽃축제 | 2026-11-07 | bfo.or.kr |
| busan-E-00019 | 부산국제록페스티벌 | 2026-10-02~10-04 | bfo.or.kr |

### 공개 프로모션 (2건)

| ID | 제목 | 상태 | 만료 |
|---|---|---|---|
| BTO_PRESS_5340 | 부산병 치유 프로모션 | ACTIVE | 2026-08-27 |
| VB_EVENT_684 | Starry Night River Cruise | ENDING_SOON | 2026-08-09 |

---

## 검토 순서 (메인노트북)

1. **Git 기준선 확인** — 아래 검증 명령 실행
2. **좌표 오류 2건 수정** (권장): busan-F-00341, busan-K-00674
3. **구조 hold 4건 adjudication** 완료 (merge 후 운영 전)
4. **HTML description 처리 정책** 결정 (69건)
5. **프로모션 organizer 필드** 추가 여부 결정
6. merge 실행

---

## 알려진 이슈 (merge blocker 아님)

### 좌표 오류 (수정 권장)

| ID | 유형 | 현재 좌표 | 주소 |
|---|---|---|---|
| busan-F-00341 | lat==lng (경도 복사) | 35.195267, 35.195267 | 부산 연제구 교대로 7 (거제동) |
| busan-K-00674 | 동남아 해역 (KTO 오류) | 19.69, 117.99 | 부산 해운대구 반송동 |

주소는 정상이므로 release 계약('주소 또는 좌표') 위반 아님. 수정 권장.

### HTML in description_en (정제 필요)

69건의 description_en에 VisitBusan 원천 HTML 태그 미제거.
예시: `<p class="font-size28 colorDarkBlue medium">Jungang Park</p>`
UI에서 strip 처리 또는 데이터 정제 스크립트 필요.

### Korean in EN title (설계 패턴)

292건 EN title에 `"Transliteration (한글원문)"` 패턴.
레스토랑(F-series)은 의도적 설계. UI 렌더링 정책 확인 필요.

### 구조 hold 4건

busan-F-00050/00313, busan-F-00299/00386 — near-duplicate 쌍 adjudication 미완료.
release에서 제외됨 → merge blocker 아님. 운영 전 해소 권장.

---

## 예상 merge 충돌

**없음.** 우리 브랜치와 origin/master 변경 파일 교집합 0건.
자동 merge 완전 가능. origin/master의 src/ supabase/ 변경은 우리 브랜치와 독립.

---

## 필드 완전성

| 필드 | 보유율 |
|---|---|
| title_ko | 100.0% |
| title_en | 62.2% |
| address | 99.9% |
| lat / lng | 100.0% |
| description_ko | 78.7% |
| description_en | 56.0% |
| images | 91.6% |
| provenance | 100.0% |
| district | 99.8% |

---

## 메인노트북 최소 검증 명령

```bash
# 1. Branch fetch
git fetch origin data/busan-enrichment-v1

# 2. Source SHA 확인
git rev-parse origin/data/busan-enrichment-v1

# 3. 우리 브랜치 변경 파일 — 허용 범위만 있는지
git diff --name-only 369d4cc8b0143021870fa4e0cd2227dc384d58e0..HEAD \
  | grep -Ev '^(data|docs|scripts)/'

# 4. 금지 경로 확인
git diff --name-only 369d4cc8b0143021870fa4e0cd2227dc384d58e0..HEAD \
  | grep -E '^(src|supabase|functions)/'

# 5. 수량 확인
python -c "import json; m=json.load(open('data/tourapi/reports/busan/busan-final-place-event-release-manifest.json',encoding='utf-8')); c=m['counts']; print('release:',len(m['items']),'total_candidates:',c['total_candidates'],'hold_exclude:',c['hold_structural_review']+c['exclude_duplicate_sibling']+c['hold_past_event']+c['hold_stale_event']+c['hold_date_missing_event']+c['hold_no_current_source_event'])"

# 6. Enriched SHA 확인
python -c "import hashlib; print(hashlib.sha256(open('data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl','rb').read()).hexdigest())"
# 기대값: 73bad4f894b1b252c8caf9dbd4ea16352b2c99223553553d6018e472056b4619

# 7. 고위험 표본 열람
python -c "import json; hr=json.load(open('data/tourapi/reports/busan/busan-merge-readiness-high-risk-samples.json',encoding='utf-8')); [print(s['risk_id'], s['risk_type']) for s in hr['samples']]"

# 8. merge-tree 충돌 사전확인 (read-only)
git merge-tree $(git merge-base HEAD origin/master) HEAD origin/master | head -30

# 9. merge 직전 상태 확인
git status --short && git log --oneline -3
```

---

## 정기 유지관리 항목 (merge blocker 아님)

- 행사 날짜: 매 시즌 bfo.or.kr + FestivalService 재확인 (68건 보류 중)
- 프로모션 만료: BTO_PRESS_5340 만료일 2026-08-27 이후 archive 이동
- 운영시간: 전수 hours 미확인 — 정기 갱신
- 도착 좌표: 전수 미검증 — 정기 갱신

---

## 경주 수집 착수

**메인노트북 병합 승인 전: 착수 불가.**
준비 체크리스트: `data/tourapi/reports/busan/next-city-gyeongju-readiness-checklist-v1.json`

---

## 운영 미실행 확인

- 운영 DB 직접 반영: 없음
- migration 실행: 없음
- 배포: 없음
- src/ 수정: 없음
- push to master: 없음
- force push: 없음
