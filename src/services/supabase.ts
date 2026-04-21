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
  round3_qualified?: boolean;
};

export type TeamRanking = {
  franchise_code: string;
  name: string;
  total_credits: number;
  player_count: number;
  spent_lakhs: number;
  remaining_budget: number;
  round3_qualified: boolean;
  ranking: number;
};

export type AuctionSnapshot = {
  players: Player[];
  teams: TeamRow[];
  auctionState: AuctionStateRow | null;
};

type GetPlayersOptions = {
  availableOnly?: boolean;
  auctionRound?: number;
};

type PurseUpdateType = "increase" | "decrease";

const TEAM_SIZE_CAP = 11;
const TEAM_PURSE_CAP_LAKHS = 10000; // 100 Cr

const ROUND_THREE_ICONIC_PLAYERS_IN_ORDER: string[][] = [
  ["VIRATKOHLI"],
  ["ROHITSHARMA"],
  ["SHREYASIYER"],
  ["SHUBMANGILL"],
  ["TRAVISHEAD"],
  ["MSDHONI", "MSD"],
  ["RISHABHPANT"],
  ["JOSBUTTLER"],
  ["KLRAHUL"],
  ["ISHANKISHAN"],
  ["HARDIKPANDYA"],
  ["RAVINDRAJADEJA", "RJADEJA"],
  ["ANDRERUSSELL"],
  ["BENSTOKES"],
  ["SUNILNARINE"],
  ["RASHIDKHAN"],
  ["AXARPATEL"],
  ["KRUNALPANDYA"],
  ["MARCUSSTONIS", "MARCUSSTONIES"],
  ["TIMDAVID"],
  ["JASPRITBUMRAH"],
  ["BHUVNESHWARKUMAR", "BHUVI"],
  ["MITCHELLSTARC"],
  ["JOSHHAZLEWOOD"],
  ["TRENTBOULT"],
  ["PATCUMMINS"],
  ["MOHAMMADSHAMI"],
  ["JOFRAARCHER"],
  ["KAGISORABADA", "RABADA"],
  ["ARSHDEEPSINGH"],
];

const normalizeNameKey = (value: unknown): string => {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
};

const ROUND_THREE_ICONIC_SEQUENCE_BY_KEY = new Map<string, number>();
ROUND_THREE_ICONIC_PLAYERS_IN_ORDER.forEach((aliases, index) => {
  aliases.forEach((alias) => {
    ROUND_THREE_ICONIC_SEQUENCE_BY_KEY.set(alias, index + 1);
  });
});

const getIconicSequenceByName = (row: Record<string, unknown>): number | null => {
  const normalizedName = normalizeNameKey(readOptionalString(row, "name"));

  if (!normalizedName) {
    return null;
  }

  const exactMatch = ROUND_THREE_ICONIC_SEQUENCE_BY_KEY.get(normalizedName);
  if (typeof exactMatch === "number") {
    return exactMatch;
  }

  for (const [alias, sequence] of ROUND_THREE_ICONIC_SEQUENCE_BY_KEY.entries()) {
    if (normalizedName.includes(alias)) {
      return sequence;
    }
  }

  return null;
};

const readOptionalNumber = (row: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const key of keys) {
    if (!(key in row)) continue;
    const value = row[key];
    const numericValue = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return null;
};

const readOptionalBoolean = (row: Record<string, unknown>, ...keys: string[]): boolean | null => {
  for (const key of keys) {
    if (!(key in row)) continue;
    const value = row[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
  }

  return null;
};

const readOptionalString = (row: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const key of keys) {
    if (!(key in row)) continue;
    const value = row[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
};

const isAssignedRow = (row: Record<string, unknown>): boolean => {
  const assignedCode = readOptionalString(row, "assigned_franchise_code", "assignedFranchiseCode", "team_id");
  return Boolean(assignedCode);
};

const isRoundThreeIconicRow = (row: Record<string, unknown>): boolean => {
  const explicitFlag = readOptionalBoolean(
    row,
    "is_round_three_iconic",
    "round_three_only",
    "is_iconic_round_three",
    "round3_iconic",
  );

  if (explicitFlag === true) {
    return true;
  }

  const unlockRound = readOptionalNumber(
    row,
    "available_from_round",
    "entry_round",
    "unlock_round",
    "auction_round",
  );

  if (unlockRound !== null && unlockRound >= 3) {
    return true;
  }

  const poolTag = readOptionalString(row, "auction_pool", "player_pool", "round_bucket", "pool_tag")?.toLowerCase();
  if (poolTag && ["round3", "round_3", "round3_iconic", "round_three", "round_three_iconic", "iconic_r3"].includes(poolTag)) {
    return true;
  }

  return getIconicSequenceByName(row) !== null;
};

const getRoundThreeSequence = (row: Record<string, unknown>): number => {
  const explicitSequence = readOptionalNumber(row, "round_three_sequence", "round3_sequence", "iconic_sequence");
  if (explicitSequence !== null && explicitSequence > 0) {
    return explicitSequence;
  }

  const sequenceFromName = getIconicSequenceByName(row);
  if (sequenceFromName !== null) {
    return sequenceFromName;
  }

  const serialNumber = readOptionalNumber(row, "sl_no", "slNo", "serial_no", "lot_number");
  if (serialNumber !== null && serialNumber > 0) {
    return serialNumber;
  }

  return Number.MAX_SAFE_INTEGER;
};

export const mapPlayersForAuctionRound = (
  rows: PlayerRow[],
  auctionRound: number,
  options?: { availableOnly?: boolean },
): Player[] => {
  const filteredRows = (rows ?? [])
    .filter((rawRow) => {
      const row = rawRow as Record<string, unknown>;

      if (options?.availableOnly && isAssignedRow(row)) {
        return false;
      }

      if (auctionRound <= 2 && isRoundThreeIconicRow(row)) {
        return false;
      }

      return true;
    })
    .sort((leftRaw, rightRaw) => {
      const left = leftRaw as Record<string, unknown>;
      const right = rightRaw as Record<string, unknown>;

      if (auctionRound >= 3) {
        const leftIconic = isRoundThreeIconicRow(left);
        const rightIconic = isRoundThreeIconicRow(right);

        if (leftIconic !== rightIconic) {
          return leftIconic ? -1 : 1;
        }

        if (leftIconic && rightIconic) {
          const sequenceDiff = getRoundThreeSequence(left) - getRoundThreeSequence(right);
          if (sequenceDiff !== 0) {
            return sequenceDiff;
          }
        }
      }

      const leftSlNo = readOptionalNumber(left, "sl_no", "slNo", "serial_no", "lot_number");
      const rightSlNo = readOptionalNumber(right, "sl_no", "slNo", "serial_no", "lot_number");

      if (leftSlNo !== null && rightSlNo !== null && leftSlNo !== rightSlNo) {
        return leftSlNo - rightSlNo;
      }

      if (leftSlNo !== null && rightSlNo === null) return -1;
      if (leftSlNo === null && rightSlNo !== null) return 1;

      const leftName = String(readOptionalString(left, "name") ?? "");
      const rightName = String(readOptionalString(right, "name") ?? "");
      return leftName.localeCompare(rightName);
    });

  return filteredRows.map((row) => mapPlayerRow(row));
};

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
    const nestedError =
      errorRecord.error && typeof errorRecord.error === "object"
        ? (errorRecord.error as Record<string, unknown>)
        : null;
    const parts = [errorRecord.message, errorRecord.details, errorRecord.hint]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join(" | ");

    if (parts) return parts;

    if (nestedError) {
      const nestedParts = [nestedError.message, nestedError.details, nestedError.hint]
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join(" | ");

      if (nestedParts) return nestedParts;
    }

    if (typeof errorRecord.code === "string" && errorRecord.code) {
      return `Database error (${errorRecord.code}).`;
    }

    try {
      const serialized = JSON.stringify(errorRecord);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      // Ignore JSON serialization issues and use fallback.
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

export const getPlayers = async (options?: GetPlayersOptions): Promise<Player[]> => {
  let query = supabase.from("players").select("*").order("sl_no", { ascending: true });

  if (options?.availableOnly) {
    query = query.is("assigned_franchise_code", null);
  }

  const { data, error } = await query;
  if (error) throw error;

  const auctionRound =
    options?.auctionRound ??
    ((await getAuctionState())?.auction_round ?? 2);

  return mapPlayersForAuctionRound((data ?? []) as PlayerRow[], auctionRound, {
    availableOnly: options?.availableOnly,
  });
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

  const nextAuctionState = stateData ? mapAuctionStateRow(stateData as Record<string, unknown>) : null;
  const auctionRound = nextAuctionState?.auction_round ?? 2;

  return {
    players: mapPlayersForAuctionRound((playersData ?? []) as PlayerRow[], auctionRound),
    teams: (teamsData ?? []) as TeamRow[],
    auctionState: nextAuctionState,
  };
};

export const getTeamRankings = async (): Promise<TeamRanking[]> => {
  const { data, error } = await supabase
    .from("team_credit_rankings")
    .select("*")
    .order("ranking", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TeamRanking[];
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
  const auctionState = await getRequiredAuctionState();
  const availablePlayers = await getPlayers({ availableOnly: true, auctionRound: auctionState.auction_round });

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
