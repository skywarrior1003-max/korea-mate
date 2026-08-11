"use client";

import { trackEvent } from "@/lib/analytics";
import type { LinkKind } from "@/config/affiliate-registry";

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
}

export default function AffiliateLink({
  href,
  provider,
  title,
  city,
  kind,
  children,
  className,
}: AffiliateLinkProps) {
  const isAffiliate = kind === "affiliate";
  return (
    <a
      href={href}
      target="_blank"
      // sponsored 는 수익 관계가 있을 때만 붙인다.
      rel={isAffiliate ? "noopener noreferrer sponsored" : "noopener noreferrer"}
      className={className}
      onClick={isAffiliate
        ? () => trackEvent("affiliate_click", { provider, title, city })
        : undefined}
    >
      {children}
    </a>
  );
}
