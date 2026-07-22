@echo off
:: run-tourapi-nightly.cmd — TourAPI 야간 조사 실행기 (Windows)
::
:: 사용법:
::   run-tourapi-nightly.cmd update busan
::   run-tourapi-nightly.cmd discover busan --dry-run
::   run-tourapi-nightly.cmd full busan --allow-full --max-calls 500
::
:: 환경 변수: .env.local 또는 시스템 환경 변수에서 로드
:: 금지: DB 수정 / commit / push / --no-verify

setlocal enabledelayedexpansion

:: ── .env.local 로드 ──────────────────────────────────────────────────────────
set ENV_FILE=%~dp0..\korea-mate\.env.local
if not exist "%ENV_FILE%" set ENV_FILE=%~dp0..\.env.local

if exist "%ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    set LINE=%%A
    if not "!LINE:~0,1!"=="#" (
      if not "%%B"=="" set %%A=%%B
    )
  )
  echo [ENV] .env.local 로드 완료
) else (
  echo [WARN] .env.local 없음 — 환경 변수가 이미 설정되어 있어야 합니다.
)

:: ── 인자 ─────────────────────────────────────────────────────────────────────
set MODE=%1
set CITY=%2
if "%MODE%"=="" set MODE=update
if "%CITY%"=="" set CITY=busan

:: 나머지 인자 그대로 전달
set EXTRA_ARGS=
shift
shift
:arg_loop
if "%1"=="" goto arg_done
set EXTRA_ARGS=%EXTRA_ARGS% %1
shift
goto arg_loop
:arg_done

:: ── 환경 변수 확인 (값은 절대 출력하지 않음) ──────────────────────────────
if "%SB_URL%"==""   echo [ERROR] SB_URL 미설정 & exit /b 1
if "%SB_ANON%"==""  echo [ERROR] SB_ANON 미설정 & exit /b 1
if "%TOUR_KEY%"=="" echo [ERROR] TOUR_KEY 미설정 & exit /b 1
echo [ENV] 자격증명 확인 완료 (값 출력 없음)

:: ── 실행 ─────────────────────────────────────────────────────────────────────
echo.
echo 실행: mode=%MODE% city=%CITY% %EXTRA_ARGS%
echo.

node "%~dp0tourapi-nightly.mjs" --mode %MODE% --city %CITY% %EXTRA_ARGS%

set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% neq 0 (
  echo.
  echo [FAIL] 종료 코드: %EXIT_CODE%
) else (
  echo.
  echo [OK] 완료
)

endlocal
exit /b %EXIT_CODE%
