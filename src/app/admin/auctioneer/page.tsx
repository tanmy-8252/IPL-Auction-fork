"use client";

import { useState } from "react";
import AuctionCarousel from "./ui/auction-carousel";
import { Component as SilkBackgroundAnimation } from "./ui/silk-background-animation";
import Link from "next/link";

export default function AuctioneerPage() {
  const [rarity, setRarity] = useState<"common" | "epic" | "legendary">("common");
  const [showArena, setShowArena] = useState(false);

  if (!showArena) {
    return (
      <main className="landing-shell">
        <nav className="landing-nav">
          <div className="logo-text">IPL Auction Arena</div>
          <div className="topbar-right">
            <button className="rules-pill" type="button">Rules</button>
          </div>
        </nav>

        <section className="hero-panel">
          <h1>
            Welcome to Cricket
            <br />
            Auction Arena
          </h1>

          <div className="hero-divider">
            <span aria-hidden />
            <strong>◆</strong>
            <span aria-hidden />
          </div>

          <div className="cta-grid">
            <button
              onClick={() => setShowArena(true)}
              className="primary-button landing-cta"
            >
              Auctioneer Login
            </button>
            <Link href="/franchise/login" className="primary-button landing-cta">
              Franchise Login
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-slate-950 text-white overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 z-0 text-cyan-400">
        <SilkBackgroundAnimation rarity={rarity} />
      </div>
      <AuctionCarousel onRarityChange={setRarity} />
    </main>
  );
}
