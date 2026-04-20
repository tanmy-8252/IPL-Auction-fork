import { mapAuctionStateRow, mapPlayerRow } from "@/lib/auctionUtils";
import { supabase } from "@/lib/supabase-client";
import type { AuctionStateRow, AuctionStatus, Player, PlayerRow } from "@/types/player";

export type TeamRow = {
  id?: string;
  franchise_code: string;
  name: string;
  city?: string;
  purse_lakhs: number;
  spent_lakhs: number;
  roster_count: number;
  is_blocked: boolean;
};

export type AuctionSnapshot = {
  players: Player[];
  teams: TeamRow[];
  auctionState: AuctionStateRow | null;
};

type PurseUpdateType = "increase" | "decrease";

const TEAM_SIZE_CAP = 11;
const TEAM_PURSE_CAP_LAKHS = 10000; // 100 Cr

const normalizeAmount = (value: unknown): number => {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? Math.max(Math.round(amount), 0) : 0;
};

const assertNonNegativeAmount = (amount: number, label: string) => {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
};

export const getErrorMessage = (error: unknown, fallback = "Unable to update auction data."): string => {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    const parts = [errorRecord.message, errorRecord.details, errorRecord.hint]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join(" | ");

    if (parts) return parts;

    if (typeof errorRecord.code === "string" && errorRecord.code) {
      return `Database error (${errorRecord.code}).`;
    }
  }

  return fallback;
};

export const sortPlayers = (players: Player[]): Player[] => {
  return [...players].sort((leftPlayer, rightPlayer) => {
    if (leftPlayer.slNo !== null && rightPlayer.slNo !== null) {
      return leftPlayer.slNo - rightPlayer.slNo;
    }

    if (leftPlayer.slNo !== null) return -1;
    if (rightPlayer.slNo !== null) return 1;
    return leftPlayer.name.localeCompare(rightPlayer.name);
  });
};

export const getPlayers = async (options?: { availableOnly?: boolean }): Promise<Player[]> => {
  let query = supabase.from("players").select("*").order("sl_no", { ascending: true });

  if (options?.availableOnly) {
    query = query.is("assigned_franchise_code", null);
  }

  const { data, error } = await query;
  if (error) throw error;

  return sortPlayers(((data ?? []) as PlayerRow[]).map((row) => mapPlayerRow(row)));
};

export const getTeams = async (): Promise<TeamRow[]> => {
  const { data, error } = await supabase.from("teams").select("*").order("franchise_code", { ascending: true });
  if (error) throw error;

  return (data ?? []) as TeamRow[];
};

export const getAuctionState = async (): Promise<AuctionStateRow | null> => {
  const { data, error } = await supabase
    .from("auction_state")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapAuctionStateRow(data as Record<string, unknown>) : null;
};

export const getAuctionSnapshot = async (): Promise<AuctionSnapshot> => {
  const [{ data: playersData, error: playersError }, { data: teamsData, error: teamsError }, { data: stateData, error: stateError }] =
    await Promise.all([
      supabase.from("players").select("*").order("sl_no", { ascending: true }),
      supabase.from("teams").select("*").order("franchise_code", { ascending: true }),
      supabase.from("auction_state").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  if (playersError) throw playersError;
  if (teamsError) throw teamsError;
  if (stateError) throw stateError;

  return {
    players: sortPlayers(((playersData ?? []) as PlayerRow[]).map((row) => mapPlayerRow(row))),
    teams: (teamsData ?? []) as TeamRow[],
    auctionState: stateData ? mapAuctionStateRow(stateData as Record<string, unknown>) : null,
  };
};

export const searchPlayers = async (query: string): Promise<Player[]> => {
  const searchQuery = query.trim();

  if (!searchQuery) {
    return getPlayers();
  }

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .ilike("name", `%${searchQuery}%`)
    .order("sl_no", { ascending: true });

  if (error) throw error;
  return sortPlayers(((data ?? []) as PlayerRow[]).map((row) => mapPlayerRow(row)));
};

const getRequiredAuctionState = async (): Promise<AuctionStateRow> => {
  const auctionState = await getAuctionState();
  if (!auctionState?.id) {
    throw new Error("No auction state row found.");
  }

  return auctionState;
};

const getPlayerRowById = async (playerId: string): Promise<Record<string, unknown>> => {
  const { data, error } = await supabase.from("players").select("*").eq("id", playerId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Player not found.");

  return data as Record<string, unknown>;
};

const getTeamByCode = async (teamCode: string): Promise<TeamRow> => {
  const { data, error } = await supabase.from("teams").select("*").eq("franchise_code", teamCode).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Team not found.");

  return data as TeamRow;
};

const ensureTeamCanReceivePlayer = async (teamCode: string, incomingBidLakhs?: number): Promise<TeamRow> => {
  const team = await getTeamByCode(teamCode);
  const remainingPurseLakhs = Math.max(TEAM_PURSE_CAP_LAKHS - normalizeAmount(team.spent_lakhs), 0);

  if (team.is_blocked) {
    throw new Error(`${team.name} is blocked and cannot receive players.`);
  }

  if (team.roster_count >= TEAM_SIZE_CAP) {
    throw new Error(`${team.name} already has ${TEAM_SIZE_CAP} players.`);
  }

  if (typeof incomingBidLakhs === "number" && incomingBidLakhs > remainingPurseLakhs) {
    throw new Error(`${team.name} does not have enough purse for this player.`);
  }

  return team;
};

const updateLatestAuctionState = async (
  updates: {
    current_player_id?: string | null;
    current_bid_lakhs?: number;
    current_winning_franchise_code?: string | null;
    current_winning_bid_lakhs?: number;
    status?: AuctionStatus;
  },
): Promise<AuctionStateRow> => {
  const auctionState = await getRequiredAuctionState();

  const { data, error } = await supabase
    .from("auction_state")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auctionState.id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Auction state update did not return a row.");

  return mapAuctionStateRow(data as Record<string, unknown>);
};

const setTeamTotals = async (teamCode: string, spentLakhs: number, rosterCount: number) => {
  const { error } = await supabase
    .from("teams")
    .update({
      spent_lakhs: Math.max(normalizeAmount(spentLakhs), 0),
      roster_count: Math.max(Math.round(rosterCount), 0),
      updated_at: new Date().toISOString(),
    })
    .eq("franchise_code", teamCode);

  if (error) throw error;
};

const adjustTeamTotals = async (teamCode: string, spentDeltaLakhs: number, rosterDelta: number) => {
  const team = await getTeamByCode(teamCode);
  await setTeamTotals(teamCode, team.spent_lakhs + spentDeltaLakhs, team.roster_count + rosterDelta);
};

const assignPlayerToTeam = async (playerId: string, teamCode: string, amountLakhs: number) => {
  assertNonNegativeAmount(amountLakhs, "Sold amount");

  const playerRow = await getPlayerRowById(playerId);
  const soldAmountLakhs = normalizeAmount(amountLakhs);

  if (soldAmountLakhs > TEAM_PURSE_CAP_LAKHS) {
    throw new Error(`Sold amount cannot exceed ${TEAM_PURSE_CAP_LAKHS} lakhs.`);
  }

  const receivingTeam = await ensureTeamCanReceivePlayer(teamCode, soldAmountLakhs);
  const previousTeamCode = typeof playerRow.assigned_franchise_code === "string" ? playerRow.assigned_franchise_code : null;
  const previousAmountLakhs = normalizeAmount(playerRow.current_bid_lakhs);

  if (previousTeamCode && previousTeamCode !== teamCode) {
    await adjustTeamTotals(previousTeamCode, -previousAmountLakhs, -1);
  }

  const spentDelta = previousTeamCode === teamCode ? soldAmountLakhs - previousAmountLakhs : soldAmountLakhs;
  const rosterDelta = previousTeamCode === teamCode ? 0 : 1;

  await setTeamTotals(
    receivingTeam.franchise_code,
    receivingTeam.spent_lakhs + spentDelta,
    receivingTeam.roster_count + rosterDelta,
  );

  const { error } = await supabase
    .from("players")
    .update({
      assigned_franchise_code: teamCode,
      auction_status: "sold",
      current_bid_lakhs: soldAmountLakhs,
      last_bidder_code: teamCode,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  if (error) throw error;
};

export const removePlayerFromTeam = async (playerId: string, nextStatus: "unsold" | "sold" | "bidding" = "unsold") => {
  const playerRow = await getPlayerRowById(playerId);
  const previousTeamCode = typeof playerRow.assigned_franchise_code === "string" ? playerRow.assigned_franchise_code : null;
  const previousAmountLakhs = normalizeAmount(playerRow.current_bid_lakhs);

  if (previousTeamCode) {
    await adjustTeamTotals(previousTeamCode, -previousAmountLakhs, -1);
  }

  const { error } = await supabase
    .from("players")
    .update({
      assigned_franchise_code: null,
      auction_status: nextStatus,
      current_bid_lakhs: 0,
      last_bidder_code: null,
      assigned_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  if (error) throw error;
};

const selectAdjacentAvailablePlayer = async (direction: "next" | "previous"): Promise<Player> => {
  const [auctionState, availablePlayers] = await Promise.all([getRequiredAuctionState(), getPlayers({ availableOnly: true })]);

  if (!availablePlayers.length) {
    throw new Error("No unsold players are available.");
  }

  if (!auctionState.current_player_id) {
    return direction === "next" ? availablePlayers[0] : availablePlayers[availablePlayers.length - 1];
  }

  const currentIndex = availablePlayers.findIndex((player) => player.id === auctionState.current_player_id);

  if (currentIndex !== -1) {
    const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    const nextPlayer = availablePlayers[nextIndex];

    if (!nextPlayer) {
      throw new Error(direction === "next" ? "Already at the last unsold player." : "Already at the first unsold player.");
    }

    return nextPlayer;
  }

  const currentPlayerRow = await getPlayerRowById(auctionState.current_player_id);
  const currentSlNo = normalizeAmount(currentPlayerRow.sl_no);
  const orderedCandidates =
    direction === "next"
      ? availablePlayers.filter((player) => (player.slNo ?? 0) > currentSlNo)
      : [...availablePlayers].reverse().filter((player) => (player.slNo ?? 0) < currentSlNo);
  const nextPlayer = orderedCandidates[0];

  if (!nextPlayer) {
    throw new Error(direction === "next" ? "Already at the last unsold player." : "Already at the first unsold player.");
  }

  return nextPlayer;
};

export const startAuction = async () => {
  return updateLatestAuctionState({ status: "bidding" });
};

export const stopAuction = async () => {
  return updateLatestAuctionState({ status: "stopped" });
};

export const resetAuction = async () => {
  return updateLatestAuctionState({
    current_player_id: null,
    current_bid_lakhs: 0,
    current_winning_franchise_code: null,
    current_winning_bid_lakhs: 0,
    status: "idle",
  });
};

export const setCurrentPlayer = async (playerId: string) => {
  await getPlayerRowById(playerId);
  return updateLatestAuctionState({ current_player_id: playerId });
};

export const nextPlayer = async () => {
  const player = await selectAdjacentAvailablePlayer("next");
  return updateLatestAuctionState({
    current_player_id: player.id,
    current_bid_lakhs: 0,
    current_winning_franchise_code: null,
    current_winning_bid_lakhs: 0,
    status: "idle",
  });
};

export const previousPlayer = async () => {
  const player = await selectAdjacentAvailablePlayer("previous");
  return updateLatestAuctionState({
    current_player_id: player.id,
    current_bid_lakhs: 0,
    current_winning_franchise_code: null,
    current_winning_bid_lakhs: 0,
    status: "idle",
  });
};

export const markSold = async () => {
  const auctionState = await getRequiredAuctionState();

  if (!auctionState.current_player_id) {
    throw new Error("Set a current auction player first.");
  }

  if (!auctionState.current_winning_franchise_code) {
    throw new Error("Set a leading franchise before selling.");
  }

  await assignPlayerToTeam(auctionState.current_player_id, auctionState.current_winning_franchise_code, auctionState.current_bid);

  return updateLatestAuctionState({
    status: "sold",
    current_winning_bid_lakhs: auctionState.current_bid,
  });
};

export const markUnsold = async (playerId?: string) => {
  const auctionState = await getRequiredAuctionState();
  const resolvedPlayerId = playerId ?? auctionState.current_player_id;

  if (!resolvedPlayerId) {
    throw new Error("Set a current auction player first.");
  }

  await removePlayerFromTeam(resolvedPlayerId, "unsold");

  if (auctionState.current_player_id === resolvedPlayerId) {
    return updateLatestAuctionState({
      current_bid_lakhs: 0,
      current_winning_franchise_code: null,
      current_winning_bid_lakhs: 0,
      status: "unsold",
    });
  }

  return auctionState;
};

export const resetPlayer = async (playerId: string) => {
  await removePlayerFromTeam(playerId, "unsold");
};

export const blockTeam = async (teamCode: string) => {
  const { error } = await supabase
    .from("teams")
    .update({ is_blocked: true, updated_at: new Date().toISOString() })
    .eq("franchise_code", teamCode);

  if (error) throw error;
};

export const unblockTeam = async (teamCode: string) => {
  const { error } = await supabase
    .from("teams")
    .update({ is_blocked: false, updated_at: new Date().toISOString() })
    .eq("franchise_code", teamCode);

  if (error) throw error;
};

export const updatePurse = async (teamCode: string, amountLakhs: number, type: PurseUpdateType) => {
  assertNonNegativeAmount(amountLakhs, "Purse amount");

  const team = await getTeamByCode(teamCode);
  const currentRemainingPurseLakhs = Math.max(TEAM_PURSE_CAP_LAKHS - normalizeAmount(team.spent_lakhs), 0);
  const nextRemainingPurseLakhs =
    type === "increase"
      ? Math.min(currentRemainingPurseLakhs + normalizeAmount(amountLakhs), TEAM_PURSE_CAP_LAKHS)
      : Math.max(currentRemainingPurseLakhs - normalizeAmount(amountLakhs), 0);

  const { error } = await supabase
    .from("teams")
    .update({ purse_lakhs: nextRemainingPurseLakhs, updated_at: new Date().toISOString() })
    .eq("franchise_code", teamCode);

  if (error) throw error;
};

export const overrideBid = async (amountLakhs: number) => {
  assertNonNegativeAmount(amountLakhs, "Bid amount");
  const amount = normalizeAmount(amountLakhs);

  return updateLatestAuctionState({
    current_bid_lakhs: amount,
    current_winning_bid_lakhs: amount,
  });
};

export const overrideTeam = async (teamCode: string) => {
  await ensureTeamCanReceivePlayer(teamCode);
  return updateLatestAuctionState({ current_winning_franchise_code: teamCode });
};

export const resetBid = async () => {
  return updateLatestAuctionState({
    current_bid_lakhs: 0,
    current_winning_franchise_code: null,
    current_winning_bid_lakhs: 0,
  });
};

export const forceSell = async (teamCode: string, amountLakhs: number) => {
  const auctionState = await getRequiredAuctionState();

  if (!auctionState.current_player_id) {
    throw new Error("Set a current auction player first.");
  }

  await assignPlayerToTeam(auctionState.current_player_id, teamCode, amountLakhs);

  return updateLatestAuctionState({
    current_bid_lakhs: normalizeAmount(amountLakhs),
    current_winning_franchise_code: teamCode,
    current_winning_bid_lakhs: normalizeAmount(amountLakhs),
    status: "sold",
  });
};

export const assignPlayerDirect = async (playerId: string, teamCode: string, amountLakhs?: number) => {
  const playerRow = await getPlayerRowById(playerId);
  const resolvedAmount =
    amountLakhs ?? (normalizeAmount(playerRow.current_bid_lakhs) || normalizeAmount(playerRow.base_price_lakhs));
  await assignPlayerToTeam(playerId, teamCode, resolvedAmount);
};

export const transferPlayer = async (playerId: string, newTeamCode: string) => {
  const playerRow = await getPlayerRowById(playerId);
  const resolvedAmount = normalizeAmount(playerRow.current_bid_lakhs) || normalizeAmount(playerRow.base_price_lakhs);
  await assignPlayerToTeam(playerId, newTeamCode, resolvedAmount);
};
