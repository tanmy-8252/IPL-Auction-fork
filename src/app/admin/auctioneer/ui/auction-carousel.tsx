"use client";

import React, { useEffect, useState, useRef } from "react";

type RarityType = "common" | "epic" | "legendary";

const PLAYERS = [
  {
    id: 1,
    name: "KL Rahul",
    role: "Wicketkeeper Batter",
    biddingPrice: 40,
    image: "/klrahul.png",
    imageScale: 1,
    stats: { Matches: 118, Runs: 4163, "Strike Rate": 134.4, Average: 46.8, "Base Price (Cr)": 2 },
    rarity: "common" as RarityType,
  },
  {
    id: 2,
    name: "Jasprit Bumrah",
    role: "Fast Bowler",
    basePrice: "₹ 2.0 Cr",
    biddingPrice: 85,
    image: "/jasprit.png",
    imageScale: 1.0,
    stats: { Matches: 120, Wickets: 145, Economy: 6.8, Average: 24.5, "Base Price (Cr)": 2 },
    rarity: "epic" as RarityType,
  },
  {
    id: 3,
    name: "Virat Kohli",
    role: "Top Order Batter",
    basePrice: "₹ 2.0 Cr",
    biddingPrice: 95,
    image: "/virat-kohli-30.png",
    imageScale: 1,
    stats: { Matches: 237, Runs: 7263, "Strike Rate": 130.0, Average: 37.2, "Base Price (Cr)": 2 },
    rarity: "legendary" as RarityType,
  },
];

const TEAMS = [
  { name: "CSK", currentBid: 88 },
  { name: "MI", currentBid: 76 },
  { name: "RCB", currentBid: 82 },
  { name: "KKR", currentBid: 69 },
  { name: "SRH", currentBid: 54 },
  { name: "PBKS", currentBid: 47 },
  { name: "RR", currentBid: 63 },
  { name: "DC", currentBid: 58 },
  { name: "LSG", currentBid: 52 },
  { name: "GT", currentBid: 38 },
] as const;

const THEME = {
  common: {
    name: "text-cyan-100",
    role: "text-cyan-400/90",
    header: "text-cyan-300",
    label: "text-cyan-400",
    value: "text-cyan-100",
    price: "text-cyan-100",
    accent: "text-cyan-400",
    next: "text-cyan-300 hover:text-cyan-100",
    badge: { label: "Common", cls: "border-cyan-500/50 bg-cyan-500/20 text-cyan-200" },
    bgGlow: "radial-gradient(ellipse at 50% 60%, rgba(0,229,255,0.20) 0%, transparent 65%)",
  },
  epic: {
    name: "text-purple-100",
    role: "text-purple-400/90",
    header: "text-purple-300",
    label: "text-purple-400",
    value: "text-purple-200",
    price: "text-purple-100",
    accent: "text-purple-400",
    next: "text-purple-300 hover:text-purple-100",
    badge: { label: "Epic Tier", cls: "border-purple-500/50 bg-purple-500/20 text-purple-200" },
    bgGlow: "radial-gradient(ellipse at 50% 60%, rgba(168,85,247,0.12) 0%, transparent 65%)",
  },
  legendary: {
    name: "text-amber-100",
    role: "text-amber-400/90",
    header: "text-amber-300",
    label: "text-amber-400",
    value: "text-amber-400",
    price: "text-amber-300",
    accent: "text-amber-400",
    next: "text-amber-300 hover:text-amber-100",
    badge: { label: "★ Legendary ★", cls: "border-amber-500/50 bg-amber-500/20 text-amber-200 animate-pulse" },
    bgGlow: "radial-gradient(ellipse at 50% 60%, rgba(251,191,36,0.10) 0%, transparent 65%)",
  },
};

/** Animate a number from its previous value to the new target */
function useAnimatedNumber(target: number) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (from === target) return;

    let frame = 0;
    const totalFrames = 30;
    const timer = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(Math.round((from + (target - from) * eased) * 10) / 10);
      if (frame >= totalFrames) { setDisplay(target); clearInterval(timer); }
    }, 600 / totalFrames);
    return () => clearInterval(timer);
  }, [target]);

  return display;
}

/** Slot-machine roll: old value slides up out, new value rolls in from below */
function RollingText({ value, className }: { value: string | number; className?: string }) {
  const [displayed, setDisplayed] = useState(value);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current === value) return;
    // slide old text up
    setPhase("out");
    const t1 = setTimeout(() => {
      setDisplayed(value);
      setPhase("in");
    }, 200);
    const t2 = setTimeout(() => {
      prevRef.current = value;
      setPhase("idle");
    }, 450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [value]);

  const style: React.CSSProperties = {
    display: "inline-block",
    transition: "opacity 0.2s ease, transform 0.2s ease",
    opacity: phase === "out" ? 0 : 1,
    transform:
      phase === "out" ? "translateY(-12px)" :
        phase === "in" ? "translateY(0px)" :
          "translateY(0px)",
  };
  // on "in" phase, start from below
  if (phase === "in") {
    style.transform = "translateY(0px)";
    style.transition = "opacity 0.25s ease 0.05s, transform 0.25s ease 0.05s";
  }

  return <span className={className} style={style}>{displayed}</span>;
}

function StatRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass: string;
}) {
  const animated = useAnimatedNumber(value);
  // Format to match target's decimal places so all numbers stay same visual size
  const decimals = Number.isInteger(value) ? 0 : 1;
  const formatted = animated.toFixed(decimals);
  return (
    <li className="flex justify-between items-center py-1 border-b border-white/10">
      <span className="text-2xl text-white font-bold tracking-wide">{label}</span>
      <span className={`font-bold text-4xl tabular-nums lining-nums min-w-[7rem] text-right ${valueClass}`}>{formatted}</span>
    </li>
  );
}

/** Smooth crossfade between player images */
function CrossfadeImage({
  src,
  alt,
  scale,
  glowColor,
}: {
  src: string;
  alt: string;
  scale: number;
  glowColor: string;
}) {
  // slot A is always visible; when src changes we load slot B then swap
  const [slotA, setSlotA] = useState({ src, scale, glowColor });
  const [slotB, setSlotB] = useState<typeof slotA | null>(null);
  const [showB, setShowB] = useState(false);

  // Synchronize glow/scale without a crossfade if the user toggles rarity directly
  useEffect(() => {
    setSlotA(prev => (prev.glowColor === glowColor && prev.scale === scale) ? prev : { ...prev, glowColor, scale });
  }, [glowColor, scale]);

  useEffect(() => {
    if (src === slotA.src) return;
    const next = { src, scale, glowColor };
    setSlotB(next);
    // tiny delay so browser has time to paint slotB before fading
    const t1 = setTimeout(() => setShowB(true), 30);
    // once fade done, promote B to A and hide B
    const t2 = setTimeout(() => {
      setSlotA(next);
      setSlotB(null);
      setShowB(false);
    }, 750);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [src]);

  const imgStyle = (s: typeof slotA, opacity: number): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    objectPosition: "bottom center",
    transform: `scale(${s.scale})`,
    transformOrigin: "bottom center",
    filter: `drop-shadow(0 0 24px ${s.glowColor})`,
    opacity,
    transition: "opacity 0.7s ease",
  });

  return (
    <div className="relative w-full h-full">
      <img src={slotA.src} alt={alt} style={imgStyle(slotA, showB ? 0 : 1)} />
      {slotB && <img src={slotB.src} alt={alt} style={imgStyle(slotB, showB ? 1 : 0)} />}
    </div>
  );
}

export default function AuctionCarousel({
  onRarityChange,
}: {
  onRarityChange?: (rarity: RarityType) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rarityOverrides, setRarityOverrides] = useState<Record<number, RarityType>>({});

  const player = PLAYERS[index];
  const activeRarity = rarityOverrides[player.id] || player.rarity;
  const theme = THEME[activeRarity];

  const topTeams = [...TEAMS]
    .sort((a, b) => b.currentBid - a.currentBid)
    .slice(0, 4);

  // Notify parent whenever the active rarity changes
  useEffect(() => {
    onRarityChange?.(activeRarity);
  }, [activeRarity, onRarityChange]);

  const handleNext = () => setIndex((i) => (i + 1) % PLAYERS.length);

  return (
    <div className="absolute inset-0 z-10 flex min-h-screen items-center justify-center p-4">
      {/* 3-Way Rarity Switch - Top Right Corner */}
      <div className="absolute top-6 right-8 z-50 flex bg-slate-900/80 border border-slate-700/50 rounded-full p-1 backdrop-blur-md shadow-lg">
        {(['common', 'epic', 'legendary'] as RarityType[]).map(r => (
          <button
            key={r}
            onClick={() => setRarityOverrides(prev => ({ ...prev, [player.id]: r }))}
            className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all duration-300 ${activeRarity === r ? r === 'common' ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.6)]' : r === 'epic' ? 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.6)]' : 'bg-amber-500 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.6)]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            {r === 'common' ? 'COM' : r === 'epic' ? 'EPIC' : 'LEG'}
          </button>
        ))}
      </div>

      {/* Dynamic background hue overlay — transitions with rarity */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: theme.bgGlow,
          transition: "background 1.2s ease",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-col lg:flex-row gap-8 p-4">

        {/* Left part: Header text and Player Image card */}
        <div className="flex flex-col w-[360px] shrink-0 gap-6">
          <div className="pl-2">
            <div className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1 drop-shadow-sm">IPL AUCTION 2026</div>
            <div className="text-4xl font-black uppercase tracking-tight text-white drop-shadow-md">Live Auction Card</div>
          </div>

          {/* Player Image Card */}
          <div className={`bg-slate-900/40 border border-slate-700/50 shadow-2xl rounded-[2rem] p-6 flex flex-col items-center backdrop-blur-sm transition-all duration-700 hover:border-slate-500/50`}>
            <div className="w-56 h-56 rounded-full border border-slate-700/50 overflow-hidden relative mb-8 bg-slate-950/80 shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)] flex items-end justify-center">
              <CrossfadeImage
                src={player.image}
                alt={player.name}
                scale={player.imageScale ?? 1}
                glowColor={
                  activeRarity === "common" ? "rgba(0,229,255,0.4)"
                    : activeRarity === "epic" ? "rgba(168,85,247,0.45)"
                      : "rgba(251,191,36,0.5)"
                }
              />
            </div>

            {/* Base Price Pill */}
            <div className="w-full bg-slate-200 text-slate-900 rounded-xl py-4 flex items-center justify-center shadow-lg transform transition-transform hover:scale-[1.02]">
              <span className="text-3xl font-black tracking-tight">Rs {player.stats["Base Price (Cr)"] || "2.0"} Cr</span>
            </div>
          </div>
        </div>

        {/* ── Column 2: Stats ── */}
        <div className="flex flex-1 flex-col justify-start space-y-6 pt-4">
          <div>
            <div className={`text-center text-base font-bold uppercase tracking-[0.4em] mb-2 ${theme.header}`}>
              Player Stats
            </div>
            <hr className="border-0 h-px mt-0 opacity-30" style={{ background: activeRarity === "common" ? "rgba(0,229,255,1)" : activeRarity === "epic" ? "rgba(168,85,247,1)" : "rgba(251,191,36,1)" }} />
          </div>

          {/* Middle Row: Player Info */}
          <div className="bg-slate-900/40 border border-slate-700/50 shadow-xl rounded-2xl p-8 backdrop-blur-sm relative overflow-hidden flex flex-col justify-center min-h-[160px]">
            <div className="absolute top-6 right-8 flex flex-col items-end opacity-60">
              <span className="text-[10px] font-bold tracking-widest text-white uppercase mb-1">Tier</span>
              <span className={`text-sm font-black tracking-widest uppercase ${theme.name}`}>{activeRarity}</span>
            </div>
            <h1 className={`text-5xl font-black uppercase tracking-tighter sm:text-6xl ${theme.name}`}>
              <RollingText value={player.name} />
            </h1>
            <div className={`text-sm font-bold uppercase tracking-[0.2em] mt-3 opacity-90 ${theme.role}`}>
              <RollingText value={player.role} />
            </div>
          </div>

          {/* Bottom Row: Stats Grid */}
          <div className="bg-slate-900/40 border border-slate-700/50 shadow-xl rounded-2xl p-6 backdrop-blur-sm">
            <div className="grid grid-cols-4 gap-4">
              {Object.entries(player.stats).filter(([key]) => key !== "Base Price (Cr)").map(([key, value]) => (
                <div key={key} className="bg-slate-950/40 border border-slate-700/30 rounded-xl p-5 flex flex-col items-center justify-center transition-colors hover:bg-slate-800/50">
                  <span className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase mb-3 text-center">{key}</span>
                  <span className={`text-3xl font-black tabular-nums drop-shadow-md ${theme.value}`}>
                    {Number.isInteger(value) ? value : Number(value).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
