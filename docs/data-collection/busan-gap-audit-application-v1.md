# data-collection/busan-gap-audit-application-v1.md

**작성일**: 2026-08-08
**목적**: 경주 파이프라인에서 도출한 수집 원칙을 부산 데이터에 적용하는 방법

---

## 1. 경주 vs 부산 구조 비교

| 항목 | 경주 | 부산 | 조치 |
|------|------|------|------|
| VG 공식 사이트 | gyeongju.go.kr/tour | visitbusan.net | URL 구조 재확인 |
| KTO 코드 | lDongRegnCd=47, signgu=130 | lDongRegnCd=26 (부산광역시) | signgu 필터 확인 |
| Source Facts | gyeongju-WEB-ATT-XXXXX | busan-WEB-ATT-XXXXX | 동일 구조 |
| KTO type | 12(관광지) 우선 | 12 우선 + 39(음식) 포함 | 동일 원칙 |

---

## 2. 부산 적용 시 경주 교훈 체크리스트

### A. KTO 캐시 포맷 처리
- [ ] detailCommon2 캐시가 tier-a 포맷인지 표준 포맷인지 확인
- [ ] `parse_ko_detail()` 공통 함수 사용 (`gyeongju_final_source_resolution_v4.py` 참조)

### B. 중복 검출
- [ ] CORE/TIER_A → 이름 정규화 인덱스 빌드
- [ ] 새 후보 처리 전 중복 체크 선행
- [ ] KTO12 후보 vs VG 후보 동일 장소 판단 기준 문서화

### C. VG URL 구조
- [ ] visitbusan.net 상세 페이지 URL 패턴 파악
- [ ] mnu_uid / area_uid 해당 파라미터 이름 확인
- [ ] 이벤트 개별 URL 패턴 별도 확인

### D. 188×N crosswalk
- [ ] 부산 전체 KTO list 수집 (lDongRegnCd=26 전 구군)
- [ ] VG identity 없는 후보 전수 대상으로 global crosswalk 수행

---

## 3. 부산 파이프라인 현황 (2026-08-08 기준)

- enrichment v1 완료 (4465278 HEAD)
- POST-LINK-QA 완료 (74a484d)
- 상태: READY_FOR_RELEASE_HOLD_CLASSIFICATION
- 후속 단계: 경주와 동일한 Source State Audit → crosswalk → final release

---

## 4. 공통 원칙 적용 방법

1. `common-city-collection-rules-v1.md` 섹션 1-7 전체 준수
2. 캐시 디렉토리 네이밍: `raw/busan/busan-tier-a-*/kto-detail/` 등 도시명 prefix 통일
3. 파일명 패턴: `busan-final-source-state-audit-v1.jsonl` (도시명 + 태스크명 + 버전)
4. SHA manifest 생성: Run1=Run2 BYTE_IDENTICAL 필수
5. 안전 규칙: master push 금지, force push 금지 (공통 규칙 동일)
