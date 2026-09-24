"use client";

// 본인 Story 의 user_spot 문맥형 제안 진입점 (RANKING-UX-HOTFIX §5-2)
//
// 조건:
//   · Story 소유자 화면에서만 마운트된다(호출부가 isOwner && isPublic 게이트)
//   · Story 의 원 여행 일정(days)에 실제 포함된 user_spot 만 나열한다
//   · canonical city_spot 은 제안 대상이 아니다(user_spot: 접두 id 만 수집)
//   · 자격 판정·prefill 은 MyPlaceSuggestAction 공통 몸통(§5-1 조건 동일)
//   · 개인 메모·사진·Story 본문은 자동 제출되지 않는다 — sheet 의 텍스트
//     필드(이름·카테고리·주소·이유·링크)를 사용자가 보고 명시적으로 보낸다
//   · 자격 있는 장소가 없으면 아무것도 그리지 않는다(빈 섹션 금지)

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiGetUserSpots, userSpotDisplayName, type UserSpot } from "@/lib/user-spots-api";
import MyPlaceSuggestAction from "./MyPlaceSuggestAction";
import { suggestEligibleCity, userSpotIdsFromDays } from "@/lib/community/suggest-entry-core";

interface Props {
  days: unknown;
  /** Story 의 도시 — user_spot 에 city 가 없을 때의 fallback */
  tripCity: string;
}

export default function StoryUserSpotSuggest({ days, tripCity }: Props) {
  const t = useTranslations("community");
  const [spots, setSpots] = useState<UserSpot[]>([]);

  const includedIds = userSpotIdsFromDays(days);
  const wanted = includedIds.join(",");

  useEffect(() => {
    if (!wanted) return; // 렌더 필터가 이전 값도 걸러낸다 — 효과 안 동기 setState 금지
    let alive = true;
    apiGetUserSpots()
      .then(all => { if (alive) setSpots(all); })
      .catch(() => { /* 조용히 미표시 — Story 화면을 막지 않는다 */ });
    return () => { alive = false; };
  }, [wanted]);

  const includedSet = new Set(includedIds);
  const eligible = spots.filter(s => includedSet.has(s.id)).filter(s => suggestEligibleCity({
    name: userSpotDisplayName(s, ""),
    city: s.city ?? null,
    address: s.address ?? null,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    category: s.category ?? null,
    relatedCitySpotId: s.related_city_spot_id ?? null,
  }, tripCity) !== null);

  if (eligible.length === 0) return null;

  return (
    <div className="max-w-xl mx-auto px-4 mt-3">
      <p className="text-[11px] font-black tracking-[.12em] uppercase text-sub">{t("storySpotsSuggestTitle")}</p>
      <ul className="mt-1">
        {eligible.map(s => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-line/60">
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
              {userSpotDisplayName(s, "")}
            </span>
            <MyPlaceSuggestAction
              spot={{
                name: userSpotDisplayName(s, ""),
                city: s.city ?? null,
                address: s.address ?? null,
                lat: s.lat ?? null,
                lng: s.lng ?? null,
                category: s.category ?? null,
                relatedCitySpotId: s.related_city_spot_id ?? null,
              }}
              fallbackCity={tripCity}
              ctaKey="storySpotSuggestCta"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
