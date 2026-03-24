"use client";

import { useState, Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ScrollControls } from "@react-three/drei";
import { AnimatePresence } from "framer-motion";
import DetailOverlay from "@/components/DetailOverlay";
import { SceneContent } from "@/components/ThreeScene";
import type { GalleryEntry } from "@/lib/content-types";
import { motion } from "framer-motion";

interface HomeClientProps {
  entries: GalleryEntry[];
}

export default function HomeClient({ entries }: HomeClientProps) {
  const [selected, setSelected] = useState<GalleryEntry | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "life" | "archive">("all");
  const [showLoader, setShowLoader] = useState(false);

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
    <main className="fixed inset-0 w-full h-full bg-[#f4f4f0] overflow-hidden font-sans">
      <div className="absolute top-0 left-0 w-full p-8 z-10 pointer-events-none flex justify-between items-start mix-blend-difference text-white">
        <h1 className="text-xl font-medium tracking-widest uppercase">
          JOY&apos;S GALLERY
        </h1>
        <p className="text-xs tracking-widest uppercase opacity-60">
          Scroll to explore
        </p>
      </div>

      {/* 顶部极简导航栏 */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 pointer-events-auto mix-blend-difference text-white">
        <nav className="flex items-center gap-12 text-[11px] tracking-[0.2em] uppercase font-medium">
          <button 
            onClick={() => setActiveFilter("all")}
            className={`transition-opacity duration-300 hover:opacity-100 relative ${activeFilter === "all" ? "opacity-100" : "opacity-40"}`}
          >
            Home
            {activeFilter === "all" && (
              <motion.div layoutId="nav-indicator" className="absolute -bottom-2 left-0 right-0 h-[1px] bg-white" />
            )}
          </button>
          <button 
            onClick={() => setActiveFilter("life")}
            className={`transition-opacity duration-300 hover:opacity-100 relative ${activeFilter === "life" ? "opacity-100" : "opacity-40"}`}
          >
            Life
            {activeFilter === "life" && (
              <motion.div layoutId="nav-indicator" className="absolute -bottom-2 left-0 right-0 h-[1px] bg-white" />
            )}
          </button>
          <button 
            onClick={() => setActiveFilter("archive")}
            className={`transition-opacity duration-300 hover:opacity-100 relative ${activeFilter === "archive" ? "opacity-100" : "opacity-40"}`}
          >
            Archive
            {activeFilter === "archive" && (
              <motion.div layoutId="nav-indicator" className="absolute -bottom-2 left-0 right-0 h-[1px] bg-white" />
            )}
          </button>
        </nav>
      </div>

      {entries.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center px-8">
          <div className="max-w-xl text-center text-[#111]">
            <h2 className="text-2xl tracking-wide uppercase mb-4">No Entries Yet</h2>
            <p className="text-sm leading-7 text-black/65">
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
      ) : (
        <div className="absolute inset-0 z-0">
          <Canvas
            orthographic
            camera={{
              zoom: 100,
              position: [0, 0, 10],
            }}
            gl={{
              antialias: true,
              alpha: false,
            }}
            style={{ pointerEvents: "auto" }}
          >
            <color attach="background" args={["#f4f4f0"]} />

            <Suspense fallback={null}>
              <ScrollControls
                pages={Math.max(filteredEntries.length * 0.4, 1)}
                damping={0.1}
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
        <div
          className="absolute inset-0 bg-[#f4f4f0] z-50 flex items-center justify-center transition-opacity duration-500 pointer-events-none"
        >
          <p className="text-xs tracking-widest uppercase animate-pulse text-[#111]">
            Loading Gallery...
          </p>
        </div>
      )}
    </main>
  );
}
