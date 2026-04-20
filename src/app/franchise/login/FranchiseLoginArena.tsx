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

const TEAM_THEME: Record<FranchiseCode, { accent: string; accentSoft: string }> = {
  CSK: { accent: "#d8c758", accentSoft: "#fff3a6" },
  MI: { accent: "#4ab0ff", accentSoft: "#d8efff" },
  RCB: { accent: "#dd3f45", accentSoft: "#ffd6d8" },
  KKR: { accent: "#b993ff", accentSoft: "#eee3ff" },
  SRH: { accent: "#f47a3b", accentSoft: "#ffe1c9" },
  RR: { accent: "#f073ad", accentSoft: "#ffdceb" },
  PBKS: { accent: "#e94a53", accentSoft: "#ffdddd" },
  DC: { accent: "#4d9bff", accentSoft: "#d9ebff" },
  LSG: { accent: "#5dd4c4", accentSoft: "#d9fff7" },
  GT: { accent: "#d1b16a", accentSoft: "#fff1c9" },
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
  const displayFranchise = selectedFranchiseDetails ?? FRANCHISES[0];
  const selectedIndex = Math.max(
    0,
    FRANCHISES.findIndex((franchise) => franchise.code === displayFranchise.code),
  );
  const activeTheme = TEAM_THEME[displayFranchise.code];
  const arenaStyle = {
    "--team-accent": activeTheme.accent,
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
            <h1>Tata IPL Auction 2026</h1>
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
              <span>{selectedFranchiseDetails?.city ?? "Select Team"}</span>
              <strong>Franchise Login</strong>
            </div>

            <div className={styles.statusTable} aria-label="Franchise status">
              <div className={styles.statusHead}>
                <span>Team</span>
                <span>City</span>
                <span>Status</span>
              </div>
              <div className={styles.statusRow}>
                <span>{selectedFranchiseDetails?.code ?? "--"}</span>
                <span>{selectedFranchiseDetails?.city ?? "--"}</span>
                <span>{selectedFranchiseDetails?.status ?? "Choose"}</span>
              </div>
              <div className={styles.statusRow}>
                <span>Login</span>
                <span>{selectedFranchiseDetails ? "Open" : "--"}</span>
                <span>{selectedFranchiseDetails ? "Ready" : "Waiting"}</span>
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
