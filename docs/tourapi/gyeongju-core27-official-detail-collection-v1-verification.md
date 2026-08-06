# TASK-GYEONGJU-CORE27-OFFICIAL-DETAIL-COLLECTION-V1 검증보고서

**작성일**: 2026-08-06  
**검증 판정**: **실행 보류 — 3개 개선 사항 반영 후 재제출 권고**  
**이유**: 파일럿 기준 설계 오류 1건 + 재현성 달성 방법 미명시 1건 + 기존 데이터 미활용 1건

---

## 요약

프롬프트의 전체 구조와 워크플로우는 타당하다. KTO TourAPI + 경주문화관광 공식 사이트를 이용한
표적 수집으로 CORE27의 설명·이미지·좌표를 완성하는 접근은 올바르다.

그러나 실제 CORE_TIER_1 데이터를 탐색한 결과 다음이 확인됐다:
1. **파일럿 5건 선정 기준이 달성 불가** (CORE_TIER_1 27건 전건 attraction, nature 0건)
2. **"자체 요약" 생성 알고리즘이 미명시**로 Run1=Run2 달성 불확실
3. **기존 수집된 WEB-ATT source facts 159건 및 course waypoint area_uid가 활용되지 않음**

---

## 1. CORE_TIER_1 27건 실제 현황 (실데이터 탐색)

| 항목 | 현황 |
|------|------|
| 총 후보 | 27건 |
| 카테고리 | **전건 attraction** (nature 0건) |
| source namespace | **전건 GJ01** |
| 좌표 보유 | 4/27 |
| 이미지 보유 | **0/27** |
| 설명 보유 | **0/27** |
| KTO contentId (source fact) | **0/27** |
| 저장된 VG 공식 URL (source fact) | **0/27** |

**CORE_TIER_1 27건 전체 이름**:
경주 계림, 경주 동궁원, 경주 엑스포대공원, 경주 월성, 경주읍성, 국립경주박물관, 나정, 대릉원, 동궁과 월지, 동리목월문학관, 무열왕릉, 민속공예촌, 박목월 생가, 보문관광단지, 분황사, 불국사, 삼릉, 석굴암, 양동마을, 오릉, 옥산서원, 우양미술관, 월정교, 중앙시장 야시장, 첨성대, 포석정, 황리단길

---

## 2. 개선 이슈

### 이슈-01 (BLOCKING): 파일럿 5건 선정 기준 달성 불가

**프롬프트 요건**:
> "attraction과 nature 모두 포함"

**실제**:
- CORE_TIER_1 27건 전건 attraction
- nature = **0건**

이 기준 그대로면 파일럿 선정 단계에서 실패한다.

**수정 권고**:
```
변경 전: "attraction과 nature 모두 포함"
변경 후: "attraction 카테고리 다양성: CORE_TIER_1 전건 attraction임을 인식하고
          세계유산·역사·자연경관·현대문화 등 성격 다른 attraction 5건 포함"
```

---

### 이슈-02 (IMPORTANT): "자체 요약" 생성 알고리즘 미명시

**프롬프트 요건**:
> "공식 페이지의 확인 가능한 사실을 기반으로 짧은 자체 요약을 작성한다"

**문제**:
Run1=Run2 BYTE_IDENTICAL을 달성하려면 처리 phase에서의 요약 생성이 결정적이어야 한다.
그런데 "자체 요약"을 누가 어떻게 생성하는지 명시가 없다.

세 가지 경로가 가능하다:

| 경로 | Run1=Run2 가능 여부 | 품질 | 비고 |
|------|------------------|------|------|
| A. 규칙 기반 템플릿 | ✅ 가능 | 낮음 | `{장소명}은 경주에 위치한 {카테고리}입니다. {주소}.` |
| B. Gemini API 호출 (수집 phase) → raw 저장 | ✅ 가능 (처리 phase에서 읽기만) | 높음 | .env.local GEMINI_API_KEY 필요 |
| C. 처리 phase에서 LLM 호출 | ❌ 불가 | 높음 | 매 실행마다 다름 |

**수정 권고**:
```
방법 B 명시:
- 수집 phase에서 Gemini API로 요약 생성
- 생성 결과를 raw snapshot에 저장
- 처리 phase(Run1=Run2)에서는 저장된 raw 요약을 읽기만 함
- original_text_hash + generated_summary_hash로 재현성 확인

또는 방법 A 명시 (Gemini API 불필요 시):
- 규칙 기반 템플릿 포맷 구체화
- 추출 필드: 장소명, 카테고리, 주소, 운영시간, 입장료, 역사적 특징
- 연결 문장 규칙 명시
```

프롬프트에는 기존에 `GEMINI_API_KEY`가 `.env.local`에 설정돼 있으므로 방법 B가 자연스럽다.

---

### 이슈-03 (IMPROVEMENT): 기존 수집 데이터 미활용

실데이터를 탐색한 결과 두 가지 기존 데이터가 CORE27 작업에 직접 활용 가능하다.

#### A. WEB-ATT source facts 159건

`data/tourapi/normalized/gyeongju/source-facts-full-v1.jsonl` 내
`source_fact_id`가 `WEB-ATT` prefix인 source facts 159건이 이미 존재한다.

이 데이터는 이전 visitgyeongju.go.kr 수집 작업에서 생성된 것으로,
경주 관광지 detail 페이지 데이터를 포함할 가능성이 높다.

**수정 권고**:
Section 1 "CORE27 입력 확정" 이전에 다음을 추가:
```
WEB-ATT source facts 탐색:
- source-facts-full-v1.jsonl에서 WEB-ATT prefix 항목 추출
- CORE27 candidate와 이름 매칭
- 매칭된 항목의 official_url, address, 기타 필드 활용
```

#### B. Course waypoint area_uid → VG detail URL

`gyeongju-course-waypoint-relations-v1.jsonl` 29건이 area_uid와 detail_url을 보유한다.

```
area_uid=47: 첨성대  → https://www.gyeongju.go.kr/tour/page.do?...&area_uid=47&cmd=2
area_uid=48: 국립경주박물관
area_uid=49: 월정교
area_uid=50: 동궁과 월지
area_uid=51: 경주 월성
...
```

이 URL 패턴으로 CORE27 중 다수의 VG 공식 detail URL을 직접 구성할 수 있다.

**수정 권고**:
Section 1 또는 Section 5에 다음 추가:
```
VG detail URL 탐색 우선순위:
1. 저장된 official_external_url (현재 전건 없음)
2. course waypoint relations의 area_uid → URL 구성
3. WEB-ATT source facts의 source_url
4. 이름 기반 검색으로 area_uid 탐색
```

---

### 이슈-04 (참고): KTO contentId 탐색 가능성

KTO type12(143건) 이름 매칭으로 현재 6건 확인 가능:

| CORE27 이름 | KTO 제목 | contentId |
|------------|---------|----------|
| 나정 | 경주 나정 | 128635 |
| 동궁과 월지 | 경주 동궁과 월지 | 128526 |
| 경주 엑스포대공원 | 경주엑스포대공원 | 127487 |
| 경주읍성 | 경주읍성 | 2756611 |
| 대릉원 | 대릉원 | 3101699 |
| 첨성대 | 첨성대 | 3101689 |

불국사, 석굴암 등은 KTO type12에 있으나 이름 표기 차이로 위의 단순 매칭에서 누락됨.  
Section 4의 "제한적 KTO 검색"을 통해 나머지도 찾을 수 있을 것으로 예상됨 (차단 이슈 아님).

---

## 3. 실행 가능성 평가

이슈-01~03 해소 시 태스크 실행은 가능하며 다음을 달성할 수 있을 것으로 예상된다:

| 예상 항목 | 수치 |
|----------|------|
| VG detail URL 확보 가능 (course waypoints) | 10~20건 |
| KTO contentId 확보 가능 | 15~22건 |
| KTO overview 기반 description_ko | 10~15건 |
| 요약 기반 description_ko | 5~10건 |
| 대표 이미지 (KTO firstimage 또는 VG 공식) | 20~27건 |
| 신규 RELEASE 제안 가능 | 15~24건 (추정) |

---

## 4. 수정 체크리스트

실행 전 프롬프트에 반영 필요:

- [ ] 파일럿 5건 기준 "nature 포함" → "성격 다른 attraction 5건" 으로 변경
- [ ] "자체 요약" 생성 방법 명시 (Gemini API 수집 phase 활용 또는 규칙 기반 템플릿)
- [ ] Section 1에 WEB-ATT source facts 159건 활용 단계 추가
- [ ] Section 5에 course waypoint area_uid → VG URL 구성 경로 추가

---

## 5. 그 외 확인 사항

| 항목 | 상태 |
|------|------|
| TOUR_API_KEY (.env.local) | 확인 필요 (기존 스크립트에서 사용 확인됨) |
| 기존 frozen 파일 보호 | 프롬프트 절대 수정 금지 목록 적절 |
| Run1=Run2 구조 (수집/처리 분리) | 프롬프트에서 "동일 raw snapshot으로 Run1=Run2" 명시 — 적절 |
| 23개 산출물 | 스크립트 규모 적정 (이전 16/24개 경험 있음) |
| 사용자 승인 정책 분리 | 적절하게 VERIFIED / APPROVED_BY_OWNER 구분 |
| takedown_ready | 포함 |
| 행사 5건 date audit | 부가 작업으로 적절 |

---

*실데이터 탐색: HTTP/API/WebFetch 0건, 기존 frozen raw 읽기만*  
*브랜치: data/gyeongju-core-attraction-nature-enrichment-v1 HEAD ed2e0bc*
