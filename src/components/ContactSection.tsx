"use client";

import { useState } from "react";
import ContactModal from "@/components/ContactModal";

export default function ContactSection() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: "#f97316" }}
      >
        ✉️ Contact gokoreamate
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
