"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { GalleryEntry } from "@/lib/content-types";

interface DetailOverlayProps {
  entry: GalleryEntry;
  onClose: () => void;
}

function ImageGallery({ images, title }: { images: string[]; title: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  if (images.length <= 1) {
    return (
      <div className="w-full h-full relative">
        <Image
          src={images[0]}
          alt={title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
      </div>
    );
  }

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIdx(idx);
  };

  return (
    <div className="w-full h-full relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {images.map((src, i) => (
          <div key={i} className="w-full h-full flex-shrink-0 snap-center relative">
            <Image
              src={src}
              alt={`${title} ${i + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority={i === 0}
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-opacity duration-300 ${
                i === activeIdx ? "bg-white opacity-90" : "bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DetailOverlay({ entry, onClose }: DetailOverlayProps) {
  const paragraphs = entry.body.split("\n\n");
  const allImages = entry.images.length > 0 ? entry.images : [entry.image];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex bg-bg overflow-y-auto"
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="min-h-screen w-full flex flex-col md:flex-row">
        <div className="w-full md:w-1/2 h-[45vh] sm:h-[50vh] md:h-screen relative md:sticky md:top-0">
          <ImageGallery images={allImages} title={entry.title} />
        </div>

        <div className="w-full md:w-1/2 min-h-[55vh] md:min-h-screen flex flex-col justify-center px-6 sm:px-8 md:px-20 py-12 md:py-20 bg-bg">
          <div className="max-w-xl">
            <motion.p
              className="text-[10px] md:text-[11px] tracking-[0.2em] uppercase text-muted mb-6 md:mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              {entry.channel === "archive" && entry.archiveType
                ? `${entry.archiveType} — ${entry.date.replace(/-/g, ".")}`
                : entry.date.replace(/-/g, ".")}
            </motion.p>

            <motion.h1
              className="text-2xl sm:text-3xl md:text-4xl font-normal tracking-wide mb-8 md:mb-12 text-fg"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              {entry.title}
            </motion.h1>

            <div className="space-y-6 md:space-y-8 text-[13px] md:text-[15px] leading-[2] md:leading-[2.2] text-fg/70 font-light tracking-wide">
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
        aria-label="Close"
        className="fixed top-[max(0.75rem,env(safe-area-inset-top,0.75rem))] right-4 md:top-8 md:right-8 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-overlay-close-bg text-overlay-close-fg hover:scale-105 active:scale-95 transition-transform z-50"
      >
        <svg
          className="w-3.5 h-3.5 md:w-4 md:h-4"
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
