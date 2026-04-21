'use client';

import { useEffect, useMemo, useState } from "react";
import PlayerCard from "@/components/PlayerCard";
import { mapAuctionStateRow } from "@/lib/auctionUtils";
import { supabase } from "@/lib/supabase-client";
import { mapPlayersForAuctionRound } from "@/services/supabase";
import type { AuctionStateRow, Player, PlayerRow } from "@/types/player";

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unable to load the live auction feed.";
};

export default function AuctioneerOnePage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [auctionState, setAuctionState] = useState<AuctionStateRow | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const activePlayer = useMemo(() => {
    if (!players.length) {
      return null;
    }

    return (
      players.find((player) => player.id === auctionState?.current_player_id) ??
      players.find((player) => player.id === selectedPlayerId) ??
      players[0] ??
      null
    );
  }, [auctionState?.current_player_id, players, selectedPlayerId]);

  useEffect(() => {
    let isMounted = true;

    const loadAuctionState = async (): Promise<AuctionStateRow | null> => {
      const { data, error } = await supabase.from("auction_state").select("*").limit(1).maybeSingle();

      if (error) {
        throw error;
      }

      return data ? mapAuctionStateRow(data as Record<string, unknown>) : null;
    };

    const loadAvailablePlayers = async (): Promise<PlayerRow[]> => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .is("assigned_franchise_code", null)
        .order("sl_no", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as PlayerRow[];
    };

    const syncFeed = async () => {
      try {
        const [playerRows, nextAuctionState] = await Promise.all([loadAvailablePlayers(), loadAuctionState()]);
        const nextPlayers = mapPlayersForAuctionRound(playerRows, nextAuctionState?.auction_round ?? 2, {
          availableOnly: true,
        });

        if (!isMounted) {
          return;
        }

        setPlayers(nextPlayers);
        setAuctionState(nextAuctionState);
        setSelectedPlayerId((currentId) =>
          nextPlayers.some((player) => player.id === currentId) ? currentId : nextAuctionState?.current_player_id ?? nextPlayers[0]?.id ?? null,
        );
        setErrorMessage("");
      } catch (error) {
        if (isMounted) {
          setPlayers([]);
          setAuctionState(null);
          setSelectedPlayerId(null);
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void syncFeed();

    // Poll every 1 second for live updates (aggressive refresh to keep auction live)
    const intervalId = setInterval(() => {
      void syncFeed();
    }, 1000);

    const channel = supabase
      .channel("auctioneer1_live_board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        () => {
          void syncFeed();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auction_state" },
        () => {
          void syncFeed();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="grid min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(200,163,79,0.2),_transparent_24%),linear-gradient(180deg,#06162f_0%,#0a2447_100%)] px-4 py-5 text-[#fdfbf7] sm:px-8 sm:py-8">
      <div className="mx-auto grid w-full max-w-7xl gap-6">
        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.5em] text-[#d4b467]">Auctioneer 1</p>
          <h1 className="mt-4 font-display text-5xl leading-none sm:text-6xl lg:text-7xl">Arena Display</h1>
          <p className="mt-4 text-sm uppercase tracking-[0.32em] text-[#d4ddef]">
            Live players are loaded from Supabase and hidden as soon as a franchise gets assigned.
          </p>
        </header>

        {errorMessage ? (
          <section className="rounded-[2rem] border border-[#d9a0a0] bg-[#5f1111]/35 px-6 py-5 text-center text-sm uppercase tracking-[0.22em] text-[#ffe1e1]">
            {errorMessage}
          </section>
        ) : null}

        <section className="grid gap-4 rounded-[2rem] border border-white/12 bg-white/5 px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur sm:grid-cols-4">
          <article>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-[#d4b467]">Available</p>
            <h2 className="mt-2 text-3xl font-black">{players.length}</h2>
          </article>
          <article>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-[#d4b467]">Current Bid</p>
            <h2 className="mt-2 text-3xl font-black">Rs {(auctionState?.current_bid ?? 0).toLocaleString("en-IN")}</h2>
          </article>
          <article>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-[#d4b467]">Live Player</p>
            <h2 className="mt-2 text-3xl font-black">{activePlayer?.name ?? "Waiting"}</h2>
          </article>
          <article>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-[#d4b467]">Status</p>
            <h2 className="mt-2 text-3xl font-black">{auctionState?.status ?? "idle"}</h2>
          </article>
        </section>

        {isLoading ? (
          <section className="grid min-h-[55vh] place-items-center rounded-[2.4rem] border border-white/12 bg-white/5 px-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.42em] text-[#d4b467]">Connecting</p>
              <h2 className="mt-6 font-display text-4xl leading-none sm:text-5xl">Loading the live auction board</h2>
            </div>
          </section>
        ) : activePlayer ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="grid place-items-center">
              <PlayerCard player={activePlayer} className="w-full max-w-6xl" />
            </div>

            <aside className="rounded-[2rem] border border-white/12 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.42em] text-[#d4b467]">Available Queue</p>
                  <h2 className="mt-2 text-2xl font-black">Live Player List</h2>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-[0.65rem] font-bold uppercase tracking-[0.28em] text-[#fdfbf7]"
                  onClick={() => {
                    setSelectedPlayerId(activePlayer.id);
                  }}
                >
                  Focus Current
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                {players.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(player.id)}
                    className={`rounded-[1.4rem] border px-4 py-4 text-left transition ${
                      player.id === activePlayer.id
                        ? "border-[#d4b467] bg-[#d4b467]/10"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-[#d4b467]">
                          {player.slNo !== null ? `Lot #${player.slNo}` : "Live Lot"}
                        </p>
                        <h3 className="mt-2 text-lg font-black">{player.name}</h3>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[#d4ddef]">{player.role}</p>
                      </div>
                      <span className="rounded-full border border-white/12 px-3 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-[#d4ddef]">
                        Rs {player.basePriceLakhs} L
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[#d4ddef]">
                      <span>CP {player.creditPoints}</span>
                      <span>{player.country}</span>
                      <span>{player.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          </div>
        ) : (
          <section className="grid min-h-[55vh] place-items-center rounded-[2.4rem] border border-white/12 bg-white/5 px-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.42em] text-[#d4b467]">Waiting for Controller</p>
              <h2 className="mt-6 font-display text-4xl leading-none sm:text-5xl">No unassigned players are available right now</h2>
              <p className="mt-5 text-sm uppercase tracking-[0.24em] text-[#d4ddef]">
                A locked player disappears from this board until a super admin releases that franchise assignment.
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
