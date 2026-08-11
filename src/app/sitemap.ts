import { MetadataRoute } from "next";
import fs from "fs";
import path from "path";
import { fetchPublicSpotIds } from "@/lib/place-detail/place-source";

export const dynamic = "force-static";

const siteUrl = "https://gokoreamate.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const postsDir = path.join(process.cwd(), "src/content/posts");
  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".md"));

  const blogPosts = files.map((filename) => ({
    url: `${siteUrl}/blog/${filename.replace(/\.md$/, "")}/`,
    lastModified: new Date(),
  }));

  // V1-A: 장소 상세는 검색 유입의 주 경로인데 지금까지 sitemap 에 0건이었다.
  // /place/[id] 의 generateStaticParams 와 **같은 함수**를 써서 실제로 생성되는
  // 장소만 넣는다. 조회가 실패하면 양쪽 모두 0건이 되므로 불일치가 생기지 않는다.
  // M1-A 이후 place-source 에 is_published=true 조건이 들어가면 여기도 함께 좁혀진다.
  const spotIds = await fetchPublicSpotIds();
  const placePages = spotIds.map((id) => ({
    url: `${siteUrl}/place/${id}/`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    { url: `${siteUrl}/`,                       lastModified: new Date(), changeFrequency: "daily",   priority: 1.0 },
    // TASK-031: city SEO landing pages
    { url: `${siteUrl}/seoul/`,                 lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/jeju/`,                  lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/gyeongju/`,              lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/busan/`,                 lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    // 전주는 진입 화면만 있고 검증된 장소·실용 정보가 아직 없다. 색인은 하되
    // 콘텐츠가 갖춰진 도시들과 같은 우선순위로 올리지 않는다.
    { url: `${siteUrl}/jeonju/`,                lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    // TASK-042: explore city pages
    { url: `${siteUrl}/explore/busan/`,         lastModified: new Date(), changeFrequency: "weekly",  priority: 0.9 },
    { url: `${siteUrl}/explore/seoul/`,         lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${siteUrl}/explore/jeju/`,          lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${siteUrl}/explore/gyeongju/`,      lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${siteUrl}/explore/jeonju/`,        lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${siteUrl}/survival-guide/`,        lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/all-spots/`,             lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${siteUrl}/trending/`,              lastModified: new Date(), changeFrequency: "daily",   priority: 0.8 },
    { url: `${siteUrl}/blog/`,                  lastModified: new Date(), changeFrequency: "weekly",  priority: 0.7 },
    // 실제 콘텐츠가 있는 소개 페이지인데 지금까지 sitemap 에서 빠져 있었다.
    { url: `${siteUrl}/about/`,                 lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    ...blogPosts,
    ...placePages,
  ];
}
