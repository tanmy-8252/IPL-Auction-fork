"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FRANCHISES, type FranchiseCode } from "@/lib/franchises";
import FranchiseLoginArena from "./FranchiseLoginArena";

export default function FranchiseLoginPage() {
  const router = useRouter();
  const [selectedFranchise, setSelectedFranchise] = useState<FranchiseCode | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const selectedFranchiseDetails = useMemo(
    () => FRANCHISES.find((franchise) => franchise.code === selectedFranchise),
    [selectedFranchise],
  );

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFranchise) {
      setError("Please select a franchise first.");
      return;
    }

    setError("");
    setIsLoading(true);

    const response = await fetch("/api/franchise-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        franchiseCode: selectedFranchise,
        username,
        password,
      }),
    });

    const responseBody = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(responseBody.message ?? "Login failed.");
      setIsLoading(false);
      return;
    }

    router.push(`/franchise/dashboard?team=${selectedFranchise}`);
  }

  return (
    <FranchiseLoginArena
      selectedFranchise={selectedFranchise}
      selectedFranchiseDetails={selectedFranchiseDetails}
      username={username}
      password={password}
      error={error}
      isLoading={isLoading}
      onSelectFranchise={(franchise) => {
        setSelectedFranchise(franchise);
        setError("");
      }}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onSubmit={handleLogin}
    />
  );
}
