# PhotoGalleryService1 엔드포인트 운영 원칙

> **적용 범위**: PhotoGalleryService1 API 수집·동기화·매칭 작업 전체.  
> API 명칭과 실제 기능이 불일치하는 엔드포인트가 있으므로 아래 표를 기준으로 사용한다.

---

## 엔드포인트 역할 정의

| 엔드포인트 | 실제 역할 | 필수 파라미터 | 주의사항 |
|------------|----------|-------------|---------|
| gallerySearchList1 | 지역·장소·테마 키워드 검색 보완 | keyword | 기존 수집분 재수집·덮어쓰기 금지 |
| galleryList1 | 전체 제목 색인 (지역 필터 없음) | numOfRows, pageNo | 지역 판정은 galPhotographyLocation 텍스트로 후처리 |
| galleryDetailList1 | **제목 기반 검색 보완** — ID 조회 아님 | **title (필수)** | 반환 필드는 gallerySearchList1과 동일. 오류 응답이 비표준 형식일 수 있음 |
| gallerySyncDetailList1 | 전체·증분 동기화 | modifiedtime (선택) | galUseFlag 필드 추가 — 비활성(galUseFlag=0) 필터 적용 |

## 수집 방식 분리

- **최초 기준 수집**: gallerySearchList1(keyword=도시명)으로 지역 태그 사진 수집, 또는 gallerySyncDetailList1(modifiedtime 없음)으로 전체 취득 후 galPhotographyLocation 텍스트로 지역 후처리.
- **이후 증분 수집**: gallerySyncDetailList1(modifiedtime=이전 실행 max(galModifiedtime))으로 신규·갱신 사진만 수집. 이미 수집한 galContentId는 재호출하지 않는다.

## galleryDetailList1 사용 제한

- 후보 전체 제목으로 반복 호출하는 방식은 금지한다.
- 무이미지·URL 접근 오류·권리 문제·매칭 실패 항목에 한해 표적 검색에만 사용한다.

## 비표준 오류 응답 처리

- galleryDetailList1 등 일부 엔드포인트는 오류 시 `response.header`가 없는 최상위 `{ resultCode, resultMsg }` 형식으로 반환한다.
- 파서는 `response.header.resultCode` 부재 시 최상위 `resultCode`를 fallback으로 점검해야 한다.
- 오류 원문·endpoint·호출 파라미터를 callLog에 기록하고 CLAUDE.md 핵심 HARD STOP 규칙을 동일하게 적용한다.
- 비표준 오류를 정상 응답(items 0건)으로 처리하지 않는다.

## 기존 수집 보존

- gallerySearchList1(keyword=도시명)으로 수집한 기존 데이터는 재수집·덮어쓰기 금지 (도시별 수집 현황은 pipeline-checkpoint.json 참조).
- 신규 수집분은 galContentId 기준 중복 제거 후 병합한다.

## GPS 부재

- PhotoGalleryService1 전 엔드포인트에 mapX/mapY 없음. 좌표는 항상 null로 기록하고 장소 매칭은 제목·키워드 일치 점수만으로 산출한다.

## 동명 장소 오매칭 방지

PG GPS가 항상 null이므로 제목 유사도 점수가 높아도 지리·카테고리 불일치를 감지할 수 없다. 아래 규칙을 매칭 단계에 적용한다.

- **명칭 점수만으로 자동 채택 금지** — 명칭 점수가 임계값 이상이어도 주소·행정구역·카테고리 중 최소 2개 근거가 일치해야 `high confidence` 채택을 허용한다.
- **강한 충돌 시 `place_identity_issue`** — 제목 점수가 높더라도 location_raw 행정구역, 후보 category, 후보 district 중 하나라도 명확히 충돌하면 매칭 결과를 `confidence: manual_review`로 강제 하향하고 `place_identity_issue` 플래그를 부여한다.
- **동명 장소는 별도 entity 유지** — 같은 이름의 후보가 둘 이상 존재할 때 한 후보에 매칭된 PG 사진을 다른 후보에 자동 공유하지 않는다.
- **PG GPS null → 거리 검증 완료 표시 금지** — PG 사진 자체 GPS가 null이면 보고서·로그에 "거리 검증 완료" 또는 거리 수치를 기재할 수 없다. 거리 수치가 필요하면 후보의 source record 좌표와 비교 대상 source record 좌표를 별도로 명시하고 그 근거를 기록한다.
- **보통명사·동명 관광지 후보는 `manual_review`** — PG 제목이 보통명사(예: 다원·고스락)이거나, 해당 제목의 전국 동명 관광지가 존재할 경우 location_raw 행정구역을 후보 district와 반드시 대조한다. 불일치 시 `confidence: manual_review`로 처리하고 matched_candidate_id를 부여하지 않는다.
- **근거 없는 거리 수치 작성 금지** — 실제 source record 좌표 비교 없이 추정 거리를 보고서에 기재하지 않는다.
