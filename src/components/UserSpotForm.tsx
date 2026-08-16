// 사용자 등록 장소(user_spots) 입력 폼 — UserSpotsPanel 과 Picks > My Places 공용.
//
// 원래 UserSpotsPanel.renderForm 안에 있던 JSX 를 그대로 옮긴 것이다. 같은 폼을
// 두 화면에서 쓰게 되면서 로직을 복제하면 검증 규칙이 갈라진다 — 한 곳만 고치고
// 다른 곳을 잊는 종류의 버그다. 마크업·maxLength·필수값 규칙을 한 파일에 둔다.
//
// 상태는 호출부가 소유한다(controlled). 생성·수정 모두 같은 폼을 쓰는데 저장
// 동작과 낙관적 갱신 방식이 서로 다르기 때문이다.

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { canEdit, hasCompleteGps } from "@/lib/user-spots/anchor-core";
import {
  chooseSeed, isShortMapLink, parseMapLinkCoordinate,
  type SeedCoordinate, type SeedSource,
} from "@/lib/user-spots/location-seed";
import { geocodeAddress } from "@/lib/maps/naver-geocode";
import { CITY_ARRIVAL_OPTIONS } from "@/data/city-presets";
import SpotLocationPicker from "./SpotLocationPicker";

// 값(value)은 저장되는 데이터라 그대로 두고, 화면에 찍는 라벨만 키로 바꾼다.
export const USER_SPOT_CATEGORIES = [
  { value: "attraction",     labelKey: "catAttraction"    },
  { value: "nature",         labelKey: "catNature"        },
  { value: "restaurant",     labelKey: "catRestaurant"    },
  { value: "event",          labelKey: "catEvent"         },
  { value: "accommodation",  labelKey: "catAccommodation" },
] as const;

export type UserSpotCategory = typeof USER_SPOT_CATEGORIES[number]["value"];
export type UserSpotCategoryLabelKey = typeof USER_SPOT_CATEGORIES[number]["labelKey"];

/**
 * 저장된 category value 를 화면 라벨 키로 바꾼다.
 *
 * DB 에 들어 있는 값은 그대로 두고 보여줄 때만 번역한다. 폼의 select 와
 * 목록 카드가 같은 키를 쓰게 하려고 여기 둔다 — 두 곳이 갈라지면 폼에서는
 * "명소" 인데 목록에서는 "attraction" 인 상태가 다시 생긴다.
 *
 * 아는 값이 아니면 null 을 준다. 호출부는 원본 값을 그대로 보여준다 —
 * 모르는 값을 감추면 사용자는 자기 데이터가 사라진 것처럼 본다.
 */
export function userSpotCategoryLabelKey(
  value: string | null | undefined,
): UserSpotCategoryLabelKey | null {
  const v = (value ?? "").trim();
  return USER_SPOT_CATEGORIES.find(c => c.value === v)?.labelKey ?? null;
}

export interface UserSpotFormState {
  name:     string;
  /** 나만 보는 제목. factual name 과 다른 값이다. 편집 화면에서만 다룬다. */
  displayTitle: string;
  /** 나만 보는 기록. 공개로 나갈 수 있는 note 와 다른 값이다. */
  displayMemo:  string;
  category: UserSpotCategory;
  address:  string;
  note:     string;
  /** 위치 확인 지도에서 사용자가 맞춘 중심. 좌표는 언제나 짝으로 움직인다. */
  lat:      number | null;
  lng:      number | null;
}

export const EMPTY_USER_SPOT_FORM: UserSpotFormState = {
  name: "", displayTitle: "", displayMemo: "",
  category: "attraction", address: "", note: "", lat: null, lng: null,
};

interface Props {
  form:        UserSpotFormState;
  setForm:     React.Dispatch<React.SetStateAction<UserSpotFormState>>;
  formError:   string | null;
  submitting:  boolean;
  submitLabel: string;
  onSubmit:    (e: React.FormEvent) => Promise<void>;
  onCancel:    () => void;

  // ── 사진 ────────────────────────────────────────────────────────────────────
  /** 새로 만드는 중인지 고치는 중인지. 저장 가능 조건이 다르다. */
  mode:             "create" | "edit";
  /**
   * 지금 보고 있는 도시. 주소도 링크도 현재 위치도 없을 때 지도를 열 자리다.
   * 없으면 지도는 그대로 열리고 사용자가 찾아간다 — 없다고 막지 않는다.
   */
  city?:            string | null;
  /** 이번에 고른 파일. 폼은 파일 자체만 들고 있고 바이트를 복제하지 않는다. */
  photoFile:        File | null;
  onPickPhoto:      (file: File | null) => void;
  /** 이미 저장된 사진의 만료되는 URL. 없으면 null. */
  existingPhotoUrl?: string | null;
  hasExistingPhoto?: boolean;
  /** 저장된 사진 삭제. 서버가 409 로 막을 수 있어 호출부가 결과를 처리한다. */
  onRemoveExistingPhoto?: () => void;
  /** 사진 관련 진행 중 상태 (압축·업로드·삭제) */
  photoBusy?:       boolean;
  /** 사진 관련 안내·오류 문구 */
  photoNotice?:     string | null;
  /**
   * 개인 사진이 없을 때만 쓰는 공개 장소 대표 이미지.
   * 개인 사진이 있으면 서버가 주지 않는다 — 내가 찍은 사진 위에 덮이지 않는다.
   */
  canonicalImageUrl?:  string | null;
  /** 표기가 필요한 이미지일 때의 출처 링크. 없으면 표기할 것이 없다는 뜻이다. */
  canonicalSourceUrl?: string | null;
}

const INPUT =
  "mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EA] text-sm font-medium text-[#191C21] bg-white focus:outline-none focus:border-[#FF4A2D] focus:ring-1 focus:ring-[#FF4A2D]";
const LABEL = "text-xs font-black text-[#565D66] uppercase tracking-wider";
const CHIP_BTN =
  "gkm-focus px-3 min-h-11 py-2 rounded-xl text-xs font-bold border border-[#E5E7EA] text-[#565D66] hover:bg-[#F6F7F8] transition-colors disabled:opacity-60 cursor-pointer";

type GpsState = "idle" | "loading" | "denied" | "failed";

export default function UserSpotForm({
  form, setForm, formError, submitting, submitLabel, onSubmit, onCancel,
  mode, city = null, photoFile, onPickPhoto,
  existingPhotoUrl = null, hasExistingPhoto = false,
  onRemoveExistingPhoto, photoBusy = false, photoNotice = null,
  canonicalImageUrl = null, canonicalSourceUrl = null,
}: Props) {
  const t = useTranslations("picks");
  const [gps, setGps] = useState<GpsState>("idle");

  // 위치 확인 화면. 지도를 열기 전에 어디서 열지부터 정한다.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [seeking,    setSeeking]    = useState(false);
  const [seed, setSeed] = useState<
    { coordinate: SeedCoordinate | null; source: SeedSource; short: boolean; hadAlready: boolean } | null
  >(null);

  // 고른 파일의 미리보기. Object URL 은 만든 쪽이 반드시 되돌려줘야 한다 —
  // 안 하면 탭을 닫을 때까지 그 이미지가 메모리에 남는다.
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!photoFile) { setLocalPreview(null); return; }
    const url = URL.createObjectURL(photoFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  /** 지도를 여는 순간에만 권한을 묻는다. 거절해도 지도는 열린다. */
  function currentPosition(): Promise<SeedCoordinate | null> {
    if (!navigator.geolocation) { setGps("failed"); return Promise.resolve(null); }
    setGps("loading");
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => { setGps("idle"); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        err => { setGps(err.code === err.PERMISSION_DENIED ? "denied" : "failed"); resolve(null); },
        { timeout: 8_000, maximumAge: 60_000, enableHighAccuracy: false },
      );
    });
  }

  /** 이 도시의 첫 프리셋 지점. 새 좌표표를 만들지 않고 화면이 이미 쓰는 값을 쓴다. */
  function cityCenter(): SeedCoordinate | null {
    const first = CITY_ARRIVAL_OPTIONS[(city ?? "").trim()]?.[0];
    return first ? { lat: first.lat, lng: first.lng } : null;
  }

  /**
   * 지도를 어디서 열지 정하고 연다.
   *
   * 주소 칸 하나가 두 가지를 받는다 — 사람이 읽는 주소, 그리고 지도 링크.
   * 링크에 좌표가 박혀 있으면 그게 가장 정확하고, 아니면 주소를 찾아본다.
   * 둘 다 안 되면 지금 서 있는 자리, 그것도 안 되면 도시 중심이다.
   * 어디서 열든 최종 좌표는 사용자가 확인한 지도 중심이다.
   */
  async function openPicker() {
    setSeeking(true);
    const raw   = form.address.trim();
    const short = isShortMapLink(raw);
    const link  = short ? null : parseMapLinkCoordinate(raw);

    // 링크로 이미 찾았으면 주소를 다시 묻지 않는다. 링크처럼 생긴 문자열을
    // geocoder 에 넘기면 엉뚱한 곳이 나온다.
    const looksLikeUrl = /^https?:\/\//i.test(raw) || short;
    const address = !link && raw && !looksLikeUrl ? await geocodeAddress(raw) : null;

    // 이미 확인해 둔 좌표가 있으면 그 자리에서 다시 연다.
    const already = form.lat !== null && form.lng !== null
      ? { lat: form.lat, lng: form.lng }
      : null;

    let picked = already
      ? { coordinate: already, source: "link" as SeedSource }
      : chooseSeed({ link, address });

    if (!picked.coordinate) {
      const gps = await currentPosition();
      picked = chooseSeed({ gps, city: cityCenter() });
    }

    setSeed({ ...picked, short, hadAlready: already !== null });
    setSeeking(false);
    setPickerOpen(true);
  }

  function clearLocation() {
    // 한쪽만 지우는 상태를 만들지 않는다.
    setForm(p => ({ ...p, lat: null, lng: null }));
    setGps("idle");
  }

  const hasLocation = form.lat !== null && form.lng !== null;
  const shownPhoto  = localPreview ?? existingPhotoUrl;
  // 내 사진이 하나도 없을 때만 장소 사진을 보여준다. 순서를 바꾸면 내가 찍은
  // 사진 대신 카탈로그 사진이 뜬다 — 그건 내 기록이 아니다.
  const shownCanonical = !shownPhoto ? canonicalImageUrl : null;

  // 저장할 수 있는가 — 이름은 여기에 영향을 주지 않는다.
  //
  // 새로 만들 때는 지도에서 확인한 좌표 하나만 본다. 예전에는 `canCreate` 를
  // 그대로 써서 "좌표 또는 사진" 이었고, 사진만 붙이면 지도를 한 번도 열지
  // 않고 좌표 없는 장소가 만들어졌다. 그 장소는 일정에 넣을 수 없다 —
  // 사진은 무엇을 봤는지 알려 주지만 어디였는지는 알려 주지 않는다.
  //
  // 고칠 때는 규칙이 다르다. 이름만으로 만들어진 예전 행이 남아 있고 그
  // 메모를 고치려는 사람을 막을 이유가 없다 — `canEdit` 를 그대로 둔다.
  const anchorInput = { lat: form.lat, lng: form.lng, hasPhoto: photoFile !== null };
  const canSubmit = mode === "create"
    ? hasCompleteGps({ lat: form.lat, lng: form.lng })
    : canEdit({ ...anchorInput, name: form.name, hasExistingPhoto });

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 mt-3">
      {/* Photo — 위치와 함께 이 장소를 아는 근거가 된다. 사진만으로도 저장된다. */}
      <div>
        <label className={LABEL}>
          {t("fieldPhoto")}{" "}
          <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
        </label>

        {shownPhoto && (
          <div className="mt-1 relative w-full max-w-[280px] aspect-[4/3] rounded-xl overflow-hidden bg-[#F6F7F8] border border-[#E5E7EA]">
            {/* 만료되는 URL 이라 next/image 최적화 대상이 아니다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shownPhoto}
              alt={t("photoAlt")}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <label className={`${CHIP_BTN} inline-flex items-center ${photoBusy ? "opacity-60 pointer-events-none" : ""}`}>
            {shownPhoto ? t("photoChange") : t("photoAdd")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={photoBusy || submitting}
              onChange={e => {
                const f = e.target.files?.[0] ?? null;
                onPickPhoto(f);
                // 같은 파일을 다시 골라도 change 가 나도록 비운다.
                e.target.value = "";
              }}
            />
          </label>

          {photoFile && (
            <button
              type="button"
              onClick={() => onPickPhoto(null)}
              disabled={photoBusy || submitting}
              className={CHIP_BTN}
            >
              {t("photoRemove")}
            </button>
          )}

          {/* 저장된 사진 삭제는 서버 호출이라 고르기 취소와 다른 동작이다. */}
          {!photoFile && hasExistingPhoto && onRemoveExistingPhoto && (
            <button
              type="button"
              onClick={onRemoveExistingPhoto}
              disabled={photoBusy || submitting}
              className={CHIP_BTN}
            >
              {t("photoRemove")}
            </button>
          )}
        </div>

        {/* 장소 사진 fallback — 내 사진이 없을 때만 */}
        {shownCanonical && (
          <div className="mt-1">
            <div className="relative w-full max-w-[280px] aspect-[4/3] rounded-xl overflow-hidden bg-[#F6F7F8] border border-[#E5E7EA]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shownCanonical} alt={t("canonicalPhotoAlt")} className="w-full h-full object-cover" />
            </div>
            <p className="mt-1 text-[11px] text-[#565D66]/70">
              {t("canonicalPhotoNote")}
              {canonicalSourceUrl && (
                <>
                  {" · "}
                  <a
                    href={canonicalSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >{t("photoSource")}</a>
                </>
              )}
            </p>
          </div>
        )}

        {photoNotice && (
          <p role="status" className="mt-1 text-[11px] text-[#565D66]">{photoNotice}</p>
        )}
      </div>

      {/* Location — 지도에서 이 장소의 자리를 짚는다.
          예전에는 "지금 내가 서 있는 곳" 만 줄 수 있었다. 그건 이 장소의 위치가
          아니라 내 위치다 — 집에서 카페를 등록하면 집 좌표가 저장됐다.
          이제 그 값은 지도를 열 자리로만 쓰고, 저장되는 것은 사용자가 확인한 중심이다. */}
      <div>
        <label className={LABEL}>
          {t("fieldLocation")}{" "}
          <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
        </label>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {hasLocation ? (
            <>
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F6F7F8] text-sm font-bold text-[#191C21]">
                ✓ {t("locConfirmed")}
              </span>
              <button type="button" onClick={() => void openPicker()} disabled={seeking} className={CHIP_BTN}>
                {t("locRecheck")}
              </button>
              <button type="button" onClick={clearLocation} className={CHIP_BTN}>
                {t("locationClear")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void openPicker()}
              disabled={seeking}
              className="gkm-focus px-4 min-h-11 py-2 rounded-xl text-sm font-black text-white transition-opacity disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: "#0057ff" }}
            >
              {seeking ? t("locSeeking") : t("locConfirmOpen")}
            </button>
          )}
        </div>
        {!hasLocation && gps === "idle" && (
          <p className="mt-1 text-[11px] text-[#565D66]/70">{t("locConfirmWhy")}</p>
        )}
        {gps === "denied" && (
          <p className="mt-1 text-[11px] text-[#565D66]">{t("locationDenied")}</p>
        )}
        {gps === "failed" && (
          <p className="mt-1 text-[11px] text-[#565D66]">{t("locationFailed")}</p>
        )}
      </div>

      {pickerOpen && (
        <SpotLocationPicker
          center={seed?.coordinate ?? null}
          zoomedIn={seed?.hadAlready ?? false}
          placeName={form.name}
          seedNote={
            seed?.short              ? t("locSeedShortLink")
            : seed?.source === "link"    ? (seed.hadAlready ? null : t("locSeedLink"))
            : seed?.source === "address" ? t("locSeedAddress")
            : seed?.source === "gps"     ? t("locSeedGps")
            : seed?.source === "city"    ? t("locSeedCity")
            : t("locSeedNone")
          }
          onCancel={() => setPickerOpen(false)}
          onConfirm={(lat, lng) => {
            setForm(p => ({ ...p, lat, lng }));
            setPickerOpen(false);
          }}
        />
      )}

      {/* Name — 손으로 적는 것은 선택이다. 저장 여부에는 영향을 주지 않는다. */}
      <div>
        <label className={LABEL}>
          {t("fieldName")}{" "}
          <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          maxLength={300}
          placeholder={t("phName")}
          className={INPUT}
        />
      </div>

      {/* 나만 보는 값 — 만들 때는 묻지 않는다. 저장을 복잡하게 만들지 않는다. */}
      {mode === "edit" && (
        <>
          <div>
            <label className={LABEL}>
              {t("fieldDisplayTitle")}{" "}
              <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
            </label>
            <input
              type="text"
              value={form.displayTitle}
              onChange={e => setForm(p => ({ ...p, displayTitle: e.target.value }))}
              maxLength={300}
              placeholder={t("phDisplayTitle")}
              className={INPUT}
            />
            <p className="mt-1 text-[11px] text-[#565D66]/70">{t("displayVsName")}</p>
          </div>

          <div>
            <label className={LABEL}>
              {t("fieldDisplayMemo")}{" "}
              <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
            </label>
            <textarea
              value={form.displayMemo}
              onChange={e => setForm(p => ({ ...p, displayMemo: e.target.value }))}
              maxLength={1000}
              rows={2}
              placeholder={t("phDisplayMemo")}
              className={`${INPUT} resize-none`}
            />
            <p className="mt-1 text-[11px] text-[#565D66]/70">{t("displayVsNote")}</p>
          </div>
        </>
      )}

      {/* Category */}
      <div>
        <label className={LABEL}>{t("fieldCategory")}</label>
        <select
          value={form.category}
          onChange={e => setForm(p => ({ ...p, category: e.target.value as UserSpotCategory }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EA] text-sm font-medium text-[#191C21] bg-white focus:outline-none focus:border-[#FF4A2D]"
        >
          {USER_SPOT_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{t(c.labelKey)}</option>
          ))}
        </select>
      </div>

      {/* Address */}
      <div>
        <label className={LABEL}>{t("fieldAddress")} <span className="font-normal normal-case text-[#565D66]/60">{t("optional")}</span></label>
        <input
          type="text"
          value={form.address}
          onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
          maxLength={500}
          placeholder={t("phAddress")}
          className={INPUT}
        />
      </div>

      {/* Note */}
      <div>
        <label className={LABEL}>{t("fieldNote")} <span className="font-normal normal-case text-[#565D66]/60">{t("optional")}</span></label>
        <textarea
          value={form.note}
          onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
          maxLength={2000}
          rows={2}
          placeholder={t("phNote")}
          className={`${INPUT} resize-none`}
        />
      </div>

      {formError && (
        <p role="alert" className="text-xs text-red-500 font-medium">{formError}</p>
      )}

      {/* 저장할 수 없는 이유를 버튼이 비활성인 채로 두지 않고 말해 준다.
          만들 때와 고칠 때 막히는 이유가 다르므로 다른 말을 한다. */}
      {!canSubmit && !formError && (
        <p className="text-[11px] text-[#565D66]/80">{t(mode === "create" ? "needLocation" : "needAnchor")}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting || photoBusy || !canSubmit}
          aria-describedby={!canSubmit ? "gkm-anchor-hint" : undefined}
          className="gkm-focus flex-1 min-h-11 py-2.5 rounded-xl text-sm font-black text-white transition-opacity disabled:opacity-60 cursor-pointer"
          style={{ backgroundColor: "#FF4A2D" }}
        >
          {submitting ? t("saving") : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="gkm-focus px-4 min-h-11 py-2.5 rounded-xl text-sm font-bold border border-[#E5E7EA] text-[#565D66] hover:bg-[#F6F7F8] transition-colors cursor-pointer"
        >
          {t("cancel")}
        </button>
      </div>
      {!canSubmit && (
        <span id="gkm-anchor-hint" className="sr-only">{t(mode === "create" ? "needLocation" : "needAnchor")}</span>
      )}
    </form>
  );
}
