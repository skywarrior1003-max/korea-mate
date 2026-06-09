import { MetadataRoute } from "next";
import fs from "fs";
import path from "path";

export const dynamic = "force-static";

const siteUrl = "https://gokoreamate.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const postsDir = path.join(process.cwd(), "src/content/posts");
  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".md"));

  const blogPosts = files.map((filename) => ({
    url: `${siteUrl}/blog/${filename.replace(/\.md$/, "")}`,
    lastModified: new Date(),
  }));

  return [
    { url: siteUrl,                          lastModified: new Date(), changeFrequency: "daily",   priority: 1.0 },
    { url: `${siteUrl}/explore-busan`,       lastModified: new Date(), changeFrequency: "weekly",  priority: 0.9 },
    { url: `${siteUrl}/survival-guide`,      lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/all-spots`,           lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${siteUrl}/trending`,            lastModified: new Date(), changeFrequency: "daily",   priority: 0.8 },
    { url: `${siteUrl}/planner`,             lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/itinerary`,           lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/blog`,                lastModified: new Date(), changeFrequency: "weekly",  priority: 0.7 },
    ...blogPosts,
  ];
}
