'use client';

import Link from "next/link";
import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { FRANCHISE_BY_CODE, type FranchiseCode } from "@/lib/franchises";
import { mapAuctionStateRow } from "@/lib/auctionUtils";
import { supabase } from "@/lib/supabase-client";
import { mapPlayersForAuctionRound } from "@/services/supabase";
import type { AuctionStateRow, Player, PlayerRow } from "@/types/player";
import AnimatedTabs from "@/components/ui/animated-tabs";
import ProceduralGroundBackground from "@/components/ui/demo";


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

type StrategyPickRow = {
  player_id: string;
  slot: number;
};

type RoundTransitionModal = {
  qualified: boolean;
};

const TEAM_SIZE_CAP = 11;
const TEAM_PURSE_CAP_LAKHS = 10000; // 100 Cr

const isMissingTableError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorRecord = error as Record<string, unknown>;
  return errorRecord.code === "42P01" || errorRecord.code === "PGRST205";
};

type ViewMode = "squad" | "market" | "strategy";

type MarketBasePriceFilter = "all" | "upto50" | "50to100" | "above100";
type MarketCreditsFilter = "all" | "upto50" | "51to70" | "above70";
type MarketSortOption = "default" | "alphaAsc" | "alphaDesc" | "baseAsc" | "baseDesc" | "creditsAsc" | "creditsDesc";

const MARKET_PAGE_SIZE = 12;

const VIEW_LABELS: Record<ViewMode, string> = {
  squad: "Squad",
  market: "Market",
  strategy: "Strategy",
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unable to load the franchise dashboard.";
};

const formatCr = (amountInLakhs: number): string => {
  if (amountInLakhs >= 100) {
    return `Rs ${(amountInLakhs / 100).toFixed(amountInLakhs % 100 === 0 ? 1 : 2)} Cr`;
  }

  return `Rs ${amountInLakhs} L`;
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

const hexToHSL = (hex: string): string => {
  let r = 0, g = 0, b = 0;
  hex = hex.replace(/^#/, "");
  if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
  }
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)} ${Math.round(l * 100)}`;
};

const getStorageKey = (teamCode: FranchiseCode) => `franchise-strategy-${teamCode}`;

const IPL_COLOR_THEME: Record<FranchiseCode, { base: string; text: "white" | "black" }> = {
  CSK: { base: "#FFF100", text: "black" },
  DC: { base: "#0116CF", text: "white" },
  GT: { base: "#1B2133", text: "white" },
  KKR: { base: "#2E0854", text: "white" },
  LSG: { base: "#0057E2", text: "white" },
  MI: { base: "#004BA0", text: "white" },
  PBKS: { base: "#ED1B24", text: "white" },
  RR: { base: "#FC4CFC", text: "black" },
  RCB: { base: "#CC1213", text: "white" },
  SRH: { base: "#FF6600", text: "white" },
};

const themeByFranchise: Record<FranchiseCode, { accent: string; accentSoft: string; surface: string; border: string; text: string; mutedText: string }> = {
  CSK: { accent: "#ffd200", accentSoft: "#fff0a8", surface: "#fffbe6", border: "#d4b12a", text: "#1e2f57", mutedText: "#6f6529" },
  MI: { accent: "#0a2a66", accentSoft: "#c7d8ff", surface: "#f3f8ff", border: "#16408e", text: "#0a2a66", mutedText: "#4a5d84" },
  RCB: { accent: "#ff1a1a", accentSoft: "#ffd1d1", surface: "#fff2f2", border: "#b70f0f", text: "#111111", mutedText: "#7a2323" },
  KKR: { accent: "#5b2da3", accentSoft: "#ead8ff", surface: "#faf5ff", border: "#7b47c7", text: "#24103f", mutedText: "#694f8e" },
  SRH: { accent: "#ff7a00", accentSoft: "#ffe0bf", surface: "#fff8ef", border: "#c55c00", text: "#411700", mutedText: "#82512b" },
  RR: { accent: "#ff8fb2", accentSoft: "#ffe2eb", surface: "#fff8fb", border: "#ce6e8e", text: "#5f1734", mutedText: "#8a5670" },
  PBKS: { accent: "#d71920", accentSoft: "#ffd0d0", surface: "#fff4f4", border: "#a61a1f", text: "#52050a", mutedText: "#7c3a3d" },
  DC: { accent: "#1d4ed8", accentSoft: "#dbe7ff", surface: "#f4f8ff", border: "#2c65e3", text: "#12316b", mutedText: "#52648f" },
  LSG: { accent: "#0b5fa5", accentSoft: "#cde9ff", surface: "#f4fbff", border: "#1672c2", text: "#0b355b", mutedText: "#4d6a84" },
  GT: { accent: "#c9a74e", accentSoft: "#f4e4bb", surface: "#fffaf0", border: "#93752f", text: "#2b2616", mutedText: "#6d5c34" },
};

const getFranchiseTheme = (code: FranchiseCode) => themeByFranchise[code];

/* ─── Team-specific silk textures ─── */
const teamBackgrounds: Record<string, string> = {
  RCB:  "/textures/rcb-bg.png",
  MI:   "/textures/mi-bg.png",
  CSK:  "/textures/csk-bg.png",
  KKR:  "/textures/kkr-bg.png",
  RR:   "/textures/rr-bg.png",
  SRH:  "/textures/srh-bg.png",
  DC:   "/textures/dc-bg.png",
  GT:   "/textures/gt-bg.png",
  LSG:  "/textures/lsg-bg.png",
  PBKS: "/textures/pbks-bg.png",
};

/* ─── Player Card ─── */
function PlayerCard({ player, bannerColor1, bannerColor2, franchiseCode, onClick }: {
  player: Player;
  bannerColor1: string;
  bannerColor2: string;
  franchiseCode?: string;
  onClick?: () => void;
}) {
  const textureSrc = (franchiseCode && teamBackgrounds[franchiseCode])
    ? teamBackgrounds[franchiseCode]
    : "/textures/silk-bg.png";

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 60, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 60, damping: 20 });

  const ringRotateXOuter = useTransform(springY, [-0.5, 0.5], [15, -15]);
  const ringRotateYOuter = useTransform(springX, [-0.5, 0.5], [-15, 15]);
  const ringRotateXInner = useTransform(springY, [-0.5, 0.5], [24, -24]);
  const ringRotateYInner = useTransform(springX, [-0.5, 0.5], [-24, 24]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative z-10 hover:z-20 transition-transform duration-200 ease-out hover:scale-105 active:scale-[0.98]"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <article className="group relative overflow-hidden rounded-xl h-[145px] border border-white/80 hover:border-white transition-all duration-300 bg-black">

        {/* Team-specific silk texture */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-[length:120%_120%] transition-transform duration-700 group-hover:scale-110"
          style={{ backgroundImage: `url('${textureSrc}')` }}
        />

        {/* Layer 1 — diagonal base color wash (lightened) */}
        <div
          className="absolute inset-0 z-[1] opacity-70"
          style={{ background: `linear-gradient(135deg, ${bannerColor1}99, transparent 55%)` }}
        />

        {/* Layer 2 — temperature shift (softened, not going to solid black) */}
        <div
          className="absolute inset-0 z-[2] opacity-60"
          style={{ background: `linear-gradient(to right, ${bannerColor1}44, transparent 65%)` }}
        />

        {/* Layer 3 — exposure veil (reduced to let texture breathe) */}
        <div className="absolute inset-0 bg-black/25 z-[3]" />

        {/* Layer 4 — radial color pop highlight */}
        <div
          className="absolute inset-0 z-[4] opacity-30"
          style={{ background: `radial-gradient(circle at 20% 30%, ${bannerColor1}, transparent 55%)` }}
        />

        {/* Layer 5 — premium lighting sheen */}
        <div className="absolute inset-0 z-[5] bg-gradient-to-br from-white/8 via-transparent to-black/20" />

        {/* Content Container */}
        <div className="relative z-10 w-full h-full" style={{
          padding: "1rem 1.1rem",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gridTemplateRows: "auto 1fr",
          gap: "0.4rem 1.1rem",
          fontFamily: "'Patrick Hand', cursive"
        }}>
          {/* Player Avatar Circle — spans both rows */}
          <div style={{
            gridRow: "1 / 3",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 2,
            transformStyle: "preserve-3d",
            perspective: "700px",
          }}>
            <motion.div
              className="absolute pointer-events-none"
              style={{
                width: "6.5rem",
                height: "6.5rem",
                rotateX: ringRotateXOuter,
                rotateY: ringRotateYOuter,
                transformStyle: "preserve-3d",
              }}
            >
              <motion.div
                className="w-full h-full rounded-full border-[2px] border-dashed border-white/35"
                animate={{ rotateZ: 360, scale: [0.98, 1.04, 0.98] }}
                transition={{
                  rotateZ: { duration: 14, repeat: Infinity, ease: "linear" },
                  scale: { duration: 2.6, repeat: Infinity, ease: "easeInOut" },
                }}
              />
            </motion.div>

            <motion.div
              className="absolute pointer-events-none"
              style={{
                width: "5.8rem",
                height: "5.8rem",
                rotateX: ringRotateXInner,
                rotateY: ringRotateYInner,
                transformStyle: "preserve-3d",
              }}
            >
              <motion.div
                className="w-full h-full rounded-full border border-solid border-transparent border-t-[#F9CD05]/90 border-b-[#F9CD05]/35"
                animate={{ rotateZ: -360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>

            <div style={{
              width: "5rem",
              height: "5rem",
              borderRadius: "50%",
              border: "2.5px solid rgba(255,255,255,0.35)",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.45)",
              flexShrink: 0,
            }}>
              {player.imageUrl ? (
                <img
                  src={player.imageUrl}
                  alt={player.name ?? "Player"}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      const fallback = parent.querySelector("[data-fallback]") as HTMLElement | null;
                      if (fallback) fallback.style.display = "flex";
                    }
                  }}
                />
              ) : null}
              <span
                data-fallback=""
                style={{
                  display: player.imageUrl ? "none" : "flex",
                  fontSize: "1.5rem",
                  fontWeight: "700",
                  color: "#ffffff",
                  textShadow: "0 2px 4px rgba(0,0,0,0.8)",
                  lineHeight: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                }}
              >
                {player.name?.charAt(0)?.toUpperCase() ?? (player.slNo ?? "?")}
              </span>
            </div>
          </div>

          {/* Name & Subtitle — top right */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", justifyContent: "flex-end", position: "relative", zIndex: 2 }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "#ffffff", textShadow: "0 2px 4px rgba(0,0,0,0.8)", lineHeight: 1.1, margin: 0 }}>
              {player.name ?? "Player"}
            </h3>
            <small style={{ fontSize: "0.78rem", fontWeight: "400", color: "rgba(255,255,255,0.85)", textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}>
              {player.role ?? "Role"} • {player.category ?? "Type"}
            </small>
          </div>

          {/* Info Boxes — bottom right */}
          <div className="flex gap-2 items-center mt-1 mr-1" style={{ position: "relative", zIndex: 2 }}>
            <div className="flex flex-col items-center justify-center px-3 py-1.5 min-w-[80px] rounded-lg" style={{
              background: "rgba(0,0,0,0.35)",
            }}>
              <p className="text-[10px] text-white/70 leading-tight">Base Price</p>
              <p className="text-sm text-white font-semibold leading-snug">{formatCr(player.basePriceLakhs ?? 20)}</p>
            </div>
            <div className="flex flex-col items-center justify-center px-3 py-1.5 min-w-[70px] rounded-lg" style={{
              background: "rgba(0,0,0,0.35)",
            }}>
              <p className="text-[10px] text-white/70 leading-tight">Credits</p>
              <p className="text-sm text-white font-semibold leading-snug">{player.creditPoints ?? 50}</p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

function FranchiseDashboardContent() {
  const searchParams = useSearchParams();
  const team = searchParams.get("team") as FranchiseCode | null;
  const franchise = team ? FRANCHISE_BY_CODE[team] : null;

  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [auctionState, setAuctionState] = useState<AuctionStateRow | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("squad");
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<string[]>([]);
  const [marketSearchQuery, setMarketSearchQuery] = useState("");
  const deferredMarketSearchQuery = useDeferredValue(marketSearchQuery);
  const [marketBasePriceFilter, setMarketBasePriceFilter] = useState<MarketBasePriceFilter>("all");
  const [marketCreditsFilter, setMarketCreditsFilter] = useState<MarketCreditsFilter>("all");
  const [marketSortOption, setMarketSortOption] = useState<MarketSortOption>("default");
  const [marketPage, setMarketPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [roundTransitionModal, setRoundTransitionModal] = useState<RoundTransitionModal | null>(null);
  const strategySnapshotRef = useRef("");
  const hasHydratedStrategyRef = useRef(false);
  const previousRoundRef = useRef<number | null>(null);

  const teamRow = useMemo(
    () => teams.find((entry) => entry.franchise_code === team) ?? null,
    [teams, team],
  );

  const squadPlayers = useMemo(
    () => sortPlayers(players.filter((player) => player.assignedFranchiseCode === team)),
    [players, team],
  );

  const marketPlayers = useMemo(
    () => sortPlayers(players.filter((player) => !player.assignedFranchiseCode)),
    [players],
  );

  const filteredMarketPlayers = useMemo(() => {
    const query = deferredMarketSearchQuery.trim().toLowerCase();

    const baseFiltered = marketPlayers.filter((player) => {
      const basePrice = player.basePriceLakhs ?? 0;
      const credits = player.creditPoints ?? 0;
      const matchesQuery =
        !query ||
        player.name.toLowerCase().includes(query) ||
        (player.role ?? "").toLowerCase().includes(query) ||
        (player.category ?? "").toLowerCase().includes(query) ||
        String(player.slNo ?? "").includes(query);

      const matchesBasePrice =
        marketBasePriceFilter === "all" ||
        (marketBasePriceFilter === "upto50" && basePrice <= 50) ||
        (marketBasePriceFilter === "50to100" && basePrice > 50 && basePrice <= 100) ||
        (marketBasePriceFilter === "above100" && basePrice > 100);

      const matchesCredits =
        marketCreditsFilter === "all" ||
        (marketCreditsFilter === "upto50" && credits <= 50) ||
        (marketCreditsFilter === "51to70" && credits >= 51 && credits <= 70) ||
        (marketCreditsFilter === "above70" && credits > 70);

      return matchesQuery && matchesBasePrice && matchesCredits;
    });

    if (marketSortOption === "default") {
      return baseFiltered;
    }

    return [...baseFiltered].sort((leftPlayer, rightPlayer) => {
      if (marketSortOption === "alphaAsc") {
        return leftPlayer.name.localeCompare(rightPlayer.name);
      }

      if (marketSortOption === "alphaDesc") {
        return rightPlayer.name.localeCompare(leftPlayer.name);
      }

      if (marketSortOption === "baseAsc") {
        return (leftPlayer.basePriceLakhs ?? 0) - (rightPlayer.basePriceLakhs ?? 0);
      }

      if (marketSortOption === "baseDesc") {
        return (rightPlayer.basePriceLakhs ?? 0) - (leftPlayer.basePriceLakhs ?? 0);
      }

      if (marketSortOption === "creditsAsc") {
        return (leftPlayer.creditPoints ?? 0) - (rightPlayer.creditPoints ?? 0);
      }

      return (rightPlayer.creditPoints ?? 0) - (leftPlayer.creditPoints ?? 0);
    });
  }, [
    deferredMarketSearchQuery,
    marketBasePriceFilter,
    marketCreditsFilter,
    marketPlayers,
    marketSortOption,
  ]);

  const marketTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredMarketPlayers.length / MARKET_PAGE_SIZE)),
    [filteredMarketPlayers.length],
  );

  const paginatedMarketPlayers = useMemo(() => {
    const startIndex = (marketPage - 1) * MARKET_PAGE_SIZE;
    return filteredMarketPlayers.slice(startIndex, startIndex + MARKET_PAGE_SIZE);
  }, [filteredMarketPlayers, marketPage]);

  const strategyPlayers = useMemo(
    () => squadPlayers.filter((player) => selectedStrategyIds.includes(player.id)),
    [selectedStrategyIds, squadPlayers],
  );

  /* ─── Body background override for smoke page ─── */
  useEffect(() => {
    document.documentElement.classList.add("smoke-page");
    document.body.classList.add("smoke-page");
    return () => {
      document.documentElement.classList.remove("smoke-page");
      document.body.classList.remove("smoke-page");
    };
  }, []);

  useEffect(() => {
    setMarketPage(1);
  }, [deferredMarketSearchQuery, marketBasePriceFilter, marketCreditsFilter, marketSortOption]);

  useEffect(() => {
    if (marketPage > marketTotalPages) {
      setMarketPage(marketTotalPages);
    }
  }, [marketPage, marketTotalPages]);

  useEffect(() => {
    if (!team) {
      return;
    }

    const loadStoredStrategy = async () => {
      try {
        const { data, error } = await supabase
          .from("team_strategy_picks")
          .select("player_id,slot")
          .eq("team_code", team)
          .order("slot", { ascending: true });

        if (error && !isMissingTableError(error)) {
          throw error;
        }

        const nextStrategyIds = ((data ?? []) as StrategyPickRow[])
          .sort((left, right) => left.slot - right.slot)
          .map((row) => row.player_id)
          .slice(0, 2);

        if (nextStrategyIds.length > 0) {
          strategySnapshotRef.current = JSON.stringify(nextStrategyIds);
          setSelectedStrategyIds(nextStrategyIds);
          return;
        }

        const storedValue = window.localStorage.getItem(getStorageKey(team));
        if (storedValue) {
          try {
            const parsedValue = JSON.parse(storedValue) as string[];
            const nextLocalStrategyIds = parsedValue.slice(0, 2);
            strategySnapshotRef.current = JSON.stringify(nextLocalStrategyIds);
            setSelectedStrategyIds(nextLocalStrategyIds);
            return;
          } catch {
            // fall through to empty selection
          }
        }

        strategySnapshotRef.current = JSON.stringify([]);
        setSelectedStrategyIds([]);
      } catch {
        const storedValue = window.localStorage.getItem(getStorageKey(team));
        if (storedValue) {
          try {
            const parsedValue = JSON.parse(storedValue) as string[];
            const nextLocalStrategyIds = parsedValue.slice(0, 2);
            strategySnapshotRef.current = JSON.stringify(nextLocalStrategyIds);
            setSelectedStrategyIds(nextLocalStrategyIds);
            return;
          } catch {
            // ignore malformed cache
          }
        }

        strategySnapshotRef.current = JSON.stringify([]);
        setSelectedStrategyIds([]);
      } finally {
        hasHydratedStrategyRef.current = true;
      }
    };

    void loadStoredStrategy();
  }, [team]);

  useEffect(() => {
    if (!team) {
      return;
    }

    if (!hasHydratedStrategyRef.current) {
      return;
    }

    window.localStorage.setItem(getStorageKey(team), JSON.stringify(selectedStrategyIds));
  }, [selectedStrategyIds, team]);

  useEffect(() => {
    if (!team || !hasHydratedStrategyRef.current) {
      return;
    }

    const serializedSelection = JSON.stringify(selectedStrategyIds.slice(0, 2));
    if (serializedSelection === strategySnapshotRef.current) {
      return;
    }

    const syncStrategySelection = async () => {
      try {
        const { error: deleteError } = await supabase.from("team_strategy_picks").delete().eq("team_code", team);
        if (deleteError && !isMissingTableError(deleteError)) {
          throw deleteError;
        }

        const nextRows = selectedStrategyIds.slice(0, 2).map((playerId, index) => ({
          team_code: team,
          player_id: playerId,
          slot: index + 1,
        }));

        if (nextRows.length > 0) {
          const { error: insertError } = await supabase.from("team_strategy_picks").insert(nextRows);
          if (insertError && !isMissingTableError(insertError)) {
            throw insertError;
          }
        }

        strategySnapshotRef.current = serializedSelection;
      } catch (error) {
        if (!isMissingTableError(error)) {
          setErrorMessage(getErrorMessage(error));
        }
      }
    };

    void syncStrategySelection();
  }, [selectedStrategyIds, team]);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const [{ data: playersData, error: playersError }, { data: teamsData, error: teamsError }, { data: stateData, error: stateError }] =
          await Promise.all([
            supabase.from("players").select("*").order("sl_no", { ascending: true }),
            supabase.from("teams").select("*").order("franchise_code", { ascending: true }),
            supabase.from("auction_state").select("*").limit(1).maybeSingle(),
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

        setPlayers(nextPlayers);
        setTeams(nextTeams);
        setAuctionState(nextAuctionState);
        setSelectedStrategyIds((currentIds) =>
          currentIds.filter((playerId) => nextPlayers.some((player) => player.id === playerId && player.assignedFranchiseCode === team)).slice(0, 2),
        );
        setErrorMessage("");
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
      .channel("franchise_dashboard_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => {
        void loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => {
        void loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_state" }, () => {
        void loadData();
      })
      .subscribe();

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, [team]);

  const teamSpent = teamRow?.spent_lakhs ?? 0;
  const teamBudget = TEAM_PURSE_CAP_LAKHS;
  const teamRemaining = Math.max(teamBudget - teamSpent, 0);
  const teamCount = teamRow?.roster_count ?? squadPlayers.length;
  const teamTotalCredits = useMemo(() => {
    return squadPlayers.reduce((sum, player) => sum + (player.creditPoints || 0), 0);
  }, [squadPlayers]);
  const auctionRound = auctionState?.auction_round ?? 2;
  const isRoundThree = auctionRound === 3;
  const isRoundThreeQualified = Boolean(teamRow?.round3_qualified);
  const theme = franchise ? getFranchiseTheme(franchise.code) : getFranchiseTheme("CSK");
  const teamBrand = franchise ? IPL_COLOR_THEME[franchise.code] : IPL_COLOR_THEME.CSK;
  const bannerColor1 = teamBrand.base;
  const bannerColor2 = "#000000";
  const teamTextColor = teamBrand.text === "black" ? "#111111" : "#ffffff";

  const toggleStrategyPlayer = (playerId: string) => {
    setSelectedStrategyIds((currentIds) => {
      if (currentIds.includes(playerId)) {
        return currentIds.filter((id) => id !== playerId);
      }

      if (currentIds.length >= 2) {
        return currentIds;
      }

      return [...currentIds, playerId];
    });
  };

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

      setViewMode("squad");
    }

    // Clear the session flag when transitioning back to round 2
    if (previousRound === 3 && auctionRound === 2) {
      const modalShownKey = `round3_modal_shown_${franchise.code}`;
      sessionStorage.removeItem(modalShownKey);
    }

    previousRoundRef.current = auctionRound;
  }, [auctionRound, franchise, isRoundThreeQualified]);

  if (!franchise) {
    return (
      <main className="dashboard-shell">
        <section className="dashboard-card">
          <h1>Franchise Dashboard</h1>
          <p>Please login from the franchise screen to access your team dashboard.</p>
          <Link href="/franchise/login" className="primary-button">
            Go To Franchise Login
          </Link>
        </section>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="dashboard-shell">
        <section className="dashboard-card">
          <h1>Loading {franchise.name}</h1>
          <p>Fetching live squad and market data from Supabase.</p>
        </section>
      </main>
    );
  }

  /* ─── Render: active player list for the current view ─── */
  const activePlayerList =
    viewMode === "squad"
      ? squadPlayers
      : viewMode === "market"
        ? paginatedMarketPlayers
        : squadPlayers;

  const emptyMessage =
    viewMode === "squad"
      ? "No squad players yet."
      : filteredMarketPlayers.length === 0
        ? "No market players match your current search and filters."
        : "All players are currently assigned.";

  return (
    <div className="relative w-full min-h-screen overflow-hidden max-w-full">
      <ProceduralGroundBackground
        teamColor={bannerColor1}
        accentColor={teamBrand.text === "black" ? "#000000" : "#ffffff"}
      />
      <div className="absolute inset-0 w-full h-screen flex flex-col items-center overflow-y-auto overflow-x-hidden pt-1 sm:pt-0 z-20">

        {/* Top Bar Wrapper */}
        <div className="w-[95%] max-w-[1600px] mt-1 ml-2 sm:mt-3 sm:ml-0 flex-shrink-0">
          <div className="auth-topbar glass-override" style={{
            marginBottom: "0"
          }}>
            <div className="flex items-center gap-4">
              <img
                src="/images/cricket-banner.png"
                className="w-[70px] h-[50px] object-cover rounded-md"
                alt="Cricket Tycoon"
              />
              <span className="text-white/90 text-xl font-semibold tracking-wide drop-shadow-md">
                Cricket Tycoon
              </span>
            </div>
            <div className="topbar-right">
              <Link href="/franchise/login" className="flex items-center justify-center bg-white/10 border border-white/20 rounded-xl px-6 py-2 shadow-md group cursor-pointer hover:bg-white/20 transition-all">
                <div className="relative overflow-hidden w-[220px] h-6 flex items-center justify-center">
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white transition-all duration-300 group-hover:-translate-y-6 group-hover:opacity-0">
                    {franchise.name}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white translate-y-6 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    Switch Team
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </div>

        <main className="w-[95%] max-w-[1600px] mt-1 ml-2 sm:mt-3 sm:ml-0 flex-grow flex flex-col gap-3 min-h-0 overflow-hidden mb-3">
          {errorMessage ? <section className="dashboard-card dashboard-card--wide">{errorMessage}</section> : null}

          <section className="franchise-team-board glass-override h-full flex flex-col min-h-0 overflow-hidden">

            <div className="w-full rounded-2xl overflow-hidden mb-3 flex-shrink-0" style={{
              background: `linear-gradient(to right, ${bannerColor1}, ${bannerColor2})`,
              padding: "1rem 2rem",
            }}>
              <div className="grid grid-cols-2 gap-6 items-center w-full h-full">

                {/* LEFT SIDE: Identity */}
                <div className="flex items-center gap-5">
                  <div>
                    <img
                      src={`/teams/${franchise.code}.png`}
                      alt={`${franchise.name} Logo`}
                      className="w-40 h-40 object-contain flex-shrink-0"
                    />
                  </div>
                  <div style={{ color: teamTextColor }}>
                    <h1 className="text-4xl font-bold tracking-tight leading-tight">{franchise.name}</h1>
                    <p className="text-base font-medium mt-1" style={{ color: teamTextColor }}>{teamCount} / {TEAM_SIZE_CAP} Players Signed</p>
                    <p className="text-sm font-semibold mt-1" style={{ color: teamTextColor }}>
                      Round {auctionRound}{isRoundThree ? (isRoundThreeQualified ? " • Qualified for Round 3" : " • Not in Round 3") : ""}
                    </p>
                  </div>
                </div>

                {/* RIGHT SIDE: Budget & Actions */}
                <div className="flex flex-col h-full justify-between items-start pl-8">
                  {/* Budget Row */}
                  <div className="grid grid-cols-4 gap-4 w-full">
                    <article className="w-full bg-white/10 rounded-xl py-4 text-white text-center">
                      <p className="text-sm font-medium uppercase tracking-wider text-white/70">Total Budget</p>
                      <p className="text-lg font-bold mt-1">{formatCr(teamBudget)}</p>
                    </article>

                    <article className="w-full bg-white/10 rounded-xl py-4 text-white text-center">
                      <p className="text-sm font-medium uppercase tracking-wider text-white/70">Spent</p>
                      <p className="text-lg font-bold mt-1">{formatCr(teamSpent)}</p>
                    </article>

                    <article className="w-full bg-white/10 rounded-xl py-4 text-white text-center">
                      <p className="text-sm font-medium uppercase tracking-wider text-white/70">Remaining</p>
                      <p className="text-lg font-bold mt-1">{formatCr(teamRemaining)}</p>
                    </article>

                    <article className="w-full bg-amber-500/20 rounded-xl py-4 text-amber-100 text-center border border-amber-400/30">
                      <p className="text-sm font-medium uppercase tracking-wider text-amber-200/70">Team Credits</p>
                      <p className="text-lg font-bold mt-1">{teamTotalCredits} pts</p>
                    </article>
                  </div>

                  <Link
                    href={`/franchise/live-auction?team=${encodeURIComponent(franchise.code)}`}
                    className="
                      w-full 
                      bg-black 
                      text-white 
                      py-4 
                      rounded-xl 
                      font-bold 
                      text-xl 
                      tracking-wide
                      flex items-center justify-center
                      transition-all duration-200
                      hover:scale-105 
                      active:scale-95
                    "
                    style={{
                      color: "#ffffff",
                      opacity: 1,
                      filter: "none",
                      mixBlendMode: "normal"
                    }}
                  >
                    Enter Live Auction
                  </Link>
                </div>
              </div>
            </div>


            {/* ── View-Mode Tabs ── */}
            <div className="px-4 mb-4 flex-shrink-0">
              <AnimatedTabs
                tabs={[
                  { label: "Squad", value: "squad" },
                  { label: "Market", value: "market" },
                  ...(isRoundThree ? [] : [{ label: "Strategy", value: "strategy" }]),
                ]}
                activeValue={viewMode}
                onTabChange={(value) => setViewMode(value as ViewMode)}
              />
            </div>



            {viewMode === "strategy" ? (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr] gap-6 px-4 flex-1 min-h-0 overflow-visible items-stretch">

                {/* LEFT: Strategy Picks (25%) */}
                <div className="rounded-xl p-4 bg-white/10 border border-white/10 flex flex-col gap-4">
                  {/* Title only */}
                  <p
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: theme.accent }}
                  >
                    Strategy Picks ({strategyPlayers.length}/2)
                  </p>

                  {/* Slots */}
                  <div className="flex flex-col gap-3">
                    {strategyPlayers.map((p) => (
                      <div key={p.id} className="relative">
                        <PlayerCard
                          player={p}
                          bannerColor1={bannerColor1}
                          bannerColor2={bannerColor2}
                          franchiseCode={team ?? undefined}
                          onClick={() => toggleStrategyPlayer(p.id)}
                        />
                        {/* Remove badge */}
                        <div
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white/90 text-black text-[10px] font-bold flex items-center justify-center cursor-pointer z-30 shadow"
                          onClick={() => toggleStrategyPlayer(p.id)}
                        >
                          ✕
                        </div>
                      </div>
                    ))}

                    {/* Empty slot placeholders */}
                    {Array.from({ length: 2 - strategyPlayers.length }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="flex items-center justify-center border border-white/20 rounded-xl h-[145px] w-full text-white/30 text-sm font-medium tracking-wide"
                      >
                        Empty Slot
                      </div>
                    ))}
                  </div>
                </div>

                {/* CENTER: Squad Player Cards — excludes already-selected players (50%) */}
                <div className="rounded-xl p-4 bg-white/10 border border-white/10 overflow-y-auto max-h-[calc(100vh-280px)] scrollbar-hide">
                  <section className="grid grid-cols-2 gap-4 overflow-visible" aria-label="Strategy player selection">
                    {activePlayerList
                      .filter((p) => !selectedStrategyIds.includes(p.id))
                      .map((player) => (
                        <PlayerCard
                          key={player.id}
                          player={player}
                          bannerColor1={bannerColor1}
                          bannerColor2={bannerColor2}
                          franchiseCode={team ?? undefined}
                          onClick={() => toggleStrategyPlayer(player.id)}
                        />
                      ))}
                    {activePlayerList.filter((p) => !selectedStrategyIds.includes(p.id)).length === 0 && (
                      <p className="col-span-2 text-center text-white/40 text-sm py-6">All players selected.</p>
                    )}
                  </section>
                </div>

                {/* RIGHT: Live Auction State (25%) */}
                <div className="rounded-xl p-4 bg-white/10 border border-white/10 flex flex-col gap-3">
                  <h2 className="text-xl font-black">Live Auction State</h2>
                  <p className="text-sm text-[#d4ddef]">Current Player: <span className="text-white font-semibold">{auctionState?.current_player_id ?? "None"}</span></p>
                  <p className="text-sm text-[#d4ddef]">Current Bid: <span className="text-white font-semibold">{formatCr(auctionState?.current_bid ?? 0)}</span></p>
                  <p className="text-sm text-[#d4ddef]">Status: <span className="text-white font-semibold capitalize">{auctionState?.status ?? "idle"}</span></p>
                </div>

              </div>
            ) : null}

            {/* ── Player Cards Grid (squad/market views) ── */}
            {viewMode !== "strategy" ? (
              <div className="px-4 pt-3 pb-6 h-[calc(100vh-220px)] overflow-y-auto overflow-x-hidden scrollbar-hide" style={{ borderRadius: "0.5rem" }}>
                {viewMode === "market" ? (
                  <div className="mb-4 rounded-xl border border-white/15 bg-black/25 p-3">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
                      <input
                        type="text"
                        value={marketSearchQuery}
                        onChange={(event) => setMarketSearchQuery(event.target.value)}
                        placeholder="Search name, role, category, or SL No"
                        className="h-11 rounded-lg border border-white/20 bg-black/35 px-3 text-sm text-white placeholder:text-white/45 outline-none focus:border-white/40"
                      />

                      <select
                        value={marketBasePriceFilter}
                        onChange={(event) => setMarketBasePriceFilter(event.target.value as MarketBasePriceFilter)}
                        className="h-11 rounded-lg border border-white/20 bg-black/35 px-3 text-sm text-white outline-none focus:border-white/40"
                      >
                        <option value="all">Base Price: All</option>
                        <option value="upto50">Base Price: Up to 50L</option>
                        <option value="50to100">Base Price: 50L to 1Cr</option>
                        <option value="above100">Base Price: Above 1Cr</option>
                      </select>

                      <select
                        value={marketCreditsFilter}
                        onChange={(event) => setMarketCreditsFilter(event.target.value as MarketCreditsFilter)}
                        className="h-11 rounded-lg border border-white/20 bg-black/35 px-3 text-sm text-white outline-none focus:border-white/40"
                      >
                        <option value="all">Credits: All</option>
                        <option value="upto50">Credits: Up to 50</option>
                        <option value="51to70">Credits: 51 to 70</option>
                        <option value="above70">Credits: Above 70</option>
                      </select>

                      <select
                        value={marketSortOption}
                        onChange={(event) => setMarketSortOption(event.target.value as MarketSortOption)}
                        className="h-11 rounded-lg border border-white/20 bg-black/35 px-3 text-sm text-white outline-none focus:border-white/40"
                      >
                        <option value="default">Sort: Default</option>
                        <option value="alphaAsc">Sort: Alphabetical A-Z</option>
                        <option value="alphaDesc">Sort: Alphabetical Z-A</option>
                        <option value="baseAsc">Sort: Base Price Low-High</option>
                        <option value="baseDesc">Sort: Base Price High-Low</option>
                        <option value="creditsAsc">Sort: Credits Low-High</option>
                        <option value="creditsDesc">Sort: Credits High-Low</option>
                      </select>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-white/70">
                      <p>
                        {filteredMarketPlayers.length > 0
                          ? `Showing ${(marketPage - 1) * MARKET_PAGE_SIZE + 1}-${Math.min(marketPage * MARKET_PAGE_SIZE, filteredMarketPlayers.length)} of ${filteredMarketPlayers.length}`
                          : "Showing 0 of 0"}
                        {" "}
                        market players
                      </p>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMarketPage((currentPage) => Math.max(1, currentPage - 1))}
                          disabled={marketPage === 1}
                          className="rounded-md border border-white/20 px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Prev
                        </button>
                        <span className="min-w-20 text-center text-white/80">
                          Page {marketPage} / {marketTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMarketPage((currentPage) => Math.min(marketTotalPages, currentPage + 1))}
                          disabled={marketPage >= marketTotalPages}
                          className="rounded-md border border-white/20 px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <section className="grid grid-cols-4 gap-6 overflow-visible" aria-label={
                  viewMode === "squad" ? "Team squad list" : "Auction market list"
                }>
                  {activePlayerList.length ? (
                    activePlayerList.map((player) => (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        bannerColor1={bannerColor1}
                        bannerColor2={bannerColor2}
                        franchiseCode={team ?? undefined}
                      />
                    ))
                  ) : (
                    <article className="dashboard-card dashboard-card--wide col-span-4">{emptyMessage}</article>
                  )}
                </section>
              </div>
            ) : null}
          </section>
        </main>
      </div>

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
                <p>You have to start the bidding for the remaining players. Your squad board now shows those retained strategy players while all other previous players are removed.</p>
              </>
            ) : (
              <p>Only top 5 teams proceed to Round 3. Your team is not qualified for Round 3 bidding.</p>
            )}
            <div className="franchise-win-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setViewMode("squad");
                  setRoundTransitionModal(null);
                }}
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function FranchiseDashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="dashboard-shell">
          <section className="dashboard-card">
            <h1>Loading Franchise Dashboard</h1>
            <p>Preparing live team data.</p>
          </section>
        </main>
      }
    >
      <FranchiseDashboardContent />
    </Suspense>
  );
}
