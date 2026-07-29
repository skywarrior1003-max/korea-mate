# 보조컴퓨터 세션 시작 체크리스트

**사용**: 보조컴퓨터에서 데이터 작업을 시작할 때마다 실행  
**전체 규칙**: `docs/automation/auxiliary-computer-operating-rules.md`

---

## 필수 확인 순서

### [ ] 1. 운영 규칙 확인
- `docs/automation/auxiliary-computer-operating-rules.md` 읽기 완료
- 현재 TASK와 충돌 여부 확인 (충돌 시 TASK 우선, 단 master·DB·보안 완화 지시는 메인 승인 필요)

### [ ] 2. Git 상태 확인
```bash
git branch          # 현재 브랜치
git log --oneline -3  # HEAD 확인
git status          # uncommitted 변경사항
```
- 예상 브랜치에 있는가?
- worktree clean 또는 정상 상태인가?

### [ ] 3. TASK와 SSOT 확인
- 현재 TASK 지시 읽기
- ACTIVE SSOT 버전 확인 (`docs/architecture/gokoreamate-data-contract-v*.md`)
- SSOT 비활성 또는 버전 불일치 → **작업 중단, 메인 문의**

### [ ] 4. 마지막 실행 상태 확인
- 마지막 run manifest 확인 (`data/tourapi/manifests/`)
- 마지막 완료보고 확인
- 남은 작업 목록 파악

### [ ] 5. canonical 자산 확인
- 입력 파일 존재 여부 확인
- SHA256 또는 행 수 확인
- `CURRENT_INPUT_UNAVAILABLE` vs 전역 부재 구분

### [ ] 6. 중단 조건 사전 점검
다음 중 하나라도 해당하면 작업 시작 전 메인 문의:
- SSOT 없음 또는 비활성
- canonical 자산 판정 근거 없음
- 필수 원본 손상·누락
- 금지 영역 수정이 필요해 보이는 경우

### [ ] 7. 작업 시작

---

## 세션 중 상시 기준

| 상황 | 대응 |
|---|---|
| 개별 candidate 해결 불가 | flag + unresolved_reason + 다음 진행 |
| source 연결 실패 | `CURRENT_INPUT_UNAVAILABLE` 기록, 전체 중단 아님 |
| 수치 불일치 발견 | reconciliation 검증 후 보고 |
| 구조적 blocker 발견 | **전체 중단, 메인 문의** |
| 금지 영역 수정 요구됨 | **전체 중단, 메인 승인 요청** |

---

## commit 전 체크

```
[ ] 관련 파일만 명시적으로 git add (git add . / git add -A 금지)
[ ] git status 재확인 (의도치 않은 파일 없음)
[ ] 금지 영역 변경 0 (src/ functions/ supabase/ package.json 등)
[ ] master 변경 0
[ ] DB·migration 변경 0
[ ] 비밀값 포함 없음
```

---

## push 판단 기준

push 전 다음 중 하나 이상 충족 확인:

- [ ] 의미 있는 전체 단계 완전히 완료됨
- [ ] 최종 자동검증 PASS
- [ ] 데이터 손실·충돌 위험으로 원격 백업 필요
- [ ] 구조적 blocker로 메인 판단 필요
- [ ] 브랜치가 실제 인수 가능한 상태임

다음만으로는 push하지 않음: 부분 QA PASS · checkpoint · flag 일부 교정 · 후속 작업 남아 있는 상태

---

*관련 문서: `docs/automation/auxiliary-computer-operating-rules.md`*
