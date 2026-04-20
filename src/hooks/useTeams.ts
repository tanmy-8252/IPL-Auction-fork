"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";

export type AdminTeam = {
  id: string;
  assignmentId: string;
  name: string;
  purse: number;
  initialPurse: number;
  isBlocked: boolean;
  franchiseCode: string | null;
  raw: Record<string, unknown>;
};

const readString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
};

const readNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }
  return 0;
};

const getValue = (row: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return undefined;
};

const mapTeam = (row: Record<string, unknown>): AdminTeam => {
  const franchiseCode = readString(getValue(row, "franchise_code")) || null;
  const purse = readNumber(getValue(row, "purse"));
  const purseLakhs = readNumber(getValue(row, "purse_lakhs"));
  const spentLakhs = readNumber(getValue(row, "spent_lakhs"));
  const remainingPurse = "purse" in row ? purse : Math.max(purseLakhs, 0);
  const totalBudget = Math.max(purseLakhs + spentLakhs, 10000);
  const initialPurse = readNumber(getValue(row, "initial_purse")) || totalBudget || purse || remainingPurse;

  return {
    id: readString(row.id),
    assignmentId: franchiseCode ?? readString(row.id),
    name: readString(row.name) || franchiseCode || "Unnamed Team",
    purse: remainingPurse > 0 || spentLakhs > 0 ? remainingPurse : totalBudget,
    initialPurse,
    isBlocked: Boolean(getValue(row, "is_blocked")),
    franchiseCode,
    raw: row,
  };
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unable to load teams.";
};

export const useTeams = () => {
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from("teams").select("*").order("name", { ascending: true });

    if (error) throw error;

    setTeams(((data ?? []) as Record<string, unknown>[]).map(mapTeam));
    setErrorMessage("");
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadTeams = async () => {
      try {
        await refetch();
      } catch (error) {
        if (isMounted) {
          setTeams([]);
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadTeams();

    const channel = supabase
      .channel("admin_teams_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => {
        void loadTeams();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  return { teams, isLoading, errorMessage, refetch };
};

