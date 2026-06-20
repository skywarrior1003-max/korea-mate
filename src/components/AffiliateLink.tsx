"use client";

import { trackEvent } from "@/lib/analytics";

interface AffiliateLinkProps {
  href: string;
  provider: string;
  title: string;
  city: string;
  children: React.ReactNode;
  className?: string;
}

export default function AffiliateLink({
  href,
  provider,
  title,
  city,
  children,
  className,
}: AffiliateLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={className}
      onClick={() => trackEvent("affiliate_click", { provider, title, city })}
    >
      {children}
    </a>
  );
}
