"use client";

// 추천 장소 제안 진입점 (RANKING-UX-HOTFIX §5·§10-2)
//
// City Hub 의 제안 CTA 는 제거됐다 — 진입점은 두 곳뿐:
//   · Picks > My Places (기본 진입점, §5-1)
//   · 본인 Story 의 user_spot 문맥 (보조 진입점, §5-2)
// 이 컴포넌트가 둘의 공통 몸통이다. 자격이 안 되면 아무것도 그리지 않는다.
//
// 자격(§5-1):
//   · 장소명 존재
//   · canonical city 식별 가능(sp.city → fallbackCity 순)
//   · 주소 또는 유효 좌표 존재(좌표만 있으면 GPS 문자열로 — 제안은 관리자
//     검토 전용의 내부 전달이라 정확 좌표 허용, 공개 렌더 0)
//   · 이미 city_spots 에 연결된 장소(related_city_spot_id)가 아님
// 중복 pending 차단은 서버(place-suggestion 409)가 한다 — sheet 가 안내문을 띄운다.
// 개인 메모·사진·Story 본문은 여기서 전달하지 않는다(sheet 는 텍스트 필드만).

import { useState } from "react";
import { useTranslations } from "next-intl";
import SuggestPlaceSheet from "./SuggestPlaceSheet";
import { quietCity } from "@/components/quiet/quiet-data";
import { isValidCoordinate } from "@/lib/geo";
import { suggestEligibleCity, type SuggestableSpot } from "@/lib/community/suggest-entry-core";

export type { SuggestableSpot };
export { suggestEligibleCity };

interface Props {
  spot: SuggestableSpot;
  /** 장소에 city 가 없을 때 쓰는 문맥 도시(예: Story 의 도시) */
  fallbackCity?: string | null;
  /** 진입점별 문구 키(community ns) */
  ctaKey: "myPlaceSuggestCta" | "storySpotSuggestCta";
}

export default function MyPlaceSuggestAction({ spot, fallbackCity, ctaKey }: Props) {
  const t = useTranslations("community");
  const tForm = useTranslations("tripForm");
  const [open, setOpen] = useState(false);

  const citySlug = suggestEligibleCity(spot, fallbackCity);
  if (!citySlug) return null;
  const city = quietCity(citySlug);
  if (!city) return null;
  const cityLabel = tForm(city.labelKey);

  const address = (spot.address ?? "").trim() ||
    (isValidCoordinate(spot.lat, spot.lng) ? `GPS: ${(spot.lat as number).toFixed(6)}, ${(spot.lng as number).toFixed(6)}` : "");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="gkm-focus inline-flex items-center min-h-11 text-xs font-bold text-action px-2"
      >
        {t(ctaKey)} <span aria-hidden className="ml-1">→</span>
      </button>
      {open && (
        <SuggestPlaceSheet
          open={open}
          onClose={() => setOpen(false)}
          citySlug={citySlug}
          cityLabel={cityLabel}
          initial={{
            name: (spot.name ?? "").trim(),
            category: spot.category ?? undefined,
            address,
          }}
        />
      )}
    </>
  );
}
