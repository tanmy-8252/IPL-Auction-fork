'use client';

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PlayerCard from "@/components/PlayerCard";
import { FRANCHISE_BY_CODE, type FranchiseCode } from "@/lib/franchises";
import { mapAuctionStateRow } from "@/lib/auctionUtils";
import { supabase } from "@/lib/supabase-client";
import { mapPlayersForAuctionRound } from "@/services/supabase";
import type { AuctionStateRow, AuctionStatus, Player, PlayerRow } from "@/types/player";

type TeamRow = {
  franchise_code: string;
  name: string;
  city: string;
  purse_lakhs: number;
  spent_lakhs: number;
  roster_count: number;
  is_blocked: boolean;
  round3_qualified?: boolean;
};

const TEAM_SIZE_CAP = 11;
const TEAM_PURSE_CAP_LAKHS = 10000; // 100 Cr
const BID_INCREMENT_LAKHS = 50;

const LIVE_ARENA_THEME: Record<FranchiseCode, {
  primary: string;
  secondary: string;
  accent: string;
  accentSoft: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
}> = {
  CSK: { primary: "#f5d400", secondary: "#0c2d62", accent: "#ffe37a", accentSoft: "#fff5c2", surface: "#1a2438", surfaceAlt: "#263454", ink: "#fff8d2" },
  MI: { primary: "#004ba8", secondary: "#0a1f4d", accent: "#d4af37", accentSoft: "#f5de8f", surface: "#111f38", surfaceAlt: "#1b2e52", ink: "#dfe9ff" },
  RCB: { primary: "#d71920", secondary: "#171214", accent: "#d4af37", accentSoft: "#f3dd9c", surface: "#2a1618", surfaceAlt: "#3a1d20", ink: "#ffe4e4" },
  KKR: { primary: "#5d2d91", secondary: "#281544", accent: "#d4af37", accentSoft: "#f2df9d", surface: "#241b36", surfaceAlt: "#33224b", ink: "#f0e6ff" },
  SRH: { primary: "#f26a21", secondary: "#7a2f00", accent: "#ffd447", accentSoft: "#ffe8ad", surface: "#2d1c13", surfaceAlt: "#3f2418", ink: "#ffe7cf" },
  RR: { primary: "#ff2f92", secondary: "#123d9a", accent: "#d4af37", accentSoft: "#f6dd98", surface: "#2d1a34", surfaceAlt: "#382045", ink: "#ffe5f1" },
  PBKS: { primary: "#c8102e", secondary: "#4a0912", accent: "#d4af37", accentSoft: "#f0d68e", surface: "#2c1419", surfaceAlt: "#3b1a20", ink: "#ffe6e8" },
  DC: { primary: "#0078d4", secondary: "#0e2a66", accent: "#e63946", accentSoft: "#ffc1c8", surface: "#14233e", surfaceAlt: "#1e3050", ink: "#e5efff" },
  LSG: { primary: "#a1186a", secondary: "#172b65", accent: "#d4af37", accentSoft: "#f3dd95", surface: "#251a38", surfaceAlt: "#30214a", ink: "#f5e6ff" },
  GT: { primary: "#0b2344", secondary: "#111827", accent: "#caa65b", accentSoft: "#ecd8a0", surface: "#162235", surfaceAlt: "#1f2d42", ink: "#e6edf8" },
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unable to load the live auction feed.";
};

const formatCr = (amountInLakhs: number): string => {
  if (amountInLakhs >= 100) {
    return `Rs ${(amountInLakhs / 100).toFixed(amountInLakhs % 100 === 0 ? 1 : 2)} Cr`;
  }

  return `Rs ${amountInLakhs} L`;
};

type WinAnnouncement = {
  playerId: string;
  playerName: string;
  amountLakhs: number;
  imageUrl: string;
};

type RoundTransitionModal = {
  qualified: boolean;
};

function FranchiseLiveAuctionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamCodeFromQuery = searchParams.get("team") as FranchiseCode | null;
  const franchise = teamCodeFromQuery ? FRANCHISE_BY_CODE[teamCodeFromQuery] : null;

  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [auctionState, setAuctionState] = useState<AuctionStateRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [draftBidLakhs, setDraftBidLakhs] = useState(0);
  const [uiNotice, setUiNotice] = useState("");
  const [bidFeed, setBidFeed] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [winAnnouncement, setWinAnnouncement] = useState<WinAnnouncement | null>(null);
  const [roundTransitionModal, setRoundTransitionModal] = useState<RoundTransitionModal | null>(null);

  const previousAssignmentsRef = useRef<Map<string, string | null>>(new Map());
  const hasHydratedRef = useRef(false);
  const lastWinAnnouncementKeyRef = useRef("");
  const previousRoundRef = useRef<number | null>(null);

  const currentPlayer = useMemo(
    () => players.find((player) => player.id === auctionState?.current_player_id) ?? null,
    [auctionState?.current_player_id, players],
  );

  const teamRow = useMemo(
    () => teams.find((entry) => entry.franchise_code === franchise?.code) ?? null,
    [franchise?.code, teams],
  );

  const availablePlayers = useMemo(
    () => players.filter((player) => !player.assignedFranchiseCode),
    [players],
  );

  const baseBidLakhs = currentPlayer?.basePriceLakhs ?? 0;
  const liveBidLakhs = auctionState?.current_bid ?? 0;
  const minimumNextBidLakhs = useMemo(() => {
    return Math.max(baseBidLakhs, liveBidLakhs + BID_INCREMENT_LAKHS);
  }, [baseBidLakhs, liveBidLakhs]);

  const auctionRound = auctionState?.auction_round ?? 2;
  const isRoundThree = auctionRound === 3;
  const isRoundThreeQualified = Boolean(teamRow?.round3_qualified);
  const isAuctionStarted = auctionState?.status === "bidding";
  const isTeamFull = (teamRow?.roster_count ?? 0) >= TEAM_SIZE_CAP;
  const teamSpent = teamRow?.spent_lakhs ?? 0;
  const teamBudget = TEAM_PURSE_CAP_LAKHS;
  const teamRemainingPurse = Math.max(teamBudget - teamSpent, 0);
  const isFundsExhausted = teamRemainingPurse <= 0;
  const hasInsufficientFundsForNextBid = teamRemainingPurse < minimumNextBidLakhs;
  const teamRemainingDisplay = teamRemainingPurse;
  const liveTheme = franchise ? LIVE_ARENA_THEME[franchise.code] : LIVE_ARENA_THEME.CSK;

  const arenaSurfaceStyle = {
    background: `linear-gradient(145deg, color-mix(in srgb, ${liveTheme.primary} 38%, #0d1622), color-mix(in srgb, ${liveTheme.secondary} 74%, #0b111a))`,
    borderColor: `color-mix(in srgb, ${liveTheme.secondary} 45%, #111111)`,
    color: liveTheme.ink,
  };

  const panelStyle = {
    background: `linear-gradient(160deg, ${liveTheme.surface}, ${liveTheme.surfaceAlt})`,
    borderColor: `color-mix(in srgb, ${liveTheme.secondary} 42%, #111111)`,
    color: liveTheme.ink,
  };

  const panelSubtleStyle = {
    background: `linear-gradient(150deg, color-mix(in srgb, ${liveTheme.surface} 86%, #0d121a), color-mix(in srgb, ${liveTheme.surfaceAlt} 88%, #0b1016))`,
    borderColor: `color-mix(in srgb, ${liveTheme.accent} 30%, #111111)`,
    color: liveTheme.ink,
  };

  const bidBlockReason = useMemo(() => {
    if (!currentPlayer) return "Cannot place a bid because there is no active player.";
    if (!isAuctionStarted) return "Bidding has not started yet. Waiting for auctioneer.";
    if (isRoundThree && !isRoundThreeQualified) return "Your franchise did not qualify for Round 3 bidding.";
    if (teamRow?.is_blocked) return "Your franchise is currently blocked from bidding.";
    if (isTeamFull) return `Squad full. Maximum ${TEAM_SIZE_CAP} players allowed.`;
    if (isFundsExhausted) return "You have exhausted your funds. Go back and manage your team.";
    if (hasInsufficientFundsForNextBid) return "Insufficient purse for the next valid bid.";
    return "";
  }, [currentPlayer, hasInsufficientFundsForNextBid, isAuctionStarted, isFundsExhausted, isRoundThree, isRoundThreeQualified, isTeamFull, teamRow?.is_blocked]);

  const isBidActionDisabled = isSubmittingBid || Boolean(bidBlockReason);

  const cardPlayer = useMemo(() => {
    if (!currentPlayer) {
      return null;
    }

    return {
      ...currentPlayer,
      currentBidLakhs: liveBidLakhs,
      status: auctionState?.status ?? currentPlayer.status,
    };
  }, [auctionState?.status, currentPlayer, liveBidLakhs]);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const [{ data: playersData, error: playersError }, { data: teamsData, error: teamsError }, { data: stateData, error: stateError }] =
          await Promise.all([
            supabase.from("players").select("*").order("sl_no", { ascending: true }),
            supabase.from("teams").select("*").order("franchise_code", { ascending: true }),
            supabase.from("auction_state").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
          ]);

        if (playersError) throw playersError;
        if (teamsError) throw teamsError;
        if (stateError) throw stateError;

        const nextTeams = (teamsData ?? []) as TeamRow[];
        const nextAuctionState = stateData ? mapAuctionStateRow(stateData as Record<string, unknown>) : null;
        const nextPlayers = mapPlayersForAuctionRound(
          (playersData ?? []) as PlayerRow[],
          nextAuctionState?.auction_round ?? 2,
        );

        if (!isMounted) {
          return;
        }

        if (hasHydratedRef.current && franchise) {
          const wonPlayer = nextPlayers.find((player) => {
            const previousAssignment = previousAssignmentsRef.current.get(player.id) ?? null;
            return player.assignedFranchiseCode === franchise.code && previousAssignment !== franchise.code;
          });

          if (wonPlayer && lastWinAnnouncementKeyRef.current !== wonPlayer.id) {
            lastWinAnnouncementKeyRef.current = wonPlayer.id;
            setWinAnnouncement({
              playerId: wonPlayer.id,
              playerName: wonPlayer.name,
              amountLakhs:
                wonPlayer.currentBidLakhs || nextAuctionState?.current_winning_bid_lakhs || nextAuctionState?.current_bid || 0,
              imageUrl: wonPlayer.imageUrl,
            });
          }
        }

        setPlayers(nextPlayers);
        setTeams(nextTeams);
        setAuctionState(nextAuctionState);
        setErrorMessage("");

        previousAssignmentsRef.current = new Map(nextPlayers.map((player) => [player.id, player.assignedFranchiseCode]));
        hasHydratedRef.current = true;
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getErrorMessage(error));
          setPlayers([]);
          setTeams([]);
          setAuctionState(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    // Poll every 1 second to keep auction live
    const intervalId = setInterval(() => {
      void loadData();
    }, 1000);

    const channel = supabase
      .channel("franchise_live_auction")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => {
        void loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_state" }, () => {
        void loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => {
        void loadData();
      })
      .subscribe();

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    setDraftBidLakhs(minimumNextBidLakhs);
  }, [minimumNextBidLakhs, auctionState?.current_player_id]);

  useEffect(() => {
    if (!franchise || !auctionState?.current_player_id || !currentPlayer) {
      return;
    }

    if (auctionState.status !== "bidding" || auctionState.current_bid <= 0) {
      return;
    }

    const feedItem = `${franchise.code === auctionState.current_winning_franchise_code ? "You" : auctionState.current_winning_franchise_code ?? "Unknown"} bid ${formatCr(auctionState.current_bid)} for ${currentPlayer.name}`;
    setBidFeed((previous) => {
      if (previous[0] === feedItem) {
        return previous;
      }
      return [feedItem, ...previous].slice(0, 8);
    });
  }, [auctionState?.current_bid, auctionState?.current_player_id, auctionState?.current_winning_franchise_code, auctionState?.status, currentPlayer, franchise]);

  useEffect(() => {
    if (!winAnnouncement) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setWinAnnouncement(null);
    }, 9000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [winAnnouncement]);

  useEffect(() => {
    if (!franchise) {
      return;
    }

    if (previousRoundRef.current === null) {
      previousRoundRef.current = auctionRound;
      return;
    }

    const previousRound = previousRoundRef.current;

    if (previousRound !== auctionRound && auctionRound === 3) {
      // Only show modal if we haven't shown it for this round transition
      const modalShownKey = `round3_modal_shown_${franchise.code}`;
      const hasShownModal = sessionStorage.getItem(modalShownKey) === "true";

      if (!hasShownModal) {
        setRoundTransitionModal({ qualified: isRoundThreeQualified });
        sessionStorage.setItem(modalShownKey, "true");
      }
    }

    // Clear the session flag when transitioning back to round 2
    if (previousRound === 3 && auctionRound === 2) {
      const modalShownKey = `round3_modal_shown_${franchise.code}`;
      sessionStorage.removeItem(modalShownKey);
    }

    previousRoundRef.current = auctionRound;
  }, [auctionRound, franchise, isRoundThreeQualified]);

  const applyBidDelta = (deltaLakhs: number) => {
    setDraftBidLakhs((previous) => {
      const nextValue = previous + deltaLakhs;
      return Math.max(minimumNextBidLakhs, nextValue);
    });
  };

  const placeBid = async () => {
    if (!franchise || !auctionState?.id || !currentPlayer) {
      setErrorMessage("Cannot place a bid because there is no active player.");
      return;
    }

    if (bidBlockReason) {
      setErrorMessage(bidBlockReason);
      return;
    }

    const nextBidLakhs = Math.max(draftBidLakhs, minimumNextBidLakhs);

    setIsSubmittingBid(true);
    setErrorMessage("");
    setUiNotice("");

    try {
      const response = await fetch("/api/place-bid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auctionStateId: auctionState.id,
          playerId: currentPlayer.id,
          franchiseCode: franchise.code,
          bidLakhs: nextBidLakhs,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        auctionState?: Record<string, unknown>;
      };

      if (!response.ok || !payload.success || !payload.auctionState) {
        throw new Error(payload.message || "Unable to place bid right now.");
      }

      setAuctionState(mapAuctionStateRow(payload.auctionState));

      setUiNotice(`Bid placed: ${formatCr(nextBidLakhs)} on ${currentPlayer.name}`);
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.toLowerCase().includes("permission") || message.toLowerCase().includes("policy")) {
        setErrorMessage("Bid write blocked by Supabase policy. Enable franchise bid updates for auction_state or add a server route that places bids with elevated permissions.");
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const handleBidInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void placeBid();
    }
  };

  if (!franchise) {
    return (
      <main className="dashboard-shell min-h-screen flex items-center justify-center">
        <section className="dashboard-card">
          <h1>Live Auction</h1>
          <p>Team is missing. Please login as a franchise first.</p>
          <Link href="/franchise/login" className="primary-button">
            Go To Franchise Login
          </Link>
        </section>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="dashboard-shell h-screen overflow-hidden">
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <section className="dashboard-card">
            <h1>Loading Live Auction</h1>
            <p>Fetching live player and auction state from Supabase.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main
      className="dashboard-shell live-auction-shell min-h-screen w-full overflow-x-hidden overflow-y-auto flex flex-col"
      style={{
        maxWidth: "100%",
        background:
          `radial-gradient(circle at 16% 8%, color-mix(in srgb, ${liveTheme.accent} 18%, transparent), transparent 35%), radial-gradient(circle at 84% 16%, color-mix(in srgb, ${liveTheme.primary} 14%, transparent), transparent 34%)`,
      }}
    >
      <header
        className="auth-topbar sticky top-0 z-30"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${liveTheme.secondary} 86%, #ffffff), color-mix(in srgb, ${liveTheme.primary} 72%, #ffffff))`,
          borderColor: `color-mix(in srgb, ${liveTheme.accent} 40%, #111111)`,
          color: "#ffffff",
        }}
      >
        <span className="logo-text" style={{ color: liveTheme.accentSoft }}>●●● Cricket Auction Arena</span>
        <span className="text-sm font-semibold tracking-[0.06em]" style={{ color: "#ffffff" }}>
          {franchise.name} • Round {auctionRound}
          {isRoundThree ? (isRoundThreeQualified ? " • Qualified" : " • Not Qualified") : ""}
        </span>
        <div className="topbar-right">
          <Link href={`/franchise/dashboard?team=${franchise.code}`} className="ghost-button" style={{ borderColor: liveTheme.accentSoft, color: "#ffffff", background: "rgba(255,255,255,0.08)" }}>
            Back
          </Link>
          <Link href="/" className="ghost-button" style={{ borderColor: liveTheme.accentSoft, color: "#ffffff", background: "rgba(255,255,255,0.08)" }}>
            Logout
          </Link>
        </div>
      </header>

      {errorMessage ? <section className="dashboard-card max-w-none px-4 py-3 text-left text-sm">{errorMessage}</section> : null}
      {uiNotice ? <section className="dashboard-card max-w-none px-4 py-3 text-left text-sm text-emerald-700">{uiNotice}</section> : null}

      <section className="min-h-0 grid flex-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(420px,0.5fr)] px-1 pb-2 xl:overflow-hidden">
        <article className="min-h-0 overflow-hidden rounded-[1.6rem] border-[3px] p-3 shadow-[7px_7px_0_#00000024]" style={arenaSurfaceStyle}>
          {cardPlayer ? (
            <div className="h-full overflow-visible xl:overflow-auto">
              <PlayerCard player={cardPlayer} className="h-full" />
            </div>
          ) : (
            <div className="grid h-full place-items-center rounded-[1.3rem] border-[3px] border-dashed text-center" style={panelSubtleStyle}>
              <div>
                <h2 className="font-display text-4xl">Waiting For Auctioneer</h2>
                <p className="mt-2 text-sm uppercase tracking-[0.2em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 70%, transparent)" }}>No active lot</p>
              </div>
            </div>
          )}
        </article>

        <aside className="min-h-0 w-full space-y-3 overflow-visible xl:overflow-hidden flex flex-col">
          <section className="dashboard-card max-w-none w-full p-4 text-left" style={panelStyle}>
            <h2 className="font-display text-2xl">Live Bidding Panel</h2>
            <p className="mt-1 text-xs uppercase tracking-[0.22em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 70%, transparent)" }}>Current lot: {currentPlayer?.name ?? "--"}</p>

            <div className="mt-4 grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <article className="rounded-[0.9rem] border-[3px] p-2 text-center" style={panelSubtleStyle}>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 75%, transparent)" }}>Base</p>
                  <strong className="text-lg">{formatCr(baseBidLakhs)}</strong>
                </article>
                <article className="rounded-[0.9rem] border-[3px] p-2 text-center" style={panelSubtleStyle}>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 75%, transparent)" }}>Current Bid</p>
                  <strong className="text-lg">{formatCr(liveBidLakhs)}</strong>
                </article>
              </div>

              <div className="rounded-[0.9rem] border-[3px] p-3" style={panelSubtleStyle}>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 75%, transparent)" }}>Your next bid</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.2fr_1fr]">
                  <button
                    type="button"
                    className="ghost-button h-10 min-h-0"
                    onClick={() => applyBidDelta(-BID_INCREMENT_LAKHS)}
                    disabled={isBidActionDisabled}
                  >
                    -50 L
                  </button>
                  <input
                    type="number"
                    min={minimumNextBidLakhs}
                    step={BID_INCREMENT_LAKHS}
                    value={draftBidLakhs}
                    onChange={(event) => setDraftBidLakhs(Math.max(minimumNextBidLakhs, Number(event.target.value) || minimumNextBidLakhs))}
                    onKeyDown={handleBidInputKeyDown}
                    className="h-10 w-full rounded-[0.7rem] border-[3px] px-2 text-center text-base font-black"
                    style={panelSubtleStyle}
                    disabled={isBidActionDisabled}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="ghost-button h-10 min-h-0"
                      onClick={() => applyBidDelta(BID_INCREMENT_LAKHS)}
                      disabled={isBidActionDisabled}
                    >
                      +50 L
                    </button>
                    <button
                      type="button"
                      className="ghost-button h-10 min-h-0"
                      onClick={() => applyBidDelta(100)}
                      disabled={isBidActionDisabled}
                    >
                      +1 Cr
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs uppercase tracking-[0.16em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 70%, transparent)" }}>Minimum next bid: {formatCr(minimumNextBidLakhs)} • Press Enter to place</p>
                {bidBlockReason ? (
                  <p className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-rose-700">
                    {bidBlockReason}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                className="primary-button w-full"
                onClick={() => void placeBid()}
                disabled={isBidActionDisabled}
                style={{ background: `linear-gradient(135deg, ${liveTheme.primary}, ${liveTheme.secondary})`, borderColor: liveTheme.accentSoft, color: "#ffffff" }}
              >
                {isSubmittingBid ? "Placing Bid..." : `Place Bid ${formatCr(draftBidLakhs)}`}
              </button>
            </div>
          </section>

          <section className="dashboard-card max-w-none w-full p-4 text-left" style={panelStyle}>
            <h2 className="font-display text-xl">Squad Snapshot</h2>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <article className="rounded-[0.8rem] border-[3px] p-2" style={panelSubtleStyle}>
                <p className="text-[0.62rem] uppercase tracking-[0.18em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 70%, transparent)" }}>Players</p>
                <strong>{teamRow?.roster_count ?? 0}</strong>
              </article>
              <article className="rounded-[0.8rem] border-[3px] p-2" style={panelSubtleStyle}>
                <p className="text-[0.62rem] uppercase tracking-[0.18em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 70%, transparent)" }}>Spent</p>
                <strong>{formatCr(teamRow?.spent_lakhs ?? 0)}</strong>
              </article>
              <article className="rounded-[0.8rem] border-[3px] p-2" style={panelSubtleStyle}>
                <p className="text-[0.62rem] uppercase tracking-[0.18em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 70%, transparent)" }}>Remaining</p>
                <strong>{formatCr(teamRemainingDisplay)}</strong>
              </article>
            </div>
          </section>

          <section className="dashboard-card max-w-none w-full xl:min-h-0 xl:flex-1 overflow-hidden p-4 text-left" style={panelStyle}>
            <h2 className="font-display text-xl">Live Bid Feed</h2>
            <div className="mt-3 grid max-h-[32vh] xl:h-full xl:min-h-0 gap-2 overflow-y-auto pr-1">
              {bidFeed.length ? (
                bidFeed.map((item) => (
                  <p key={item} className="rounded-[0.7rem] border-[3px] px-3 py-2 text-xs uppercase tracking-[0.14em]" style={panelSubtleStyle}>
                    {item}
                  </p>
                ))
              ) : (
                <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 70%, transparent)" }}>Waiting for first bid...</p>
              )}
            </div>
          </section>

          <section className="dashboard-card max-w-none w-full xl:min-h-0 xl:flex-1 overflow-hidden p-4 text-left" style={panelStyle}>
            <h2 className="font-display text-xl">Available Market</h2>
            <div className="mt-3 grid max-h-[32vh] xl:h-full xl:min-h-0 gap-2 overflow-y-auto pr-1">
              {availablePlayers.slice(0, 25).map((player) => (
                <article key={player.id} className="rounded-[0.8rem] border-[3px] px-3 py-2" style={panelSubtleStyle}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black">{player.name}</h3>
                      <p className="mt-1 text-[0.62rem] uppercase tracking-[0.18em]" style={{ color: "color-mix(in srgb, " + liveTheme.accentSoft + " 70%, transparent)" }}>{player.role}</p>
                    </div>
                    <span className="text-[0.66rem] font-bold uppercase tracking-[0.18em]" style={{ color: liveTheme.accentSoft }}>{formatCr(player.basePriceLakhs)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>

      {winAnnouncement ? (
        <div className="franchise-win-overlay" role="dialog" aria-modal="true" aria-labelledby="franchise-win-title">
          <section className="franchise-win-modal" style={{ borderColor: liveTheme.accent, background: `linear-gradient(160deg, ${liveTheme.surface}, ${liveTheme.surfaceAlt})` }}>
            <p className="franchise-win-kicker" style={{ color: liveTheme.primary }}>Congratulations</p>
            
            <div className="franchise-win-player-image-container">
              <div className="franchise-win-player-glow" />
              {winAnnouncement.imageUrl ? (
                <img 
                  src={winAnnouncement.imageUrl} 
                  alt={winAnnouncement.playerName}
                  className="franchise-win-player-image"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      const fallback = parent.querySelector("[data-win-fallback]") as HTMLElement | null;
                      if (fallback) fallback.style.display = "flex";
                    }
                  }}
                />
              ) : null}
              <div
                data-win-fallback=""
                style={{
                  display: winAnnouncement.imageUrl ? "none" : "flex",
                  position: "absolute",
                  inset: 0,
                  fontSize: "3.5rem",
                  fontWeight: "700",
                  color: "#ffffff",
                  textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                  lineHeight: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  backgroundColor: "rgba(200, 163, 79, 0.3)",
                  borderRadius: "1rem",
                }}
              >
                {winAnnouncement.playerName?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            </div>
            
            <h2 id="franchise-win-title">You won the bid for {winAnnouncement.playerName}</h2>
            <p className="franchise-win-amount">
              Final winning bid: <strong>{formatCr(winAnnouncement.amountLakhs)}</strong>
            </p>
            <p className="franchise-win-description">
              This player has been added to your team section. Open your dashboard to review your full squad.
            </p>
            <div className="franchise-win-actions">
              <Link href={`/franchise/dashboard?team=${encodeURIComponent(franchise.code)}`} className="primary-button">
                Go To Team Section
              </Link>
              <button type="button" className="ghost-button" onClick={() => setWinAnnouncement(null)}>
                Continue Bidding
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {roundTransitionModal ? (
        <div className="franchise-win-overlay" role="dialog" aria-modal="true" aria-labelledby="round-transition-title">
          <section className="franchise-win-modal">
            <p className="franchise-win-kicker">Round Update</p>
            <h2 id="round-transition-title">
              {roundTransitionModal.qualified ? "Congratulations, you are up to the next round" : "Round 3 has started"}
            </h2>
            {roundTransitionModal.qualified ? (
              <>
                <p>Your strategy players are kept back in your team.</p>
                <p>You have to start the bidding for the remaining players. Continue to your squad board to see those retained strategy players while all other previous players are removed.</p>
              </>
            ) : (
              <p>Only top 5 teams proceed to Round 3. Your team is not qualified for Round 3 bidding.</p>
            )}
            <div className="franchise-win-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setRoundTransitionModal(null);
                  router.push(`/franchise/dashboard?team=${encodeURIComponent(franchise.code)}`);
                }}
              >
                Go To Squad
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setRoundTransitionModal(null)}
              >
                Stay Here
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default function FranchiseLiveAuctionPage() {
  return (
    <Suspense
      fallback={
        <main className="dashboard-shell h-screen overflow-hidden">
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <section className="dashboard-card">
              <h1>Loading Live Auction</h1>
              <p>Connecting to live bidding feed.</p>
            </section>
          </div>
        </main>
      }
    >
      <FranchiseLiveAuctionContent />
    </Suspense>
  );
}
