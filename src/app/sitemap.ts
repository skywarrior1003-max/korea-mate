import { MetadataRoute } from "next";
import fs from "fs";
import path from "path";

export const dynamic = "force-static";

const siteUrl = "https://korea-mate.pages.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const postsDir = path.join(process.cwd(), "src/content/posts");
  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".md"));

  const blogPosts = files.map((filename) => ({
    url: `${siteUrl}/blog/${filename.replace(/\.md$/, "")}`,
    lastModified: new Date(),
  }));

  return [
    { url: siteUrl, lastModified: new Date() },
    { url: `${siteUrl}/blog`, lastModified: new Date() },
    ...blogPosts,
  ];
}
