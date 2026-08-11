// 에디토리얼 헤더의 데스크톱 nav (Blog · Survival Guide · About).
//
// 왜 별도 컴포넌트인가
//   /blog 와 /blog/[slug] 는 서버 컴포넌트다(fs 로 글을 읽고 metadata 를
//   내보낸다). 이 앱의 locale 은 브라우저에서 정해지므로 서버 컴포넌트는
//   번역을 읽을 수 없다. 그래서 문구가 필요한 이 조각만 클라이언트로 뺀다 —
//   같은 파일들이 LanguageSwitcher 를 이미 그렇게 쓰고 있다.
//
// 무엇이 아닌가
//   헤더 전체를 공용화하는 리팩터링이 아니다. 브랜드·레이아웃·간격은 각
//   페이지가 그대로 갖고 있고, 여기로 옮긴 것은 링크 3개뿐이다.
//   좁은 화면에서 숨기는 규칙(hidden sm:flex)도 원래 자리 그대로다 —
//   그 폭에서는 하단 More 탭(/more)이 같은 곳으로 데려간다.

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

const LINKS = [
  { href: "/blog",           key: "blog"           },
  { href: "/survival-guide", key: "survivalGuide"  },
  { href: "/about",          key: "about"          },
] as const;

export type EditorialNavKey = typeof LINKS[number]["key"];

export default function EditorialNav({ active }: { active?: EditorialNavKey }) {
  const t = useTranslations("nav");
  return (
    <nav className="hidden sm:flex items-center gap-8">
      {LINKS.map(l => (
        <Link
          key={l.key}
          href={l.href}
          aria-current={active === l.key ? "page" : undefined}
          className={`text-base font-bold transition-colors ${
            active === l.key ? "text-[#D4AF37]" : "hover:text-[#D4AF37]"
          }`}
        >
          {t(l.key)}
        </Link>
      ))}
    </nav>
  );
}
