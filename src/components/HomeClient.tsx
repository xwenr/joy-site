"use client";

import { useState, Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ScrollControls } from "@react-three/drei";
import { AnimatePresence } from "framer-motion";
import DetailOverlay from "@/components/DetailOverlay";
import { SceneContent } from "@/components/ThreeScene";
import type { GalleryEntry } from "@/lib/content-types";
import { motion } from "framer-motion";

function useThemeColor(cssVar: string, fallback: string) {
  const [color, setColor] = useState(fallback);
  useEffect(() => {
    const update = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
      if (v) setColor(v);
    };
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [cssVar]);
  return color;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

interface HomeClientProps {
  entries: GalleryEntry[];
}

export default function HomeClient({ entries }: HomeClientProps) {
  const [selected, setSelected] = useState<GalleryEntry | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "life" | "archive">("all");
  const [showLoader, setShowLoader] = useState(false);
  const isMobile = useIsMobile();

  const bgColor = useThemeColor("--color-bg-canvas", "#f4f4f0");

  useEffect(() => {
    if (entries.length === 0) {
      setShowLoader(false);
      return;
    }

    setShowLoader(true);
    const timer = window.setTimeout(() => {
      setShowLoader(false);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [entries.length]);

  const filteredEntries = useMemo(() => {
    if (activeFilter === "all") return entries;
    return entries.filter(entry => entry.channel === activeFilter);
  }, [entries, activeFilter]);

  return (
    <main className="fixed inset-0 w-full h-full bg-bg overflow-hidden font-sans">
      <div className="absolute top-0 left-0 w-full px-5 pt-3 md:p-8 z-10 pointer-events-none flex justify-between items-center mix-blend-difference text-white md:items-start">
        <h1 className="text-[12px] md:text-xl font-medium tracking-[0.2em] uppercase">
          JOY&apos;S GALLERY
        </h1>
        <p className="text-[10px] md:text-xs tracking-widest uppercase opacity-60 hidden md:block">
          Scroll to explore
        </p>
      </div>

      <div className="absolute top-8 md:top-8 left-5 md:left-1/2 md:-translate-x-1/2 z-20 pointer-events-auto mix-blend-difference text-white">
        <nav className="flex items-center gap-5 md:gap-12 text-[10px] md:text-[11px] tracking-[0.15em] md:tracking-[0.2em] uppercase font-medium">
          {(["all", "life", "archive"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`transition-opacity duration-300 hover:opacity-100 relative py-2 ${activeFilter === filter ? "opacity-100" : "opacity-40"}`}
            >
              {filter === "all" ? "Home" : filter === "life" ? "Life" : "Archive"}
              {activeFilter === filter && (
                <motion.div layoutId="nav-indicator" className="absolute -bottom-0.5 left-0 right-0 h-[1px] bg-white" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {entries.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center px-6 md:px-8">
          <div className="max-w-xl text-center text-fg">
            <h2 className="text-xl md:text-2xl tracking-wide uppercase mb-4">No Entries Yet</h2>
            <p className="text-sm leading-7 text-fg/60">
              现在内容目录还是空的。你之后只需要把图片放进
              <code className="mx-1">public/images/...</code>
              ，再把 JSON 内容文件放进
              <code className="mx-1">content/life</code>
              或
              <code className="mx-1">content/archive</code>
              即可。模板已经放在
              <code className="mx-1">content/templates</code>
              里。
            </p>
          </div>
        </div>
      ) : isMobile === null ? null : (
        <div className="absolute inset-0 z-0">
          <Canvas
            orthographic
            camera={{
              zoom: 100,
              position: [0, 0, 10],
            }}
            gl={{
              antialias: !isMobile,
              alpha: false,
              powerPreference: isMobile ? "high-performance" : "default",
            }}
            style={{ pointerEvents: "auto" }}
          >
            <color attach="background" args={[bgColor]} />

            <Suspense fallback={null}>
              <ScrollControls
                pages={Math.max(filteredEntries.length * 0.4, 1)}
                damping={0.12}
                distance={1}
              >
                <SceneContent entries={filteredEntries} onSelect={setSelected} />
              </ScrollControls>
            </Suspense>
          </Canvas>
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <DetailOverlay entry={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>

      {showLoader && (
        <div className="absolute inset-0 bg-bg z-50 flex items-center justify-center transition-opacity duration-500 pointer-events-none">
          <p className="text-xs tracking-widest uppercase animate-pulse text-fg">
            Loading Gallery...
          </p>
        </div>
      )}
    </main>
  );
}
