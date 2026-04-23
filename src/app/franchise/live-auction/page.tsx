'use client';

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import "./live-auction.module.css";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PlayerCard from "@/components/PlayerCard";
import { FRANCHISE_BY_CODE, type FranchiseCode } from "@/lib/franchises";
import { mapAuctionStateRow } from "@/lib/auctionUtils";
import { supabase } from "@/lib/supabase-client";
import { mapPlayersForAuctionRound } from "@/services/supabase";
import type { AuctionStateRow, Player, PlayerRow } from "@/types/player";

/* ── Enhanced team colour map with darker, modern palette ───────────────── */
const TEAM_THEMES: Record<string, {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  surface: string;
  text: string;
  gradient: string;
  darkBg: string;
}> = {
  CSK: {
    primary: "#ffc107",
    secondary: "#ff6f00",
    accent: "#ffd54f",
    glow: "rgba(255, 193, 7, 0.4)",
    surface: "rgba(255, 193, 7, 0.08)",
    text: "#ffe082",
    gradient: "linear-gradient(135deg, #1a1500 0%, #0d0a00 100%)",
    darkBg: "#0f0c00"
  },
  MI: {
    primary: "#00e5ff",
    secondary: "#0091ea",
    accent: "#80d8ff",
    glow: "rgba(0, 229, 255, 0.4)",
    surface: "rgba(0, 145, 234, 0.08)",
    text: "#4fc3f7",
    gradient: "linear-gradient(135deg, #00151a 0%, #000a0d 100%)",
    darkBg: "#000d12"
  },
  RCB: {
    primary: "#ff1744",
    secondary: "#d50000",
    accent: "#ff5252",
    glow: "rgba(255, 23, 68, 0.4)",
    surface: "rgba(213, 0, 0, 0.08)",
    text: "#ff8a80",
    gradient: "linear-gradient(135deg, #1a0005 0%, #0d0002 100%)",
    darkBg: "#140005"
  },
  KKR: {
    primary: "#7c4dff",
    secondary: "#3d5afe",
    accent: "#b388ff",
    glow: "rgba(124, 77, 255, 0.4)",
    surface: "rgba(61, 90, 254, 0.08)",
    text: "#9575cd",
    gradient: "linear-gradient(135deg, #0a0014 0%, #05000a 100%)",
    darkBg: "#0a0514"
  },
  SRH: {
    primary: "#ff9100",
    secondary: "#ff6d00",
    accent: "#ffd180",
    glow: "rgba(255, 145, 0, 0.4)",
    surface: "rgba(255, 109, 0, 0.08)",
    text: "#ffab40",
    gradient: "linear-gradient(135deg, #1a0d00 0%, #0d0600 100%)",
    darkBg: "#120900"
  },
  RR: {
    primary: "#ff4081",
    secondary: "#f50057",
    accent: "#ff80ab",
    glow: "rgba(255, 64, 129, 0.4)",
    surface: "rgba(245, 0, 87, 0.08)",
    text: "#ff6090",
    gradient: "linear-gradient(135deg, #1a0008 0%, #0d0004 100%)",
    darkBg: "#120008"
  },
  PBKS: {
    primary: "#ff3d00",
    secondary: "#dd2c00",
    accent: "#ff6e40",
    glow: "rgba(255, 61, 0, 0.4)",
    surface: "rgba(221, 44, 0, 0.08)",
    text: "#ff9e80",
    gradient: "linear-gradient(135deg, #1a0500 0%, #0d0200 100%)",
    darkBg: "#120800"
  },
  DC: {
    primary: "#536dfe",
    secondary: "#3d5afe",
    accent: "#8c9eff",
    glow: "rgba(83, 109, 254, 0.4)",
    surface: "rgba(61, 90, 254, 0.08)",
    text: "#a1b3ff",
    gradient: "linear-gradient(135deg, #00051a 0%, #00020d 100%)",
    darkBg: "#050a1a"
  },
  LSG: {
    primary: "#00b0ff",
    secondary: "#0091ea",
    accent: "#80d8ff",
    glow: "rgba(0, 176, 255, 0.4)",
    surface: "rgba(0, 145, 234, 0.08)",
    text: "#4fc3f7",
    gradient: "linear-gradient(135deg, #00101a 0%, #00080d 100%)",
    darkBg: "#000d14"
  },
  GT: {
    primary: "#00bfa5",
    secondary: "#00b8d4",
    accent: "#64ffda",
    glow: "rgba(0, 191, 165, 0.4)",
    surface: "rgba(0, 184, 212, 0.08)",
    text: "#4dd0e1",
    gradient: "linear-gradient(135deg, #001a16 0%, #000d0c 100%)",
    darkBg: "#001412"
  },
};

const getTeamTheme = (code: string) => TEAM_THEMES[code] ?? TEAM_THEMES.CSK;

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
    return `₹${(amountInLakhs / 100).toFixed(amountInLakhs % 100 === 0 ? 1 : 2)} Cr`;
  }
  return `₹${amountInLakhs} L`;
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

type WinAnnouncement = {
  playerId: string;
  playerName: string;
  amountLakhs: number;
  imageUrl?: string;
};

type RoundTransitionModal = {
  qualified: boolean;
};

/* ══════════════════════════════════════════════════════════════════
   CLEAN CURTAIN ANIMATION COMPONENT - LOGO ON TOP
   ══════════════════════════════════════════════════════════════════ */
function CurtainReveal({
  franchiseCode,
  franchiseName,
  currentPlayer,
  onComplete
}: {
  franchiseCode: string;
  franchiseName: string;
  currentPlayer: Player | null;
  onComplete: () => void;
}) {
  const theme = getTeamTheme(franchiseCode);
  const [phase, setPhase] = useState<"hold" | "open" | "done">("hold");

  useEffect(() => {
    const holdTimer = setTimeout(() => setPhase("open"), 2200);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      onComplete();
    }, 3500);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  if (phase === "done") return null;

  return (
    <div
      className="curtain-overlay"
      style={{
        "--team-primary": theme.primary,
        "--team-secondary": theme.secondary,
        "--team-glow": theme.glow,
        "--team-surface": theme.surface,
        "--team-text": theme.text,
      } as React.CSSProperties}
    >
      {/* Background with player - Layer 1 */}
      <div className="curtain-background">
        <div className="curtain-bg-gradient" />
        {currentPlayer?.id && (
          <div className="curtain-player-bg">
            <img
              src={`/players/${currentPlayer.id}.png`}
              alt=""
              className="curtain-player-bg__img"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="curtain-player-bg__overlay" />
          </div>
        )}
      </div>

      {/* Curtains - Layer 2 */}
      <div className="curtain-container">
        <div className={`curtain-panel curtain-left ${phase === "open" ? "curtain-panel--open" : ""}`}>
          <div className="curtain-panel__fabric" />
        </div>
        <div className={`curtain-panel curtain-right ${phase === "open" ? "curtain-panel--open" : ""}`}>
          <div className="curtain-panel__fabric" />
        </div>
      </div>

      {/* Logo & Content - Layer 3 (On top of curtains) */}
      <div className={`curtain-content ${phase === "open" ? "curtain-content--fade" : ""}`}>
        <div className="curtain-brand">
          <div className="curtain-logo">
            <img src={`/teams/${franchiseCode}.png`} alt={franchiseName} />
          </div>

          <div className="curtain-text">
            <span className="curtain-text__subtitle">Entering the Arena</span>
            <h1 className="curtain-text__title">{franchiseName}</h1>
          </div>
        </div>

        <div className="curtain-sparks">
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="curtain-spark"
              style={{
                left: `${10 + Math.random() * 80}%`,
                animationDelay: `${Math.random() * 1.5}s`,
                background: i % 2 === 0 ? theme.primary : theme.secondary,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   BID LOG PANEL - Right side component
   ══════════════════════════════════════════════════════════════════ */
function BidLogPanel({ bidFeed, teamTheme }: { bidFeed: string[]; teamTheme: ReturnType<typeof getTeamTheme> }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new bids come in
  useEffect(() => {
    if (scrollRef.current && bidFeed.length > 0) {
      scrollRef.current.scrollTop = 0;
    }
  }, [bidFeed]);

  return (
    <section
      className="la-glass-card la-bid-log"
      style={{
        "--team-primary": teamTheme.primary,
        "--team-glow": teamTheme.glow,
        "--team-text": teamTheme.text,
      } as React.CSSProperties}
    >
      <div className="la-bid-log__header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 8v4l3 3"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
        <h2>Live Bid History</h2>
        {bidFeed.length > 0 && (
          <span className="la-bid-log__count">{bidFeed.length}</span>
        )}
      </div>

      <div className="la-bid-log__list" ref={scrollRef}>
        {bidFeed.length ? (
          bidFeed.map((item, idx) => (
            <div
              key={`${item}-${idx}`}
              className="la-bid-log__item"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="la-bid-log__dot" />
              <p className="la-bid-log__text">{item}</p>
            </div>
          ))
        ) : (
          <div className="la-bid-log__empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <p>No bids yet</p>
            <span>Waiting for the auction to begin...</span>
          </div>
        )}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════
   LATEST BID TOAST - Top left notification
   ══════════════════════════════════════════════════════════════════ */
function LatestBidToast({ bidFeed, teamTheme }: { bidFeed: string[]; teamTheme: ReturnType<typeof getTeamTheme> }) {
  const [show, setShow] = useState(false);
  const [latestBid, setLatestBid] = useState("");
  const prevLengthRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check if a new bid was added
    if (bidFeed.length > prevLengthRef.current && bidFeed.length > 0) {
      const newBid = bidFeed[0];
      setLatestBid(newBid);
      setShow(true);

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Auto dismiss after 2 seconds
      timeoutRef.current = setTimeout(() => {
        setShow(false);
      }, 2000);
    }

    prevLengthRef.current = bidFeed.length;

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [bidFeed]);

  if (!show || !latestBid) return null;

  return (
    <div
      className={`latest-bid-toast ${show ? "latest-bid-toast--show" : ""}`}
      style={{
        "--team-primary": teamTheme.primary,
        "--team-secondary": teamTheme.secondary,
        "--team-glow": teamTheme.glow,
        "--team-text": teamTheme.text,
      } as React.CSSProperties}
    >
      <div className="latest-bid-toast__content">
        <div className="latest-bid-toast__icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8v4l3 3"/>
            <circle cx="12" cy="12" r="10"/>
          </svg>
        </div>
        <div className="latest-bid-toast__text">
          <span className="latest-bid-toast__label">New Bid</span>
          <p className="latest-bid-toast__message">{latestBid}</p>
        </div>
      </div>
      <div className="latest-bid-toast__progress">
        <div className="latest-bid-toast__progress-bar" />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN AUCTION CONTENT - MODERN DARK UI
   ══════════════════════════════════════════════════════════════════ */
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
  const [showCurtain, setShowCurtain] = useState(true);

  const previousAssignmentsRef = useRef<Map<string, string | null>>(new Map());
  const hasHydratedRef = useRef(false);
  const lastWinAnnouncementKeyRef = useRef("");
  const previousRoundRef = useRef<number | null>(null);

  const teamTheme = useMemo(() => getTeamTheme(franchise?.code ?? "CSK"), [franchise?.code]);

  const currentPlayer = useMemo(
    () => players.find((player) => player.id === auctionState?.current_player_id) ?? null,
    [auctionState?.current_player_id, players],
  );

  const teamRow = useMemo(
    () => teams.find((entry) => entry.franchise_code === franchise?.code) ?? null,
    [franchise?.code, teams],
  );

  const availablePlayers = useMemo(
    () => sortPlayers(players.filter((player) => !player.assignedFranchiseCode)),
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
    if (!currentPlayer) return null;
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
        const nextPlayers = sortPlayers(mapPlayersForAuctionRound(
          (playersData ?? []) as PlayerRow[],
          nextAuctionState?.auction_round ?? 2,
        ));

        if (!isMounted) return;

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
        if (isMounted) setIsLoading(false);
      }
    };

    void loadData();

    const intervalId = setInterval(() => {
      void loadData();
    }, 1000);

    const channel = supabase
      .channel("franchise_live_auction")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_state" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => void loadData())
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
    if (!franchise || !auctionState?.current_player_id || !currentPlayer) return;
    if (auctionState.status !== "bidding" || auctionState.current_bid <= 0) return;

    const feedItem = `${franchise.code === auctionState.current_winning_franchise_code ? "You" : auctionState.current_winning_franchise_code ?? "Unknown"} bid ${formatCr(auctionState.current_bid)} for ${currentPlayer.name}`;
    setBidFeed((previous) => {
      if (previous[0] === feedItem) return previous;
      return [feedItem, ...previous].slice(0, 10);
    });
  }, [auctionState?.current_bid, auctionState?.current_player_id, auctionState?.current_winning_franchise_code, auctionState?.status, currentPlayer, franchise]);

  useEffect(() => {
    if (!winAnnouncement) return;
    const timeoutId = window.setTimeout(() => setWinAnnouncement(null), 9000);
    return () => window.clearTimeout(timeoutId);
  }, [winAnnouncement]);

  useEffect(() => {
    if (!franchise) return;
    
    if (previousRoundRef.current === null) {
      previousRoundRef.current = auctionRound;
      return;
    }

    const previousRound = previousRoundRef.current;

    if (previousRound !== auctionRound && auctionRound === 3) {
      const modalShownKey = `round3_modal_shown_${franchise.code}`;
      const hasShownModal = sessionStorage.getItem(modalShownKey) === "true";

      if (!hasShownModal) {
        setRoundTransitionModal({ qualified: isRoundThreeQualified });
        sessionStorage.setItem(modalShownKey, "true");
      }
    }

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auctionStateId: auctionState.id,
          playerId: currentPlayer.id,
          franchiseCode: franchise.code,
          bidLakhs: nextBidLakhs,
        }),
      });

      const payload = await response.json() as { success?: boolean; message?: string; auctionState?: Record<string, unknown> };

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

  const handleCurtainComplete = useCallback(() => setShowCurtain(false), []);

  /* ── NO FRANCHISE ─────────────────────────────────── */
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

  /* ── LOADING ──────────────────────────────────────── */
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

  /* ── MAIN RENDER ──────────────────────────────────── */
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

      {/* ── NOTICES ───────────────────────────────────── */}
      {errorMessage ? (
        <div className="la-glass-card" style={{ padding: "0.5rem 1rem", border: "1px solid #ff4444", color: "#ff8888", margin: "1rem" }}>
          {errorMessage}
        </div>
      ) : null}

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
              <h2>Waiting For Auctioneer</h2>
              <p>No active lot</p>
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

            <button
              type="button"
              className="la-btn la-btn--primary la-btn--large la-btn--glow"
              onClick={() => void placeBid()}
              disabled={isBidActionDisabled}
            >
              {isSubmittingBid ? <span className="la-btn__spinner" /> : null}
              {isSubmittingBid ? "Placing..." : `Place Bid ${formatCr(draftBidLakhs)}`}
            </button>
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
                  <span className="la-market-item__price">{formatCr(player.basePriceLakhs)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Bid History - At the bottom of right panel */}
          <BidLogPanel bidFeed={bidFeed} teamTheme={teamTheme} />
        </aside>
      </section>

      {/* ── WIN ANNOUNCEMENT ─────────────────────────── */}
      {winAnnouncement ? (
        <div className="franchise-win-overlay" role="dialog" aria-modal="true" aria-labelledby="franchise-win-title">
          <section className="franchise-win-modal" style={{ borderColor: liveTheme.accent, background: `linear-gradient(160deg, ${liveTheme.surface}, ${liveTheme.surfaceAlt})` }}>
            <p className="franchise-win-kicker" style={{ color: liveTheme.primary }}>Congratulations</p>
            
            <div style={{ position: "relative", width: "120px", height: "120px", margin: "0 auto 1.5rem", borderRadius: "50%", background: teamTheme.surface, overflow: "hidden", border: `2px solid ${teamTheme.primary}` }}>
              {winAnnouncement.imageUrl ? (
                <img 
                  src={winAnnouncement.imageUrl} 
                  alt={winAnnouncement.playerName}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
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
                  color: teamTheme.primary,
                  lineHeight: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  backgroundColor: "transparent",
                }}
              >
                {winAnnouncement.playerName?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            </div>

            <p className="la-win-kicker">Congratulations</p>
            <h2>You won the bid for<br /><span style={{ color: teamTheme.primary }}>{winAnnouncement.playerName}</span></h2>
            <p className="la-win-amount">
              Final bid: <strong>{formatCr(winAnnouncement.amountLakhs)}</strong>
            </p>
            <p className="la-win-info">This player has been added to your squad. Open your dashboard to review your full squad.</p>
            <div className="la-win-actions">
              <Link href={`/franchise/dashboard?team=${encodeURIComponent(franchise.code)}`} className="la-btn la-btn--primary">
                View Squad
              </Link>
              <button type="button" className="la-btn la-btn--ghost" onClick={() => setWinAnnouncement(null)}>
                Continue Bidding
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {/* ── ROUND TRANSITION MODAL ─────────────────────────── */}
      {roundTransitionModal ? (
        <div className="la-win-overlay" role="dialog" aria-modal="true" aria-labelledby="round-transition-title">
          <section className="la-win-modal">
            <p className="la-win-kicker" style={{ color: teamTheme.primary }}>Round Update</p>
            <h2 id="round-transition-title" style={{ fontSize: "1.7rem", lineHeight: 1.3 }}>
              {roundTransitionModal.qualified ? "Congratulations, you are up to the next round" : "Round 3 has started"}
            </h2>
            {roundTransitionModal.qualified ? (
              <>
                <p className="la-win-info" style={{ marginTop: "1rem", color: "#e2e8f0" }}>Your strategy players are kept back in your team.</p>
                <p className="la-win-info" style={{ color: "#94a3b8" }}>You have to start the bidding for the remaining players. Continue to your squad board to see those retained strategy players while all other previous players are removed.</p>
              </>
            ) : (
              <p className="la-win-info" style={{ marginTop: "1rem", color: "#e2e8f0" }}>Only top 5 teams proceed to Round 3. Your team is not qualified for Round 3 bidding.</p>
            )}
            <div className="la-win-actions" style={{ marginTop: "2rem" }}>
              <button
                type="button"
                className="la-btn la-btn--primary"
                onClick={() => {
                  setRoundTransitionModal(null);
                  router.push(`/franchise/dashboard?team=${encodeURIComponent(franchise.code)}`);
                }}
              >
                Go To Squad
              </button>
              <button
                type="button"
                className="la-btn la-btn--ghost"
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
