"use client";
export const dynamic = "force-static";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function RedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/explore/busan"); }, [router]);
  return null;
}
