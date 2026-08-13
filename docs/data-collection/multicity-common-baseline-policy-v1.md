# GoKoreaMate Multicity Common Baseline Policy v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 작성일 | 2026-08-13 |
| 작성 TASK | TASK-MULTICITY-COMMON-BASELINE-CONSOLIDATION-V1 |
| Branch | data/multicity-common-baseline-v1 |
| 적용 범위 | 전 도시 데이터 수집 공통 |

---

## Branch 거버넌스 원칙

```
MULTICITY_COMMON_BASELINE = master

CITY_BRANCH_POLICY:
- 각 신규 도시 data branch는 최신 검증된 master에서 독립 분기한다.
- 도시 branch가 다음 도시 branch의 부모가 되어서는 안 된다.

COMMON_PROMOTION_POLICY:
- 도시 작업 중 새로 발견된 전국 공통 정책/스크립트 개선은
  검증 후 common baseline/master로 승격한 뒤 후속 도시에서 사용한다.
- 도시 전용 데이터는 common baseline으로 승격하지 않는다.
```

## 이 Branch에 포함된 공통 자산

| 파일 | 설명 | 최신 source commit |
|---|---|---|
| `multicity-place-eligibility-policy-v1.md` | Place eligibility 5축 정책 | `e6ee1f1` |
| `multicity-event-freshness-policy-v1.md` | Event freshness (ONGOING/UPCOMING 7일 주기) | `983c8d9` |
| `multicity-food-discovery-collection-policy-v1.md` | Food 수집 정책 FINAL FREEZE | `cfa4640` |
| `multicity-main-data-handoff-v1.md` | Main 인수인계 공통 기준 | `983c8d9` |
| `multicity-data-quality-guardrail-v1.md` | 데이터 품질 가드레일 v1 | `8dfdc6d` |
| `multicity-regression-fixtures-v1.json` | QA regression fixture (Busan+Gyeongju) | `8dfdc6d` |
| `multicity-eligibility-regression-fixtures-v1.json` | Place eligibility regression fixture | `2b301d4` |
| `multicity-place-eligibility-backfill-audit-v1.json` | Busan+Gyeongju eligibility backfill audit | `2b301d4` |

## 주요 이력

- **부산**: KTO TourAPI 기반 수집, eligibility / provenance / rights 정책 최초 확립
- **경주**: visitGyeongju 지역 공식 source 우선, Food phone gate, KTO lessons 문서화
- **서울**: VisitSeoul PRIMARY_AND_SUFFICIENT, Event freshness 정책, eligibility 5축 최종 확정
- **3도시 Food 보완**: Food policy FINAL FREEZE (cfa4640), 데이터 품질 가드레일 확립
- **서울 Final Handoff**: Seoul 수집 COMPLETE (7a71304)

## 다음 도시 branch 생성 기준

```
1. 이 baseline이 master에 반영된 후:
   git checkout -b data/<city>-collection-v1 origin/master

2. master 반영 전 긴급 착수 시:
   git checkout -b data/<city>-collection-v1 data/multicity-common-baseline-v1
   (단, Master 승인 필요)
```

## 관련 문서

- `docs/data-collection/multicity-place-eligibility-policy-v1.md`
- `docs/data-collection/multicity-event-freshness-policy-v1.md`
- `docs/data-collection/multicity-food-discovery-collection-policy-v1.md`
- `docs/data-collection/multicity-data-quality-guardrail-v1.md`
