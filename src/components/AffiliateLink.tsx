"use client";

import { trackEvent } from "@/lib/analytics";
import type { LinkKind } from "@/config/affiliate-registry";
import { affiliateLive, AFFILIATE_PREVIEW_HREF } from "@/lib/env/app-env-client";

interface AffiliateLinkProps {
  href: string;
  provider: string;
  title: string;
  city: string;
  /**
   * 이 링크가 실제 수익 제휴인지(affiliate) 제휴 없는 외부 서비스인지
   * (external). 선택 prop 으로 두면 새 호출부가 조용히 제휴로 통과하고,
   * 제휴가 없는데 "Sponsored" 라고 표시하게 된다 — 방향이 반대인 허위
   * 고지다. 그래서 필수다. KoreaReadySection 의 surface prop 과 같은 이유다.
   */
  kind: LinkKind;
  children: React.ReactNode;
  className?: string;
  /**
   * PHASE 10 최소 추적 문맥(선택 — 기존 호출부 불변). 개인정보·좌표·메모는
   * 어떤 경우에도 싣지 않는다. surface 는 commerce-surfaces 식별자 문자열.
   */
  surface?: string;
  purpose?: string;
  locale?: string;
}

export default function AffiliateLink({
  href,
  provider,
  title,
  city,
  kind,
  children,
  className,
  surface,
  purpose,
  locale,
}: AffiliateLinkProps) {
  const isAffiliate = kind === "affiliate";
  // V2-ENV-ISOLATION §11-2 — 비-production 빌드에서는 실제 외부 이동과
  // affiliate_click 전송을 모두 막는다. UI·문구·locale 은 그대로 두어
  // Production 장애처럼 보이지 않게 하고, title 로 테스트 환경임을 알린다.
  // 실제 파트너 URL·파라미터 SSOT(partner-links)는 변경하지 않는다.
  const live = affiliateLive();
  return (
    <a
      href={live ? href : AFFILIATE_PREVIEW_HREF}
      target={live ? "_blank" : undefined}
      // sponsored 는 수익 관계가 있을 때만 붙인다.
      rel={isAffiliate ? "noopener noreferrer sponsored" : "noopener noreferrer"}
      className={className}
      aria-disabled={live ? undefined : true}
      title={live ? undefined : "Preview environment: partner links are disabled"}
      onClick={live && isAffiliate
        ? () => trackEvent("affiliate_click", {
            provider, title, city,
            ...(surface ? { surface } : {}),
            ...(purpose ? { purpose } : {}),
            ...(locale ? { locale } : {}),
          })
        : (live ? undefined : (e) => e.preventDefault())}
    >
      {children}
    </a>
  );
}
