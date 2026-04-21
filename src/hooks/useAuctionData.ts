"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import type { AuctionStateRow, Player } from "@/types/player";
import {
  getAuctionSnapshot,
  getAuctionState,
  getErrorMessage,
  getPlayers,
  getTeams,
  type TeamRow,
} from "@/services/supabase";

export const useAuctionState = () => {
  const [auctionState, setAuctionState] = useState<AuctionStateRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setAuctionState(await getAuctionState());
      setError("");
    } catch (refreshError) {
      setError(getErrorMessage(refreshError, "Unable to load auction state."));
      setAuctionState(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const guardedRefresh = async () => {
      if (isMounted) {
        await refresh();
      }
    };

    void guardedRefresh();

    const channel = supabase
      .channel("auction_state_hook")
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_state" }, () => {
        void guardedRefresh();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { auctionState, isLoading, error, refresh };
};

export const usePlayers = (options?: { availableOnly?: boolean }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setPlayers(await getPlayers(options));
      setError("");
    } catch (refreshError) {
      setError(getErrorMessage(refreshError, "Unable to load players."));
      setPlayers([]);
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  useEffect(() => {
    let isMounted = true;

    const guardedRefresh = async () => {
      if (isMounted) {
        await refresh();
      }
    };

    void guardedRefresh();

    const channel = supabase
      .channel(options?.availableOnly ? "available_players_hook" : "players_hook")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => {
        void guardedRefresh();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [options?.availableOnly, refresh]);

  return { players, isLoading, error, refresh };
};

export const useTeams = () => {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setTeams(await getTeams());
      setError("");
    } catch (refreshError) {
      setError(getErrorMessage(refreshError, "Unable to load teams."));
      setTeams([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const guardedRefresh = async () => {
      if (isMounted) {
        await refresh();
      }
    };

    void guardedRefresh();

    const channel = supabase
      .channel("teams_hook")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => {
        void guardedRefresh();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { teams, isLoading, error, refresh };
};

export const useAuctionData = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [auctionState, setAuctionState] = useState<AuctionStateRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const snapshot = await getAuctionSnapshot();
      setPlayers(snapshot.players);
      setTeams(snapshot.teams);
      setAuctionState(snapshot.auctionState);
      setError("");
    } catch (refreshError) {
      setError(getErrorMessage(refreshError, "Unable to load auction data."));
      setPlayers([]);
      setTeams([]);
      setAuctionState(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const guardedRefresh = async () => {
      if (isMounted) {
        await refresh();
      }
    };

    void guardedRefresh();

    // Aggressive 1-second polling to keep auction always live
    const intervalId = setInterval(() => {
      void guardedRefresh();
    }, 1000);

    const channel = supabase
      .channel("auction_data_hook")
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_state" }, () => {
        void guardedRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => {
        void guardedRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => {
        void guardedRefresh();
      })
      .subscribe();

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { players, teams, auctionState, isLoading, error, refresh };
};

