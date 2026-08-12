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
import { canCreate, canEdit } from "@/lib/user-spots/anchor-core";

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
  category: UserSpotCategory;
  address:  string;
  note:     string;
  /** 현재 위치 버튼으로만 채워진다. 좌표는 언제나 짝으로 움직인다. */
  lat:      number | null;
  lng:      number | null;
}

export const EMPTY_USER_SPOT_FORM: UserSpotFormState = {
  name: "", category: "attraction", address: "", note: "", lat: null, lng: null,
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
  mode, photoFile, onPickPhoto,
  existingPhotoUrl = null, hasExistingPhoto = false,
  onRemoveExistingPhoto, photoBusy = false, photoNotice = null,
  canonicalImageUrl = null, canonicalSourceUrl = null,
}: Props) {
  const t = useTranslations("picks");
  const [gps, setGps] = useState<GpsState>("idle");

  // 고른 파일의 미리보기. Object URL 은 만든 쪽이 반드시 되돌려줘야 한다 —
  // 안 하면 탭을 닫을 때까지 그 이미지가 메모리에 남는다.
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!photoFile) { setLocalPreview(null); return; }
    const url = URL.createObjectURL(photoFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  // 버튼을 눌렀을 때만 권한을 묻는다. 폼을 열자마자 위치를 요구하면
  // 사진만 올리고 싶은 사람에게도 권한 팝업이 뜬다.
  function requestLocation() {
    if (!navigator.geolocation) { setGps("failed"); return; }
    setGps("loading");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(p => ({ ...p, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setGps("idle");
      },
      err => setGps(err.code === err.PERMISSION_DENIED ? "denied" : "failed"),
      { timeout: 8_000, maximumAge: 60_000, enableHighAccuracy: false },
    );
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
  const anchorInput = { lat: form.lat, lng: form.lng, hasPhoto: photoFile !== null };
  const canSubmit = mode === "create"
    ? canCreate(anchorInput)
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

      {/* Location — 지도 선택기는 아직 없다. 지금 안전하게 줄 수 있는 것은
          "지금 내가 서 있는 곳" 하나뿐이라 그것만 준다. */}
      <div>
        <label className={LABEL}>
          {t("fieldLocation")}{" "}
          <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
        </label>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {hasLocation ? (
            <>
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F6F7F8] text-sm font-bold text-[#191C21]">
                ✓ {t("locationSet")}
              </span>
              <button type="button" onClick={clearLocation} className={CHIP_BTN}>
                {t("locationClear")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={requestLocation}
              disabled={gps === "loading"}
              className="gkm-focus px-3 min-h-11 py-2 rounded-xl text-sm font-bold border border-[#E5E7EA] text-[#565D66] hover:bg-[#F6F7F8] transition-colors disabled:opacity-60 cursor-pointer"
            >
              {gps === "loading" ? t("locating") : `📍 ${t("useMyLocation")}`}
            </button>
          )}
        </div>
        {!hasLocation && gps === "idle" && (
          <p className="mt-1 text-[11px] text-[#565D66]/70">{t("locationHint")}</p>
        )}
        {gps === "denied" && (
          <p className="mt-1 text-[11px] text-[#565D66]">{t("locationDenied")}</p>
        )}
        {gps === "failed" && (
          <p className="mt-1 text-[11px] text-[#565D66]">{t("locationFailed")}</p>
        )}
      </div>

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

      {/* 저장할 수 없는 이유를 버튼이 비활성인 채로 두지 않고 말해 준다. */}
      {!canSubmit && !formError && (
        <p className="text-[11px] text-[#565D66]/80">{t("needAnchor")}</p>
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
        <span id="gkm-anchor-hint" className="sr-only">{t("needAnchor")}</span>
      )}
    </form>
  );
}
