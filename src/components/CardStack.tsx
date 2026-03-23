"use client";

import { useState } from "react";
import {
  motion,
  AnimatePresence,
  type PanInfo,
} from "framer-motion";
import Image from "next/image";
import { entries, type CardEntry } from "@/lib/data";

const colorMap = {
  sunny: { bg: "bg-sunny", shadow: "shadow-sunny-deep/20", accent: "#FADA5E" },
  mint: { bg: "bg-mint", shadow: "shadow-mint-deep/20", accent: "#7ECDA0" },
  sky: { bg: "bg-sky", shadow: "shadow-sky-deep/20", accent: "#6BB5D6" },
  lavender: { bg: "bg-lavender", shadow: "shadow-lavender-deep/20", accent: "#B09CC5" },
};

function Doodle({ color }: { color: string }) {
  return (
    <svg
      className="absolute -top-6 -right-6 w-16 h-16 opacity-30"
      viewBox="0 0 100 100"
      fill="none"
    >
      <circle cx="50" cy="50" r="20" stroke={color} strokeWidth="3" strokeDasharray="6 4" />
      <circle cx="30" cy="30" r="8" stroke={color} strokeWidth="2" />
      <circle cx="72" cy="35" r="5" fill={color} opacity="0.4" />
      <path d="M20 70 Q40 55 60 72 T95 60" stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
}

function StarDoodle({ color }: { color: string }) {
  return (
    <svg
      className="absolute -bottom-4 -left-4 w-12 h-12 opacity-25"
      viewBox="0 0 80 80"
      fill="none"
    >
      <path
        d="M40 5 L45 30 L70 35 L48 45 L55 70 L40 52 L25 70 L32 45 L10 35 L35 30 Z"
        stroke={color}
        strokeWidth="2"
        fill={color}
        opacity="0.3"
      />
    </svg>
  );
}

interface CardProps {
  entry: CardEntry;
  isTop: boolean;
  stackIndex: number;
  onSwipe: () => void;
  onTap: (entry: CardEntry) => void;
}

function Card({ entry, isTop, stackIndex, onSwipe, onTap }: CardProps) {
  const [exitX, setExitX] = useState(0);
  const colors = colorMap[entry.color];
  const scale = 1 - stackIndex * 0.05;
  const y = stackIndex * 16;

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (Math.abs(info.offset.x) > 120 || Math.abs(info.velocity.x) > 500) {
      setExitX(info.offset.x > 0 ? 600 : -600);
      onSwipe();
    }
  }

  return (
    <motion.div
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      style={{
        zIndex: 10 - stackIndex,
      }}
      initial={isTop ? { scale: 0.9, opacity: 0, y: -40 } : false}
      animate={{
        scale,
        y,
        opacity: stackIndex > 2 ? 0 : 1,
        rotateZ: isTop ? entry.rotation : entry.rotation * 0.5,
      }}
      exit={{
        x: exitX,
        opacity: 0,
        rotateZ: exitX > 0 ? 15 : -15,
        transition: { duration: 0.4, ease: "easeOut" },
      }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 26,
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={isTop ? handleDragEnd : undefined}
      onClick={() => isTop && onTap(entry)}
      whileHover={isTop ? { scale: scale + 0.02, rotateZ: 0 } : {}}
    >
      <div
        className={`relative w-full h-full rounded-3xl overflow-hidden ${colors.bg} shadow-2xl`}
        style={{ boxShadow: `0 20px 60px -12px ${colors.accent}40` }}
      >
        <Doodle color={colors.accent} />
        <StarDoodle color={colors.accent} />

        <div className="w-full overflow-hidden" style={{ height: "55%" }}>
          <Image
            src={entry.image}
            alt={entry.title}
            width={880}
            height={660}
            className="w-full h-full object-cover"
            priority={stackIndex === 0}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-24"
            style={{
              background: `linear-gradient(to top, ${colors.accent}30, transparent)`,
            }}
          />
        </div>

        <div className="relative p-6 pt-5">
          <p className="font-mono text-xs tracking-widest opacity-50 mb-2">
            {entry.date}
          </p>
          <h2 className="font-hand text-3xl font-bold mb-1 text-ink">
            {entry.title}
          </h2>
          <p className="font-hand text-lg opacity-60 mb-3">{entry.subtitle}</p>
          <p className="text-sm leading-relaxed text-ink-light line-clamp-3">
            {entry.excerpt}
          </p>

          {isTop && (
            <motion.div
              className="mt-4 flex items-center gap-2 opacity-40"
              animate={{ x: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              <span className="text-xs tracking-wider">轻触阅读 · 左右滑动切换</span>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface CardStackProps {
  onCardTap: (entry: CardEntry) => void;
}

export default function CardStack({ onCardTap }: CardStackProps) {
  const [stack, setStack] = useState(entries);

  function handleSwipe() {
    setStack((prev) => {
      const [top, ...rest] = prev;
      return [...rest, top];
    });
  }

  return (
    <div className="relative w-[min(440px,85vw)] h-[min(580px,75vh)]">
      <AnimatePresence mode="popLayout">
        {stack.slice(0, 3).map((entry, i) => (
          <Card
            key={entry.id}
            entry={entry}
            isTop={i === 0}
            stackIndex={i}
            onSwipe={handleSwipe}
            onTap={onCardTap}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
