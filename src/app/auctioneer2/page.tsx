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
  }
> = {
  common: {
    accent: "#9ca3af",
    panelBorder: "border-slate-300/45",
    panelGlow: "shadow-[0_0_40px_rgba(148,163,184,0.22)]",
    badgeText: "text-slate-200",
    button: "bg-slate-300 text-slate-950 hover:bg-slate-200",
    buttonMuted: "bg-slate-700 text-slate-100 hover:bg-slate-600",
  },
  epic: {
    accent: "#3b82f6",
    panelBorder: "border-blue-300/45",
    panelGlow: "shadow-[0_0_40px_rgba(59,130,246,0.25)]",
    badgeText: "text-blue-200",
    button: "bg-blue-300 text-slate-950 hover:bg-blue-200",
    buttonMuted: "bg-blue-900/70 text-blue-100 hover:bg-blue-800/80",
  },
  legendary: {
    accent: "#f59e0b",
    panelBorder: "border-amber-300/55",
    panelGlow: "shadow-[0_0_44px_rgba(245,158,11,0.3)]",
    badgeText: "text-amber-200",
    button: "bg-amber-300 text-slate-950 hover:bg-amber-200",
    buttonMuted: "bg-amber-900/60 text-amber-100 hover:bg-amber-800/75",
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

    // If migrations are not applied yet, keep screen functional.
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

    // Keep auction_state as the single source of truth for all connected screens.
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

    // Fallback for cases where realtime events lag or drop.
    const interval = window.setInterval(() => {
      void refreshData();
    }, 2000);

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
    <main className="relative min-h-screen overflow-hidden bg-[#050a17] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="absolute inset-0 z-0 opacity-85">
        <SilkBackgroundAnimation rarity={tier} />
      </div>
      <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,_rgba(3,7,18,0.18),rgba(3,7,18,0.78)_65%)]" />

      <div className="relative z-20 mx-auto flex min-h-[92vh] max-w-7xl items-center justify-center">
        <section
          className={`w-full max-w-6xl rounded-[1.8rem] border bg-[linear-gradient(180deg,rgba(18,22,30,0.92),rgba(7,10,16,0.96))] ${tierStyle.panelBorder} ${tierStyle.panelGlow}`}
          style={{ boxShadow: `inset 0 0 0 1px ${tierStyle.accent}55` }}
        >
          <header className="rounded-t-[1.8rem] border-b border-white/10 bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))] px-5 py-4 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.35em] text-white/70">TATA IPL AUCTION 2025</p>
                <h1 className={`mt-2 text-3xl font-black uppercase tracking-tight sm:text-4xl ${tierStyle.badgeText}`}>Live Auction Card</h1>
              </div>
              <div className="text-right">
                <p className="text-[0.6rem] uppercase tracking-[0.3em] text-white/65">Tier</p>
                <p className={`mt-1 text-sm font-bold uppercase tracking-[0.24em] ${tierStyle.badgeText}`}>{tier}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowLiveBidPanel((previous) => !previous)}
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[0.64rem] font-bold uppercase tracking-[0.22em] text-white transition hover:bg-white/15"
              >
                {showLiveBidPanel ? "Hide Live Bid" : "Show Live Bid"}
              </button>
              <p className="text-[0.66rem] uppercase tracking-[0.24em] text-white/75">
                Highest Bid: <strong className="text-white">{formatLakhs(currentBidLakhs)}</strong> by <strong className="text-white">{leadingFranchiseCode}</strong>
              </p>
            </div>
          </header>

          {error ? (
            <div className="mx-5 mt-4 rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100 sm:mx-8">{error}</div>
          ) : null}
          {notice ? (
            <div className="mx-5 mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 sm:mx-8">{notice}</div>
          ) : null}

          {activePlayer ? (
            <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[340px_minmax(0,1fr)]">
              {!isCardReady ? (
                <div className="col-span-full grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
                  <aside className="space-y-4">
                    <div className="rounded-[1.4rem] border border-white/20 bg-[linear-gradient(180deg,#0d1528,#101d36)] p-4 animate-pulse">
                      <div className="mx-auto aspect-square w-full max-w-[290px] rounded-full border border-white/15 bg-white/10" />
                    </div>
                    <div className="h-20 rounded-[1rem] border border-white/20 bg-white/10 animate-pulse" />
                  </aside>
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="h-24 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                      <div className="h-24 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                      <div className="h-24 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                    </div>
                    <div className="h-32 rounded-[1rem] border border-white/20 bg-white/10 animate-pulse" />
                    <div className="h-28 rounded-[1rem] border border-white/20 bg-white/10 animate-pulse" />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="h-24 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                      <div className="h-24 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                      <div className="h-24 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                      <div className="h-24 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="h-24 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                      <div className="h-24 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                    </div>
                    <div className="h-36 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                    <div className="flex gap-3 justify-end">
                      <div className="h-12 w-36 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                      <div className="h-12 w-36 rounded-xl border border-white/20 bg-white/10 animate-pulse" />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <aside className="space-y-4 animate-[cardReveal_320ms_ease-out]">
                    <div className="rounded-[1.4rem] border border-white/20 bg-[linear-gradient(180deg,#0d1528,#101d36)] p-4">
                      <div className="mx-auto aspect-square w-full max-w-[290px] overflow-hidden rounded-full border border-white/30 bg-black/30 p-2 shadow-[inset_0_0_30px_rgba(255,255,255,0.06)]">
                        <img src={playerImage} alt={activePlayer.name} className="h-full w-full rounded-full object-cover" />
                      </div>
                    </div>
                    <div className="rounded-[1rem] border border-white/20 bg-[linear-gradient(180deg,#d4d6dc,#8c919e)] px-5 py-3 text-center text-4xl font-black text-slate-900">
                      {formatLakhs(activePlayer.basePriceLakhs)}
                    </div>
                  </aside>

                  <div className="space-y-4 animate-[cardReveal_320ms_ease-out]">
                    {showLiveBidPanel ? (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                          <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/65">Current Highest Bid</p>
                          <p className={`mt-1 text-3xl font-black ${tierStyle.badgeText}`}>{formatLakhs(currentBidLakhs)}</p>
                        </div>
                        <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                          <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/65">Leading Franchise</p>
                          <p className="mt-1 text-3xl font-black text-white">{leadingFranchiseCode}</p>
                        </div>
                        <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                          <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/65">Top 3 Bids</p>
                          <p className="mt-1 text-xl font-black text-white">{topBids.length || 0} Live</p>
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-[1rem] border border-white/20 bg-[linear-gradient(180deg,#0d1b37,#0c1830)] px-5 py-4">
                      <h2 className={`text-4xl font-black uppercase tracking-tight sm:text-5xl ${tierStyle.badgeText}`}>{activePlayer.name}</h2>
                      <p className="mt-2 text-xl font-bold uppercase tracking-wide text-white/90">{activePlayer.country || "Unknown"}</p>
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/70">{activePlayer.role}</p>
                    </div>

                    <div className="rounded-[1rem] border border-white/20 bg-[linear-gradient(180deg,#0b1731,#091225)] p-3">
                      <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-white/70">
                        <div>Format</div>
                        <div>Mtch</div>
                        <div>Runs</div>
                        <div>Wkts</div>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-center text-3xl font-black">
                        <div className="rounded-lg border border-white/10 bg-white/5 py-2 text-white/95">T20</div>
                        <div className="rounded-lg border border-white/10 bg-white/5 py-2 text-white">{activePlayer.matchesPlayed}</div>
                        <div className="rounded-lg border border-white/10 bg-white/5 py-2 text-white">{activePlayer.totalRuns}</div>
                        <div className="rounded-lg border border-white/10 bg-white/5 py-2 text-white">{activePlayer.wicketsTaken}</div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-center">
                        <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/60">Bat Avg</p>
                        <p className="mt-1 text-2xl font-black text-white">{activePlayer.battingAverage.toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-center">
                        <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/60">Strike Rate</p>
                        <p className="mt-1 text-2xl font-black text-white">{activePlayer.stats.strikeRate.toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-center">
                        <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/60">Bowl Avg</p>
                        <p className="mt-1 text-2xl font-black text-white">{activePlayer.bowlingAverage.toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-center">
                        <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/60">Economy</p>
                        <p className="mt-1 text-2xl font-black text-white">{activePlayer.economy.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3">
                        <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/60">Current Price</p>
                        <p className={`mt-1 text-3xl font-black ${tierStyle.badgeText}`}>
                          {formatLakhs(currentBidLakhs)}
                        </p>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/55">Status: {auctionState?.status ?? "idle"}</p>
                      </div>
                      <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3">
                        <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/60">Best Bowling</p>
                        <p className="mt-1 text-3xl font-black text-white">{activePlayer.bestBowling || "N/A"}</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/55">Credit Points: {activePlayer.creditPoints}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3">
                      <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/60">Top 3 Bids (Live)</p>
                      {topBids.length ? (
                        <div className="mt-2 grid gap-2">
                          {topBids.map((bid, index) => (
                            <div key={bid.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">#{index + 1} {bid.franchise_code}</p>
                              <p className="text-lg font-black text-white">{formatLakhs(bid.bid_lakhs)}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/55">No bids recorded yet for this player.</p>
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
                </>
              )}
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
