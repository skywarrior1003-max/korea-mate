"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import ContactModal from "@/components/ContactModal";

export default function ContactSection() {
  const t = useTranslations("about");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: "#FF4A2D" }}
      >
        ✉️ {t("contactCta")}
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
