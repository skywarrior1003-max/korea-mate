# TourAPI 야간 조사 자동화 가이드

## 개요

`scripts/tourapi-nightly.mjs`는 KoreaMate `city_spots`와 TourAPI EngService2를 비교해 세 가지 조사 모드를 수행한다. DB 쓰기·migration·commit·push는 일절 하지 않는다.

## 환경 변수

| 변수 | 설명 |
|------|------|
| `SB_URL` | Supabase REST URL (`https://xxx.supabase.co`) |
| `SB_ANON` | Supabase anon public key (읽기 전용) |
| `TOUR_KEY` | 공공데이터포털 TourAPI 인증키 (EngService2) |

`.env.local`에 설정하거나 시스템 환경 변수로 지정한다. 값은 절대 로그에 출력되지 않는다.

## 실행 모드

### update (기본)

기존 `city_spots` 중 아래 항목을 대상으로 TourAPI 매칭을 재시도한다.

- `external_id IS NULL` (contentId 미등록)
- 이전 실행에서 `no_match`, `wrong_match`, `duplicate_contentid_conflict` 판정

```cmd
run-tourapi-nightly.cmd update busan
node scripts/tourapi-nightly.mjs --mode update --city busan --max-calls 200 --max-items 50
```

### discover

도시 경계 GPS 격자를 스캔해 `city_spots`에 없는 신규 장소 후보를 발굴한다.  
결과는 `discover-{city}.json`에만 기록되며 **자동 승인·DB 반영 없음**.

```cmd
run-tourapi-nightly.cmd discover busan
node scripts/tourapi-nightly.mjs --mode discover --city busan --max-calls 300
```

### full

모든 `city_spots`를 재수집한다. 신규 도시 초기 구축 또는 명시적으로 승인된 전체 점검에서만 사용.  
`--allow-full` 옵션 없이는 실행 불가.

```cmd
node scripts/tourapi-nightly.mjs --mode full --city busan --allow-full --max-calls 500
```

## 공통 옵션

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--city` | `busan` | 대상 도시 (config의 키 이름) |
| `--max-calls` | 200 | TourAPI 최대 호출 수 |
| `--max-items` | 50 | 최대 처리 항목 수 |
| `--dry-run` | — | API 호출 없이 파싱·경로만 확인 |
| `--no-resume` | — | 이전 상태 무시하고 처음부터 실행 |
| `--config` | 자동 | `data/tourapi-nightly-config.json` 경로 |
| `--allow-full` | — | full 모드 활성화 필수 플래그 |

## 출력 파일

```
tmp/tourapi-nightly/
├── state.json                          재개용 상태 (완료 ID 목록)
└── YYYY-MM-DD/
    ├── results-{mode}-{city}.json      전체 결과 (JSON)
    ├── summary-{mode}-{city}.csv       요약 CSV (Excel 열기 가능)
    ├── call-log-{mode}-{city}.csv      API 호출 로그
    └── discover-{city}.json            discover 모드 신규 후보
```

`tmp/tourapi-pilot/` 및 `tmp/tourapi-nightly/`는 `.gitignore` 대상이며 커밋하지 않는다.

## 분류 기준

| confidence | 조건 |
|------------|------|
| `high_confidence` | `exact_match` + score ≥ 130 |
| `manual_review` | `exact_match`(저점) 또는 `probable_match` |
| `wrong_match` | 거리 5km 초과 |
| `no_match` | 후보 없음 |
| `duplicate_conflict` | 동일 contentId가 여러 spot에 할당 |

## 재개

중단 후 같은 도시·모드·날짜로 재실행하면 `state.json`에서 완료된 ID를 건너뛰고 이어서 실행한다.  
다른 날짜가 되면 자동으로 새 실행으로 시작한다.

## 중단 조건

아래 상황에서는 스크립트가 스스로 중단하거나 수동 중단이 필요하다.

- `MAX_CALLS` 또는 `MAX_ITEMS` 도달 → 자동 중단 후 결과 저장
- Supabase 또는 TourAPI 응답 오류 → 해당 항목 스킵, 계속 실행
- 자동 분류 규칙 자체 오류 발견 → 수동 검토 후 `tourapi-batch.mjs` 수정

## 설정 파일

`data/tourapi-nightly-config.json`에서 도시 경계, API 기본값, 매칭 임계값을 조정할 수 있다.  
신규 도시 추가 시 `cities` 객체에 항목만 추가하면 된다.
