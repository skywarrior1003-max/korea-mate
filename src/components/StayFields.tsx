"use client";

// 숙박 입력 한 벌.
//
// Home 이 먼저 쓰지만 Home 것이 아니다. This Trip 도 같은 것을 걸어 쓴다 —
// 화면마다 따로 만들면 한쪽에서 지운 좌표가 다른 쪽에 남는다.
//
// 세 가지 수준을 사용자가 고른다. 아직 안 정했거나, 동네만 정했거나, 숙소를
// 정했거나. 무엇을 고르든 일정은 만들어진다 — 숙박은 필수가 아니다.
//
// 정확한 숙소에서 이름·주소·링크는 사용자의 메모다. 우리는 그것을 읽어 위치를
// 알아내지 않는다. 위치는 사용자가 지도에서 짚었을 때만 생긴다.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { stayAreaOptions } from "@/lib/trip-stay/stay-core";
import {
  hasAnyStayField, nextStayDetail, confirmStayCoordinate, stayMapCenter,
  type StayFields as Fields, type StayMode,
} from "@/lib/trip-stay/stay-input-core";
import type { TripStayDetail } from "@/lib/trip-draft/trip-draft-core";
import StayLocationPicker from "./StayLocationPicker";

export interface StayFieldsProps {
  city:     string;
  mode:     StayMode;
  stayArea: string;
  fields:   Fields;
  stay:     TripStayDetail | null;
  onModeChange:  (mode: StayMode) => void;
  onAreaChange:  (value: string) => void;
  onFieldChange: (fields: Fields, stay: TripStayDetail | null) => void;
}

const INPUT_CLASS =
  "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 " +
  "focus:outline-none focus:ring-2 focus:ring-orange-400";

export default function StayFieldsSection({
  city, mode, stayArea, fields, stay,
  onModeChange, onAreaChange, onFieldChange,
}: StayFieldsProps) {
  const t = useTranslations("stay");
  const [pickerOpen, setPickerOpen] = useState(false);

  const confirmed = stay?.coordinate ?? null;
  const center    = stayMapCenter(city, stayArea, confirmed);

  /** 글자가 바뀔 때마다. 좌표를 지킬지 버릴지는 core 가 정한다. */
  function edit(patch: Partial<Fields>) {
    const next = { ...fields, ...patch };
    onFieldChange(next, nextStayDetail(next, stay));
  }

  const MODES: { key: StayMode; label: string }[] = [
    { key: "none",  label: t("modeNone")  },
    { key: "area",  label: t("modeArea")  },
    { key: "exact", label: t("modeExact") },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-gray-500">{t("question")}</p>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t("question")}>
          {MODES.map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => onModeChange(m.key)}
              aria-pressed={mode === m.key}
              className={`px-2 py-2 rounded-lg text-[11px] font-bold leading-tight transition-all border ${
                mode === m.key
                  ? "border-orange-400 bg-orange-100 text-orange-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-orange-300"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "area" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-gray-600">{t("areaLabel")}</label>
          <div className="grid grid-cols-2 gap-1.5">
            {stayAreaOptions(city).map(area => (
              <button
                key={area.value}
                type="button"
                onClick={() => onAreaChange(area.value)}
                aria-pressed={stayArea === area.value}
                className={`px-3 py-2 rounded-lg text-xs font-bold text-left transition-all border ${
                  stayArea === area.value
                    ? "border-orange-400 bg-orange-100 text-orange-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-orange-300"
                }`}
              >
                {area.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "exact" && (
        <div className="flex flex-col gap-2.5">
          <p className="text-[11px] text-gray-500">{t("exactHint")}</p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="stay-name" className="text-xs font-bold text-gray-600">{t("nameLabel")}</label>
            <input
              id="stay-name" type="text" value={fields.name}
              onChange={e => edit({ name: e.target.value })}
              placeholder={t("namePlaceholder")} className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="stay-address" className="text-xs font-bold text-gray-600">{t("addressLabel")}</label>
            <input
              id="stay-address" type="text" value={fields.address}
              onChange={e => edit({ address: e.target.value })}
              placeholder={t("addressPlaceholder")} className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="stay-link" className="text-xs font-bold text-gray-600">{t("linkLabel")}</label>
            <input
              id="stay-link" type="url" inputMode="url" value={fields.link}
              onChange={e => edit({ link: e.target.value })}
              placeholder={t("linkPlaceholder")} className={INPUT_CLASS}
            />
          </div>

          {/* 지도 확인. 여기가 좌표가 생기는 유일한 자리다. */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={!center}
              className={`w-full py-2.5 px-3 rounded-lg text-xs font-bold border transition-all disabled:opacity-50 ${
                confirmed
                  ? "border-orange-300 bg-white text-orange-700 hover:bg-orange-50"
                  : "border-dashed border-gray-300 bg-transparent text-gray-600 hover:border-orange-300 hover:text-orange-600"
              }`}
            >
              {confirmed ? t("changeLocation") : t("checkLocation")}
            </button>
            <p className="text-[11px] text-gray-500" aria-live="polite">
              {confirmed ? t("locationConfirmed")
                : hasAnyStayField(fields) ? t("locationNotConfirmed")
                : t("locationOptional")}
            </p>
          </div>
        </div>
      )}

      {pickerOpen && center && (
        <StayLocationPicker
          center={center}
          confirmed={confirmed}
          placeName={fields.name}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(lat, lng) => {
            const next = confirmStayCoordinate(fields, lat, lng);
            if (next) onFieldChange(fields, next);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
