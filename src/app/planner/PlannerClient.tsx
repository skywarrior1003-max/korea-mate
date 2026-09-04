"use client";

// PLANNER-SPOTS-SEPARATION-V1: 이 파일은 예전 HomeClient 의 AI 플래너 부분을
// 그대로 옮긴 것이다(Owner 결정 — #planner 를 Home 에서 분리). 폼 필드·검증·
// draft·clone(?ref=clone)·?city= 처리·생성 semantics 는 바꾸지 않았다.
// Home 에 있던 #spots-main 대량 디렉토리와 그 전용 상태(events/GPS/필터/BTS
// 모달)는 함께 옮기지 않고 제거했다 — 장소 발견은 Search·City Hub·Explore 가
// 담당한다(데이터·canonical route·/all-spots 는 그대로).

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { resolveCityParam, stripCityParam } from "@/lib/home-city-param-core";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import DatePicker from "@/components/DatePicker";
import ContactModal from "@/components/ContactModal";
import { getCart, CART_EVENT } from "@/lib/cart";
import { trackEvent } from "@/lib/analytics";
import { useTranslations } from "next-intl";
import { stayAreaOptions } from "@/lib/trip-stay/stay-core";
import StayFieldsSection from "@/components/StayFields";
import {
  EMPTY_STAY_FIELDS, stayFieldsFrom, stayModeFrom,
  type StayFields, type StayMode,
} from "@/lib/trip-stay/stay-input-core";
import { readTripDraft, writeTripDraft, clearTripDraft, type TripStayDetail }
  from "@/lib/trip-draft/trip-draft-core";
import { DEFAULT_TRIP_PACE, TRIP_PACE_CHOICES, type TripPaceChoice }
  from "@/lib/trip-pace/pace-core";
import { buildItineraryGenerationUrl, itineraryDayCount } from "@/lib/trip-generation/itinerary-url";
import { CITY_ARRIVAL_DEFAULTS, CITY_ARRIVAL_OPTIONS } from "@/data/city-presets";
import { CITY_CONFIGS, CITY_SLUGS, cityLabelKey } from "@/data/cities";
import { citySwitchAction, savedToReleaseForCity, hasPlanningState } from "@/lib/city-switch/city-switch-core";
import { getSavedSpotsData, removeFavorite } from "@/lib/favorites";
import { getCityCart, clearCityCart } from "@/lib/cart";

// 정적 프리렌더 중에는 레이아웃 이펙트가 의미도 없고 경고만 낸다.
// 브라우저에서만 레이아웃 이펙트를 쓴다 — 페인트 전 판정이 필요한 쪽은 거기뿐이다.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function PlannerClient() {
  // AI 여행계획 폼 전용 문구. 화면에 보이는 label 만 번역하고
  // city·style·시간 슬롯의 내부 value 는 손대지 않는다 — API payload 와
  // localStorage 가 그 값을 그대로 쓴다.
  // 제휴 링크는 화면이 소유하지 않는다 — 상품 키만 넘기고 resolver 가 정한다.
  const tf = useTranslations("tripForm");
  // 도착/출발 지점 이름표는 locale 을 따른다(tripForm.arrival_*). value 는 그대로(URL·localStorage 계약).
  const arrivalLabel = (label: string): string => { const m = label.match(/^(\S+)\s+(.+)$/); const emoji = m ? m[1] : ""; const base = m ? m[2] : label; const key = `arrival_${base.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`; try { return tf.has(key) ? `${emoji} ${tf(key)}`.trim() : label; } catch { return label; } };
  const tPace = useTranslations("pace");
  const th = useTranslations("homeUi");
  const tn = useTranslations("nav");
  const tFooter = useTranslations("footer"); // 저작권 줄도 Explore 와 같은 footer.copyright 를 쓴다

  // ── AI 플래너 폼 ──────────────────────────────
  const [city,          setCity]          = useState("Busan");
  // ?city= 가 플래너 미지원 도시를 가리킬 때. 그 프레임부터 Home 을 그리지 않는다.
  const [redirecting,   setRedirecting]   = useState(false);
  const [startDate,     setStartDate]     = useState("");
  const [endDate,       setEndDate]       = useState("");
  const [travelers,     setTravelers]     = useState("1");
  // 어떤 속도로 다닐 것인가. 동행 선택에서 유추하지 않는다 — 다른 질문이다.
  const [tripPace,      setTripPace]      = useState<TripPaceChoice>(DEFAULT_TRIP_PACE);
  const [style,         setStyle]         = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return sessionStorage.getItem("km_travel_style") || ""; } catch { return ""; }
  });
  const [cartItemCount, setCartItemCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try { return getCart().length; } catch { return 0; }
  });
  const [showVibeModal,   setShowVibeModal]   = useState(false);
  const [showCloneBanner, setShowCloneBanner] = useState(false);
  const [startLocation, setStartLocation] = useState("KTX Busan Station (부산역)");
  const [arrivalTime,   setArrivalTime]   = useState("14:00");

  const [contactOpen,     setContactOpen]     = useState(false);

  useEffect(() => {
    if (!style) return;
    try { sessionStorage.setItem("km_travel_style", style); } catch { /* ignore */ }
  }, [style]);

  // ── 지역 변경 ────────────────────────────────────────────────────────────
  //
  // 한 번에 한 지역만 계획한다. 지역을 바꾸면 이전 지역에서 모아 둔 임시 상태
  // (Saved · This Trip)는 정리하고 새 지역에서 다시 시작한다. 돌아왔을 때
  // 되살려 주는 도시별 바구니는 만들지 않는다 — 있으면 사용자는 자기가 지금
  // 무엇을 보고 있는지 알 수 없다.
  //
  // 어느 도시가 열렸는지는 세지 않는다. `CityConfig.planningReady` 하나만 본다.
  const [pendingCity, setPendingCity] = useState<string | null>(null);

  /** 이름이든 slug 든 그 도시의 선언을 찾는다. 화면은 이름을, 설정은 slug 를 쓴다. */
  function cityConfigOf(v: string) {
    const k = v.trim().toLowerCase();
    return CITY_CONFIGS[k]
      ?? Object.values(CITY_CONFIGS).find(c => c.name.toLowerCase() === k)
      ?? null;
  }

  /** 이전 지역의 임시 상태를 정리하고 새 지역에서 다시 시작한다. */
  function applyCitySwitch(next: string) {
    try {
      // 이 도시 것이 확실한 Saved 만 내린다. 도시를 모르는 예전 항목은 남는다.
      for (const r of savedToReleaseForCity(getSavedSpotsData(), city)) {
        removeFavorite(r.id, r.sourceKey);
      }
      clearCityCart(city);
    } catch { /* ignore */ }

    // 저장된 draft 를 먼저 지운다.
    //
    // `writeTripDraft` 는 날짜가 유효할 때만 쓴다. 날짜를 비운 채로 두면 그
    // 저장은 조용히 실패하고 **이전 도시가 그대로 남는다** — 화면은 경주인데
    // 저장된 여행은 부산인 상태가 된다. 지우고 시작하면 새 지역에서 날짜를
    // 고르는 순간 그때의 인원·속도와 함께 새로 쓰인다.
    clearTripDraft();

    // 날짜·도착·출발·숙박은 그 지역에서만 뜻이 있는 값이라 비운다.
    // 인원과 여행 속도는 지역이 바뀌어도 그대로다 — 같은 사람이 같은 방식으로
    // 다닌다. 두 값은 React state 로 남아 다음 draft 에 그대로 실린다.
    setStartDate(""); setEndDate("");
    setArrivalTime("");
    setDeparturePlace(""); setDepartureTime("");
    setStayArea(""); setStayMode("none"); setStayDetail(null);

    setPendingCity(null);
    setCity(next);
  }

  /** 도시 버튼이 부른다. 바꿔도 되는지 먼저 보고, 지울 것이 있으면 묻는다. */
  function requestCitySwitch(next: string) {
    const action = citySwitchAction({
      from: city, to: next, toCity: cityConfigOf(next),
      hasPlanningState: hasPlanningState({
        savedForCity: savedToReleaseForCity(getSavedSpotsData(), city).length,
        cartForCity:  getCityCart(city).length,
      }),
    });
    if (action === "blocked" || action === "noop") return;
    if (action === "confirm") { setPendingCity(next); return; }
    applyCitySwitch(next);
  }

  // ── 도시 변경 시 도착지 기본값 자동 전환 ─────────────────────────────────
  useEffect(() => {
    setStartLocation(CITY_ARRIVAL_DEFAULTS[city] ?? city);
  }, [city]);


  const router = useRouter();

  // ── 클론 파라미터 처리 (?city=&from=&to=&style=&ref=clone) ──────────────
  //
  // ?city= 는 도시 진입 화면의 CTA 가 넘긴다. 판정은 resolveCityParam 한 곳에
  // 맡긴다 — 여기에 도시 목록을 적어두면 도시가 늘 때마다 빠뜨린다. 실제로
  // jeonju 가 빠져 있어서 /jeonju/ 에서 온 요청이 Busan 으로 흘렀다.
  //
  // 레이아웃 이펙트인 이유: redirect 로 판정된 경우 Busan 플래너가 한 프레임
  // 이라도 그려지면 안 된다. 레이아웃 이펙트의 상태 갱신은 페인트 전에
  // 반영되므로 화면에 Busan 이 스치지 않는다.
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const isClone = p.get("ref") === "clone";

    const resolved = resolveCityParam(p.get("city"));
    if (resolved.kind === "redirect") {
      // 플래너가 없는 도시다. 그 도시의 진입 화면이 정답이므로 그리로 보낸다.
      // replace 라 뒤로가기가 이 URL 로 되돌아오지 않는다 = 루프가 없다.
      setRedirecting(true);
      router.replace(resolved.href);
      return;
    }
    if (resolved.kind === "planner") setCity(resolved.city);
    if (resolved.kind === "ignore") {
      // 모르는 도시다. Busan 으로 해석하지 않고 주소에서 지우기만 한다.
      // 도시 선택·일정은 건드리지 않으므로 평소 Home 그대로다.
      //
      // router.replace 가 아니라 history.replaceState 인 이유: 같은 route 로의
      // replace 는 주소를 그대로 두는 경우가 있어 실측에서 ?city= 가 남았다.
      // 여기서 필요한 건 라우팅이 아니라 주소 정리뿐이라 재렌더도 없는 쪽이 낫다.
      window.history.replaceState(
        null, "",
        stripCityParam(window.location.pathname, window.location.search) + window.location.hash,
      );
    }

    if (!isClone) return;
    const from = p.get("from");
    const to   = p.get("to");
    const st   = p.get("style");
    if (from) setStartDate(from);
    if (to)   setEndDate(to);
    if (st && ["Solo", "Couple", "Family", "Group"].includes(st)) setStyle(st);
    setShowCloneBanner(true);
    setTimeout(() =>
      document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })
    , 300);
  }, []);

  // ── /#planner 로 들어오면 플래너에 키보드 focus 를 준다 ──────────────────
  //
  // 브라우저 기본 앵커 이동은 스크롤만 하고 focus 는 직전에 누른 버튼에
  // 남겨 둔다(실측 당시: 전역 CartDrawer 의 Build 버튼). 키보드·스크린리더 사용자는
  // 화면은 플래너로 갔는데 Tab 은 헤더로 돌아가는 상태가 된다.
  //
  // preventScroll 로 브라우저 앵커 스크롤과 겹치는 두 번째 점프를 막는다.
  // 이미 플래너 안쪽에 focus 가 있으면 빼앗지 않는다 — 입력 중에 커서를
  // 옮기면 더 나쁘다.
  useEffect(() => {
    function focusPlanner() {
      if (window.location.hash !== "#planner") return;
      const section = document.getElementById("planner");
      if (!section) return;
      if (section.contains(document.activeElement)) return;
      section.focus({ preventScroll: true });
    }
    // 해시 진입 직후에는 아직 섹션이 그려지지 않았을 수 있다.
    const id = window.setTimeout(focusPlanner, 0);
    window.addEventListener("hashchange", focusPlanner);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("hashchange", focusPlanner);
    };
  }, []);

  const [isNavigating,    setIsNavigating]    = useState(false);
  const [departurePlace,  setDeparturePlace]  = useState("");
  const [departureTime,   setDepartureTime]   = useState("");
  const [showDeptSection, setShowDeptSection] = useState(false);
  const [showDeptWarning, setShowDeptWarning] = useState(false);
  const [deptDismissed,   setDeptDismissed]   = useState(false);
  // 숙박 지역 — 선택 입력. 정확한 숙소가 아니라 공개 지역 프리셋 하나다.
  const [stayArea,        setStayArea]        = useState("");
  const [showStaySection, setShowStaySection] = useState(false);
  // 사용자가 고른 숙박 수준. 아직 안 정했거나 / 동네만 / 숙소를 정했거나.
  const [stayMode,        setStayMode]        = useState<StayMode>("none");
  // 정확한 숙소. 글자는 사용자의 메모고, 좌표는 지도에서 짚었을 때만 생긴다.
  const [stayFields,      setStayFields]      = useState<StayFields>(EMPTY_STAY_FIELDS);
  const [stayDetail,      setStayDetail]      = useState<TripStayDetail | null>(null);

  /**
   * 숙박 수준을 바꾼다.
   *
   * 적어 둔 글자를 지우지 않는다. `Not decided yet` 을 잘못 눌렀다가 되돌리는
   * 사람이 이름과 주소를 다시 타이핑하게 만들지 않는다 — 저장되는 내용은 아래
   * 저장 effect 가 고른 수준에 맞춰 정한다.
   */
  function changeStayMode(next: StayMode) { setStayMode(next); }
  const deptSectionRef = useRef<HTMLDivElement>(null);

  // ── 이번 여행의 조건을 This Trip 도 볼 수 있게 남긴다 ─────────────────────
  //
  // 지금까지 도시와 날짜만 남겼다. 동행·도착·출발·숙박은 이 컴포넌트 안에만
  // 있어서 화면을 떠나면 사라졌고, This Trip 은 그 값들을 볼 방법이 없었다.
  // 같은 여행인데 두 화면이 서로 다른 것을 알고 있는 상태였다.
  //
  // 읽기가 먼저고 쓰기가 나중이다. 순서가 뒤집히면 첫 렌더의 기본값("1",
  // "14:00", "")이 저장된 값을 덮어쓴다 — 돌아올 때마다 입력이 초기화되는 것과
  // 같다. `restored` 가 그 순서를 지킨다.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const d = readTripDraft();
    if (d) {
      // 날짜도 되돌린다.
      //
      // 처음에는 "도시·날짜는 다른 곳에서 정해진다" 고 두고 건드리지 않았다.
      // 그런데 되돌리는 곳이 아무 데도 없었다. 날짜를 고르고 장소를 담으러
      // Explore·Picks 로 갔다가 돌아오면 달력이 비어 있고, 일정 만들기를 눌러도
      // 아무 일이 일어나지 않는다 — 날짜가 없어 조용히 멈춘다. 장소를 담는 것
      // 자체가 Home 을 떠나야 하는 일이라 이 경로가 오히려 정상 경로였다.
      //
      // 두 가지를 지킨다. 이미 값이 있으면 덮지 않는다(복사 링크의 ?from=·?to=
      // 가 먼저 들어온다). 그리고 draft 의 도시가 지금 고른 도시와 같을 때만
      // 쓴다 — 서울 여행의 날짜를 부산 화면에 올려 두면 그다음 저장이 도시를
      // 조용히 바꿔 버린다.
      if (d.startDate && d.endDate && d.city.trim().toLowerCase() === city.trim().toLowerCase()) {
        setStartDate(prev => prev || d.startDate);
        setEndDate(prev   => prev || d.endDate);
      }
      if (d.travelers)      setTravelers(d.travelers);
      if (d.tripPace)       setTripPace(d.tripPace);
      if (d.startLocation)  setStartLocation(d.startLocation);
      if (d.arrivalTime)    setArrivalTime(d.arrivalTime);
      if (d.departurePlace) setDeparturePlace(d.departurePlace);
      if (d.departureTime)  setDepartureTime(d.departureTime);
      if (d.stayArea)       setStayArea(d.stayArea);
      if (d.stay) { setStayDetail(d.stay); setStayFields(stayFieldsFrom(d.stay)); }
      setStayMode(stayModeFrom(d.stayArea, d.stay));
      // 되살린 값이 접힌 칸 안에 숨어 있으면 사용자는 자기가 입력한 것을 보지
      // 못한 채 일정이 생성되는 것을 본다.
      if (d.departurePlace || d.departureTime) setShowDeptSection(true);
      if (d.stayArea || d.stay)                setShowStaySection(true);
    }
    setRestored(true);
  }, []);

  // ── 도시를 바꾸면 그 도시에 없는 지점은 버린다 ────────────────────────────
  //
  // 프리셋 value 는 도시별 목록에서 고른 것이다. 서울로 바꿔도 "해운대"가 남아
  // 있으면 builder 가 좌표를 찾지 못한 채 이름만 넘기고, 사용자는 자기가 고르지
  // 않은 지역이 선택돼 있는 것을 본다. 도착지는 이미 위에서 새 도시 기본값으로
  // 바뀐다 — 출발지와 숙박 지역만 남아 있었다.
  useEffect(() => {
    if (!restored) return;
    const options = CITY_ARRIVAL_OPTIONS[city] ?? [];
    setDeparturePlace(p => (p && !options.some(o => o.value === p) ? "" : p));
    setStayArea(s => (s && !stayAreaOptions(city).some(o => o.value === s) ? "" : s));
    // 적어 둔 숙소 이름·주소·링크는 그대로 둔다 — 사용자가 쓴 글을 우리가
    // 지우지 않는다. 다만 지도에서 확인한 좌표는 버린다. 부산에서 짚은 지점이
    // 서울 여행에 그대로 남으면 다음 작업에서 엉뚱한 곳을 기준으로 잡는다.
    setStayDetail(prev => {
      if (!prev?.coordinate) return prev;
      const { coordinate: _dropped, ...rest } = prev;
      return Object.keys(rest).length > 0 ? rest : null;
    });
  }, [city, restored]);

  // 값이 실제로 바뀔 때만 도는 effect 라 매 렌더마다 쓰지 않는다.
  // 도시·날짜가 모두 유효할 때만 저장된다 — 날짜를 하나만 고른 순간에 쓰면
  // This Trip 이 하루짜리 여행을 보게 된다.
  useEffect(() => {
    if (!restored) return;
    writeTripDraft({
      city, startDate, endDate,
      travelers, startLocation, arrivalTime, departurePlace, departureTime,
      // 고른 수준이 저장되는 내용을 정한다.
      //
      // 지역은 `Not decided yet` 일 때만 지운다. 숙소를 정한 사람의 지역 선택은
      // 남겨 둔다 — 지도 확인 전까지 그 사람에 대해 우리가 아는 유일한 위치이고,
      // 하루 시작점이 이미 그것을 쓰고 있다.
      stayArea: stayMode === "none"  ? "" : stayArea,
      stay:     stayMode === "exact" ? stayDetail : null,
      tripPace,
    });
  }, [restored, city, startDate, endDate,
      travelers, startLocation, arrivalTime, departurePlace, departureTime,
      stayArea, stayMode, stayDetail, tripPace]);

  // ── AI 일정 생성 ──────────────────────────────
  function doNavigate(overrideStyle?: string) {
    const effectiveStyle = overrideStyle ?? style;
    // 주소 조립은 공용 builder 한 곳에서 한다. This Trip 도 같은 것을 쓴다 —
    // 두 화면이 각자 조립하면 파라미터 하나가 어긋나도 한쪽에서만 티가 난다.
    const url = buildItineraryGenerationUrl({
      city, startDate, endDate, travelers,
      travelStyle:    effectiveStyle,
      tripPace,
      startLocation,  arrivalTime,
      departurePlace, departureTime, stayArea,
    });
    if (!url) return;                       // 도시·날짜가 없으면 이동하지 않는다
    setIsNavigating(true);
    trackEvent("generate_itinerary", {
      city, travelers, travel_style: effectiveStyle,
      days: itineraryDayCount(startDate, endDate),
    });
    router.push(url);
  }

  function handleGenerate() {
    // 필수 조건 먼저 확인 — vibe 모달은 모든 조건 통과 후 마지막에만 표시
    if (!startDate || !endDate) {
      alert(tf("errNoDates"));
      return;
    }
    if (isNavigating) return;
    if (!departurePlace && !departureTime && !deptDismissed) {
      setShowDeptWarning(true);
      return;
    }
    // 스팟 미선택 시 유도 모달
    if (cartItemCount === 0) {
      setShowVibeModal(true);
      return;
    }
    doNavigate();
  }

  function handlePickVibeClick() {
    // 예전에는 Home 의 #spots-main 카드로 스크롤했다. 그 디렉토리는 제거됐고,
    // 장소를 담는 정상 경로는 Explore 다(카트는 localStorage 라 그대로 이어진다).
    setShowVibeModal(false);
    router.push(`/explore/${cityConfigOf(city)?.slug ?? "busan"}`);
  }

  function handleContinueWithoutPicks() {
    setShowVibeModal(false);
    if (!startDate || !endDate) {
      alert("Please select both start and end travel dates.");
      return;
    }
    if (!departurePlace && !departureTime && !deptDismissed) {
      setShowDeptWarning(true);
      return;
    }
    // 고르지 않았으면 비워 둔다. 예전에는 "Solo" 를 넣었는데, 그러면 넷이 가는
    // 여행에도 "Solo Trip" 이라고 적혔다. 없는 것은 없는 대로 넘긴다.
    doNavigate(style);
  }

  useEffect(() => {
    const refresh = () => { try { setCartItemCount(getCart().length); } catch { setCartItemCount(0); } };
    window.addEventListener(CART_EVENT, refresh);
    return () => window.removeEventListener(CART_EVENT, refresh);
  }, []);

  // ════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════

  // 도시 진입 화면으로 넘기는 중이다. 플래너를 그리면 Busan 도착지 목록이
  // 잠깐 보이고, 그건 그 도시를 고른 사용자에게 틀린 화면이다.
  if (redirecting) {
    return <div className="min-h-screen bg-white" aria-hidden />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans antialiased overflow-x-clip">

      {/* ── 네비게이션 ──────────────────────────────────────────── */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          <Link href="/" className="text-lg sm:text-xl font-normal text-gray-900 flex items-center gap-1 sm:gap-1.5 shrink min-w-0">
            <span className="font-black tracking-tight">gokoreamate</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog"           className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("blog")}</Link>
            <Link href="/restaurants"    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("foodGuide")}</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("survivalGuide")}</Link>
            <Link href="/about"          className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("about")}</Link>
            <Link href="/my-trips"       className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("myTrips")}</Link>
            {/* 데스크톱 CTA 도 Home 시안 색을 따른다. 이모지 라벨과 주황 버튼은
                구버전 인상이 강해 Hero 보다 메뉴가 먼저 읽혔다 */}
            <LanguageSwitcher variant="icon" className="text-gray-700" />
            <button
              onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })}
              className="px-5 py-2.5 rounded-full text-sm font-bold text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#0041c8" }}
            >
              {tn("planMyTrip")}
            </button>
          </nav>
          {/* 모바일 헤더 — 시안은 로고 + 아이콘 두 개로 아주 얇다.
              예전엔 여기에 큰 버튼 두 개(My Trips / Plan Trip)가 있어서 첫
              화면의 3분의 1을 먹고 Hero 위계를 눌렀다. 두 경로 모두 살아 있다:
              일정 만들기는 화면 안 CTA 와 하단 내비, My Trips 는 아래 아이콘. */}
          <div className="sm:hidden flex items-center gap-1 shrink-0">
            <LanguageSwitcher variant="icon" className="text-gray-700" />
            <Link
              href="/my-trips"
              aria-label={tn("myTrips")}
              className="gkm-focus w-11 h-11 inline-flex items-center justify-center rounded-full text-gray-700"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="7.5" width="17" height="12.5" rx="2.4" />
                <path d="M9 7.5V6a1.6 1.6 0 011.6-1.6h2.8A1.6 1.6 0 0115 6v1.5" />
              </svg>
            </Link>
          </div>
        </div>
      </header>


      {/* ══════════════════════════════════════════════════════════
          AI 일정 생성 폼
      ══════════════════════════════════════════════════════════ */}
      {/* tabIndex={-1} 은 프로그램적 focus 만 허용한다 — Tab 순서에는 들어가지
          않으므로 마우스 사용자의 흐름은 그대로다. aria-labelledby 로 아래
          h2 를 이름으로 재사용해 스크린리더가 이 영역의 목적을 읽는다. */}
      <section
        id="planner"
        tabIndex={-1}
        aria-labelledby="planner-heading"
        className="py-20 focus:outline-none"
        style={{ backgroundColor: "#faf8f3" }}
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6">

          {/* 클론 배너 — ?ref=clone 진입 시 표시 */}
          {showCloneBanner && (
            <div
              className="mb-6 flex items-center justify-between gap-3 px-5 py-3.5 rounded-xl text-sm font-bold"
              style={{
                background: "rgba(212,175,55,0.10)",
                border: "1px solid rgba(212,175,55,0.35)",
                color: "#8C6239",
              }}
            >
              <span>{tf("sharedBanner")}</span>
              <button
                onClick={() => setShowCloneBanner(false)}
                className="text-xs font-black opacity-50 hover:opacity-100 shrink-0 transition-opacity"
              >✕</button>
            </div>
          )}

          <div className="text-center mb-8">
            <h2 id="planner-heading" className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">
              {tf("title")}
            </h2>
            <p className="text-base font-medium text-gray-500">
              {tf("subtitle")}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("cityLabel")}</label>
                <div className="w-full bg-gray-50 border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                  {/* 어느 도시가 열렸는지는 `planningReady` 하나가 정한다.
                      예전에는 Busan 만 따로 떼어 "활성" 이라고 적어 두었는데, 그
                      구분이 이제 선언 값으로 옮겨졌으므로 한 목록으로 둔다 —
                      도시가 열리면 값만 바꾸면 되고 이 파일은 손대지 않는다. */}
                  {CITY_SLUGS.map((slug) => {
                    const conf  = CITY_CONFIGS[slug]!;
                    const c     = { value: conf.name, emoji: conf.emoji };
                    const ready = conf.planningReady;
                    return (
                    <button
                      key={c.value}
                      type="button"
                      aria-disabled={!ready}
                      onClick={() => { if (ready) requestCitySwitch(c.value); }}
                      className={`w-full flex items-center justify-between px-4 py-3 text-base font-semibold transition-colors ${
                        !ready
                          ? "text-gray-400 cursor-not-allowed"
                          : city === c.value
                            ? "bg-orange-50 text-orange-700 border-l-4 border-orange-500 cursor-pointer"
                            : "text-gray-900 hover:bg-gray-100 cursor-pointer"
                      }`}
                    >
                      <span>{c.emoji} {tf(cityLabelKey(conf))}</span>
                      {/* 눌러도 아무 일이 없으면 고장 난 버튼으로 읽힌다. 왜 안 되는지 말해 준다. */}
                      {!ready && <span className="text-[11px] font-bold text-gray-400">{tf("cityComingSoon")}</span>}
                      {ready && city === c.value && <span className="text-xs font-black text-orange-500">{tf("cityChosen")}</span>}
                    </button>
                    );
                  })}
                </div>
                <Link
                  href={`/explore/${city.toLowerCase()}`}
                  className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-black rounded-xl transition-all active:scale-95 hover:opacity-90 shadow-sm"
                  style={{ color: "#fff", background: "linear-gradient(135deg, #FF4A2D, #D93317)" }}
                >
                  {tf("exploreOnMap", { city: tf(`city_${city}`) })}
                </Link>
              </div>
              {/* 누구와 가는지(Solo·Couple·Family·Group)는 더 이상 묻지 않는다.
                  여행 계획에 필요한 것은 몇 명인가(Travelers)와 어떤 속도로
                  다니는가(Trip Pace) 두 가지이고, 그 둘은 각자 따로 있다.
                  예전 값은 저장된 여행을 다시 열기 위해 남겨 둔다. */}
              <div id="travel-style-section" className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById("search-filters-bar")?.scrollIntoView({ behavior: "smooth" })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-sm text-white transition-all active:scale-95 hover:opacity-90"
                  style={{ backgroundColor: "#FF4A2D" }}
                >
                  {tf("pickVibe")}
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("startDate")}</label>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder={tf("startDatePlaceholder")}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("endDate")}</label>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder={tf("endDatePlaceholder")}
                  min={startDate || new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("travelers")}</label>
                {/* 위 <label> 은 for/id 로 묶여 있지 않아 보조기술이 연결하지 못한다.
                    보이는 문구는 그대로 두고 접근 가능한 이름만 붙인다. */}
                <input type="number" min="1" max="50" value={travelers} onChange={(e) => setTravelers(e.target.value)}
                  aria-label={tf("travelersAria")}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>

              {/* ── 가변형 AI 스케줄러 — 시작 위치 ── */}
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("arrivalLabel")}</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(CITY_ARRIVAL_OPTIONS[city] ?? CITY_ARRIVAL_OPTIONS["Busan"]!).map((loc) => (
                    <button
                      key={loc.value}
                      type="button"
                      onClick={() => setStartLocation(loc.value)}
                      className={`px-3 py-2.5 rounded-xl text-sm font-bold text-left transition-all border ${
                        startLocation === loc.value
                          ? "border-orange-400 bg-orange-50 text-orange-700"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:border-orange-300"
                      }`}
                    >
                      {arrivalLabel(loc.label)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── 가변형 AI 스케줄러 — 도착 시간 ── */}
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("arrivalTimeLabel")}</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { value: "09:00", k: "morning"   },
                    { value: "12:00", k: "noon"      },
                    { value: "14:00", k: "afternoon" },
                    { value: "17:00", k: "evening"   },
                    { value: "20:00", k: "night"     },
                  ].map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      onClick={() => setArrivalTime(slot.value)}
                      className={`flex flex-col items-center px-2 py-3 rounded-xl text-center transition-all border ${
                        arrivalTime === slot.value
                          ? "border-orange-400 bg-orange-50 text-orange-700"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:border-orange-300"
                      }`}
                    >
                      <span className="text-sm font-black">{tf(`slot_${slot.k}`)}</span>
                      <span className="text-[10px] font-semibold opacity-60">{tf(`sub_${slot.k}`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Optional: Departure Info ── */}
            <div ref={deptSectionRef} className="mt-4">
              {!showDeptSection ? (
                <button
                  type="button"
                  onClick={() => setShowDeptSection(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold border border-dashed border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-600 transition-all bg-transparent"
                >
                  <span>✈️</span>
                  <span>{tf("addDeparture")}</span>
                  <span className="text-[10px] font-normal text-gray-400">{tf("addDepartureNote")}</span>
                </button>
              ) : (
                <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-orange-700">
                      {tf("departureTitle")}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowDeptSection(false); setDeparturePlace(""); setDepartureTime(""); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {tf("departureRemove")}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 -mt-1">
                    {tf("departureHint")}
                  </p>

                  {/* Where do you leave from? */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">{tf("departureFrom")}</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(CITY_ARRIVAL_OPTIONS[city] ?? CITY_ARRIVAL_OPTIONS["Busan"]!).map((loc) => (
                        <button
                          key={loc.value}
                          type="button"
                          onClick={() => setDeparturePlace(loc.value)}
                          className={`px-3 py-2 rounded-lg text-xs font-bold text-left transition-all border ${
                            departurePlace === loc.value
                              ? "border-orange-400 bg-orange-100 text-orange-700"
                              : "border-gray-200 bg-white text-gray-600 hover:border-orange-300"
                          }`}
                        >
                          {arrivalLabel(loc.label)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Departure time */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">{tf("departureTime")}</label>
                    <input
                      type="time"
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* -- Trip Pace --
                누구와 가는지(위 여행 스타일)와 얼마나 느긋하게 다닐지는 다른
                질문이다. 예전에는 커플·가족을 고르면 체류가 조용히 1.3 배가
                됐다. 이제 직접 고른다. -- */}
            <div className="mt-3 flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600">{tPace("title")}</label>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={tPace("title")}>
                {TRIP_PACE_CHOICES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTripPace(p)}
                    aria-pressed={tripPace === p}
                    className={`px-2 py-2 rounded-lg text-[11px] font-bold leading-tight transition-all border ${
                      tripPace === p
                        ? "border-orange-400 bg-orange-100 text-orange-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-orange-300"
                    }`}
                  >
                    {tPace(p)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">{tPace(`${tripPace}Desc`)}</p>
            </div>

            {/* -- Optional: Stay Area -- */}
            <div className="mt-3">
              {!showStaySection ? (
                <button
                  type="button"
                  onClick={() => setShowStaySection(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold border border-dashed border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-600 transition-all bg-transparent"
                >
                  <span>🛏️</span>
                  <span>{tf("addStayArea")}</span>
                  <span className="text-[10px] font-normal text-gray-400">{tf("addStayAreaNote")}</span>
                </button>
              ) : (
                <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-orange-700">
                      {tf("stayAreaTitle")}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowStaySection(false); setStayArea(""); setStayMode("none"); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {tf("stayAreaRemove")}
                    </button>
                  </div>
                  {/* 이 안내는 지역을 고를 때의 말이다. 정확한 숙소를 적는
                      사람에게 "묵는 지역을 골라 주세요" 라고 하면 자기가 무엇을
                      하는 중인지 헷갈린다. */}
                  {stayMode === "area" && (
                    <p className="text-[11px] text-gray-500 -mt-1">
                      {tf("stayAreaHint")}
                    </p>
                  )}

                  {/* 입력 한 벌은 공용 컴포넌트다 — This Trip 도 같은 것을 건다. */}
                  <StayFieldsSection
                    city={city}
                    mode={stayMode}
                    stayArea={stayArea}
                    fields={stayFields}
                    stay={stayDetail}
                    onModeChange={changeStayMode}
                    onAreaChange={setStayArea}
                    onFieldChange={(f, next) => { setStayFields(f); setStayDetail(next); }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={isNavigating}
              className="w-full mt-6 py-4 rounded-xl text-base font-black text-white shadow-md transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#FF4A2D" }}
            >
              {isNavigating ? tf("generating") : tf("generate")}
            </button>
          </div>
        </div>
      </section>

      {/* ── Pick Your Vibe 유도 모달 ── */}
      {showVibeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowVibeModal(false); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7" style={{ animation: "vibeModalIn 0.22s ease-out" }}>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="text-xl font-black text-[#2C2520] mb-2">{tf("vibeTitle")}</h3>
              <p className="text-sm text-[#61554D] leading-relaxed">
                Pick a few places you&apos;re into from Explore.
                We&apos;ll build your itinerary around your picks — or skip for a balanced mix.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={handlePickVibeClick}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white transition-all active:scale-95 hover:opacity-90"
                style={{ backgroundColor: "#FF4A2D" }}
              >
                {tf("vibePick")}
              </button>
              <button
                onClick={handleContinueWithoutPicks}
                className="w-full py-3 rounded-xl font-bold text-sm text-[#61554D] border-2 border-[#E6DFD5] hover:border-[#FF4A2D] hover:bg-[#FAF7F2] transition-all"
              >
                {tf("vibeSkip")}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes vibeModalIn {
              from { opacity: 0; transform: scale(0.93) translateY(12px); }
              to   { opacity: 1; transform: scale(1)   translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* ── Departure Info 안내 모달 ── */}
      {/* 지역을 바꾸면 이 지역에서 모아 둔 것이 사라진다. 개수도, Saved 와
          This Trip 의 차이도 말하지 않는다 — 사용자가 알아야 할 것은 하나뿐이다. */}
      {pendingCity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          role="dialog" aria-modal="true" aria-label={tf("citySwitchTitle")}
          onClick={(e) => { if (e.target === e.currentTarget) setPendingCity(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-black text-gray-900 mb-2 text-center">
              {tf("citySwitchTitle")}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-5 leading-relaxed">
              {tf("citySwitchBody", { city: tf(`city_${pendingCity}`) })}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => applyCitySwitch(pendingCity)}
                className="gkm-focus w-full min-h-11 py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: "#FF4A2D" }}
              >
                {tf("citySwitchGo", { city: tf(`city_${pendingCity}`) })}
              </button>
              <button
                type="button"
                onClick={() => setPendingCity(null)}
                className="gkm-focus w-full min-h-11 py-3 rounded-xl text-sm font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                {tf("citySwitchCancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeptWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeptWarning(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-3xl mb-3 text-center">✈️</div>
            <h3 className="text-lg font-black text-gray-900 mb-2 text-center">
              {tf("deptWarnTitle")}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-5 leading-relaxed">
              {tf("deptWarnBody")}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowDeptWarning(false);
                  setShowDeptSection(true);
                  setTimeout(() => deptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
                }}
                className="w-full py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#FF4A2D" }}
              >
                {tf("addDeparture")}
              </button>
              <button
                onClick={() => {
                  setShowDeptWarning(false);
                  setDeptDismissed(true);
                  // 한 번의 Generate 클릭에서 모달은 하나까지다.
                  //
                  // 여기까지 왔다는 것은 사용자가 이미 "출발 정보 없이 계속"을
                  // 고른 것이다. 곧바로 Vibe 모달을 또 띄우면 아무것도 고르지
                  // 않은 첫 사용자가 모달 두 개를 연달아 통과해야 한다.
                  //
                  // handleContinueWithoutPicks 와 같은 fallback 을 쓴다 —
                  // 취향을 안 골랐으면 "Solo" 로 균형 잡힌 일정을 만든다.
                  // 출발 정보가 있거나 경고가 필요 없는 빈 Cart 사용자는
                  // handleGenerate 의 기존 Vibe 흐름을 그대로 탄다.
                  doNavigate(style);
                }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
              >
                {tf("deptWarnSkip")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 푸터 ────────────────────────────────────────────────── */}
      <footer className="py-12 px-4" style={{ backgroundColor: "#111827" }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
            <span className="text-xl font-normal text-white flex items-center gap-1.5">
              <span className="font-black tracking-tight">gokoreamate</span>
            </span>
            <div className="flex items-center gap-6">
              <Link href="/blog"           className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("blog")}</Link>
              <Link href="/survival-guide" className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("survivalGuide")}</Link>
              <Link href="/about"          className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("about")}</Link>
              <button
                onClick={() => setContactOpen(true)}
                className="text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              >
                {tn("contact")}
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center sm:text-right leading-relaxed">
              {th("footerData")}<br />{th("footerAi")}
            </p>
          </div>
          <div className="border-t border-white/5 pt-6 text-center">
            <p className="text-xs text-gray-600">{tFooter("copyright", { year: new Date().getFullYear() })}</p>
          </div>
        </div>
      </footer>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />


    </div>
  );
}
