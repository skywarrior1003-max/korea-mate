// Picks — Selected / Saved / My Places 3탭.
//
// 세 자산은 저장소가 서로 다르다. 합치지 않는다.
//   Selected  localStorage["koreamate_cart"]        · CART_EVENT
//   Saved     localStorage favorites 3키            · FAVORITES_EVENT
//   My Places 서버 user_spots (device_id 소유권)     · /api/user-spots
//
// 이 화면이 전역 CartDrawer 를 대체한다. 목록·삭제·전체삭제·개수·Build 를
// 여기서 전부 제공해야 드로어를 제거할 수 있다.

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { TopNav, Card, Badge, Button } from "@/components/ui";
import { getItemSourceKey, parseCitySpotId, userSpotSourceKey } from "@/lib/place-identity";
import { getCityCart, getUnresolvedCart, removeFromCart, removeFromAllCities, clearCart, addToCart, setCartFixed, updateCartPlace, attachCartItemToCity, CART_EVENT, type CartItem, type EventItem, type CartFixed } from "@/lib/cart";
import { readTripDraft, tripDraftDates } from "@/lib/trip-draft/trip-draft-core";
import { buildItineraryGenerationUrl, itineraryDayCount } from "@/lib/trip-generation/itinerary-url";
import { isValidCoordinate } from "@/lib/geo";
import FixedScheduleFields from "@/components/FixedScheduleFields";
import Coachmark, { COACH_PULSE } from "@/components/Coachmark";
import { readCoachStep, writeCoachStep, nextCoachStep, type CoachStep } from "@/lib/onboarding";
import { getFavorites, getSavedSpotsData, removeFavorite, FAVORITES_EVENT } from "@/lib/favorites";
import {
  apiGetUserSpots, apiCreateUserSpot, apiUpdateUserSpot, apiDeleteUserSpot,
  apiCreateUserSpotWithPhoto, apiUploadUserSpotPhoto,
  apiGetUserSpotPhotoUrl, apiDeleteUserSpotPhoto, apiGetUserSpotCanonicalImage,
  apiEnrichUserSpot,
  type UserSpot,
  userSpotDisplayName,
} from "@/lib/user-spots-api";
import { compressPhotoBlob } from "@/lib/trip-moments/storage";
import { runCreateFlow } from "@/lib/user-spots/create-flow";
import { canEdit } from "@/lib/user-spots/anchor-core";
import { trackEvent } from "@/lib/analytics";
import UserSpotForm, {
  EMPTY_USER_SPOT_FORM,
  userSpotCategoryLabelKey,
  type UserSpotFormState,
} from "@/components/UserSpotForm";

type Tab = "selected" | "saved" | "mine";
const TABS: Tab[] = ["selected", "saved", "mine"];

/** ?tab= 으로 열 탭을 지정한다. 모르는 값은 조용히 기본 탭으로 떨어뜨린다. */
function tabFromParam(v: string | null): Tab {
  return (TABS as string[]).includes(v ?? "") ? (v as Tab) : "selected";
}

const CATEGORY_EMOJI: Record<string, string> = {
  attraction: "🏛️", restaurant: "🍽️", nature: "🌿", event: "🎉", accommodation: "🏨",
};

/**
 * user_spots 행을 Cart 항목으로.
 *
 * 좌표를 그대로 옮긴다. 예전에는 여기서 lat/lng 를 빠뜨렸고, 그래서 사용자가
 * 직접 등록한 장소를 This Trip 에 담아도 일정 단계에서 "위치 없음" 으로 걸러져
 * 통째로 빠졌다. 원본에는 좌표가 있는데도 그랬다.
 *
 * 없는 좌표를 만들어 주지는 않는다. 도시 중심도, 앞 장소도, (0,0) 도 넣지
 * 않는다 — 모르는 위치를 지어내면 엉뚱한 곳에 일정이 잡힌다. 유효하지 않으면
 * 좌표 없는 항목으로 남고, 화면이 그 사실을 알린다.
 */
function userSpotToEvent(s: UserSpot, displayName: string): EventItem {
  const hasCoord = isValidCoordinate(s.lat, s.lng);
  return {
    ...(hasCoord ? { lat: s.lat, lng: s.lng } : {}),
    id: `user_spot-${s.id}`,
    sourceKey: `user_spot:${s.id}`,
    type: s.category || "attraction",
    isAnchor: false, journeyCluster: null, stage: "", anchorEventId: null,
    relatedSpotIds: [], relatedSurvivalGuides: [], transitFromAnchor: null,
    name: displayName, shortName: displayName, tags: [],
    city: s.city ?? "", district: "", address: s.address ?? "",
    mapUrl: "", description: s.note ?? "", whyItMatters: "",
    recommendedDurationMinutes: 60, bestTimeSlot: "", openingHours: null,
    image: null, startDate: null, endDate: null,
    isTrending: false, soloFriendly: false, foreignCardAccepted: false,
    cashOnly: false, englishMenu: false, barrierFree: false,
    koreanSurvivalScore: 0, notice: null,
  };
}


/** 디자인(my_picks_selected_places)의 카드 위계 — 이미지 상단, 그 아래 이름·분류·위치. */
function PlaceCardMedia({ image, type }: { image: string | null; type: string }) {
  return (
    <div className="relative w-full aspect-[16/9] bg-surface-dim overflow-hidden">
      {image
        ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" />
        : <div className="w-full h-full flex items-center justify-center text-4xl" aria-hidden>
            {CATEGORY_EMOJI[type] ?? "📍"}
          </div>}
    </div>
  );
}

function PicksContent() {
  const t   = useTranslations("picks");
  const locale = useLocale();
  const tS  = useTranslations("shell");
  const tP  = useTranslations("place");
  const router = useRouter();
  const searchParams = useSearchParams();

  // 첫 탭만 URL 에서 읽는다. 이후 탭 전환은 URL 을 다시 쓰지 않는다 —
  // 히스토리에 탭 클릭이 쌓이면 뒤로가기가 이전 화면 대신 옆 탭으로 간다.
  const [tab, setTab] = useState<Tab>(() => tabFromParam(searchParams.get("tab")));

  // ── Selected (cart) ─────────────────────────────────────────────────────────
  // This Trip 은 지금 준비 중인 도시 여행의 목록이다. 부산 여행을 만들다 서울로
  // 옮기면 부산에서 고른 장소는 지워지지 않고 부산 목록에 그대로 남는다.
  const [tripCity, setTripCity] = useState<string | null>(null);
  const [selected, setSelected] = useState<CartItem[]>([]);
  /** 어느 여행 것인지 아직 모르는 예전 선택. 지우지 않고 사용자에게 물어본다. */
  const [unresolved, setUnresolved] = useState<CartItem[]>([]);

  // 고정 일정은 여행 날짜 안에서만 고를 수 있다. 날짜가 아직 없으면 입력을 열지 않는다.
  const [tripDays, setTripDays] = useState<string[]>([]);

  // 처음 쓰는 사람에게만 두 걸음. 끝나면 다시 오지 않는다.
  const [coach, setCoach] = useState<CoachStep>("done");
  useEffect(() => { setCoach(readCoachStep()); }, []);
  function advanceCoach() {
    setCoach(prev => { const n = nextCoachStep(prev); writeCoachStep(n); return n; });
  }

  /** 시간 입력이 펼쳐진 카드. 한 번에 하나만 연다. */
  const [openTimeKey, setOpenTimeKey] = useState<string | null>(null);

  /** 도시·날짜가 없어 일정을 만들 수 없을 때만 켠다. */
  const [buildNotice, setBuildNotice] = useState(false);
  useEffect(() => {
    // 여행 날짜는 이제 TripDraft 에서 온다. 예전 PlannerSnapshot 은 저장하는
    // 코드가 하나도 없어 언제나 비어 있었고, 그래서 아래 고정 일정 입력이
    // 화면에 나타난 적이 없다. draft 가 없으면 여전히 빈 배열이고 그때는
    // "날짜를 먼저 정하세요" 안내가 나간다 — 없는 날짜를 만들지 않는다.
    const draft = readTripDraft();
    setTripDays(tripDraftDates(draft));
    setTripCity(draft?.city ?? null);
  }, []);
  useEffect(() => {
    const sync = () => {
      setSelected(getCityCart(tripCity));
      setUnresolved(getUnresolvedCart());
    };
    sync();
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, [tripCity]);

  // ── Saved (favorites) ───────────────────────────────────────────────────────
  const [saved, setSaved] = useState<EventItem[]>([]);
  useEffect(() => {
    const sync = () => {
      const ids = new Set(getFavorites());
      setSaved(getSavedSpotsData().filter(e => ids.has(e.id)));
    };
    sync();
    window.addEventListener(FAVORITES_EVENT, sync);
    return () => window.removeEventListener(FAVORITES_EVENT, sync);
  }, []);

  // ── My Places (server user_spots) ───────────────────────────────────────────
  const [mine,        setMine]        = useState<UserSpot[]>([]);
  const [mineLoading, setMineLoading] = useState(true);
  const [mineError,   setMineError]   = useState(false);
  const [showCreate,  setShowCreate]  = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [confirmId,   setConfirmId]   = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [formError,   setFormError]   = useState<string | null>(null);
  const [form,        setForm]        = useState<UserSpotFormState>(EMPTY_USER_SPOT_FORM);
  // 사진은 폼 데이터가 아니라 별도 자산이라 따로 들고 있는다. 파일 자체만
  // 보관하고 바이트를 복제하지 않는다.
  const [photoFile,   setPhotoFile]   = useState<File | null>(null);
  const [photoBusy,   setPhotoBusy]   = useState(false);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [photoUrl,    setPhotoUrl]    = useState<string | null>(null);
  const [editingHasPhoto, setEditingHasPhoto] = useState(false);
  // 개인 사진이 없을 때만 서버가 장소 사진을 준다.
  const [canonImg,    setCanonImg]    = useState<string | null>(null);
  const [canonSource, setCanonSource] = useState<string | null>(null);

  // 로딩 플래그는 여기서 세우지 않는다 — 최초 마운트에서 effect 가 동기 setState
  // 를 호출하면 렌더가 한 번 더 돈다. 초기값이 이미 true 이고, 재시도는 클릭
  // 핸들러가 직접 세운다.
  /**
   * `syncCartFor` 를 주면 그 장소 하나를 This Trip 에도 최신으로 맞춘다.
   *
   * 서버가 돌려준 값으로 맞춘다 — 방금 보낸 폼 값이 아니라 실제로 저장된 값이
   * 기준이다. 그 장소가 응답에 없으면 아무것도 하지 않는다.
   *
   * 마운트할 때는 맞추지 않는다. 목록이 일시적으로 비어 돌아오는 경우에까지
   * 담아 둔 장소를 지우게 되기 때문이다. 고친 그 순간에만 맞춘다.
   */
  const loadMine = useCallback((syncCartFor?: string) => {
    apiGetUserSpots()
      .then(rows => {
        setMine(rows); setMineError(false);
        if (!syncCartFor) return;
        const fresh = rows.find(r => r.id === syncCartFor);
        if (!fresh) return;
        updateCartPlace(
          userSpotSourceKey(fresh.id),
          userSpotToEvent(fresh, userSpotDisplayName(fresh, t("displayFallback"))),
        );
      })
      .catch(() => setMineError(true))
      .finally(() => setMineLoading(false));
  }, [t]);
  useEffect(() => { loadMine(); }, [loadMine]);

  function retryMine() {
    setMineLoading(true);
    setMineError(false);
    loadMine();
  }

  function resetPhotoState() {
    setPhotoFile(null); setPhotoBusy(false); setPhotoNotice(null);
    setPhotoUrl(null); setEditingHasPhoto(false);
    setCanonImg(null); setCanonSource(null);
  }
  function openCreate() {
    setForm(EMPTY_USER_SPOT_FORM); setFormError(null); setEditingId(null); setShowCreate(true);
    resetPhotoState();
  }
  function openEdit(s: UserSpot) {
    setForm({
      name: s.name ?? "",
      displayTitle: s.display_title ?? "",
      displayMemo:  s.display_memo  ?? "",
      category: (s.category as UserSpotFormState["category"]) || "attraction",
      address: s.address ?? "", note: s.note ?? "",
      lat: s.lat ?? null, lng: s.lng ?? null,
    });
    setFormError(null); setShowCreate(false); setEditingId(s.id);
    resetPhotoState();
    setEditingHasPhoto(s.has_photo === true);
    // 만료되는 URL 이라 폼을 열 때 한 번만 받아 온다. 저장하지 않는다.
    if (s.has_photo) {
      void apiGetUserSpotPhotoUrl(s.id).then(r => { if (r) setPhotoUrl(r.signedUrl); });
    } else {
      // 내 사진이 없을 때만 물어본다. 있으면 서버도 null 을 주지만
      // 굳이 부르지 않는다.
      void apiGetUserSpotCanonicalImage(s.id).then(r => {
        setCanonImg(r.imageUrl); setCanonSource(r.sourceUrl);
      });
    }
  }
  function closeForm() {
    setShowCreate(false); setEditingId(null); setFormError(null); setForm(EMPTY_USER_SPOT_FORM);
    resetPhotoState();
  }

  /** 저장된 사진 삭제. 사진이 그 장소의 유일한 근거이면 서버가 409 로 막는다. */
  async function removeStoredPhoto(spotId: string) {
    if (photoBusy) return;
    setPhotoBusy(true); setPhotoNotice(null);
    try {
      const r = await apiDeleteUserSpotPhoto(spotId);
      if (r.ok) {
        setPhotoUrl(null); setEditingHasPhoto(false);
        setPhotoNotice(t("photoDeleted"));
        loadMine();
      } else if (r.code === "PHOTO_IS_ONLY_ANCHOR") {
        // 기술 오류가 아니라 계약이다. 무엇을 하면 되는지 말해 준다.
        setPhotoNotice(t("photoOnlyAnchor"));
      } else {
        setPhotoNotice(t("photoFailed"));
      }
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const name = form.name.trim();
    const input = {
      name:     name || undefined,
      category: form.category,
      address:  form.address.trim() || undefined,
      note:     form.note.trim()    || undefined,
      lat:      form.lat,
      lng:      form.lng,
    };
    setSubmitting(true); setFormError(null); setPhotoNotice(null);
    try {
      const r = await runCreateFlow(input, photoFile, {
        compress:        compressPhotoBlob,
        createJson:      async i => (await apiCreateUserSpot({
          ...i, lat: i.lat ?? undefined, lng: i.lng ?? undefined,
        })).id,
        createWithPhoto: async (i, blob) => {
          const res = await apiCreateUserSpotWithPhoto({
            ...i, lat: i.lat ?? undefined, lng: i.lng ?? undefined,
          }, blob);
          return { ok: res.ok, id: res.spot?.id };
        },
        uploadPhoto:     (id, blob) => apiUploadUserSpotPhoto(id, blob),
      });

      if (!r.created) {
        // 사진을 읽지 못한 경우는 오류가 아니라 안내다 — 다른 사진을 고르면 된다.
        if (r.notice === "photoUnreadable") setPhotoNotice(t("photoUnreadable"));
        else setFormError(t(r.errorKey === "needAnchor" ? "needAnchor" : "saveFailed"));
        return;
      }

      loadMine();                       // 서버 응답을 진실로 삼는다
      // 저장은 끝났다. 개인 표시값 채우기는 그 뒤의 별도 일이고, 기다리지
      // 않는다 — 꺼져 있으면 서버가 즉시 disabled 를 주고, 실패해도 방금
      // 남긴 장소는 그대로다.
      if (r.spotId) void apiEnrichUserSpot(r.spotId, locale);
      if (r.notice === "savedPhotoFailed") {
        // 장소는 저장됐다. 폼을 닫지 않고 사진만 다시 시도할 수 있게 둔다.
        setEditingId(r.spotId ?? null); setShowCreate(false);
        setEditingHasPhoto(false);
        setPhotoNotice(t("savedPhotoFailed"));
        return;
      }
      closeForm();
    } catch {
      setFormError(t("saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(e: React.FormEvent, spot: UserSpot) {
    e.preventDefault();
    const name = form.name.trim();
    if (!canEdit({
      lat: form.lat, lng: form.lng, hasPhoto: photoFile !== null,
      name: form.name, hasExistingPhoto: editingHasPhoto,
    })) { setFormError(t("needAnchor")); return; }
    if (submitting) return;
    setSubmitting(true); setFormError(null); setPhotoNotice(null);
    try {
      const ok = await apiUpdateUserSpot(spot.id, {
        name:     name || null,
        // 나만 보는 값. 빈 문자열은 지움(null)이다 — note 와 같은 3-state.
        display_title: form.displayTitle.trim() || null,
        display_memo:  form.displayMemo.trim()  || null,
        category: form.category,
        address:  form.address.trim() || undefined,
        note:     form.note.trim()    || undefined,
        lat:      form.lat,
        lng:      form.lng,
      });
      if (!ok) { setFormError(t("saveFailed")); return; }

      // 새 사진을 골랐으면 붙이거나 바꾼다. 실패해도 방금 고친 내용은 살아 있다.
      if (photoFile) {
        setPhotoBusy(true);
        try {
          const blob = await compressPhotoBlob(photoFile);
          const up   = await apiUploadUserSpotPhoto(spot.id, blob);
          if (!up.ok) { setPhotoNotice(t("photoFailed")); loadMine(spot.id); return; }
        } catch {
          setPhotoNotice(t("photoUnreadable")); loadMine(spot.id); return;
        } finally {
          setPhotoBusy(false);
        }
      }

      closeForm();
      // 고친 장소가 This Trip 에 담겨 있으면 거기도 최신으로 맞춘다.
      // 순서와 약속 시각은 건드리지 않는다.
      loadMine(spot.id);
    } catch {
      setFormError(t("saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const ok = await apiDeleteUserSpot(id);
      if (ok) {
        setMine(prev => prev.filter(s => s.id !== id));
        // 지운 장소가 This Trip 에 남아 있으면 일정에까지 들어간다.
        // **서버 삭제가 성공했을 때만** 뺀다 — 실패하면 아무것도 건드리지 않는다.
        removeFromAllCities(userSpotSourceKey(id));
      }
    } catch { /* 실패 시 목록 유지 — 조용한 손실을 만들지 않는다 */ }
    finally { setDeletingId(null); setConfirmId(null); }
  }

  // ── 공통 동작 ───────────────────────────────────────────────────────────────
  function addToSelected(item: EventItem, from: "saved" | "mine") {
    // 어느 여행에 담는 것인지 모르면 담지 않는다. 아무 도시나 정해 주지 않는다.
    if (!tripCity) { setBuildNotice(true); return; }
    addToCart(item, tripCity);
    trackEvent("place_add_to_itinerary", {
      city: item.city || "", category: item.type || "",
      source_type: from === "saved" ? "saved" : "user_spot",
      cta_position: `picks-${from}`, picked_count: getCityCart(tripCity).length,
    });
  }

  function handleBuild() {
    trackEvent("build_trip_click", {
      city: selected[0]?.city ?? "",
      picked_count: selected.length,
      cta_position: "picks-selected",
    });
    // 여기서 바로 일정을 만든다. 예전에는 Home 플래너로 보냈다 — 장소를 다
    // 골라 놓은 사람을 다른 화면으로 튕겨 내고 날짜를 다시 확인시키는 흐름이었다.
    //
    // 고른 장소·좌표·고정 시각은 주소에 싣지 않는다. 이미 cart 에 있고 일정
    // 화면이 거기서 읽는다. 개인 좌표와 개인 제목을 브라우저 기록에 남기지 않는다.
    const draft = readTripDraft();
    const url = draft && buildItineraryGenerationUrl({
      city: draft.city, startDate: draft.startDate, endDate: draft.endDate,
    });
    if (!draft || !url) {
      // 도시·날짜가 없으면 만들지 않는다. 지어내지도, Home 으로 되돌리지도
      // 않는다 — 무엇이 있어야 하는지만 알린다.
      setBuildNotice(true);
      return;
    }
    setBuildNotice(false);
    trackEvent("generate_itinerary", {
      city: draft.city, travelers: "", travel_style: "",
      days: itineraryDayCount(draft.startDate, draft.endDate),
    });
    router.push(url);
  }

  const selectedKeys = new Set(selected.map(getItemSourceKey));

  // Saved 는 장기 보관함이고 This Trip 은 이번 여행 목록이다. 같은 장소가 두
  // 목록에 동시에 보이면 사용자는 "두 번 담았나" 를 의심한다. 그래서 **화면에서만**
  // 숨긴다 — favorites 저장소는 건드리지 않는다.
  //
  // 이 방식이 중요한 이유: This Trip 에서 빼면 cart membership 만 사라지고
  // Saved 원본은 처음부터 그대로였으므로 **아무 것도 되돌리지 않아도** 다시 보인다.
  // 반대로 뺄 때 toggleFavorite 을 부르면, Explore 에서 바로 담은(Saved 아닌)
  // 장소까지 Saved 로 새로 만들어 버린다.
  const savedVisible = saved.filter(e => !selectedKeys.has(getItemSourceKey(e)));

  // Clear All 은 여러 개를 한 번에 지운다. 개별 × 와 달리 되돌리기 비용이 커서
  // 짧은 확인 한 번을 둔다. 별도 모달을 만들지 않고 버튼 자리에서 바꿔 보여 준다.
  const [confirmClear, setConfirmClear] = useState(false);

  // Saved 정리 모드 — 평소에는 카드에 삭제 문구를 노출하지 않는다.
  const [savedManaging, setSavedManaging] = useState(false);
  const [savedPicked,   setSavedPicked]   = useState<Set<string>>(new Set());
  const [confirmSavedDelete, setConfirmSavedDelete] = useState(false);

  function exitSavedManage() {
    setSavedManaging(false); setSavedPicked(new Set()); setConfirmSavedDelete(false);
  }
  function toggleSavedPick(key: string) {
    setSavedPicked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setConfirmSavedDelete(false);   // 선택이 바뀌면 확인 단계를 되돌린다
  }
  function runSavedDelete() {
    for (const e of saved) {
      if (savedPicked.has(getItemSourceKey(e))) removeFavorite(e.id);
    }
    exitSavedManage();
  }

  const panelId = (k: Tab) => `picks-panel-${k}`;
  const tabId   = (k: Tab) => `picks-tab-${k}`;

  // 좌우 방향키로 탭 이동 (WAI-ARIA tabs 패턴)
  function onTabKey(e: React.KeyboardEvent) {
    const i = TABS.indexOf(tab);
    if (e.key === "ArrowRight") { e.preventDefault(); setTab(TABS[(i + 1) % TABS.length]); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); setTab(TABS[(i - 1 + TABS.length) % TABS.length]); }
  }

  const counts: Record<Tab, number> = { selected: selected.length, saved: saved.length, mine: mine.length };

  return (
    <div className="min-h-screen bg-surface-dim flex flex-col">
      <TopNav selectedCount={selected.length} />

      {/* 모바일 헤더 — TopNav 는 md+ 전용 */}
      <header className="md:hidden bg-surface border-b border-line px-4 h-14 flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">{t("title")}</h1>
        {/* 글자만 두면 41×20 이라 손가락으로는 빗나간다. 글자 크기는 그대로 두고
            좌우 padding 과 min-height 로 누를 수 있는 넓이만 44 까지 넓힌다.
            -mr-2 로 늘어난 padding 만큼 되당겨 헤더 오른쪽 정렬은 유지한다. */}
        <span className="flex items-center gap-1 -mr-2">
          <LanguageSwitcher variant="icon" className="text-sub" />
          <Link
            href="/"
            className="gkm-focus inline-flex items-center min-h-11 px-2 text-sm font-semibold text-sub"
          >
            {tS("home")}
          </Link>
        </span>
      </header>

      <main className="flex-1 w-full max-w-[720px] mx-auto px-4 py-5">
        <div className="hidden md:block mb-5">
          <h1 className="text-2xl font-extrabold text-ink">{t("title")}</h1>
          <p className="text-sm text-sub mt-1">{t("subtitle")}</p>
        </div>
        <p className="md:hidden text-sm text-sub mb-4">{t("subtitle")}</p>

        {/* ── 탭 ── */}
        {/* 밑줄형 탭 — 최종 디자인(my_picks_selected_places) 기준.
            3등분 grid 로 두어 KO/JA/ZH 로 바뀌어도 탭 폭이 흔들리지 않게 한다.
            비활성 탭에도 같은 두께의 투명 border 를 줘서 선택 시 내용이 1px 밀리지
            않게 한다. 개수 배지는 tabular-nums 로 자릿수가 바뀜도 폭이 고정된다. */}
        <div
          role="tablist"
          aria-label={t("title")}
          onKeyDown={onTabKey}
          className="grid grid-cols-3 border-b border-line mb-5"
        >
          {TABS.map(k => (
            <button
              key={k}
              id={tabId(k)}
              role="tab"
              aria-selected={tab === k}
              aria-controls={panelId(k)}
              tabIndex={tab === k ? 0 : -1}
              onClick={() => setTab(k)}
              className={`gkm-focus min-h-11 px-1 pb-2.5 -mb-px inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-sm font-bold border-b-[3px] transition-colors ${
                tab === k
                  ? "text-action border-action"
                  : "text-sub border-transparent hover:text-ink"
              }`}
            >
              {t(k === "selected" ? "tabSelected" : k === "saved" ? "tabSaved" : "tabMine")}
              {counts[k] > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-black tabular-nums ${
                    tab === k ? "bg-action-tint text-action" : "bg-surface-dim text-faint"
                  }`}
                >
                  {counts[k]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Selected ── */}
        <div role="tabpanel" id={panelId("selected")} aria-labelledby={tabId("selected")} hidden={tab !== "selected"}>
          {/* 어느 여행에 담은 것인지 모르는 예전 선택.
              조용히 숨기지 않는다 — 사용자가 이 여행 것인지 정해 준다.
              일정에는 자동으로 들어가지 않는다. */}
          {tab === "selected" && unresolved.length > 0 && (
            <section className="mt-6 rounded-control border border-line bg-surface-dim/40 p-4">
              <p className="text-sm font-bold text-ink">{t("legacyTitle")}</p>
              <p className="text-xs text-sub mt-0.5">{t("legacyHint")}</p>
              <ul className="flex flex-col gap-2 mt-3">
                {unresolved.map(item => {
                  const key = getItemSourceKey(item);
                  return (
                    <li key={key} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate text-sm text-ink">
                        {item.shortName || item.name}
                      </span>
                      {tripCity && (
                        <Button
                          variant="text"
                          onClick={() => attachCartItemToCity(key, tripCity)}
                        >
                          {t("legacyUse")}
                        </Button>
                      )}
                      <Button
                        variant="text"
                        aria-label={`${t("legacyDrop")}: ${item.name}`}
                        onClick={() => removeFromCart(key)}
                      >
                        {t("legacyDrop")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {tab === "selected" && (selected.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-3xl mb-3" aria-hidden>🗺️</p>
              <p className="font-bold text-ink mb-1">{t("selectedEmpty")}</p>
              <p className="text-sm text-sub mb-5">{t("selectedEmptyHint")}</p>
              <Link href="/explore/busan/" className="gkm-focus inline-flex items-center justify-center min-h-11 px-5 rounded-control bg-action text-white text-sm font-semibold hover:bg-action-hover shadow-cta">
                {t("explore")}
              </Link>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-sub">{t("selectedCount", { count: selected.length })}</p>
                {confirmClear ? (
                  <span className="flex items-center gap-1">
                    <Button variant="text" onClick={() => setConfirmClear(false)}>{t("cancel")}</Button>
                    <button
                      onClick={() => { clearCart(); setConfirmClear(false); }}
                      className="gkm-focus inline-flex items-center min-h-11 text-xs font-black text-error px-2"
                    >
                      {t("clearAllConfirm")}
                    </button>
                  </span>
                ) : (
                  <Button variant="text" onClick={() => setConfirmClear(true)}>{t("clearAll")}</Button>
                )}
              </div>

              <ul className="flex flex-col gap-3">
                {selected.map((item, cardIndex) => {
                  const key = getItemSourceKey(item);
                  const placeId = parseCitySpotId(key);
                  // 두 번째 안내는 첫 카드 하나만 가리킨다. 모든 카드가 동시에
                  // 뛰면 안내가 아니라 화면 전체가 흔들린다.
                  const isFirstCard = cardIndex === 0;
                  return (
                    <li key={key}>
                      <Card className="overflow-hidden p-0">
                        <PlaceCardMedia image={item.image} type={item.type} />
                        <div className="flex items-start gap-3 p-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-ink text-base leading-snug">{item.shortName || item.name}</p>
                            {item.type && (
                              <p className="text-[11px] font-black text-action uppercase tracking-wider mt-1">{item.type}</p>
                            )}
                            <p className="text-xs text-faint mt-1 truncate">
                              📍 {[item.district, item.city].filter(Boolean).join(", ") || "—"}
                            </p>
                            {placeId && (
                              <Link href={`/place/${placeId}/`} className="gkm-focus inline-flex items-center min-h-11 -mb-2 text-xs font-bold text-sub hover:text-ink">
                                {tP("viewDetails")} →
                              </Link>
                            )}
                          </div>
                          {/* 글리프 하나뿐이라 text 변형은 폭이 43 에서 멈춘다.
                              같은 색을 쓰면서 min-w-11 을 갖는 icon 변형으로 바꾼다. */}
                          <Button
                            variant="icon"
                            aria-label={`${t("timeAction")}: ${item.name}`}
                            aria-expanded={openTimeKey === key}
                            className={coach === "time" && isFirstCard ? COACH_PULSE : undefined}
                            onClick={() => setOpenTimeKey(openTimeKey === key ? null : key)}
                          >🕘</Button>
                          <Button variant="icon" aria-label={`${t("remove")}: ${item.name}`} onClick={() => removeFromCart(key, tripCity ?? undefined)}>✕</Button>
                        </div>
                        <div className="px-4 pb-4">
                          {coach === "time" && isFirstCard && (
                            <Coachmark
                              title={t("coachTimeTitle")}
                              body={t("coachTimeBody")}
                              onDismiss={advanceCoach}
                            />
                          )}
                          <FixedScheduleFields
                            name={item.shortName || item.name}
                            value={item.fixed}
                            tripDays={tripDays}
                            open={openTimeKey === key}
                            onOpen={() => setOpenTimeKey(key)}
                            onClose={() => setOpenTimeKey(null)}
                            onChange={(next: CartFixed | null) => setCartFixed(key, next, tripCity ?? undefined)}
                          />
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>

              <Link href="/explore/busan/" className="gkm-focus mt-4 flex items-center justify-center min-h-11 rounded-control border border-line bg-surface text-ink text-sm font-semibold">
                + {t("findMore")}
              </Link>


              <div className="sticky bottom-20 md:bottom-6 mt-6">
                {coach === "plan" && (
                  <Coachmark
                    title={t("coachPlanTitle")}
                    body={t("coachPlanBody")}
                    onDismiss={advanceCoach}
                    placement="above"
                  />
                )}
                {/* 안내는 버튼 옆에 놓일 뿐 버튼을 덮지 않는다.
                    사용자가 바로 눌러도 원래 동작이 그대로 일어나야 한다. */}
                <button
                  onClick={handleBuild}
                  className={`gkm-focus w-full flex items-center justify-center gap-2 min-h-12 rounded-control bg-action text-white font-bold shadow-cta hover:bg-action-hover${coach === "plan" ? ` ${COACH_PULSE}` : ""}`}
                >
                  ✨ {t("build")}
                </button>
                {/* 도시·날짜가 없을 때만. 버튼을 막지 않고 무엇이 필요한지만 말한다. */}
                {buildNotice && (
                  <p role="status" className="mt-2 text-xs text-sub text-center">
                    {t("buildNeedTrip")}
                  </p>
                )}
              </div>
            </>
          ))}
        </div>

        {/* ── Saved ── */}
        <div role="tabpanel" id={panelId("saved")} aria-labelledby={tabId("saved")} hidden={tab !== "saved"}>
          {tab === "saved" && savedVisible.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-sub">
                {savedManaging ? t("selectedCount", { count: savedPicked.size }) : ""}
              </p>
              {savedManaging ? (
                <span className="flex items-center gap-1">
                  <Button variant="text" onClick={exitSavedManage}>{t("savedManageDone")}</Button>
                  {savedPicked.size > 0 && (
                    confirmSavedDelete ? (
                      <button
                        onClick={runSavedDelete}
                        className="gkm-focus inline-flex items-center min-h-11 text-xs font-black text-error px-2"
                      >
                        {t("savedDeleteConfirm", { count: savedPicked.size })}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmSavedDelete(true)}
                        className="gkm-focus inline-flex items-center min-h-11 text-xs font-black text-error px-2"
                      >
                        {t("savedDeleteSelected", { count: savedPicked.size })}
                      </button>
                    )
                  )}
                </span>
              ) : (
                <Button variant="text" onClick={() => setSavedManaging(true)}>{t("savedManage")}</Button>
              )}
            </div>
          )}
          {tab === "saved" && (savedVisible.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-3xl mb-3" aria-hidden>🔖</p>
              <p className="font-bold text-ink mb-1">{t("savedEmpty")}</p>
              <p className="text-sm text-sub mb-5">{t("savedEmptyHint")}</p>
              <Link href="/explore/busan/" className="gkm-focus inline-flex items-center justify-center min-h-11 px-5 rounded-control bg-action text-white text-sm font-semibold hover:bg-action-hover shadow-cta">
                {t("explore")}
              </Link>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {savedVisible.map(e => {
                const key = getItemSourceKey(e);
                const placeId = parseCitySpotId(key);
                const picked = savedPicked.has(key);
                return (
                  <li key={key}>
                    <Card className="overflow-hidden p-0">
                      <div className="relative">
                        <PlaceCardMedia image={e.image} type={e.type} />
                        {/* 우상단 한 자리. 평소엔 저장 해제 북마크, 정리 모드에선 선택 표시.
                            평소 카드에 삭제 문구를 늘어놓지 않는다.
                            사진 위에 떠 있는 원이라 원 자체를 44 로 키우면 눈에 띄게
                            무거워진다. 보이는 원은 36 그대로 두고 ::after 로 누를 수
                            있는 범위만 사방 4px 넓혀 44×44 를 만든다. 버튼이 이미
                            absolute 라 ::after 의 기준 상자는 버튼이다. */}
                        {savedManaging ? (
                          <button
                            onClick={() => toggleSavedPick(key)}
                            aria-label={`${t("savedManage")}: ${e.name}`}
                            aria-pressed={picked}
                            className={`gkm-focus absolute top-2 right-2 w-9 h-9 rounded-full backdrop-blur-sm shadow-card flex items-center justify-center text-base after:absolute after:content-[''] after:-inset-1 ${
                              picked ? "bg-action text-white" : "bg-white/90 text-faint"
                            }`}
                          >
                            {picked ? "✓" : "○"}
                          </button>
                        ) : (
                          <button
                            onClick={() => removeFavorite(e.id)}
                            aria-label={`${t("remove")}: ${e.name}`}
                            className="gkm-focus absolute top-2 right-2 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-card flex items-center justify-center text-action after:absolute after:content-[''] after:-inset-1"
                          >
                            {/* 저장된 상태 = 채워진 북마크. 하트는 Like 전용이다. */}
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden
                                 fill="currentColor" stroke="currentColor" strokeWidth="2.2"
                                 strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="font-bold text-ink text-base leading-snug">{e.name}</p>
                        {/* 정본(my_picks_selected_places)은 분류를 이미지 위 칩이 아니라
                            이름 바로 아래 파란 대문자 캡션으로 둔다. This Trip 카드가
                            이미 같은 자리·같은 스타일을 쓰고 있어 그대로 맞춘다. */}
                        {e.type && (
                          <p className="text-[11px] font-black text-action uppercase tracking-wider mt-1">{e.type}</p>
                        )}
                        <p className="text-xs text-faint mt-1 truncate">
                          📍 {[e.district, e.city].filter(Boolean).join(", ") || "—"}
                        </p>
                        {/* 아래 두 동작은 글자만 있어 16px 높이였다. min-h-11 로 누를 수
                            있는 높이를 확보하고, 버튼이 스스로 갖게 된 위아래 여백만큼
                            바깥 margin 을 줄여 카드 여백 리듬은 그대로 둔다. */}
                        <div className="flex items-center gap-3 mt-1 -mb-2">
                          {/* savedVisible 이 이미 This Trip 에 담긴 것을 걸러내므로
                              여기 보이는 항목은 항상 미담김이다. 담기면 카드가
                              This Trip 탭으로 넘어가는 것처럼 보인다. */}
                          <button
                            onClick={() => addToSelected(e, "saved")}
                            disabled={savedManaging}
                            className="gkm-focus inline-flex items-center min-h-11 gap-1 text-xs font-black text-action disabled:text-faint disabled:cursor-default"
                          >
                            + {t("addToSelected")}
                          </button>
                          <span className="flex-1" />
                          {placeId && (
                            <Link href={`/place/${placeId}/`} className="gkm-focus inline-flex items-center min-h-11 text-xs font-bold text-sub hover:text-ink">
                              {tP("viewDetails")} →
                            </Link>
                          )}
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>

        {/* ── My Places ── */}
        <div role="tabpanel" id={panelId("mine")} aria-labelledby={tabId("mine")} hidden={tab !== "mine"}>
          {tab === "mine" && (
            <>
              {showCreate && (
                <Card className="p-4 mb-3">
                  <p className="font-bold text-ink text-sm">{t("addPlace")}</p>
                  <UserSpotForm
                    form={form} setForm={setForm} formError={formError}
                    submitting={submitting} submitLabel={t("save")}
                    onSubmit={handleCreate} onCancel={closeForm}
                    mode="create"
                    photoFile={photoFile} onPickPhoto={setPhotoFile}
                    photoBusy={photoBusy} photoNotice={photoNotice}
                  />
                </Card>
              )}

              {mineLoading ? (
                <div className="flex flex-col gap-3">
                  {[0, 1].map(i => (
                    <Card key={i} className="p-4 animate-pulse">
                      <div className="h-4 bg-surface-dim rounded w-1/2 mb-2" />
                      <div className="h-3 bg-surface-dim rounded w-1/3" />
                    </Card>
                  ))}
                </div>
              ) : mineError ? (
                <Card className="p-6 text-center">
                  <p className="text-sm text-sub mb-3">{t("loadFailed")}</p>
                  <Button variant="outline" onClick={retryMine}>{t("retry")}</Button>
                </Card>
              ) : mine.length === 0 && !showCreate ? (
                <Card className="p-8 text-center">
                  <p className="text-3xl mb-3" aria-hidden>📌</p>
                  <p className="font-bold text-ink mb-1">{t("mineEmpty")}</p>
                  <p className="text-sm text-sub mb-5">{t("mineEmptyHint")}</p>
                  <Button onClick={openCreate}>+ {t("addPlace")}</Button>
                </Card>
              ) : (
                <ul className="flex flex-col gap-3">
                  {mine.map(s => {
                    // 이름 없는 장소도 This Trip 카드에는 부를 이름이 있어야 한다.
                    const display = userSpotDisplayName(s, t("displayFallback"));
                    // 저장값(s.category)은 그대로 두고 보여줄 때만 번역한다.
                    const catKey = userSpotCategoryLabelKey(s.category);
                    const catLabel = catKey ? t(catKey) : s.category;
                    const ev = userSpotToEvent(s, display);
                    const already = selectedKeys.has(getItemSourceKey(ev));
                    return (
                      <li key={s.id}>
                        <Card className="p-4">
                          {editingId === s.id ? (
                            <>
                              <p className="font-bold text-ink text-sm">{t("editPlace")}</p>
                              <UserSpotForm
                                form={form} setForm={setForm} formError={formError}
                                submitting={submitting} submitLabel={t("save")}
                                onSubmit={(e) => handleEdit(e, s)} onCancel={closeForm}
                                mode="edit"
                                photoFile={photoFile} onPickPhoto={setPhotoFile}
                                existingPhotoUrl={photoUrl}
                                hasExistingPhoto={editingHasPhoto}
                                onRemoveExistingPhoto={() => void removeStoredPhoto(s.id)}
                                photoBusy={photoBusy} photoNotice={photoNotice}
                                canonicalImageUrl={canonImg} canonicalSourceUrl={canonSource}
                              />
                            </>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-ink text-[15px]">{display}</p>
                                  <p className="text-xs text-faint mt-0.5">
                                    {[catLabel, s.city, s.address].filter(Boolean).join(" · ")}
                                  </p>
                                  {s.note && <p className="text-sm text-sub mt-2 leading-relaxed">{s.note}</p>}
                                </div>
                                <Badge kind="editorial" className="shrink-0">🔒 {t("privateLabel")}</Badge>
                              </div>
                              <div className="flex items-center gap-1 mt-3">
                                <button
                                  onClick={() => addToSelected(ev, "mine")}
                                  disabled={already}
                                  className="gkm-focus inline-flex items-center min-h-11 text-xs font-bold text-action disabled:text-ok disabled:cursor-default px-2"
                                >
                                  {already ? `✓ ${t("inSelected")}` : `+ ${t("addToSelected")}`}
                                </button>
                                <span className="flex-1" />
                                <Button variant="icon" aria-label={`${t("edit")}: ${display}`} onClick={() => openEdit(s)}>✏️</Button>
                                {confirmId === s.id ? (
                                  <button
                                    onClick={() => void handleDelete(s.id)}
                                    disabled={deletingId === s.id}
                                    className="gkm-focus inline-flex items-center min-h-11 text-xs font-black text-error px-2 disabled:opacity-60"
                                  >
                                    {deletingId === s.id ? t("deleting") : t("confirmDelete")}
                                  </button>
                                ) : (
                                  <Button variant="icon" aria-label={`${t("delete")}: ${display}`} onClick={() => setConfirmId(s.id)}>🗑️</Button>
                                )}
                              </div>
                            </>
                          )}
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </main>

      {/* My Places 문맥형 추가 버튼 — 이 탭이 소유한 단일 생성 동작.
          전역 FAB 가 아니다(BottomNav 중앙 Build FAB 는 만들지 않는다). */}
      {tab === "mine" && !showCreate && !editingId && mine.length > 0 && (
        <button
          onClick={openCreate}
          aria-label={t("addPlace")}
          className="gkm-focus fixed right-4 z-[45] w-14 h-14 rounded-full bg-action text-white text-2xl font-black shadow-cta hover:bg-action-hover flex items-center justify-center bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          +
        </button>
      )}
    </div>
  );
}

// useSearchParams 는 Suspense 경계를 요구한다(정적 export 라 더 엄격하다).
// fallback 은 스켈레톤 하나로 둔다 — 어차피 탭 내용은 마운트 후 localStorage·
// 서버에서 채워지므로, 여기서 화면을 크게 그리면 두 번 깜빡인다.
export default function PicksClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-dim flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-line border-b-transparent animate-spin" aria-hidden />
        </div>
      }
    >
      <PicksContent />
    </Suspense>
  );
}
