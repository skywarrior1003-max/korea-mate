// 사용자 등록 장소(user_spots) 입력 폼 — UserSpotsPanel 과 Picks > My Places 공용.
//
// 원래 UserSpotsPanel.renderForm 안에 있던 JSX 를 그대로 옮긴 것이다. 같은 폼을
// 두 화면에서 쓰게 되면서 로직을 복제하면 검증 규칙이 갈라진다 — 한 곳만 고치고
// 다른 곳을 잊는 종류의 버그다. 마크업·maxLength·필수값 규칙을 한 파일에 둔다.
//
// 상태는 호출부가 소유한다(controlled). 생성·수정 모두 같은 폼을 쓰는데 저장
// 동작과 낙관적 갱신 방식이 서로 다르기 때문이다.

"use client";

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
}

export const EMPTY_USER_SPOT_FORM: UserSpotFormState = {
  name: "", category: "attraction", address: "", note: "",
};

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

export default function UserSpotForm({
  form, setForm, formError, submitting, submitLabel, onSubmit, onCancel,
}: Props) {
  const t = useTranslations("picks");

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 mt-3">
      {/* Name */}
      <div>
        <label className={LABEL}>{t("fieldName")} *</label>
        <input
          type="text"
          required
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

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting}
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
