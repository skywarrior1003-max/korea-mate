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

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { TopNav, Card, Badge, Button } from "@/components/ui";
import { getItemSourceKey, parseCitySpotId } from "@/lib/place-identity";
import { getCart, removeFromCart, clearCart, addToCart, CART_EVENT, type CartItem, type EventItem } from "@/lib/cart";
import { getFavorites, getSavedSpotsData, removeFavorite, FAVORITES_EVENT } from "@/lib/favorites";
import {
  apiGetUserSpots, apiCreateUserSpot, apiUpdateUserSpot, apiDeleteUserSpot,
  type UserSpot,
} from "@/lib/user-spots-api";
import { trackEvent } from "@/lib/analytics";
import UserSpotForm, {
  EMPTY_USER_SPOT_FORM,
  type UserSpotFormState,
} from "@/components/UserSpotForm";

type Tab = "selected" | "saved" | "mine";
const TABS: Tab[] = ["selected", "saved", "mine"];

const CATEGORY_EMOJI: Record<string, string> = {
  attraction: "🏛️", restaurant: "🍽️", nature: "🌿", event: "🎉", accommodation: "🏨",
};

/** user_spots 행을 Cart 항목으로 — 좌표가 없으므로 일정 배치는 보관함을 거친다. */
function userSpotToEvent(s: UserSpot): EventItem {
  return {
    id: `user_spot-${s.id}`,
    sourceKey: `user_spot:${s.id}`,
    type: s.category || "attraction",
    isAnchor: false, journeyCluster: null, stage: "", anchorEventId: null,
    relatedSpotIds: [], relatedSurvivalGuides: [], transitFromAnchor: null,
    name: s.name, shortName: s.name, tags: [],
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

export default function PicksClient() {
  const t   = useTranslations("picks");
  const tS  = useTranslations("shell");
  const tP  = useTranslations("place");
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("selected");

  // ── Selected (cart) ─────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<CartItem[]>([]);
  useEffect(() => {
    const sync = () => setSelected(getCart());
    sync();
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, []);

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

  // 로딩 플래그는 여기서 세우지 않는다 — 최초 마운트에서 effect 가 동기 setState
  // 를 호출하면 렌더가 한 번 더 돈다. 초기값이 이미 true 이고, 재시도는 클릭
  // 핸들러가 직접 세운다.
  const loadMine = useCallback(() => {
    apiGetUserSpots()
      .then(rows => { setMine(rows); setMineError(false); })
      .catch(() => setMineError(true))
      .finally(() => setMineLoading(false));
  }, []);
  useEffect(() => { loadMine(); }, [loadMine]);

  function retryMine() {
    setMineLoading(true);
    setMineError(false);
    loadMine();
  }

  function openCreate() {
    setForm(EMPTY_USER_SPOT_FORM); setFormError(null); setEditingId(null); setShowCreate(true);
  }
  function openEdit(s: UserSpot) {
    setForm({
      name: s.name,
      category: (s.category as UserSpotFormState["category"]) || "attraction",
      address: s.address ?? "", note: s.note ?? "",
    });
    setFormError(null); setShowCreate(false); setEditingId(s.id);
  }
  function closeForm() {
    setShowCreate(false); setEditingId(null); setFormError(null); setForm(EMPTY_USER_SPOT_FORM);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { setFormError(t("nameRequired")); return; }
    if (submitting) return;
    setSubmitting(true); setFormError(null);
    try {
      await apiCreateUserSpot({
        name,
        category: form.category,
        address:  form.address.trim() || undefined,
        note:     form.note.trim()    || undefined,
      });
      closeForm();
      loadMine();                       // 서버 응답을 진실로 삼는다
    } catch {
      setFormError(t("saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(e: React.FormEvent, spot: UserSpot) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { setFormError(t("nameRequired")); return; }
    if (submitting) return;
    setSubmitting(true); setFormError(null);
    try {
      const ok = await apiUpdateUserSpot(spot.id, {
        name,
        category: form.category,
        address:  form.address.trim() || undefined,
        note:     form.note.trim()    || undefined,
      });
      if (!ok) { setFormError(t("saveFailed")); return; }
      closeForm();
      loadMine();
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
      if (ok) setMine(prev => prev.filter(s => s.id !== id));
    } catch { /* 실패 시 목록 유지 — 조용한 손실을 만들지 않는다 */ }
    finally { setDeletingId(null); setConfirmId(null); }
  }

  // ── 공통 동작 ───────────────────────────────────────────────────────────────
  function addToSelected(item: EventItem, from: "saved" | "mine") {
    addToCart(item);
    trackEvent("place_add_to_itinerary", {
      city: item.city || "", category: item.type || "",
      source_type: from === "saved" ? "saved" : "user_spot",
      cta_position: `picks-${from}`, picked_count: getCart().length,
    });
  }

  function handleBuild() {
    trackEvent("build_trip_click", {
      city: selected[0]?.city ?? "",
      picked_count: selected.length,
      cta_position: "picks-selected",
    });
    // 기존 진입 흐름 그대로 — 신규 route·payload 를 만들지 않는다.
    router.push("/#planner");
  }

  const selectedKeys = new Set(selected.map(getItemSourceKey));
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
        <Link href="/" className="gkm-focus text-sm font-semibold text-sub">{tS("home")}</Link>
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
                <Button variant="text" onClick={() => clearCart()}>{t("clearAll")}</Button>
              </div>

              <ul className="flex flex-col gap-3">
                {selected.map(item => {
                  const key = getItemSourceKey(item);
                  const placeId = parseCitySpotId(key);
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
                              <Link href={`/place/${placeId}/`} className="gkm-focus inline-block mt-2 text-xs font-bold text-sub hover:text-ink">
                                {tP("viewDetails")} →
                              </Link>
                            )}
                          </div>
                          <Button variant="text" aria-label={`${t("remove")}: ${item.name}`} onClick={() => removeFromCart(key)}>✕</Button>
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
                <button
                  onClick={handleBuild}
                  className="gkm-focus w-full flex items-center justify-center gap-2 min-h-12 rounded-control bg-action text-white font-bold shadow-cta hover:bg-action-hover"
                >
                  ✨ {t("build")}
                </button>
              </div>
            </>
          ))}
        </div>

        {/* ── Saved ── */}
        <div role="tabpanel" id={panelId("saved")} aria-labelledby={tabId("saved")} hidden={tab !== "saved"}>
          {tab === "saved" && (saved.length === 0 ? (
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
              {saved.map(e => {
                const key = getItemSourceKey(e);
                const placeId = parseCitySpotId(key);
                const already = selectedKeys.has(key);
                return (
                  <li key={key}>
                    <Card className="overflow-hidden p-0">
                      <div className="relative">
                        <PlaceCardMedia image={e.image} type={e.type} />
                        {/* 저장 상태 — 디자인의 카드 우상단 하트 */}
                        <button
                          onClick={() => removeFavorite(e.id)}
                          aria-label={`${t("remove")}: ${e.name}`}
                          className="gkm-focus absolute top-2 right-2 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-card flex items-center justify-center text-base"
                        >
                          ❤️
                        </button>
                      </div>
                      <div className="p-4">
                        <p className="font-bold text-ink text-base leading-snug">{e.name}</p>
                        <p className="text-xs text-faint mt-1 truncate">
                          📍 {[e.district, e.city].filter(Boolean).join(", ") || "—"}
                        </p>
                        <div className="flex items-center gap-3 mt-3">
                          <button
                            onClick={() => addToSelected(e, "saved")}
                            disabled={already}
                            className="gkm-focus inline-flex items-center gap-1 text-xs font-black text-action disabled:text-ok disabled:cursor-default"
                          >
                            {already ? `✓ ${t("inSelected")}` : `+ ${t("addToSelected")}`}
                          </button>
                          <span className="flex-1" />
                          {placeId && (
                            <Link href={`/place/${placeId}/`} className="gkm-focus text-xs font-bold text-sub hover:text-ink">
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
                    const ev = userSpotToEvent(s);
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
                              />
                            </>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-ink text-[15px]">{s.name}</p>
                                  <p className="text-xs text-faint mt-0.5">
                                    {[s.category, s.city, s.address].filter(Boolean).join(" · ")}
                                  </p>
                                  {s.note && <p className="text-sm text-sub mt-2 leading-relaxed">{s.note}</p>}
                                </div>
                                <Badge kind="editorial" className="shrink-0">🔒 {t("privateLabel")}</Badge>
                              </div>
                              <div className="flex items-center gap-1 mt-3">
                                <button
                                  onClick={() => addToSelected(ev, "mine")}
                                  disabled={already}
                                  className="gkm-focus text-xs font-bold text-action disabled:text-ok disabled:cursor-default px-2 py-2"
                                >
                                  {already ? `✓ ${t("inSelected")}` : `+ ${t("addToSelected")}`}
                                </button>
                                <span className="flex-1" />
                                <Button variant="text" aria-label={`${t("edit")}: ${s.name}`} onClick={() => openEdit(s)}>✏️</Button>
                                {confirmId === s.id ? (
                                  <button
                                    onClick={() => void handleDelete(s.id)}
                                    disabled={deletingId === s.id}
                                    className="gkm-focus text-xs font-black text-error px-2 py-2 disabled:opacity-60"
                                  >
                                    {deletingId === s.id ? t("deleting") : t("confirmDelete")}
                                  </button>
                                ) : (
                                  <Button variant="text" aria-label={`${t("delete")}: ${s.name}`} onClick={() => setConfirmId(s.id)}>🗑️</Button>
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
