# 보조 PC 독립 검증 인수인계 — OFF-17463 교정·재발 방지

자체 완결형 문서다. 보조 PC 는 이 문서만으로, Data Track 완료보고를 인용하지 않고
아래 명령의 **실제 출력**으로만 판정한다.

## 절대 제한

- Main master push · Production DB/배포 접근 **금지**(검증은 전부 로컬 read + 이 branch).
- Final artifact 를 추가 수정하지 않는다 — 검증만 한다.
- 실패 시 그 지점에서 중단하고 실패 출력 원문으로 보고한다(우회·재해석 금지).

## 사건 요약

Production `city_spots.id=776`(메르밀진미집 본점, 음식점)에 인접 게스트하우스
**다나하루**(KTO 2571938, 향교길 11)의 주소·침대 이미지(2570942)와 전주시청
대표번호(063-222-1000)가 결합돼 있었다. 원인: crossmatch 가 좌표 근접(77.6m)만으로
AMBIGUOUS 매칭 → identity-resolution 의 DISTINCT_ENTITY 판정이 catalog 에 반영되지
않은 채 ACTIVE 승격. Main 은 `e66a8c1` 에서 긴급 교정 완료. 본 branch 는 Data Track
정본 교정 + 게이트다.

## 검증 환경

```
git fetch origin
git checkout datafix/off-17463-contamination-prevention-v1
node --version   # v20+ 이면 충분
```

## 수정 파일 (이 branch 의 전체 변경)

| 파일 | 성격 |
|---|---|
| `data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json` | 정본 교정(OFF-17463 단일 객체) |
| `scripts/data-gates/entity-coherence-gate.mjs` | 승격 게이트 |
| `scripts/data-gates/entity-coherence-gate.test.mjs` | 회귀 테스트 |
| `scripts/data-gates/off-17463-limited-audit.mjs` | 제한 감사 스크립트 |
| `data/quality-gates/off-17463/*.json` | fixture 2 + 감사 결과 |
| `docs/data-incidents/OFF-17463-cross-entity-contamination.md` | incident |
| `docs/data-collection/next-city-quality-gates.md` | 다음 도시 체크리스트 |
| `docs/data-handoffs/OFF-17463-independent-verification.md` | 이 문서 |

## checksum 기준값

```
# 수정 전(원본): git show 로 직접 재계산해 대조할 것
git show origin/data/jeonju-targeted-completion-v1:data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json | sha256sum
#   → da498b04458a71fe… 로 시작해야 한다
sha256sum data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json
#   → 3a2d0a2139aee1ed… 로 시작해야 한다
```

수정 전/후 OFF-17463 행 전문: incident 문서와 Main correction
(`git show origin/master:data/main-intake/five-city-core-v3/corrections/candidate-corrections-jeonju-776-identity-v1.json`) 참조.

## 독립 검증 절차 (전부 실행하고 출력 원문을 보고)

```
# 1~4. 정본 상태 — 오염값 부재·검증값 존재
node -e "
const c=require('./data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json');
const r=c.all_candidates.find(x=>x.candidate_id==='OFF-17463');
const s=JSON.stringify(r);
console.log('1 향교길 11 잔존:', s.includes('향교길'));
console.log('2 침대 이미지 잔존:', s.includes('2570942'));
console.log('3 시청 번호 잔존:', s.includes('063-222-1000'));
console.log('4 phone/좌표/match:', r.phone, r.lat, r.lng, r.match_type, r.identity_review);
console.log('   기대: 063-288-4020 · 35.8111035497203 · 127.150406207841 · OFFICIAL_ONLY · true');
console.log('   행수:', c.all_candidates.length, '(기대 423)');"

# 5~6. 게이트 동작 — AMBIGUOUS·display_eligible:false 차단
# 7. negative fixture 는 exit 2 로 실패해야 한다
node scripts/data-gates/entity-coherence-gate.mjs data/quality-gates/off-17463/negative-fixture.json
echo "exit=$?   # 2 여야 한다 (AMBIGUOUS·CATEGORY_MISMATCH·COORD·PHONE·IMAGE 사유 전부 출력)"

# 8. positive fixture 는 exit 0
node scripts/data-gates/entity-coherence-gate.mjs data/quality-gates/off-17463/positive-fixture.json
echo "exit=$?   # 0 이어야 한다"

# 회귀 테스트 6/6
node --test scripts/data-gates/entity-coherence-gate.test.mjs

# 9. 기존 5도시 제한 감사 재실행(결정적) — 저장된 결과와 수치 대조
node scripts/data-gates/off-17463-limited-audit.mjs
#   기대: 전주 catalog total 423 · review 164 · ambiguous_active 54 · gov phone 94
#         main-intake total 4829 · ambiguous_imported 55

# 10. 체크리스트 ↔ validator 연결 확인
grep -c "GATE" docs/data-collection/next-city-quality-gates.md   # 10+ 여야 한다
```

## 판정 기준

- 위 10개 항목이 전부 기대값과 일치 → PASS 보고.
- 하나라도 다르면 **그 출력 원문**과 함께 FAIL 보고, 추가 수정은 하지 않는다.
- Main/Production 상태는 검증 대상이 아니다(이미 `e66a8c1` 에서 종결).

## 남은 후보 (이 branch 에서 무수정 — 별도 TASK)

`data/quality-gates/off-17463/five-city-limited-audit-v1.json` —
전주 review 164(HIGH 65) · intake AMBIGUOUS 55. 개별 identity 재검토는 Owner 가
범위를 정한 뒤 진행한다.
