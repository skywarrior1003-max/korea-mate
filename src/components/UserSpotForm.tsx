// 사용자 등록 장소(user_spots) 입력 폼 — UserSpotsPanel 과 Picks > My Places 공용.
//
// 원래 UserSpotsPanel.renderForm 안에 있던 JSX 를 그대로 옮긴 것이다. 같은 폼을
// 두 화면에서 쓰게 되면서 로직을 복제하면 검증 규칙이 갈라진다 — 한 곳만 고치고
// 다른 곳을 잊는 종류의 버그다. 마크업·maxLength·필수값 규칙을 한 파일에 둔다.
//
// 상태는 호출부가 소유한다(controlled). 생성·수정 모두 같은 폼을 쓰는데 저장
// 동작과 낙관적 갱신 방식이 서로 다르기 때문이다.

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// 값(value)은 저장되는 데이터라 그대로 두고, 화면에 찍는 라벨만 키로 바꾼다.
export const USER_SPOT_CATEGORIES = [
  { value: "attraction",     labelKey: "catAttraction"    },
  { value: "nature",         labelKey: "catNature"        },
  { value: "restaurant",     labelKey: "catRestaurant"    },
  { value: "event",          labelKey: "catEvent"         },
  { value: "accommodation",  labelKey: "catAccommodation" },
] as const;

export type UserSpotCategory = typeof USER_SPOT_CATEGORIES[number]["value"];

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

/**
 * 저장할 수 있는 최소 조건 — 이름이 있거나, 좌표가 짝으로 있거나.
 *
 * 이름을 손으로 적는 것을 필수로 두면 "여기, 이 자리" 라고만 말하고 싶은
 * 장소를 담을 수 없다. 그렇다고 아무것도 없는 행을 만들면 나중에 그게
 * 무엇이었는지 아무도 알 수 없다. 그래서 둘 중 하나다.
 *
 * API 와 DB CHECK 도 같은 규칙을 검사한다. 세 곳이 같은 말을 하도록
 * 이 함수를 단일 출처로 쓴다.
 */
export function hasMinimumIdentity(form: {
  name: string; lat: number | null; lng: number | null;
}): boolean {
  if (form.name.trim().length > 0) return true;
  return form.lat !== null && form.lng !== null;
}

interface Props {
  form:        UserSpotFormState;
  setForm:     React.Dispatch<React.SetStateAction<UserSpotFormState>>;
  formError:   string | null;
  submitting:  boolean;
  submitLabel: string;
  onSubmit:    (e: React.FormEvent) => Promise<void>;
  onCancel:    () => void;
}

const INPUT =
  "mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EA] text-sm font-medium text-[#191C21] bg-white focus:outline-none focus:border-[#FF4A2D] focus:ring-1 focus:ring-[#FF4A2D]";
const LABEL = "text-xs font-black text-[#565D66] uppercase tracking-wider";

type GpsState = "idle" | "loading" | "denied" | "failed";

export default function UserSpotForm({
  form, setForm, formError, submitting, submitLabel, onSubmit, onCancel,
}: Props) {
  const t = useTranslations("picks");
  const [gps, setGps] = useState<GpsState>("idle");

  // 버튼을 눌렀을 때만 권한을 묻는다. 폼을 열자마자 위치를 요구하면
  // 이름만 적고 싶은 사람에게도 권한 팝업이 뜬다.
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
  const canSubmit   = hasMinimumIdentity(form);

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 mt-3">
      {/* Name — 손으로 적는 것은 선택이다. 위치만으로도 장소가 성립한다. */}
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
              <button
                type="button"
                onClick={clearLocation}
                className="gkm-focus px-3 min-h-11 py-2 rounded-xl text-xs font-bold border border-[#E5E7EA] text-[#565D66] hover:bg-[#F6F7F8] transition-colors cursor-pointer"
              >
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

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting || !canSubmit}
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
    </form>
  );
}
