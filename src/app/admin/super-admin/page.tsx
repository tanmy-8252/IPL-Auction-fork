'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuctionData } from "@/hooks/useAuctionData";
import { SUPER_ADMIN_EMAIL } from "@/lib/admin-users";
import { supabase } from "@/lib/supabase-client";
import { useAuthGuard } from "@/lib/useAuthGuard";
import {
  forceSell,
  getErrorMessage,
  markSold,
  markUnsold,
  nextPlayer,
  overrideTeam,
  removePlayerFromTeam,
} from "@/services/supabase";

const formatLakhs = (amount: number): string => {
  if (!amount) return "Rs 0 L";
  if (amount >= 100) {
    return `Rs ${(amount / 100).toFixed(amount % 100 === 0 ? 1 : 2)} Cr`;
  }
  return `Rs ${amount} L`;
};

const TEAM_PURSE_CAP_LAKHS = 10000;

export default function SuperAdminPage() {
  const router = useRouter();

  useAuthGuard(SUPER_ADMIN_EMAIL);

  const {
    players,
    teams,
    auctionState,
    isLoading,
    error: realtimeError,
    refresh,
  } = useAuctionData();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [selectedTeamCode, setSelectedTeamCode] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId],
  );

  const selectedTeam = useMemo(
    () => teams.find((team) => team.franchise_code === selectedTeamCode) ?? null,
    [teams, selectedTeamCode],
  );

  const currentPlayer = useMemo(
    () => players.find((player) => player.id === auctionState?.current_player_id) ?? null,
    [auctionState?.current_player_id, players],
  );

  const leadingTeam = useMemo(
    () => teams.find((team) => team.franchise_code === auctionState?.current_winning_franchise_code) ?? null,
    [auctionState?.current_winning_franchise_code, teams],
  );

  const auctionRound = auctionState?.auction_round ?? 2;
  const roundThreeQualifiedTeams = useMemo(
    () => teams.filter((team) => Boolean(team.round3_qualified)),
    [teams],
  );

  const teamRankings = useMemo(() => {
    const rankings = teams.map((team) => {
      const teamPlayers = players.filter((p) => p.assignedFranchiseCode === team.franchise_code);
      const totalCredits = teamPlayers.reduce((sum, p) => sum + (p.creditPoints || 0), 0);
      return {
        ...team,
        totalCredits,
        playerCount: teamPlayers.length,
      };
    });

    return rankings.sort((a, b) => {
      if (b.totalCredits !== a.totalCredits) {
        return b.totalCredits - a.totalCredits;
      }
      return a.franchise_code.localeCompare(b.franchise_code);
    });
  }, [teams, players]);

  useEffect(() => {
    setSelectedPlayerId((currentId) => {
      if (players.some((player) => player.id === currentId)) return currentId;
      return auctionState?.current_player_id ?? players[0]?.id ?? "";
    });
  }, [auctionState?.current_player_id, players]);

  useEffect(() => {
    setSelectedTeamCode((currentCode) => {
      if (teams.some((team) => team.franchise_code === currentCode)) return currentCode;
      return teams[0]?.franchise_code ?? "";
    });
  }, [teams]);

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setIsSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      await action();
      await refresh();
      setMessage(successMessage);
    } catch (error) {
      const extractedMessage = getErrorMessage(error);
      console.error("Super admin action failed", { error, extractedMessage });
      setErrorMessage(extractedMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const isMissingRelationError = (error: unknown): boolean => {
    if (!error || typeof error !== "object") {
      return false;
    }
    const errorRecord = error as Record<string, unknown>;
    const code = typeof errorRecord.code === "string" ? errorRecord.code : "";
    return code === "42P01" || code === "PGRST205";
  };

  const runResetFallback = async () => {
    const timestamp = new Date().toISOString();

    const [{ error: stateError }, { error: playersError }, { error: teamsError }] = await Promise.all([
      supabase
        .from("auction_state")
        .update({
          current_player_id: null,
          current_bid_lakhs: 0,
          current_winning_franchise_code: null,
          current_winning_bid_lakhs: 0,
          auction_round: 2,
          status: "idle",
          updated_at: timestamp,
        })
        .not("id", "is", null),
      supabase
        .from("players")
        .update({
          assigned_franchise_code: null,
          last_bidder_code: null,
          current_bid_lakhs: 0,
          auction_status: "unsold",
          assigned_at: null,
          updated_at: timestamp,
        })
        .not("id", "is", null),
      supabase
        .from("teams")
        .update({
          purse_lakhs: 10000,
          spent_lakhs: 0,
          roster_count: 0,
          round3_qualified: false,
          is_blocked: false,
          updated_at: timestamp,
        })
        .not("franchise_code", "is", null),
    ]);

    if (stateError) throw stateError;
    if (playersError) throw playersError;
    if (teamsError) throw teamsError;

    const { error: strategyDeleteError } = await supabase
      .from("team_strategy_picks")
      .delete()
      .not("id", "is", null);

    if (strategyDeleteError && !isMissingRelationError(strategyDeleteError)) {
      throw strategyDeleteError;
    }
  };

  const releaseSelectedPlayer = async () => {
    if (!selectedPlayer) {
      setErrorMessage("Select a player first.");
      return;
    }
    await runAction(
      () => removePlayerFromTeam(selectedPlayer.id),
      `${selectedPlayer.name} released back into the auction pool.`,
    );
  };

  const advanceAuction = async () => {
    await runAction(nextPlayer, "Auction moved to the next available player.");
  };

  const overrideCurrentTeam = async () => {
    if (!currentPlayer || !selectedTeamCode) {
      setErrorMessage("Current player and franchise selection required.");
      return;
    }
    await runAction(
      () => overrideTeam(selectedTeamCode),
      `${selectedTeam?.name ?? selectedTeamCode} is now the leading franchise for ${currentPlayer.name}.`,
    );
  };

  const forceSellCurrentToSelectedTeam = async () => {
    if (!currentPlayer || !selectedTeamCode) {
      setErrorMessage("Current player and franchise selection required.");
      return;
    }
    const amountLakhs = auctionState?.current_bid || currentPlayer.basePriceLakhs;
    await runAction(
      () => forceSell(selectedTeamCode, amountLakhs),
      `${currentPlayer.name} locked to ${selectedTeam?.name ?? selectedTeamCode} for ${formatLakhs(amountLakhs)}.`,
    );
  };

  const lockCurrentToLeadingBid = async () => {
    if (!currentPlayer || !auctionState?.current_winning_franchise_code) {
      setErrorMessage("No leading bidder available for the current player.");
      return;
    }
    await runAction(
      markSold,
      `✓ ${currentPlayer.name} locked to ${leadingTeam?.name ?? auctionState.current_winning_franchise_code} at ${formatLakhs(auctionState.current_bid || currentPlayer.basePriceLakhs)}`,
    );
  };

  const markCurrentUnsold = async () => {
    if (!currentPlayer) {
      setErrorMessage("No current player is selected.");
      return;
    }
    await runAction(
      () => markUnsold(currentPlayer.id),
      `${currentPlayer.name} marked unsold.`,
    );
  };

  const handleResetAuction = async () => {
    const confirmReset = window.confirm("This will reset the entire auction. Are you sure?");
    if (!confirmReset) return;

    await runAction(
      async () => {
        const { error } = await supabase.rpc("reset_full_auction");
        if (!error) return;
        await runResetFallback();
      },
      "Auction fully reset to Round 2. Teams and players cleared.",
    );
  };

  const handleStartRoundThree = async () => {
    const confirmTransition = window.confirm(
      "Start Round 3? Only top 5 teams will qualify, and non-strategy players will be released.",
    );
    if (!confirmTransition) return;

    await runAction(
      async () => {
        const { error } = await supabase.rpc("start_round_three");
        if (error) throw error;
      },
      "Round 3 started. Top 5 teams qualified and non-strategy players released.",
    );
  };

  const handleSwitchToRoundTwo = async () => {
    const confirmTransition = window.confirm(
      "Switch back to Round 2? This clears Round 3 qualification flags.",
    );
    if (!confirmTransition) return;

    await runAction(
      async () => {
        const { error } = await supabase.rpc("switch_to_round_two");
        if (error) throw error;
      },
      "Switched back to Round 2.",
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#d4a017] font-black uppercase tracking-[0.5em] text-sm animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  const availablePlayers = players.filter((player) => !player.assignedFranchiseCode);
  const assignedPlayers = players.filter((player) => Boolean(player.assignedFranchiseCode));

  return (
    <main
      className="min-h-screen text-white px-4 py-6 sm:px-6 lg:px-8 relative overflow-hidden"
      style={{ backgroundColor: "#0c0f0f" }}
    >
      {/* Starburst background — four corner rays like reference image */}
      <svg
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1440 900"
        style={{ zIndex: 0 }}
      >
        <defs>
          <radialGradient id="bgGrad" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#1a2a2a" />
            <stop offset="100%" stopColor="#080c0c" />
          </radialGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#bgGrad)" />

        {/* Bottom-right starburst — main one like reference */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i / 24) * 360;
          const rad = (angle * Math.PI) / 180;
          const cx = 1440;
          const cy = 900;
          const len = 1400;
          const halfW = 18;
          const p1x = cx + Math.cos((rad - 0.045) * 1) * halfW;
          const p1y = cy + Math.sin((rad - 0.045) * 1) * halfW;
          const p2x = cx + Math.cos((rad + 0.045) * 1) * halfW;
          const p2y = cy + Math.sin((rad + 0.045) * 1) * halfW;
          const tipX = cx + Math.cos(rad) * len;
          const tipY = cy + Math.sin(rad) * len;
          return (
            <polygon
              key={`br-${i}`}
              points={`${p1x},${p1y} ${p2x},${p2y} ${tipX},${tipY}`}
              fill={i % 2 === 0 ? "rgba(30,55,55,0.55)" : "rgba(15,30,30,0.3)"}
            />
          );
        })}

        {/* Top-left starburst */}
        {Array.from({ length: 20 }).map((_, i) => {
          const angle = (i / 20) * 360;
          const rad = (angle * Math.PI) / 180;
          const cx = 0;
          const cy = 0;
          const len = 900;
          const halfW = 14;
          const p1x = cx + Math.cos((rad - 0.05)) * halfW;
          const p1y = cy + Math.sin((rad - 0.05)) * halfW;
          const p2x = cx + Math.cos((rad + 0.05)) * halfW;
          const p2y = cy + Math.sin((rad + 0.05)) * halfW;
          const tipX = cx + Math.cos(rad) * len;
          const tipY = cy + Math.sin(rad) * len;
          return (
            <polygon
              key={`tl-${i}`}
              points={`${p1x},${p1y} ${p2x},${p2y} ${tipX},${tipY}`}
              fill={i % 2 === 0 ? "rgba(25,48,48,0.4)" : "rgba(10,22,22,0.25)"}
            />
          );
        })}

        {/* Subtle center vignette overlay */}
        <defs>
          <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
            <stop offset="30%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(4,8,8,0.7)" />
          </radialGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#vignette)" />
      </svg>

      {/* Content sits above the bg */}
      <div className="relative" style={{ zIndex: 1 }}>
        <div className="mx-auto flex max-w-7xl flex-col gap-5">

        {/* ── HEADER ── */}
        <header className="relative overflow-hidden border border-white/10 bg-[#111111]"
          style={{ clipPath: "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))" }}>

          {/* top gold bar */}
          <div className="h-[3px] w-full bg-[#d4a017]" />

          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              {/* IPL badge */}
              <div className="flex-shrink-0 border-2 border-[#d4a017] bg-black p-2"
                style={{ clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))" }}>
                <div className="text-[#d4a017] font-black text-lg leading-none tracking-widest px-1">IPL</div>
              </div>
              <div>
                <p className="text-[0.55rem] font-bold uppercase tracking-[0.55em] text-white/40 mb-1">
                  Control Room
                </p>
                <h1 className="text-3xl font-black uppercase tracking-tight text-white sm:text-4xl leading-none">
                  Super Admin
                </h1>
                <p className="mt-1 text-[0.6rem] uppercase tracking-[0.35em] text-[#d4a017]/70">
                  IPL Auction Arena
                </p>
              </div>
            </div>

            {/* Action buttons — angular pill style */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: "Start Round 3", onClick: () => void handleStartRoundThree(), color: "violet" },
                { label: "Switch To Round 2", onClick: () => void handleSwitchToRoundTwo(), color: "blue" },
                { label: "⏭ Next Player", onClick: () => void advanceAuction(), disabled: !availablePlayers.length, color: "gold" },
                { label: "🔒 Lock To Franchise", onClick: () => void overrideCurrentTeam(), disabled: !currentPlayer || !selectedTeamCode, color: "green" },
                { label: "🔓 Release Back", onClick: () => void releaseSelectedPlayer(), disabled: !selectedPlayer?.assignedFranchiseCode, color: "orange" },
                { label: "Reset Auction", onClick: () => void handleResetAuction(), color: "red" },
              ].map(({ label, onClick, disabled, color }) => {
                const colorMap: Record<string, string> = {
                  gold: "border-[#d4a017]/60 bg-[#d4a017]/10 text-[#d4a017] hover:bg-[#d4a017]/20",
                  violet: "border-violet-400/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20",
                  blue: "border-blue-400/40 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20",
                  green: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
                  orange: "border-orange-400/40 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20",
                  red: "border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
                };
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={onClick}
                    disabled={isSaving || disabled}
                    className={`border px-4 py-2 text-[0.6rem] font-bold uppercase tracking-[0.3em] transition disabled:opacity-40 ${colorMap[color]}`}
                    style={{ clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)" }}
                  >
                    {label}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => router.push("/admin/teams")}
                className="border border-white/20 bg-white/5 px-4 py-2 text-[0.6rem] font-bold uppercase tracking-[0.3em] text-white/80 hover:bg-white/10 transition"
                style={{ clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)" }}
              >
                Teams
              </button>
              <button
                type="button"
                onClick={() => router.push("/admin/players")}
                className="border border-white/20 bg-white/5 px-4 py-2 text-[0.6rem] font-bold uppercase tracking-[0.3em] text-white/80 hover:bg-white/10 transition"
                style={{ clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)" }}
              >
                Players
              </button>
              <Link
                href="/"
                className="border border-white/20 bg-white/5 px-4 py-2 text-[0.6rem] font-bold uppercase tracking-[0.3em] text-white/80 hover:bg-white/10 transition"
                style={{ clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)" }}
              >
                Logout
              </Link>
            </div>
          </div>
        </header>

        {/* ── ALERTS ── */}
        {(errorMessage || realtimeError) && (
          <div className="border border-rose-500/40 bg-rose-500/10 px-5 py-3 text-rose-200 text-sm font-semibold uppercase tracking-[0.2em]"
            style={{ clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))" }}>
            {errorMessage || realtimeError}
          </div>
        )}
        {message && (
          <div className="border border-[#d4a017]/40 bg-[#d4a017]/10 px-5 py-3 text-[#d4a017] text-sm font-semibold uppercase tracking-[0.2em]"
            style={{ clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))" }}>
            {message}
          </div>
        )}

        {/* ── STAT CARDS ── */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Total Players", value: players.length },
            { label: "Available", value: availablePlayers.length },
            { label: "Assigned", value: assignedPlayers.length },
            { label: "Current Bid", value: formatLakhs(auctionState?.current_bid ?? 0) },
            { label: "Auction Round", value: `Round ${auctionRound}` },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="relative border border-white/10 bg-[#111111] p-4 overflow-hidden"
              style={{ clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))" }}
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#d4a017]" />
              <p className="text-[0.55rem] font-bold uppercase tracking-[0.4em] text-white/40 mb-2">{label}</p>
              <p className="text-2xl font-black text-white leading-none">{value}</p>
            </div>
          ))}
        </section>

        {/* ── MAIN GRID ── */}
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.75fr)]">

          {/* LEFT — Bidding panel */}
          <div
            className="border border-white/10 bg-[#111111] overflow-hidden"
            style={{ clipPath: "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))" }}
          >
            <div className="h-[2px] bg-[#d4a017]" />

            {/* Section label */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-white/8 bg-black/30">
              <div className="h-3 w-3 bg-[#d4a017]" style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
              <span className="text-[0.55rem] font-bold uppercase tracking-[0.5em] text-white/50">Currently Bidding</span>
            </div>

            <div className="flex h-full min-h-0 flex-col p-5">
              {/* Current player info */}
              <div className="mb-5 pb-5 border-b border-white/8">
                <h2 className="text-3xl font-black uppercase text-white leading-none mb-3">
                  {currentPlayer?.name ?? "Waiting for auction..."}
                </h2>
                {currentPlayer && (
                  <div className="flex flex-wrap gap-3">
                    {[
                      `Lot #${currentPlayer.slNo}`,
                      currentPlayer.role,
                      `Base: Rs ${currentPlayer.basePriceLakhs}L`,
                      `CP: ${currentPlayer.creditPoints}`,
                    ].map((info) => (
                      <span
                        key={info}
                        className="border border-white/15 bg-white/5 px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.25em] text-white/70"
                      >
                        {info}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Current bid */}
              <div className="mb-5 pb-5 border-b border-white/8">
                <p className="text-[0.55rem] font-bold uppercase tracking-[0.45em] text-white/40 mb-2">Current Bid</p>
                <p className="text-4xl font-black text-[#d4a017] leading-none mb-3">
                  {formatLakhs(auctionState?.current_bid ?? currentPlayer?.basePriceLakhs ?? 0)}
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.55rem] uppercase tracking-[0.3em] text-white/35">Status</span>
                    <span className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-white/70 border border-white/15 bg-white/5 px-2 py-0.5">
                      {auctionState?.status ?? "idle"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[0.55rem] uppercase tracking-[0.3em] text-white/35">Leading</span>
                    <span className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-[#d4a017] border border-[#d4a017]/30 bg-[#d4a017]/10 px-2 py-0.5">
                      {auctionState?.current_winning_franchise_code ?? "None"}
                      {leadingTeam ? ` — ${leadingTeam.name}` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* Franchise selector */}
              <div className="flex min-h-[26rem] flex-1 flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <p className="text-[0.55rem] font-bold uppercase tracking-[0.45em] text-white/40">
                    Select Winning Franchise
                  </p>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <div className="scrollbar-hide grid flex-1 min-h-0 gap-2 overflow-y-auto pr-1">
                  {teams.map((team) => {
                    const isSelected = team.franchise_code === selectedTeamCode;
                    const isTeamEligibleForRound = auctionRound !== 3 || Boolean(team.round3_qualified);
                    return (
                      <button
                        key={team.franchise_code}
                        type="button"
                        onClick={() => { if (isTeamEligibleForRound) setSelectedTeamCode(team.franchise_code); }}
                        disabled={!isTeamEligibleForRound}
                        className={`border text-left transition ${
                          isSelected
                            ? "border-[#d4a017]/60 bg-[#d4a017]/12"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5"
                        } ${!isTeamEligibleForRound ? "opacity-40 cursor-not-allowed" : ""}`}
                        style={{ clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)" }}
                      >
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <div>
                            <h4 className={`text-sm font-black uppercase tracking-[0.22em] ${isSelected ? "text-[#d4a017]" : "text-white"}`}>
                              {team.franchise_code}
                            </h4>
                            <p className="mt-0.5 text-[0.62rem] uppercase tracking-[0.2em] text-white/50">{team.name}</p>
                            {auctionRound === 3 && (
                              <p className={`mt-0.5 text-[0.55rem] uppercase tracking-[0.2em] ${team.round3_qualified ? "text-emerald-400" : "text-rose-400"}`}>
                                {team.round3_qualified ? "Qualified for Round 3" : "Not Qualified"}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-[0.58rem] font-bold uppercase tracking-[0.22em] text-white/40">
                              Squad: {team.roster_count}
                            </p>
                            <p className="text-[0.58rem] font-bold uppercase tracking-[0.22em] text-white/40">
                              Rs {team.spent_lakhs}L / {Math.max(TEAM_PURSE_CAP_LAKHS - team.spent_lakhs, 0)}L
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — Sidebar */}
          <aside className="flex flex-col gap-4">

            {/* Summary */}
            <div
              className="border border-white/10 bg-[#111111] overflow-hidden"
              style={{ clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))" }}
            >
              <div className="h-[2px] bg-[#d4a017]" />
              <div className="px-5 py-4">
                <p className="text-[0.55rem] font-bold uppercase tracking-[0.45em] text-white/40 mb-4">Summary</p>
                <div className="space-y-2">
                  {[
                    { label: "Total Players", value: players.length, color: "text-white" },
                    { label: "Available", value: availablePlayers.length, color: "text-emerald-400" },
                    { label: "Assigned", value: assignedPlayers.length, color: "text-[#d4a017]" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between border-b border-white/6 pb-2">
                      <span className="text-[0.62rem] uppercase tracking-[0.25em] text-white/50">{label}</span>
                      <strong className={`text-sm font-black ${color}`}>{value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Team Rankings */}
            <div
              className="border border-white/10 bg-[#111111] overflow-hidden flex-1"
              style={{ clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))" }}
            >
              <div className="h-[2px] bg-[#d4a017]" />
              <div className="px-5 py-4">
                <p className="text-[0.55rem] font-bold uppercase tracking-[0.45em] text-[#d4a017]/80 mb-4">
                  Team Rankings by Credit Score
                </p>
                <div className="space-y-1.5 max-h-[380px] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#d4a017_transparent]">
                  {teamRankings.length ? (
                    teamRankings.map((team, index) => (
                      <div
                        key={team.franchise_code}
                        className={`flex items-center justify-between border px-3 py-2 ${
                          index < 5
                            ? "border-[#d4a017]/30 bg-[#d4a017]/8"
                            : "border-white/8 bg-white/[0.02]"
                        }`}
                        style={{ clipPath: "polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)" }}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-black ${index < 5 ? "text-[#d4a017]" : "text-white/35"}`}>
                            #{index + 1}
                          </span>
                          <span className="text-sm font-black uppercase tracking-[0.18em] text-white">
                            {team.franchise_code}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className={`text-xs font-black ${index < 5 ? "text-[#d4a017]" : "text-white/60"}`}>
                            {team.totalCredits} pts
                          </div>
                          <div className="text-[0.58rem] text-white/35">{team.playerCount}/11 players</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-white/35 uppercase tracking-[0.2em]">No teams with players yet.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Round 3 Qualified */}
            <div
              className="border border-white/10 bg-[#111111] overflow-hidden"
              style={{ clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))" }}
            >
              <div className="h-[2px] bg-violet-500" />
              <div className="px-5 py-4">
                <p className="text-[0.55rem] font-bold uppercase tracking-[0.45em] text-violet-300/70 mb-4">
                  Round 3 Qualified (Top 5)
                </p>
                <div className="space-y-1.5">
                  {roundThreeQualifiedTeams.length ? (
                    roundThreeQualifiedTeams.map((team) => (
                      <div
                        key={team.franchise_code}
                        className="flex items-center justify-between border border-violet-400/20 bg-violet-500/8 px-3 py-2"
                        style={{ clipPath: "polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)" }}
                      >
                        <span className="text-sm font-black uppercase tracking-[0.18em] text-violet-100">
                          {team.franchise_code}
                        </span>
                        <span className="text-xs text-violet-300/70 uppercase tracking-[0.15em]">{team.name}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-white/35 uppercase tracking-[0.18em]">
                      No teams qualified yet. Start Round 3 to generate the top 5.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Lock / Action buttons */}
            {currentPlayer && selectedTeamCode ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void lockCurrentToLeadingBid()}
                  disabled={isSaving || !auctionState?.current_winning_franchise_code}
                  className="w-full border border-[#d4a017]/40 bg-[#d4a017]/12 py-4 text-center text-[0.65rem] font-black uppercase tracking-[0.3em] text-[#d4a017] hover:bg-[#d4a017]/22 transition disabled:opacity-40"
                  style={{ clipPath: "polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)" }}
                >
                  🔒 Lock To Leading Bid
                </button>
                <button
                  type="button"
                  onClick={() => void forceSellCurrentToSelectedTeam()}
                  disabled={isSaving}
                  className="w-full border border-emerald-400/30 bg-emerald-500/12 py-4 text-center text-[0.65rem] font-black uppercase tracking-[0.3em] text-emerald-200 hover:bg-emerald-500/22 transition disabled:opacity-40"
                  style={{ clipPath: "polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)" }}
                >
                  🔒 Lock To Selected Team
                </button>
                <button
                  type="button"
                  onClick={() => void markCurrentUnsold()}
                  disabled={isSaving || !currentPlayer}
                  className="w-full border border-rose-400/30 bg-rose-500/12 py-4 text-center text-[0.65rem] font-black uppercase tracking-[0.3em] text-rose-200 hover:bg-rose-500/22 transition disabled:opacity-40"
                  style={{ clipPath: "polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)" }}
                >
                  ❌ Mark Unsold
                </button>
              </div>
            ) : (
              <div
                className="border border-white/8 bg-[#111111] px-5 py-4 text-center text-[0.6rem] uppercase tracking-[0.3em] text-white/30"
                style={{ clipPath: "polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)" }}
              >
                Select a player and franchise to lock
              </div>
            )}
          </aside>
        </section>
      </div>
      </div>
    </main>
  );
}