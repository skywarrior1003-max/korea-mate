"use client";

// 이번 여행의 조건 — 한 자리에서 보고 고친다.
//
// 지금까지 이 값들은 Home 플래너에만 있었다. 장소는 Picks 에서 고르는데 조건은
// Home 에 있어서, 사용자는 "내가 언제 가는 여행이더라" 를 확인하려면 화면을
// 옮겨 다녀야 했다. This Trip 이 이번 여행의 작업대라면 조건도 여기 있어야 한다.
//
// 저장소를 새로 만들지 않는다. `TripDraft` 하나가 여전히 SSOT 이고 이 화면은
// 그것을 읽고 고칠 뿐이다. Home 에서 바꾸든 여기서 바꾸든 같은 값이다.
//
// 처음부터 다 펼치지 않는다. 도착·출발·숙박은 안 정해도 되는 것들이라,
// 정해 뒀으면 한 줄로 보여 주고 아니면 "추가" 만 둔다.

import { useState } from "react";
import { useTranslations } from "next-intl";
import DatePicker from "./DatePicker";
import StayFieldsSection from "./StayFields";
import { CITY_ARRIVAL_OPTIONS } from "@/data/city-presets";
import { stayAreaOptions } from "@/lib/trip-stay/stay-core";
import {
  EMPTY_STAY_FIELDS, stayFieldsFrom, stayModeFrom,
  type StayFields as Fields, type StayMode,
} from "@/lib/trip-stay/stay-input-core";
import { TRIP_PACE_CHOICES, type TripPaceChoice } from "@/lib/trip-pace/pace-core";
import type { TripDraft, TripStayDetail } from "@/lib/trip-draft/trip-draft-core";

export interface TripSetupPatch {
  startDate?:      string;
  endDate?:        string;
  travelers?:      string;
  startLocation?:  string | null;
  arrivalTime?:    string | null;
  departurePlace?: string | null;
  departureTime?:  string | null;
  stayArea?:       string | null;
  stay?:           TripStayDetail | null;
  tripPace?:       TripPaceChoice;
}

export interface TripSetupPanelProps {
  draft:    TripDraft;
  onChange: (patch: TripSetupPatch) => void;
}

const FIELD =
  "w-full bg-white border border-line rounded-control px-3 py-2.5 text-sm text-ink " +
  "gkm-focus focus:outline-none";

/** 접었다 폈다 하는 한 칸. 정해 뒀으면 요약이 보이고, 아니면 비어 있다고 말한다. */
function Section({
  title, summary, open, onToggle, children,
}: {
  title: string; summary: string; open: boolean;
  onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line pt-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="gkm-focus w-full flex items-center justify-between gap-3 min-h-11 text-left"
      >
        <span className="text-sm font-bold text-ink shrink-0">{title}</span>
        <span className="flex-1 min-w-0 truncate text-xs text-sub text-right">{summary}</span>
        <span aria-hidden className="text-xs text-sub">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="mt-3 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

export default function TripSetupPanel({ draft, onChange }: TripSetupPanelProps) {
  const t     = useTranslations("tripSetup");
  const tPace = useTranslations("pace");

  const [openDates,  setOpenDates]  = useState(false);
  const [openArr,    setOpenArr]    = useState(false);
  const [openDep,    setOpenDep]    = useState(false);
  const [openStay,   setOpenStay]   = useState(false);

  const city    = draft.city;
  const options = CITY_ARRIVAL_OPTIONS[city] ?? [];
  const label   = (v?: string) => options.find(o => o.value === v)?.label ?? v ?? "";

  const stay       = draft.stay ?? null;
  const stayMode   = stayModeFrom(draft.stayArea, stay);
  const stayFields = stay ? stayFieldsFrom(stay) : EMPTY_STAY_FIELDS;

  const none = t("notSet");
  const staySummary =
    stayMode === "exact" ? (stay?.name?.trim() || t("stayExact"))
    : stayMode === "area" ? (stayAreaOptions(city).find(o => o.value === draft.stayArea)?.label ?? draft.stayArea ?? none)
    : none;

  return (
    <section className="rounded-control border border-line bg-surface p-4 flex flex-col gap-3">
      {/* 이번 여행이 무엇인지 — 한눈에 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-black text-ink truncate">{city}</p>
          <p className="text-xs text-sub mt-0.5">
            {draft.startDate} – {draft.endDate}
            {draft.travelers ? ` · ${t("travelersCount", { count: Number(draft.travelers) || 1 })}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenDates(v => !v)}
          className="gkm-focus shrink-0 inline-flex items-center min-h-11 text-xs font-bold text-action"
        >
          {t("edit")}
        </button>
      </div>

      {openDates && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-sub">{t("startDate")}</span>
              <DatePicker
                value={draft.startDate}
                placeholder={t("startDate")}
                onChange={(v: string) => onChange({ startDate: v })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-sub">{t("endDate")}</span>
              <DatePicker
                value={draft.endDate}
                min={draft.startDate}
                placeholder={t("endDate")}
                onChange={(v: string) => onChange({ endDate: v })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="trip-travelers" className="text-xs font-bold text-sub">{t("travelers")}</label>
            <input
              id="trip-travelers" type="number" min={1} max={20} inputMode="numeric"
              value={draft.travelers ?? "1"}
              onChange={e => onChange({ travelers: e.target.value })}
              className={FIELD}
            />
          </div>
        </div>
      )}

      {/* 도착 — 안 정해도 된다 */}
      <Section
        title={t("arrival")}
        summary={draft.startLocation ? `${label(draft.startLocation)}${draft.arrivalTime ? ` · ${draft.arrivalTime}` : ""}` : none}
        open={openArr} onToggle={() => setOpenArr(v => !v)}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {options.map(o => (
            <button
              key={o.value} type="button"
              onClick={() => onChange({ startLocation: o.value })}
              aria-pressed={draft.startLocation === o.value}
              className={`gkm-focus px-3 py-2 rounded-control text-xs font-bold text-left border transition-colors ${
                draft.startLocation === o.value
                  ? "border-action bg-action/10 text-action"
                  : "border-line bg-surface text-sub hover:border-action/40"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <input
          type="time" aria-label={t("arrivalTime")}
          value={draft.arrivalTime ?? ""}
          onChange={e => onChange({ arrivalTime: e.target.value || null })}
          className={FIELD}
        />
      </Section>

      {/* 출발 — 마지막 날을 안전하게 */}
      <Section
        title={t("departure")}
        summary={draft.departurePlace ? `${label(draft.departurePlace)}${draft.departureTime ? ` · ${draft.departureTime}` : ""}` : none}
        open={openDep} onToggle={() => setOpenDep(v => !v)}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {options.map(o => (
            <button
              key={o.value} type="button"
              onClick={() => onChange({ departurePlace: o.value })}
              aria-pressed={draft.departurePlace === o.value}
              className={`gkm-focus px-3 py-2 rounded-control text-xs font-bold text-left border transition-colors ${
                draft.departurePlace === o.value
                  ? "border-action bg-action/10 text-action"
                  : "border-line bg-surface text-sub hover:border-action/40"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <input
          type="time" aria-label={t("departureTime")}
          value={draft.departureTime ?? ""}
          onChange={e => onChange({ departureTime: e.target.value || null })}
          className={FIELD}
        />
      </Section>

      {/* 숙박 — Home 과 같은 컴포넌트다. 여기서 다시 만들지 않는다. */}
      <Section
        title={t("stay")} summary={staySummary}
        open={openStay} onToggle={() => setOpenStay(v => !v)}
      >
        <StayFieldsSection
          city={city}
          mode={stayMode}
          stayArea={draft.stayArea ?? ""}
          fields={stayFields}
          stay={stay}
          onModeChange={(m: StayMode) => {
            if (m === "none")      onChange({ stayArea: "", stay: null });
            else if (m === "area") onChange({ stay: null });
            else                   onChange({ stay: stay ?? { name: "" } });
          }}
          onAreaChange={(v: string) => onChange({ stayArea: v })}
          onFieldChange={(_f: Fields, next: TripStayDetail | null) => onChange({ stay: next })}
        />
      </Section>

      {/* 여행 속도 — 동행이 아니라 어떻게 다닐지를 묻는다 */}
      <div className="border-t border-line pt-3 flex flex-col gap-1.5">
        <p className="text-sm font-bold text-ink">{tPace("title")}</p>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={tPace("title")}>
          {TRIP_PACE_CHOICES.map(p => (
            <button
              key={p} type="button"
              onClick={() => onChange({ tripPace: p })}
              aria-pressed={(draft.tripPace ?? "balanced") === p}
              className={`gkm-focus px-2 py-2 rounded-control text-[11px] font-bold leading-tight border transition-colors ${
                (draft.tripPace ?? "balanced") === p
                  ? "border-action bg-action/10 text-action"
                  : "border-line bg-surface text-sub hover:border-action/40"}`}
            >
              {tPace(p)}
            </button>
          ))}
        </div>
        <p className="text-xs text-sub">{tPace(`${draft.tripPace ?? "balanced"}Desc`)}</p>
      </div>
    </section>
  );
}
