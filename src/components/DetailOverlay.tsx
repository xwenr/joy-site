"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import type { GalleryEntry } from "@/lib/content-types";

interface DetailOverlayProps {
  entry: GalleryEntry;
  onClose: () => void;
}

export default function DetailOverlay({ entry, onClose }: DetailOverlayProps) {
  const paragraphs = entry.body.split("\n\n");

  return (
    <motion.div
      className="fixed inset-0 z-50 flex bg-bg overflow-y-auto"
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="min-h-screen w-full flex flex-col md:flex-row">
        {/* Image Side */}
        <div className="w-full md:w-1/2 h-[50vh] md:h-screen relative sticky top-0">
          <Image
            src={entry.images[0] ?? entry.image}
            alt={entry.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        </div>

        {/* Content Side */}
        <div className="w-full md:w-1/2 min-h-screen flex flex-col justify-center px-8 md:px-20 py-20 bg-bg">
          <div className="max-w-xl">
            <motion.p
              className="text-xs tracking-widest uppercase text-muted mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              {entry.date}
            </motion.p>

            <motion.h1
              className="text-4xl md:text-5xl font-light tracking-tight mb-12 text-fg"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              {entry.title}
            </motion.h1>

            <div className="space-y-6 text-sm md:text-base leading-relaxed text-fg/80 font-light">
              {paragraphs.map((p, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.1, duration: 0.8 }}
                >
                  {p}
                </motion.p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onClose}
        className="fixed top-6 right-6 md:top-8 md:right-8 w-12 h-12 flex items-center justify-center rounded-full bg-fg text-bg hover:scale-105 transition-transform z-50"
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}
