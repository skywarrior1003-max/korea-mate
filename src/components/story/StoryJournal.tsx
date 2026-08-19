"use client";

// Travel Journal — Public Story 의 본체.
//
// 최종 screen.png 구조 그대로다. 왼쪽에 세로선이 지나가고 각 DAY 앞에 작은
// 주황 점이 찍힌다. DAY 아래 날짜, 그 아래로 Memory 가 쌓인다.
//
// Memory 하나는 [사진들] → [인용문 + Save] 다. 장소 이름은 별도 줄이 아니라
// **첫 사진 위 왼쪽 아래 유리 칩**에 얹힌다 — 시안이 그렇다.
//
// 사진 배치
//   1장   큰 사진 하나
//   2장   큰 사진 + 아래 한 장(반폭 두 칸 중 하나가 비면 어색하므로 나란히 둘)
//   3장   큰 사진 + 아래 반폭 두 장  ← 시안의 기본형
//   4장+  큰 사진 + 아래 반폭 두 장, 두 번째 칸에 +N
// 새 갤러리를 창작하지 않고 시안의 언어(큰 사진 + 보조 두 장) 안에서 처리한다.

import type { StoryDay, StoryMemory, StoryPhoto } from "./story-types";
import {
  MARGIN_MOBILE, STACK_LG, STACK_MD, GUTTER,
  HEADLINE_LG, HEADLINE_LG_MOBILE, BODY_SM, TITLE_MD,
  ON_SURFACE, ON_SURFACE_VARIANT, SURFACE_VARIANT, PRIMARY,
  RADIUS_PHOTO, AMBIENT_SHADOW, GLASS_OVERLAY,
} from "./story-tokens";

interface Props {
  id?: string;
  days: StoryDay[];
  /** 사진을 누르면 Focus 로 간다. 없으면 사진은 누를 수 없다. */
  onOpenPhoto?: (memory: StoryMemory, index: number) => void;
  /**
   * Save. **연결되지 않았으면 넘기지 않는다** — 눌러도 아무 일도 없는 버튼을
   * 공개 화면에 두지 않기 위해서다. 기능이 붙는 후속 작업에서 넘긴다.
   */
  onSave?: (memory: StoryMemory) => void;
  savedIds?: ReadonlySet<string>;
}

function PlaceChip({ name }: { name: string }) {
  return (
    <div
      className="absolute bottom-4 left-4 px-4 py-2 rounded-full flex items-center gap-2"
      style={GLASS_OVERLAY}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="currentColor" className="text-white">
        <path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
      </svg>
      <span className="text-white font-medium" style={BODY_SM}>{name}</span>
    </div>
  );
}

function Photo({
  photo, alt, className, style, onClick, chip, overlayCount,
}: {
  photo: StoryPhoto; alt: string; className?: string;
  style?: React.CSSProperties; onClick?: () => void;
  chip?: string; overlayCount?: number;
}) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.alt ?? alt} className="w-full h-full object-cover" />
      {chip && <PlaceChip name={chip} />}
      {overlayCount != null && overlayCount > 0 && (
        <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
          <span className="text-white" style={{ ...TITLE_MD, fontSize: "20px" }}>+{overlayCount}</span>
        </div>
      )}
    </>
  );
  const box = `relative overflow-hidden ${className ?? ""}`;
  const css = { borderRadius: RADIUS_PHOTO, boxShadow: AMBIENT_SHADOW, ...style };
  return onClick
    ? <button type="button" onClick={onClick} className={`${box} gkm-focus block w-full`} style={css}>{inner}</button>
    : <div className={box} style={css}>{inner}</div>;
}

function MemoryBlock({ memory, onOpenPhoto, onSave, saved }: {
  memory: StoryMemory;
  onOpenPhoto?: (m: StoryMemory, i: number) => void;
  onSave?: (m: StoryMemory) => void;
  saved?: boolean;
}) {
  const photos = memory.photos;
  const hasMemo = memory.memo.trim() !== "";
  const alt    = memory.placeName ?? (hasMemo ? memory.memo.slice(0, 40) : "");
  const open   = (i: number) => onOpenPhoto ? () => onOpenPhoto(memory, i) : undefined;

  // 두 번째 줄에 놓을 보조 사진 두 칸. 넘치는 만큼은 +N 으로 접는다.
  const secondary = photos.slice(1, 3);
  const hidden    = Math.max(0, photos.length - 3);

  return (
    <div style={{ marginBottom: STACK_LG }}>
      {photos.length > 0 && (
        <Photo
          photo={photos[0]!} alt={alt} onClick={open(0)} chip={memory.placeName}
          className={photos.length === 1 ? "w-full aspect-[4/5]" : "w-full aspect-[4/5]"}
          style={{ marginBottom: GUTTER }}
        />
      )}

      {secondary.length > 0 && (
        <div className="flex" style={{ gap: GUTTER, marginBottom: GUTTER }}>
          {secondary.map((p, i) => (
            <Photo
              key={p.url} photo={p} alt={alt} onClick={open(i + 1)}
              className="w-1/2 aspect-square"
              overlayCount={i === secondary.length - 1 ? hidden : 0}
            />
          ))}
        </div>
      )}

      {/* 적은 글이 없으면 이 줄 자체를 그리지 않는다.
          예전에는 빈 인용부호(“”)만 남아, 사진만 올린 Memory 마다 아무것도
          들어 있지 않은 따옴표 한 쌍이 떠 있었다. 없는 것은 없는 대로 둔다.
          Save 가 붙는 날에는 글이 없어도 그 버튼 때문에 줄이 필요하다. */}
      {(hasMemo || onSave) && (
      <div className="flex justify-between items-start" style={{ marginTop: 24, paddingLeft: 16, paddingRight: 16 }}>
        {/* 사용자가 적은 문구 그대로. 다듬거나 만들어 내지 않는다. */}
        {/* 줄간격은 1.625 다 — 시안이 leading-relaxed 를 얹어 26px×1.625 = 42.25px 로
            렌더한다. 토큰의 1.3 을 그대로 두면 33.8px 이 되어 시안보다 촘촘해진다. */}
        {hasMemo ? (
        <p className="italic flex-1 pr-4"
           style={{ ...HEADLINE_LG_MOBILE, lineHeight: 1.625, color: ON_SURFACE }}>
          {`“${memory.memo}”`}
        </p>
        ) : <span className="flex-1" />}
        {onSave && (
          <button
            type="button"
            onClick={() => onSave(memory)}
            aria-pressed={saved === true}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full transition-colors gkm-focus"
            style={{ ...TITLE_MD, color: ON_SURFACE_VARIANT, border: `1px solid ${SURFACE_VARIANT}` }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden
                 fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"
                 style={{ color: PRIMARY }}>
              <path d="M12 21s-7-4.35-9.33-8.5A5.5 5.5 0 0112 5.5a5.5 5.5 0 019.33 7c-2.33 4.15-9.33 8.5-9.33 8.5z" />
            </svg>
            Save
          </button>
        )}
      </div>
      )}
    </div>
  );
}

export default function StoryJournal({ id, days, onOpenPhoto, onSave, savedIds }: Props) {
  return (
    <section
      id={id}
      className="max-w-4xl mx-auto"
      style={{ paddingLeft: MARGIN_MOBILE, paddingRight: MARGIN_MOBILE, paddingTop: 80, paddingBottom: 80 }}
    >
      {days.map(day => (
        <div
          key={day.dayNumber}
          className="relative pl-6"
          style={{ marginBottom: STACK_LG, borderLeft: `2px solid ${SURFACE_VARIANT}` }}
        >
          <div
            className="absolute top-2 w-2 h-2 rounded-full"
            style={{ left: -5, backgroundColor: PRIMARY }}
          />
          <h2 className="mb-1" style={{ ...HEADLINE_LG, color: ON_SURFACE }}>
            DAY {day.dayNumber}
          </h2>
          <p
            className="uppercase"
            style={{ ...BODY_SM, color: ON_SURFACE_VARIANT, letterSpacing: "0.05em", marginBottom: STACK_MD }}
          >
            {day.dateLabel}
          </p>

          {day.memories.map(m => (
            <MemoryBlock
              key={m.id} memory={m}
              onOpenPhoto={onOpenPhoto} onSave={onSave}
              saved={savedIds?.has(m.id)}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
