'use client';

import { useEffect, useMemo, useState } from "react";
import { AUCTIONEER_EMAILS } from "@/lib/admin-users";
import { mapAuctionStateRow, mapPlayerRow } from "@/lib/auctionUtils";
import { supabase } from "@/lib/supabase-client";
import { useAuthGuard } from "@/lib/useAuthGuard";
import { Component as SilkBackgroundAnimation } from "@/app/admin/auctioneer/ui/silk-background-animation";
import type { AuctionStateRow, Player, PlayerRow } from "@/types/player";

type Tier = "common" | "epic" | "legendary";

type PlayerBidEvent = {
  id: string;
  player_id: string;
  franchise_code: string;
  bid_lakhs: number;
  created_at: string;
};

type SoldAnnouncement = {
  teamCode: string;
  playerName: string;
  amountLakhs: number;
};

const TIER_STYLES: Record<
  Tier,
  {
    accent: string;
    panelBorder: string;
    panelGlow: string;
    badgeText: string;
    button: string;
    buttonMuted: string;
    bgHi: string;
    bgLo: string;
    bgGrad: string;
  }
> = {
  common: {
    accent: "#9ca3af",
    panelBorder: "border-white/20",
    panelGlow: "shadow-[0_0_40px_rgba(148,163,184,0.22)]",
    badgeText: "text-slate-200",
    button: "bg-slate-300 text-slate-950 hover:bg-slate-200",
    buttonMuted: "bg-slate-700 text-slate-100 hover:bg-slate-600",
    bgHi: "bg-white/10",
    bgLo: "bg-white/5",
    bgGrad: "bg-[linear-gradient(180deg,#0b1731,#091225)]",
  },
  epic: {
    accent: "#a855f7",
    panelBorder: "border-purple-500/40",
    panelGlow: "shadow-[0_0_40px_rgba(168,85,247,0.25)]",
    badgeText: "text-purple-200",
    button: "bg-purple-400 text-slate-950 hover:bg-purple-300",
    buttonMuted: "bg-purple-900/70 text-purple-100 hover:bg-purple-800/80",
    bgHi: "bg-[rgba(168,85,247,0.12)]",
    bgLo: "bg-[rgba(168,85,247,0.06)]",
    bgGrad: "bg-[linear-gradient(180deg,#190b31,#0f0925)]",
  },
  legendary: {
    accent: "#eab308",
    panelBorder: "border-yellow-500/40",
    panelGlow: "shadow-[0_0_44px_rgba(234,179,8,0.3)]",
    badgeText: "text-yellow-200",
    button: "bg-yellow-400 text-slate-950 hover:bg-yellow-300",
    buttonMuted: "bg-yellow-900/60 text-yellow-100 hover:bg-yellow-800/75",
    bgHi: "bg-[rgba(234,179,8,0.12)]",
    bgLo: "bg-[rgba(234,179,8,0.06)]",
    bgGrad: "bg-[linear-gradient(180deg,#31230b,#251909)]",
  },
};

const sortPlayers = (players: Player[]): Player[] => {
  return [...players].sort((leftPlayer, rightPlayer) => {
    if (leftPlayer.slNo !== null && rightPlayer.slNo !== null) {
      return leftPlayer.slNo - rightPlayer.slNo;
    }

    if (leftPlayer.slNo !== null) return -1;
    if (rightPlayer.slNo !== null) return 1;
    return leftPlayer.name.localeCompare(rightPlayer.name);
  });
};

const formatLakhs = (amount: number): string => {
  if (!amount) return "Rs 0 L";
  if (amount >= 100) {
    return `Rs ${(amount / 100).toFixed(amount % 100 === 0 ? 1 : 2)} Cr`;
  }
  return `Rs ${amount} L`;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    const parts = [errorRecord.message, errorRecord.details, errorRecord.hint]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join(" | ");

    if (parts) {
      return parts;
    }

    const code = typeof errorRecord.code === "string" ? errorRecord.code : "";
    return code ? `Database error (${code}).` : "Unexpected database error.";
  }

  return "Something went wrong while updating auction state.";
};

const getTier = (player: Player | null): Tier => {
  if (!player) return "common";
  if (player.rarity === "common" || player.rarity === "epic" || player.rarity === "legendary") {
    return player.rarity;
  }
  if (player.creditPoints >= 92) return "legendary";
  if (player.creditPoints >= 84) return "epic";
  return "common";
};

function CrossfadeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [slotA, setSlotA] = useState(src);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [showB, setShowB] = useState(false);

  useEffect(() => {
    if (src === slotA) return;
    setSlotB(src);
    const t1 = setTimeout(() => setShowB(true), 30);
    const t2 = setTimeout(() => {
      setSlotA(src);
      setSlotB(null);
      setShowB(false);
    }, 750);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [src, slotA]);

  return (
    <>
      <img src={slotA} alt={alt} className={`${className} absolute transition-opacity duration-700 ease-in-out`} style={{ opacity: showB ? 0 : 1 }} />
      {slotB && <img src={slotB} alt={alt} className={`${className} absolute transition-opacity duration-700 ease-in-out`} style={{ opacity: showB ? 1 : 0 }} />}
    </>
  );
}

export default function AuctioneerTwoPage() {
  useAuthGuard(AUCTIONEER_EMAILS);

  const [players, setPlayers] = useState<Player[]>([]);
  const [auctionState, setAuctionState] = useState<AuctionStateRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showLiveBidPanel, setShowLiveBidPanel] = useState(true);
  const [topBids, setTopBids] = useState<PlayerBidEvent[]>([]);
  const [soldAnnouncement, setSoldAnnouncement] = useState<SoldAnnouncement | null>(null);
  const [isPlayerImageReady, setIsPlayerImageReady] = useState(false);
  const [isPlayerImageErrored, setIsPlayerImageErrored] = useState(false);

  const activePlayer = useMemo(() => {
    if (!players.length) return null;
    return players.find((player) => player.id === auctionState?.current_player_id) ?? players[0] ?? null;
  }, [auctionState?.current_player_id, players]);

  const tier = getTier(activePlayer);
  const tierStyle = TIER_STYLES[tier];
  const currentBidLakhs = auctionState?.current_bid ?? activePlayer?.basePriceLakhs ?? 0;
  const leadingFranchiseCode = auctionState?.current_winning_franchise_code ?? "--";

  const loadTopBids = async (playerId: string | null) => {
    if (!playerId) {
      setTopBids([]);
      return;
    }

    const { data, error: bidsError } = await supabase
      .from("player_bid_events")
      .select("id,player_id,franchise_code,bid_lakhs,created_at")
      .eq("player_id", playerId)
      .order("bid_lakhs", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(3);

    if (bidsError) {
      if (bidsError.code === "42P01" || bidsError.code === "PGRST205") {
        setTopBids([]);
        return;
      }
      throw bidsError;
    }

    setTopBids((data ?? []) as PlayerBidEvent[]);
  };

  const refreshData = async (): Promise<AuctionStateRow | null> => {
    const [{ data: playersData, error: playersError }, { data: stateData, error: stateError }] =
      await Promise.all([
        supabase
          .from("players")
          .select("*")
          .is("assigned_franchise_code", null)
          .order("sl_no", { ascending: true }),
        supabase.from("auction_state").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

    if (playersError) throw playersError;
    if (stateError) throw stateError;

    const nextPlayers = sortPlayers(((playersData ?? []) as PlayerRow[]).map((row) => mapPlayerRow(row)));
    let nextState = stateData ? mapAuctionStateRow(stateData as Record<string, unknown>) : null;

    if (nextState?.id && !nextState.current_player_id && nextPlayers[0]?.id) {
      const firstPlayer = nextPlayers[0];
      const { error: bootError } = await supabase
        .from("auction_state")
        .update({
          current_player_id: firstPlayer.id,
          current_bid_lakhs: firstPlayer.basePriceLakhs,
          status: "idle",
          current_winning_franchise_code: null,
          current_winning_bid_lakhs: 0,
        })
        .eq("id", nextState.id);

      if (bootError) throw bootError;

      nextState = {
        ...nextState,
        current_player_id: firstPlayer.id,
        current_bid: firstPlayer.basePriceLakhs,
        status: "idle",
        current_winning_franchise_code: null,
        current_winning_bid_lakhs: 0,
      };
    }

    setPlayers(nextPlayers);
    setAuctionState(nextState);
    await loadTopBids(nextState?.current_player_id ?? null);
    return nextState;
  };

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const latestState = await refreshData();

        if (latestState?.id && latestState.current_player_id && latestState.status !== "bidding") {
          const { error: startError } = await supabase
            .from("auction_state")
            .update({ status: "bidding", updated_at: new Date().toISOString() })
            .eq("id", latestState.id);

          if (startError) throw startError;
          await refreshData();
          if (isMounted) {
            setNotice("Auction started. Franchises can now place bids.");
          }
        }

        if (isMounted) {
          setError("");
          if (!latestState || latestState.status === "bidding") {
            setNotice("");
          }
        }
      } catch (initError) {
        if (isMounted) {
          setError(getErrorMessage(initError));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void init();

    const channel = supabase
      .channel("auctioneer2_single_card")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => {
        void refreshData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_state" }, () => {
        void refreshData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "player_bid_events" }, () => {
        void refreshData();
      })
      .subscribe();

    const interval = window.setInterval(() => {
      void refreshData();
    }, 1000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!soldAnnouncement) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSoldAnnouncement(null);
    }, 5000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [soldAnnouncement]);

  useEffect(() => {
    let isMounted = true;

    const autoStartBidding = async () => {
      if (!auctionState?.id || !auctionState.current_player_id) return;
      if (auctionState.status === "bidding") return;

      try {
        const { error } = await supabase
          .from("auction_state")
          .update({ status: "bidding", updated_at: new Date().toISOString() })
          .eq("id", auctionState.id);

        if (error) throw error;

        if (isMounted) {
          await refreshData();
          setNotice("Bidding started. Franchises can now place bids.");
        }
      } catch (err) {
        if (isMounted) {
          setError(getErrorMessage(err));
        }
      }
    };

    void autoStartBidding();

    return () => {
      isMounted = false;
    };
  }, [auctionState?.current_player_id, auctionState?.id]);

  const updateAuctionState = async (updates: {
    current_player_id?: string | null;
    current_bid_lakhs?: number;
    status?: AuctionStateRow["status"];
    current_winning_franchise_code?: string | null;
    current_winning_bid_lakhs?: number;
  }) => {
    if (!auctionState?.id) return;

    setIsSaving(true);
    setError("");

    try {
      const { error: updateError } = await supabase.from("auction_state").update(updates).eq("id", auctionState.id);
      if (updateError) throw updateError;

      await refreshData();
    } catch (updateErr) {
      setError(getErrorMessage(updateErr));
    } finally {
      setIsSaving(false);
    }
  };

  const lockBid = async () => {
    if (!activePlayer) return;

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const bidLakhs = auctionState?.current_bid ?? activePlayer.basePriceLakhs;
      const winningFranchiseCode = auctionState?.current_winning_franchise_code;

      if (winningFranchiseCode) {
        const { error: lockError } = await supabase.rpc("lock_player_to_franchise", {
          p_player_id: activePlayer.id,
          p_franchise_code: winningFranchiseCode,
          p_bid_lakhs: bidLakhs,
        });

        if (lockError) throw lockError;
        setNotice(`Locked ${activePlayer.name} to ${winningFranchiseCode} for ${formatLakhs(bidLakhs)}.`);
        setSoldAnnouncement({
          teamCode: winningFranchiseCode,
          playerName: activePlayer.name,
          amountLakhs: bidLakhs,
        });
      } else {
        const { error: playerUpdateError } = await supabase
          .from("players")
          .update({ auction_status: "sold", current_bid_lakhs: bidLakhs })
          .eq("id", activePlayer.id);

        if (playerUpdateError) throw playerUpdateError;

        await updateAuctionState({ status: "sold" });
        setNotice(`Marked ${activePlayer.name} as sold at ${formatLakhs(bidLakhs)}.`);
      }

      await refreshData();
    } catch (lockErr) {
      setError(getErrorMessage(lockErr));
    } finally {
      setIsSaving(false);
    }
  };

  const nextPlayer = async () => {
    if (!players.length) return;

    const currentIndex = players.findIndex((player) => player.id === auctionState?.current_player_id);
    const nextIndex = currentIndex >= 0 && currentIndex < players.length - 1 ? currentIndex + 1 : 0;
    const nextPlayerRecord = players[nextIndex];

    await updateAuctionState({
      current_player_id: nextPlayerRecord.id,
      current_bid_lakhs: nextPlayerRecord.basePriceLakhs,
      status: "idle",
      current_winning_franchise_code: null,
      current_winning_bid_lakhs: 0,
    });

    setNotice(`Moved to ${nextPlayerRecord.name}.`);
  };

  const playerImage =
    activePlayer?.imageUrl ||
    (activePlayer
      ? `https://ui-avatars.com/api/?name=${encodeURIComponent(activePlayer.name)}&background=0a1535&color=fff&size=512&bold=true`
      : "");

  useEffect(() => {
    setIsPlayerImageReady(false);
    setIsPlayerImageErrored(false);

    if (!playerImage) {
      setIsPlayerImageErrored(true);
      return;
    }

    const preloader = new Image();
    preloader.onload = () => setIsPlayerImageReady(true);
    preloader.onerror = () => setIsPlayerImageErrored(true);
    preloader.src = playerImage;

    if (preloader.complete) {
      setIsPlayerImageReady(true);
    }
  }, [playerImage, activePlayer?.id]);

  const isCardReady = isPlayerImageReady || isPlayerImageErrored;

  if (isLoading) {
    return <main className="grid min-h-screen place-items-center bg-[#050a17] text-white">Loading live auction...</main>;
  }

  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#050a17] px-4 py-4 sm:px-6 lg:px-8 flex flex-col">
      <div className="absolute inset-0 z-0 opacity-85">
        <SilkBackgroundAnimation rarity={tier} />
      </div>
      <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,_rgba(3,7,18,0.18),rgba(3,7,18,0.78)_65%)]" />

      <header className="relative z-30 flex flex-wrap items-start justify-between gap-4 flex-none">
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.35em] text-white/70">TATA IPL AUCTION 2025</p>
            <h1 className={`mt-0.5 text-3xl font-black uppercase tracking-tight ${tierStyle.badgeText}`}>Live Auction Card</h1>
          </div>
        </div>
      </header>

      <div className="relative z-20 flex flex-1 w-full overflow-hidden">
        <section className="w-full">

          {error ? (
            <div className="mx-5 mt-4 rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100 sm:mx-8">{error}</div>
          ) : null}


          {activePlayer ? (
            <div className="grid gap-6 lg:gap-14 p-5 sm:p-8 lg:grid-cols-[340px_minmax(0,1fr)]">
              <aside className="flex flex-col justify-end h-full mt-4 sm:mt-0">
                <div className="relative w-full flex-1 flex flex-col justify-end mb-2">
                  <CrossfadeImage src={playerImage} alt={activePlayer.name} className="inset-0 max-h-[60vh] h-full w-full object-contain object-left-bottom drop-shadow-[0_0_30px_rgba(0,0,0,0.6)] origin-bottom-left" />
                </div>
                <div className="w-full text-center sm:text-left pl-2 relative z-10 shrink-0">
                  <span className={`inline-block rounded-full border px-4 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.3em] mb-4 backdrop-blur-sm ${tier === 'common' ? 'border-[#0e7490]/70 text-[#cffafe] bg-[#083344]/60' :
                    tier === 'epic' ? 'border-[#4f46e5]/70 text-[#e0e7ff] bg-[#312e81]/60' :
                      'border-[#d97706]/70 text-[#fef3c7] bg-[#78350f]/60'
                    }`}>
                    {tier}
                  </span>
                  <h2 className="text-5xl font-black uppercase tracking-tight sm:text-[4rem] text-white mb-3 leading-[0.85] sm:leading-[0.85]" style={{ fontFamily: "Georgia, serif" }}>
                    {activePlayer.name}
                  </h2>
                  <p className={`text-[0.8rem] font-black uppercase tracking-[0.2em] ${tier === 'common' ? 'text-[#22d3ee]' : tier === 'epic' ? 'text-[#818cf8]' : 'text-[#fbbf24]'}`}>
                    {activePlayer.role}
                  </p>
                </div>
              </aside>

              <div className="flex flex-col gap-3 justify-center h-full">
                {showLiveBidPanel ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className={`rounded-xl border ${tierStyle.panelBorder} ${tierStyle.bgHi} px-4 py-3`}>
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/75">Current Highest Bid</p>
                      <p className={`mt-1 text-2xl lg:text-3xl font-black ${tierStyle.badgeText}`}>{formatLakhs(currentBidLakhs)}</p>
                    </div>
                    <div className={`rounded-xl border ${tierStyle.panelBorder} ${tierStyle.bgHi} px-4 py-3`}>
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/75">Leading Franchise</p>
                      <p className="mt-1 text-2xl lg:text-3xl font-black text-white">{leadingFranchiseCode}</p>
                    </div>
                    <div className={`rounded-xl border ${tierStyle.panelBorder} ${tierStyle.bgHi} px-4 py-3`}>
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/75">Top 3 Bids</p>
                      <p className="mt-1 text-xl lg:text-2xl font-black text-white">{topBids.length || 0} Live</p>
                    </div>
                  </div>
                ) : null}

                <div className={`rounded-2xl border ${tierStyle.panelBorder} ${tierStyle.bgGrad} p-3`}>
                  <div className="grid grid-cols-4 gap-2 text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-white/70">
                    <div>Format</div>
                    <div>Mtch</div>
                    <div>Runs</div>
                    <div>Wkts</div>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-center text-2xl lg:text-3xl font-black tracking-tight">
                    <div className="rounded-lg border border-white/10 bg-white/5 py-1.5 text-white/95">T20</div>
                    <div className="rounded-lg border border-white/10 bg-white/5 py-1.5 text-white">{activePlayer.matchesPlayed}</div>
                    <div className="rounded-lg border border-white/10 bg-white/5 py-1.5 text-white">{activePlayer.totalRuns}</div>
                    <div className="rounded-lg border border-white/10 bg-white/5 py-1.5 text-white">{activePlayer.wicketsTaken}</div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className={`rounded-xl border ${tierStyle.panelBorder} ${tierStyle.bgLo} px-3 py-3 text-center`}>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/60">Bat Avg</p>
                    <p className="mt-1 text-xl lg:text-2xl font-black text-white">{activePlayer.battingAverage.toFixed(2)}</p>
                  </div>
                  <div className={`rounded-xl border ${tierStyle.panelBorder} ${tierStyle.bgLo} px-3 py-3 text-center`}>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/60">Strike Rate</p>
                    <p className="mt-1 text-xl lg:text-2xl font-black text-white">{activePlayer.stats.strikeRate.toFixed(2)}</p>
                  </div>
                  <div className={`rounded-xl border ${tierStyle.panelBorder} ${tierStyle.bgLo} px-3 py-3 text-center`}>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/60">Bowl Avg</p>
                    <p className="mt-1 text-xl lg:text-2xl font-black text-white">{activePlayer.bowlingAverage.toFixed(2)}</p>
                  </div>
                  <div className={`rounded-xl border ${tierStyle.panelBorder} ${tierStyle.bgLo} px-3 py-3 text-center`}>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/60">Economy</p>
                    <p className="mt-1 text-xl lg:text-2xl font-black text-white">{activePlayer.economy.toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className={`rounded-xl border ${tierStyle.panelBorder} ${tierStyle.bgLo} px-4 py-3 flex flex-col justify-center`}>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/60">Current Price</p>
                    <p className={`mt-1 text-2xl lg:text-3xl font-black ${tierStyle.badgeText}`}>
                      {formatLakhs(currentBidLakhs)}
                    </p>
                    <p className="mt-0.5 text-[0.65rem] uppercase tracking-[0.2em] text-white/55">Status: {auctionState?.status ?? "idle"}</p>
                  </div>
                  <div className={`rounded-xl border ${tierStyle.panelBorder} ${tierStyle.bgLo} px-4 py-3 flex flex-col justify-center`}>
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/60">Best Bowling</p>
                    <p className="mt-1 text-2xl lg:text-3xl font-black text-white">{activePlayer.bestBowling || "N/A"}</p>
                    <p className="mt-0.5 text-[0.65rem] uppercase tracking-[0.2em] text-white/55">Credit Points: {activePlayer.creditPoints}</p>
                  </div>
                </div>

                <div className={`rounded-xl border ${tierStyle.panelBorder} ${tierStyle.bgLo} px-4 py-2.5`}>
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-white/60">Top 3 Bids (Live)</p>
                  {topBids.length ? (
                    <div className="mt-2 grid gap-1.5">
                      {topBids.map((bid, index) => (
                        <div key={bid.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
                          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-white/75">#{index + 1} {bid.franchise_code}</p>
                          <p className="text-[0.95rem] font-black text-white">{formatLakhs(bid.bid_lakhs)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[0.65rem] uppercase tracking-[0.2em] text-white/55">No bids recorded yet for this player.</p>
                  )}
                </div>

                <div className="flex flex-wrap justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void lockBid()}
                    disabled={isSaving || !activePlayer}
                    className={`rounded-xl px-6 py-3 text-sm font-black uppercase tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-50 ${tierStyle.button}`}
                  >
                    Lock Bid
                  </button>
                  <button
                    type="button"
                    onClick={() => void nextPlayer()}
                    disabled={isSaving || !players.length}
                    className={`rounded-xl px-6 py-3 text-sm font-black uppercase tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-50 ${tierStyle.buttonMuted}`}
                  >
                    Next Player
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[46vh] place-items-center p-10 text-center">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.34em] text-white/60">No Player Available</p>
                <h2 className="mt-3 text-4xl font-black">Auction pool is currently empty.</h2>
              </div>
            </div>
          )}
        </section>
      </div>

      {soldAnnouncement ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 backdrop-blur-[2px] px-4">
          <div className="w-full max-w-2xl rounded-[1.8rem] border border-emerald-300/40 bg-[linear-gradient(180deg,rgba(6,78,59,0.95),rgba(4,47,46,0.98))] p-6 shadow-[0_0_60px_rgba(16,185,129,0.35)] animate-[popupIn_320ms_ease-out]">
            <p className="text-center text-[0.72rem] font-semibold uppercase tracking-[0.35em] text-emerald-200/85">
              Player Sold
            </p>
            <h2 className="mt-3 text-center text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
              Congratulations, Team {soldAnnouncement.teamCode}
            </h2>
            <p className="mt-3 text-center text-base font-semibold uppercase tracking-[0.14em] text-emerald-100 sm:text-lg">
              You got {soldAnnouncement.playerName}
            </p>
            <p className="mt-2 text-center text-2xl font-black text-emerald-200 sm:text-3xl">
              {formatLakhs(soldAnnouncement.amountLakhs)}
            </p>

            <div className="mt-6 flex items-center justify-center gap-3 text-2xl" aria-hidden>
              <span className="animate-bounce">🏏</span>
              <span className="animate-pulse">🎉</span>
              <span className="animate-bounce [animation-delay:120ms]">🏆</span>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setSoldAnnouncement(null)}
                className="rounded-xl border border-emerald-200/50 bg-emerald-200/15 px-5 py-2 text-sm font-bold uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-200/25"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        @keyframes popupIn {
          0% {
            transform: translateY(16px) scale(0.96);
            opacity: 0;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }

        @keyframes cardReveal {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}