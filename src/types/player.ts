export type AuctionStatus = "idle" | "bidding" | "sold" | "unsold" | "stopped";

export interface PlayerStats {
  matches: number;
  highestScore?: number;
  runs?: number;
  wickets?: number;
  strikeRate: number;
  average: number;
}

export interface Player {
  id: string;
  slNo: number | null;
  name: string;
  role: string;
  rarity?: "common" | "epic" | "legendary";
  category: string;
  country: string;
  teams: string;
  imageUrl: string;
  basePriceLakhs: number;
  creditPoints: number;
  matchesPlayed: number;
  totalRuns: number;
  battingAverage: number;
  bestBowling: string;
  bowlingAverage: number;
  wicketsTaken: number;
  economy: number;
  currentBidLakhs: number;
  lastBidderId: string | null;
  assignedFranchiseCode: string | null;
  status: AuctionStatus;
  stats: PlayerStats;
}

export interface AuctionStateRow {
  id: string;
  current_player_id: string | null;
  current_bid: number;
  current_winning_franchise_code: string | null;
  current_winning_bid_lakhs: number;
  auction_round: number;
  status: AuctionStatus;
}

export type PlayerRow = Record<string, unknown>;
