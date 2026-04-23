import Link from "next/link";
import Image from "next/image";
import type { CSSProperties, FormEvent } from "react";
import { FRANCHISES, type FranchiseCode, type FranchiseInfo } from "@/lib/franchises";
import styles from "./franchise-login-arena.module.css";

type FranchiseLoginArenaProps = {
  selectedFranchise: FranchiseCode | null;
  selectedFranchiseDetails: FranchiseInfo | undefined;
  username: string;
  password: string;
  error: string;
  isLoading: boolean;
  onSelectFranchise: (franchise: FranchiseCode) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

type TeamTheme = {
  primary: string;
  secondary: string;
  tertiary: string;
  accentSoft: string;
};

const TEAM_THEME: Record<FranchiseCode, TeamTheme> = {
  MI: { primary: "#004ba8", secondary: "#0a1f4d", tertiary: "#d4af37", accentSoft: "#f5de8f" },
  CSK: { primary: "#f5d400", secondary: "#0c2d62", tertiary: "#fff08e", accentSoft: "#fff6bb" },
  KKR: { primary: "#5d2d91", secondary: "#281544", tertiary: "#d4af37", accentSoft: "#f2df9d" },
  RCB: { primary: "#d71920", secondary: "#131112", tertiary: "#d4af37", accentSoft: "#f1d58a" },
  SRH: { primary: "#f26a21", secondary: "#7a2f00", tertiary: "#ffd447", accentSoft: "#ffe391" },
  DC: { primary: "#0078d4", secondary: "#0e2a66", tertiary: "#e63946", accentSoft: "#ffb8bf" },
  PBKS: { primary: "#c8102e", secondary: "#4a0912", tertiary: "#d4af37", accentSoft: "#f0d68e" },
  RR: { primary: "#ff2f92", secondary: "#123d9a", tertiary: "#d4af37", accentSoft: "#f6dd98" },
  GT: { primary: "#0b2344", secondary: "#111827", tertiary: "#caa65b", accentSoft: "#ecd8a0" },
  LSG: { primary: "#a1186a", secondary: "#172b65", tertiary: "#d4af37", accentSoft: "#f3dd95" },
};

export default function FranchiseLoginArena({
  selectedFranchise,
  selectedFranchiseDetails,
  username,
  password,
  error,
  isLoading,
  onSelectFranchise,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: FranchiseLoginArenaProps) {
  const displayFranchise = FRANCHISES.find((franchise) => franchise.code === selectedFranchise) ?? FRANCHISES[0];
  const selectedIndex = Math.max(
    0,
    FRANCHISES.findIndex((franchise) => franchise.code === displayFranchise.code),
  );
  const activeTheme = TEAM_THEME[displayFranchise.code];
  const arenaStyle = {
    "--team-primary": activeTheme.primary,
    "--team-secondary": activeTheme.secondary,
    "--team-accent": activeTheme.tertiary,
    "--team-accent-soft": activeTheme.accentSoft,
  } as CSSProperties;

  return (
    <main className={styles.shell} style={arenaStyle}>
      <section className={styles.console} aria-labelledby="franchise-login-title">
        <header className={styles.header}>
          <div className={styles.leagueSeal} aria-hidden="true">
            IPL
          </div>
          <div className={styles.profileBar}>
            <p>Franchise Profile</p>
            <h1>IPL Auction 2026</h1>
          </div>
          <Link href="/" className={styles.backButton}>
            Back
          </Link>
        </header>

        <div className={styles.stage}>
          <aside className={styles.teamDock} aria-label="Franchise selection">
            <div className={styles.logoOrbit}>
              <div className={styles.logoDisc}>
                <Image
                  src={`/teams/${displayFranchise.code}.png`}
                  alt={`${displayFranchise.name} logo`}
                  width={164}
                  height={164}
                  className={styles.mainLogo}
                  priority
                />
              </div>
            </div>

            <div className={styles.slotRibbon}>
              <span>Team Slot</span>
              <strong>{String(selectedIndex + 1).padStart(2, "0")}</strong>
            </div>

            <div className={styles.teamGrid}>
              {FRANCHISES.map((franchise) => {
                const isSelected = selectedFranchise === franchise.code;

                return (
                  <button
                    key={franchise.code}
                    type="button"
                    className={`${styles.teamButton} ${isSelected ? styles.teamButtonSelected : ""}`}
                    onClick={() => onSelectFranchise(franchise.code)}
                    aria-pressed={isSelected}
                    title={franchise.name}
                  >
                    <span className={styles.teamLogoWrap}>
                      <Image
                        src={`/teams/${franchise.code}.png`}
                        alt=""
                        width={32}
                        height={32}
                        className={styles.teamLogo}
                        aria-hidden="true"
                      />
                    </span>
                    <span className={styles.teamCode}>{franchise.code}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className={styles.loginStack}>
            <p className={styles.teamName} id="franchise-login-title">
              {displayFranchise.name}
            </p>

            <div className={styles.cityRibbon}>
              <span>{displayFranchise.city}</span>
              <strong>Franchise Login</strong>
            </div>

            <div className={styles.statusTable} aria-label="Franchise status">
              <div className={styles.statusHead}>
                <span>Team</span>
                <span>City</span>
                <span>Status</span>
              </div>
              <div className={styles.statusRow}>
                <span>{displayFranchise.code}</span>
                <span>{displayFranchise.city}</span>
                <span>{displayFranchise.status}</span>
              </div>
              <div className={styles.statusRow}>
                <span>Login</span>
                <span>{selectedFranchise ? "Open" : "--"}</span>
                <span>{selectedFranchise ? "Ready" : "Waiting"}</span>
              </div>
            </div>

            <form className={styles.form} onSubmit={onSubmit}>
              <h2>Credentials</h2>

              <label htmlFor="franchise-username">Team ID</label>
              <input
                id="franchise-username"
                type="text"
                value={username}
                onChange={(event) => onUsernameChange(event.target.value)}
                placeholder="Enter Team Username"
                required
              />

              <label htmlFor="franchise-password">Password</label>
              <input
                id="franchise-password"
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="Enter Password"
                required
              />

              {error ? (
                <p className={styles.errorText} role="alert">
                  {error}
                </p>
              ) : null}

              <button className={styles.submitButton} type="submit" disabled={isLoading}>
                {isLoading ? "Entering..." : "Enter Arena"}
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
